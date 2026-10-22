const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const multicapa = require('../services/multicapa.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const MAX_FILAS_CSV = 5000;
const SI = new Set(['si', 'sí', 'true', '1', 'x', 'yes']);

/** Construye dinámicamente un validador zod a partir de las preguntas del formulario. */
function esquemaRespuestas(preguntas) {
  const shape = {};
  for (const p of preguntas) {
    let s;
    const opts = Array.isArray(p.opciones) ? p.opciones : [];
    switch (p.tipo) {
      case 'NUMERO': case 'ESCALA': {
        s = z.coerce.number().finite();
        if (p.min != null) s = s.min(p.min);
        if (p.max != null) s = s.max(p.max);
        break;
      }
      case 'BOOLEANO': s = z.preprocess((v) => (typeof v === 'string' ? SI.has(v.trim().toLowerCase()) : v), z.boolean()); break;
      case 'SELECCION_UNICA': s = opts.length ? z.enum(opts) : z.string().max(200); break;
      case 'SELECCION_MULTIPLE': s = z.array(opts.length ? z.enum(opts) : z.string().max(200)); break;
      case 'FECHA': s = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'fecha inválida'); break;
      default: s = z.string().max(2000);
    }
    shape[p.clave] = p.requerida ? s : s.optional().nullable();
  }
  return z.object(shape); // las claves desconocidas se descartan
}

async function contexto(faseId) {
  const fase = await prisma.fase.findUniqueOrThrow({
    where: { id: faseId },
    include: { evento: { select: { id: true, eliminado: true, jurisdiccionId: true } }, formulario: { include: { preguntas: { include: { seccion: true, capasPregunta: true } } } } },
  });
  if (fase.evento.eliminado) throw httpError(409, 'El evento está eliminado');
  if (!fase.formulario) throw httpError(409, 'La fase no tiene formulario');
  return fase;
}

const coordZ = z.object({
  latitud: z.coerce.number().min(-90).max(90).optional(), longitud: z.coerce.number().min(-180).max(180).optional(),
});

async function guardarUna(tx, fase, usuarioId, origen, lat, lng, respuestas) {
  const zonaKey = await multicapa.zonaParaPunto(tx, fase.evento.jurisdiccionId, lat, lng);
  const e = await tx.encuesta.create({
    data: { faseId: fase.id, latitud: lat ?? null, longitud: lng ?? null, zonaKey, respuestas, origen, cargadaPorId: usuarioId }, // estadoIA = PENDIENTE → lo toma el worker
  });
  await multicapa.aplicar(tx, { eventoId: fase.evento.id, zonaKey, respuestas }, fase.formulario.preguntas);
  return e;
}

// Carga individual (pestaña "Carga de encuestas")
router.post('/fase/:faseId', ah(async (req, res) => {
  const fase = await contexto(req.params.faseId);
  const { latitud, longitud } = coordZ.parse(req.body);
  const respuestas = esquemaRespuestas(fase.formulario.preguntas).parse(req.body.respuestas ?? {});
  const e = await prisma.$transaction((tx) => guardarUna(tx, fase, req.user.id, 'MANUAL', latitud, longitud, respuestas));
  res.status(201).json({ id: e.id, estadoIA: e.estadoIA });
}));

// Importación CSV: columnas = claves de pregunta + lat, lng. ?soloValidar=true no guarda nada.
router.post('/fase/:faseId/csv', upload.single('archivo'), ah(async (req, res) => {
  if (!req.file) throw httpError(400, 'Falta el campo "archivo"');
  const fase = await contexto(req.params.faseId);
  let filas;
  try { filas = parse(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true, delimiter: [',', ';'] }); }
  catch (e) { throw httpError(422, 'CSV inválido: ' + e.message); }
  if (filas.length > MAX_FILAS_CSV) throw httpError(413, `Máximo ${MAX_FILAS_CSV} filas por archivo`);

  const esquema = esquemaRespuestas(fase.formulario.preguntas);
  const multiples = new Set(fase.formulario.preguntas.filter((p) => p.tipo === 'SELECCION_MULTIPLE').map((p) => p.clave));
  const validas = [], errores = [];
  filas.forEach((f, i) => {
    const { lat, lng, ...resto } = f;
    const limpio = {};
    for (const [k, v] of Object.entries(resto)) {
      if (v === '') continue; // celda vacía = sin respuesta
      limpio[k] = multiples.has(k) ? v.split('|').map((x) => x.trim()) : v;
    }
    const r = esquema.safeParse(limpio);
    const c = coordZ.safeParse({ latitud: lat || undefined, longitud: lng || undefined });
    if (r.success && c.success) validas.push({ ...c.data, respuestas: r.data });
    else errores.push({ fila: i + 2, errores: [...(r.error?.issues ?? []), ...(c.error?.issues ?? [])].map((x) => `${x.path.join('.')}: ${x.message}`) });
  });

  if (req.query.soloValidar === 'true' || (errores.length && req.query.parcial !== 'true')) {
    return res.status(errores.length ? 422 : 200).json({ validas: validas.length, errores, guardadas: 0 });
  }
  await prisma.$transaction(async (tx) => {
    for (const v of validas) await guardarUna(tx, fase, req.user.id, 'CSV', v.latitud, v.longitud, v.respuestas);
  }, { timeout: 120000 });
  res.status(201).json({ validas: validas.length, errores, guardadas: validas.length });
}));

router.get('/fase/:faseId', ah(async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 200, 2000);
  const where = { faseId: req.params.faseId };
  const [total, items] = await Promise.all([
    prisma.encuesta.count({ where }),
    prisma.encuesta.findMany({
      where, take, skip: Number(req.query.offset) || 0, orderBy: { createdAt: 'desc' },
      select: { id: true, latitud: true, longitud: true, zonaKey: true, respuestas: true, estadoIA: true, scoreIA: true, prioridad: true, necesidadesPrimarias: true, createdAt: true },
    }),
  ]);
  res.json({ total, items });
}));

// Reintento manual de IA para encuestas en ERROR
router.post('/fase/:faseId/reintentar-ia', ah(async (req, res) => {
  const r = await prisma.encuesta.updateMany({
    where: { faseId: req.params.faseId, estadoIA: 'ERROR' }, data: { estadoIA: 'PENDIENTE', iaIntentos: 0, iaProximoIntento: new Date() },
  });
  res.json({ reencoladas: r.count });
}));

module.exports = router;
