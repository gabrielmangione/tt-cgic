const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const multicapa = require('../services/multicapa.service');
const personales = require('../services/personales');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const MAX_FILAS_CSV = 5000;
const SI = new Set(['si', 'sí', 'true', '1', 'x', 'yes']);

/** Validador dinámico de respuestas a partir de las preguntas del formulario. */
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
  return z.object(shape);
}

// Coordenadas: ambas o ninguna. Si no hay coordenadas válidas se usa la zona indicada a mano.
const coordZ = z.object({
  latitud: z.coerce.number().min(-90).max(90).nullish(),
  longitud: z.coerce.number().min(-180).max(180).nullish(),
}).refine((c) => (c.latitud == null) === (c.longitud == null), 'Indicá latitud y longitud juntas');

async function contexto(faseId) {
  const fase = await prisma.fase.findUniqueOrThrow({
    where: { id: faseId },
    include: { evento: { select: { id: true, eliminado: true, jurisdiccionId: true } }, formulario: { include: { preguntas: { include: { seccion: true, capasPregunta: true } } } } },
  });
  if (fase.evento.eliminado) throw httpError(409, 'El evento está eliminado');
  if (!fase.formulario) throw httpError(409, 'La fase no tiene formulario');
  return fase;
}

const esquemas = (fase) => {
  const f = fase.formulario;
  return { resp: esquemaRespuestas(f.preguntas), pers: f.pideDatosPersonales ? personales.esquema(f.datosPersonalesCampos ?? []) : null };
};

/** Valida respuestas, coordenadas y datos personales (+ consentimiento). */
function validarContenido(es, b) {
  const c = coordZ.parse({ latitud: b.latitud, longitud: b.longitud });
  const respuestas = es.resp.parse(b.respuestas ?? {});
  let datosPersonales = null;
  if (es.pers) {
    const dp = es.pers.parse(b.datosPersonales ?? {});
    const limpio = Object.fromEntries(Object.entries(dp).filter(([, v]) => v != null && v !== ''));
    if (Object.keys(limpio).length) {
      if (b.consentimientoDatos !== true) throw httpError(400, 'Falta registrar el consentimiento para tratar datos personales');
      datosPersonales = limpio;
    }
  }
  return { lat: c.latitud ?? null, lng: c.longitud ?? null, zonaId: b.zonaId || null, tareaId: b.tareaId || null, respuestas, datosPersonales, consentimiento: Boolean(datosPersonales) };
}

/** Alcance por rol/tarea: una Organización sólo carga en sus zonas; una tarea limita sus zonas. */
async function crearAlcance(user) {
  const u = await prisma.usuario.findUnique({ where: { id: user.id }, select: { organizacionId: true } });
  const orgId = u?.organizacionId ?? null;
  const zonasOrg = orgId
    ? new Set((await prisma.zona.findMany({ where: { organizaciones: { some: { id: orgId } } }, select: { id: true } })).map((x) => x.id))
    : new Set();
  const tareas = new Map();
  const verificar = async (zonaKey, tareaId) => {
    if (user.rol === 'ORGANIZACION') {
      if (!orgId) throw httpError(403, 'Tu usuario no está asociado a una organización');
      if (zonaKey === '_' || !zonasOrg.has(zonaKey)) throw httpError(403, 'Tu organización no trabaja en esa zona');
    }
    if (tareaId) {
      if (!tareas.has(tareaId)) tareas.set(tareaId, await prisma.tarea.findUnique({ where: { id: tareaId }, include: { zonas: { select: { id: true } } } }));
      const t = tareas.get(tareaId);
      if (!t || (user.rol === 'ADMIN' ? false : t.organizacionId !== orgId)) throw httpError(403, 'Tarea no disponible');
      if (user.rol === 'OPERADOR' && !(await prisma.inscripcion.findUnique({ where: { tareaId_usuarioId: { tareaId, usuarioId: user.id } } }))) throw httpError(403, 'Primero anotate a la actividad');
      if (t.estado === 'CANCELADA' || t.estado === 'COMPLETADA') throw httpError(409, 'La actividad ya está cerrada');
      if (t.zonas.length && !t.zonas.some((x) => x.id === zonaKey)) throw httpError(400, 'La encuesta queda fuera de las zonas de la tarea');
    }
  };
  // Zona por defecto cuando no hay coordenadas ni zona elegida: la de la actividad (si tiene una sola) o la única de la organización
  verificar.porDefecto = async (tareaId) => {
    if (tareaId) {
      if (!tareas.has(tareaId)) tareas.set(tareaId, await prisma.tarea.findUnique({ where: { id: tareaId }, include: { zonas: { select: { id: true } } } }));
      const t = tareas.get(tareaId);
      if (t?.zonas.length === 1) return t.zonas[0].id;
    }
    return user.rol === 'ORGANIZACION' && zonasOrg.size === 1 ? [...zonasOrg][0] : null;
  };
  return verificar;
}

const prepararCtx = async (fase, user) => ({ zonas: await multicapa.cargarZonas(prisma, fase.evento.jurisdiccionId), alcance: await crearAlcance(user) });

// Zona definitiva: coordenadas → zona elegida a mano → zona por defecto → sin zona
async function zonaFinal(ctx, d) {
  const r = multicapa.resolverZona(ctx.zonas, d);
  if (r.zonaKey !== '_') return r;
  const def = await ctx.alcance.porDefecto(d.tareaId);
  return def && ctx.zonas.some((x) => x.id === def) ? { zonaKey: def, zonaOrigen: 'POR_DEFECTO' } : r;
}

async function insertar(tx, fase, ctx, d, extra) {
  const { zonaKey, zonaOrigen } = await zonaFinal(ctx, d);
  await ctx.alcance(zonaKey, extra.validarTarea === false ? null : d.tareaId);
  const { validarTarea, ...resto } = extra;
  const e = await tx.encuesta.create({
    data: {
      faseId: fase.id, latitud: d.lat, longitud: d.lng, zonaKey, zonaOrigen, respuestas: d.respuestas,
      ...(d.datosPersonales && { datosPersonales: d.datosPersonales }), consentimientoDatos: d.consentimiento, tareaId: d.tareaId, ...resto,
    }, // estadoIA = PENDIENTE → lo toma el worker
  });
  await multicapa.aplicar(tx, { eventoId: fase.evento.id, zonaKey, respuestas: d.respuestas }, fase.formulario.preguntas, 1);
  return e;
}

const mensajes = (x) => (x instanceof z.ZodError ? x.issues.map((i) => `${i.path.join('.')}: ${i.message}`) : [x.message]);
const esAdmin = (u) => u.rol === 'ADMIN';
const puedeAlterar = (u, e) => esAdmin(u) || e.cargadaPorId === u.id;

// ───────── Alta individual ─────────
router.post('/fase/:faseId', ah(async (req, res) => {
  const fase = await contexto(req.params.faseId);
  const d = validarContenido(esquemas(fase), req.body);
  const ctx = await prepararCtx(fase, req.user);
  const e = await prisma.$transaction((tx) => insertar(tx, fase, ctx, d, { origen: 'MANUAL', cargadaPorId: req.user.id }));
  res.status(201).json({ id: e.id, estadoIA: e.estadoIA, zonaKey: e.zonaKey, zonaOrigen: e.zonaOrigen });
}));

// ───────── Importación CSV ─────────
// Columnas: claves de pregunta + lat, lng, zona (id o nombre; respaldo si no hay coordenadas),
// dp_<campo> (datos personales) y consentimiento (si/no). ?soloValidar=true no guarda nada.
router.post('/fase/:faseId/csv', upload.single('archivo'), ah(async (req, res) => {
  if (!req.file) throw httpError(400, 'Falta el campo "archivo"');
  const fase = await contexto(req.params.faseId);
  let filas;
  try { filas = parse(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true, delimiter: [',', ';'] }); }
  catch (e) { throw httpError(422, 'CSV inválido: ' + e.message); }
  if (filas.length > MAX_FILAS_CSV) throw httpError(413, `Máximo ${MAX_FILAS_CSV} filas por archivo`);

  const es = esquemas(fase), ctx = await prepararCtx(fase, req.user);
  const multiples = new Set(fase.formulario.preguntas.filter((p) => p.tipo === 'SELECCION_MULTIPLE').map((p) => p.clave));
  const tareaId = req.query.tareaId ? String(req.query.tareaId) : null;
  const validas = [], errores = [];

  for (const [i, f] of filas.entries()) {
    try {
      const { lat, lng, zona, consentimiento, ...resto } = f;
      const respuestas = {}, dp = {};
      for (const [k, v] of Object.entries(resto)) {
        if (v === '') continue;
        if (k.startsWith('dp_')) dp[k.slice(3)] = v;
        else respuestas[k] = multiples.has(k) ? v.split('|').map((x) => x.trim()) : v;
      }
      let zonaId = null;
      if (zona) {
        zonaId = ctx.zonas.find((x) => x.id === zona || x.nombre.toLowerCase() === zona.toLowerCase())?.id;
        if (!zonaId) throw httpError(400, `Zona desconocida: ${zona}`);
      }
      const d = validarContenido(es, { latitud: lat || undefined, longitud: lng || undefined, zonaId, tareaId, respuestas, datosPersonales: dp, consentimientoDatos: SI.has((consentimiento || '').toLowerCase()) });
      const { zonaKey } = await zonaFinal(ctx, d);
      await ctx.alcance(zonaKey, d.tareaId);
      validas.push(d);
    } catch (x) { errores.push({ fila: i + 2, errores: mensajes(x) }); }
  }

  if (req.query.soloValidar === 'true' || (errores.length && req.query.parcial !== 'true')) {
    return res.status(errores.length ? 422 : 200).json({ validas: validas.length, errores, guardadas: 0 });
  }
  await prisma.$transaction(async (tx) => {
    for (const d of validas) await insertar(tx, fase, ctx, d, { origen: 'CSV', cargadaPorId: req.user.id });
  }, { timeout: 120000 });
  res.status(201).json({ validas: validas.length, errores, guardadas: validas.length });
}));

// ───────── Listado ─────────
// ?estado=VIGENTE (defecto) | NO_RELEVADO | todas   ?liviano=1 (sin datos personales: mapa y pie)
router.get('/fase/:faseId', ah(async (req, res) => {
  const take = Math.min(Number(req.query.limit) || 200, 2000);
  const estado = ['VIGENTE', 'NO_RELEVADO', 'todas'].includes(req.query.estado) ? req.query.estado : 'VIGENTE';
  const where = { faseId: req.params.faseId, ...(estado !== 'todas' && { estado }), ...(req.query.zonaKey && { zonaKey: String(req.query.zonaKey) }) };
  const [total, items] = await Promise.all([
    prisma.encuesta.count({ where }),
    prisma.encuesta.findMany({
      where, take, skip: Number(req.query.offset) || 0, orderBy: { createdAt: 'desc' },
      select: {
        id: true, version: true, estado: true, raizId: true, latitud: true, longitud: true, zonaKey: true, zonaOrigen: true, respuestas: true,
        datosPersonales: req.query.liviano !== '1', consentimientoDatos: true, estadoIA: true, scoreIA: true, prioridad: true, necesidadesPrimarias: true,
        tareaId: true, cargadaPorId: true, cargadaPor: { select: { nombre: true } }, modificadaAt: true, motivoCambio: true, createdAt: true,
      },
    }),
  ]);
  // Datos personales: sólo ADMIN o quien cargó la encuesta
  res.json({ total, items: items.map(({ datosPersonales, ...e }) => (datosPersonales !== undefined && puedeAlterar(req.user, e) ? { ...e, datosPersonales } : { ...e, tienePersonales: Boolean(datosPersonales) })) });
}));

// ───────── Modificar = nueva versión; la anterior queda como NO_RELEVADO ─────────
router.put('/:id', ah(async (req, res) => {
  const vieja = await prisma.encuesta.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!puedeAlterar(req.user, vieja)) throw httpError(403, 'Sólo podés modificar las encuestas que cargaste');
  if (vieja.estado !== 'VIGENTE') throw httpError(409, 'Sólo se puede modificar la versión vigente');
  const fase = await contexto(vieja.faseId);
  const b = req.body ?? {};
  const motivo = z.string().max(300).optional().parse(b.motivo);
  const d = validarContenido(esquemas(fase), {
    latitud: 'latitud' in b ? b.latitud : vieja.latitud, longitud: 'longitud' in b ? b.longitud : vieja.longitud,
    zonaId: b.zonaId, tareaId: 'tareaId' in b ? b.tareaId : vieja.tareaId, respuestas: b.respuestas, datosPersonales: b.datosPersonales ?? vieja.datosPersonales, consentimientoDatos: b.consentimientoDatos ?? vieja.consentimientoDatos,
  });
  const ctx = await prepararCtx(fase, req.user);
  const nueva = await prisma.$transaction(async (tx) => {
    await multicapa.aplicar(tx, { eventoId: fase.evento.id, zonaKey: vieja.zonaKey, respuestas: vieja.respuestas }, fase.formulario.preguntas, -1);
    await tx.encuesta.update({ where: { id: vieja.id }, data: { estado: 'NO_RELEVADO' } });
    return insertar(tx, fase, ctx, d, {
      origen: vieja.origen, cargadaPorId: vieja.cargadaPorId, version: vieja.version + 1, raizId: vieja.raizId ?? vieja.id,
      modificadaPorId: req.user.id, modificadaAt: new Date(), motivoCambio: motivo ?? null,
      validarTarea: d.tareaId !== vieja.tareaId, // no bloquear la edición por una tarea ya cerrada
    });
  });
  res.json({ id: nueva.id, version: nueva.version, zonaKey: nueva.zonaKey, zonaOrigen: nueva.zonaOrigen });
}));

// Anular: pasa a NO_RELEVADO sin versión nueva (no se borra nada)
router.delete('/:id', ah(async (req, res) => {
  const e = await prisma.encuesta.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!puedeAlterar(req.user, e)) throw httpError(403, 'Sólo podés anular las encuestas que cargaste');
  if (e.estado !== 'VIGENTE') throw httpError(409, 'La encuesta ya no está vigente');
  const fase = await contexto(e.faseId);
  await prisma.$transaction(async (tx) => {
    await multicapa.aplicar(tx, { eventoId: fase.evento.id, zonaKey: e.zonaKey, respuestas: e.respuestas }, fase.formulario.preguntas, -1);
    await tx.encuesta.update({ where: { id: e.id }, data: { estado: 'NO_RELEVADO', modificadaPorId: req.user.id, modificadaAt: new Date(), motivoCambio: String(req.query.motivo ?? 'Anulada').slice(0, 300) } });
  });
  res.status(204).end();
}));

// Restaurar una encuesta anulada (sólo si no tiene una versión posterior)
router.post('/:id/restaurar', ah(async (req, res) => {
  const e = await prisma.encuesta.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!puedeAlterar(req.user, e)) throw httpError(403, 'Permisos insuficientes');
  if (e.estado !== 'NO_RELEVADO') throw httpError(409, 'La encuesta ya está vigente');
  if (await prisma.encuesta.count({ where: { raizId: e.raizId ?? e.id, version: { gt: e.version } } })) throw httpError(409, 'Tiene una versión posterior: restaurá esa o modificala');
  const fase = await contexto(e.faseId);
  await prisma.$transaction(async (tx) => {
    await multicapa.aplicar(tx, { eventoId: fase.evento.id, zonaKey: e.zonaKey, respuestas: e.respuestas }, fase.formulario.preguntas, 1);
    await tx.encuesta.update({ where: { id: e.id }, data: { estado: 'VIGENTE', modificadaPorId: req.user.id, modificadaAt: new Date(), motivoCambio: 'Restaurada' } });
  });
  res.json({ ok: true });
}));

// Historial completo de una encuesta (todas sus versiones)
router.get('/:id/historial', ah(async (req, res) => {
  const e = await prisma.encuesta.findUniqueOrThrow({ where: { id: req.params.id }, select: { id: true, raizId: true } });
  const raiz = e.raizId ?? e.id;
  const versiones = await prisma.encuesta.findMany({ where: { OR: [{ id: raiz }, { raizId: raiz }] }, orderBy: { version: 'asc' } });
  const ids = [...new Set(versiones.map((v) => v.modificadaPorId).filter(Boolean))];
  const nombres = Object.fromEntries((await prisma.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((u) => [u.id, u.nombre]));
  res.json(versiones.map(({ datosPersonales, ...v }) => ({
    ...v, modificadaPorNombre: nombres[v.modificadaPorId] ?? null,
    ...(puedeAlterar(req.user, v) ? { datosPersonales } : { tienePersonales: Boolean(datosPersonales) }),
  })));
}));

router.post('/fase/:faseId/reintentar-ia', ah(async (req, res) => {
  const r = await prisma.encuesta.updateMany({
    where: { faseId: req.params.faseId, estado: 'VIGENTE', estadoIA: 'ERROR' }, data: { estadoIA: 'PENDIENTE', iaIntentos: 0, iaProximoIntento: new Date() },
  });
  res.json({ reencoladas: r.count });
}));

module.exports = router;
