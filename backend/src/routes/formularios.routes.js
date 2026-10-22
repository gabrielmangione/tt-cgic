const router = require('express').Router();
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const { soloAdmin } = require('../middleware/auth');

const CLAVE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVADAS = new Set(['true', 'false', 'lat', 'lng', 'score_ia']);

const preguntaZ = z.object({
  id: z.string().optional(),
  clave: z.string().regex(CLAVE, 'clave inválida').max(40).refine((c) => !RESERVADAS.has(c), 'clave reservada'),
  etiqueta: z.string().min(1).max(200), ayuda: z.string().max(400).optional().nullable(),
  tipo: z.enum(['TEXTO', 'NUMERO', 'BOOLEANO', 'SELECCION_UNICA', 'SELECCION_MULTIPLE', 'ESCALA', 'FECHA']),
  opciones: z.array(z.string().min(1)).optional().nullable(),
  requerida: z.boolean().default(false), esCausaUrgencia: z.boolean().default(false),
  peso: z.number().default(1), min: z.number().optional().nullable(), max: z.number().optional().nullable(),
  capasPregunta: z.array(z.object({ capaId: z.string(), agregacion: z.enum(['SUMA', 'PROMEDIO', 'CONTEO']).default('SUMA') })).default([]),
}).superRefine((p, ctx) => {
  if (p.tipo.startsWith('SELECCION') && !p.opciones?.length) ctx.addIssue({ code: 'custom', message: 'Requiere opciones', path: ['opciones'] });
});
const seccionZ = z.object({
  id: z.string().optional(), nombre: z.string().min(1).max(100), capaId: z.string().optional().nullable(),
  preguntas: z.array(preguntaZ).default([]),
});
const formularioZ = z.object({
  titulo: z.string().min(2), descripcion: z.string().optional().nullable(),
  variableObjetivoClave: z.string().optional().nullable(), // se resuelve a variableObjetivoId tras crear las preguntas
  secciones: z.array(seccionZ).min(1),
});

const incluir = {
  secciones: { orderBy: { orden: 'asc' }, include: { preguntas: { orderBy: { orden: 'asc' }, include: { capasPregunta: true } } } },
};

/** Generador dinámico: crea/actualiza secciones y preguntas, sincroniza multicapa y variable objetivo, en UNA transacción. */
async function guardar(tx, faseId, datos) {
  const claves = datos.secciones.flatMap((s) => s.preguntas.map((p) => p.clave));
  if (new Set(claves).size !== claves.length) throw httpError(400, 'Hay claves de pregunta repetidas');
  if (datos.variableObjetivoClave && !claves.includes(datos.variableObjetivoClave)) throw httpError(400, 'variableObjetivoClave no existe en el formulario');

  const form = await tx.formulario.upsert({
    where: { faseId },
    create: { faseId, titulo: datos.titulo, descripcion: datos.descripcion },
    update: { titulo: datos.titulo, descripcion: datos.descripcion },
  });

  const idsSecc = [], idsPreg = [];
  let ordenS = 0;
  for (const s of datos.secciones) {
    const dataS = { nombre: s.nombre, orden: ordenS++, capaId: s.capaId ?? null };
    const sec = s.id
      ? await tx.seccion.update({ where: { id: s.id, formularioId: form.id }, data: dataS })
      : await tx.seccion.create({ data: { ...dataS, formularioId: form.id } });
    idsSecc.push(sec.id);
    let ordenP = 0;
    for (const p of s.preguntas) {
      const { id, capasPregunta, ...campos } = p;
      const data = { ...campos, orden: ordenP++, seccionId: sec.id, opciones: campos.opciones ?? undefined };
      const existente = id
        ? await tx.pregunta.findFirst({ where: { id, formularioId: form.id } })
        : await tx.pregunta.findUnique({ where: { formularioId_clave: { formularioId: form.id, clave: p.clave } } });
      const preg = existente
        ? await tx.pregunta.update({ where: { id: existente.id }, data })
        : await tx.pregunta.create({ data: { ...data, formularioId: form.id } });
      idsPreg.push(preg.id);
      // Multicapa: reemplazo completo de los vínculos pregunta ↔ capa
      await tx.capaPregunta.deleteMany({ where: { preguntaId: preg.id } });
      if (capasPregunta.length) await tx.capaPregunta.createMany({ data: capasPregunta.map((c) => ({ ...c, preguntaId: preg.id })), skipDuplicates: true });
      if (p.clave === datos.variableObjetivoClave) form.variableObjetivoId = preg.id;
    }
  }
  // Lo que ya no viene en el payload se elimina
  await tx.pregunta.deleteMany({ where: { formularioId: form.id, id: { notIn: idsPreg } } });
  await tx.seccion.deleteMany({ where: { formularioId: form.id, id: { notIn: idsSecc } } });
  await tx.formulario.update({ where: { id: form.id }, data: { variableObjetivoId: datos.variableObjetivoClave ? form.variableObjetivoId : null } });
  return tx.formulario.findUniqueOrThrow({ where: { id: form.id }, include: incluir });
}

router.get('/fase/:faseId', ah(async (req, res) => {
  res.json(await prisma.formulario.findUniqueOrThrow({ where: { faseId: req.params.faseId }, include: incluir }));
}));

// Crear o reemplazar el formulario de la fase (edición completa)
router.put('/fase/:faseId', soloAdmin, ah(async (req, res) => {
  const datos = formularioZ.parse(req.body);
  res.json(await prisma.$transaction((tx) => guardar(tx, req.params.faseId, datos), { timeout: 20000 }));
}));

router.post('/fase/:faseId', soloAdmin, ah(async (req, res) => {
  if (await prisma.formulario.findUnique({ where: { faseId: req.params.faseId } })) throw httpError(409, 'La fase ya tiene formulario; usar PUT');
  const datos = formularioZ.parse(req.body);
  res.status(201).json(await prisma.$transaction((tx) => guardar(tx, req.params.faseId, datos), { timeout: 20000 }));
}));

// Edición puntual de una pregunta (incluye multicapa, esCausaUrgencia)
router.patch('/preguntas/:id', soloAdmin, ah(async (req, res) => {
  const d = z.object({ etiqueta: z.string().min(1).optional(), ayuda: z.string().nullable().optional(), opciones: z.array(z.string()).nullable().optional(), requerida: z.boolean().optional(), esCausaUrgencia: z.boolean().optional(), peso: z.number().optional(), capasPregunta: z.array(z.object({ capaId: z.string(), agregacion: z.enum(['SUMA','PROMEDIO','CONTEO']).optional() })).optional() }).parse(req.body);
  const { capasPregunta, ...campos } = d;
  const p = await prisma.$transaction(async (tx) => {
    const x = await tx.pregunta.update({ where: { id: req.params.id }, data: { ...campos, id: undefined } });
    if (Array.isArray(capasPregunta)) {
      await tx.capaPregunta.deleteMany({ where: { preguntaId: x.id } });
      await tx.capaPregunta.createMany({ data: capasPregunta.map((c) => ({ capaId: c.capaId, agregacion: c.agregacion || 'SUMA', preguntaId: x.id })) });
    }
    return x;
  });
  res.json(p);
}));

// Variable objetivo
router.put('/:id/variable-objetivo', soloAdmin, ah(async (req, res) => {
  const { variableObjetivoId } = z.object({ variableObjetivoId: z.string().nullable() }).parse(req.body);
  if (variableObjetivoId) await prisma.pregunta.findFirstOrThrow({ where: { id: variableObjetivoId, formularioId: req.params.id } });
  res.json(await prisma.formulario.update({ where: { id: req.params.id }, data: { variableObjetivoId } }));
}));

module.exports = router;
