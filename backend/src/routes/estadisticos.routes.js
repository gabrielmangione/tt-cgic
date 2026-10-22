const router = require('express').Router();
const prisma = require('../db');
const { ah, z } = require('../utils');
const { soloAdmin } = require('../middleware/auth');
const { compilar, evaluar, FormulaError, FUNCIONES } = require('../services/formula.engine');

const cuerpo = z.object({
  eventoId: z.string(), nombre: z.string().min(2).max(80), descripcion: z.string().max(300).optional().nullable(),
  formula: z.string().min(1).max(500), formato: z.enum(['numero', 'entero', 'porcentaje']).default('numero'),
  unidad: z.string().max(30).optional().nullable(), orden: z.number().int().default(0), activo: z.boolean().default(true),
});

// Variables válidas = claves de preguntas de TODAS las fases del evento + score_ia
async function variablesDelEvento(eventoId) {
  const p = await prisma.pregunta.findMany({ where: { formulario: { fase: { eventoId } } }, select: { clave: true, tipo: true } });
  return new Set([...p.map((x) => x.clave), 'score_ia']);
}
const fila = (e) => ({ ...(e.respuestas || {}), score_ia: e.scoreIA ?? 0 });

router.get('/', ah(async (req, res) => {
  res.json(await prisma.estadistico.findMany({ where: { eventoId: z.string().parse(req.query.eventoId) }, orderBy: { orden: 'asc' } }));
}));

router.get('/funciones', (_req, res) => res.json(FUNCIONES));

// Valida la fórmula (y la prueba con datos reales) sin guardarla
router.post('/validar', soloAdmin, ah(async (req, res) => {
  const { eventoId, formula } = z.object({ eventoId: z.string(), formula: z.string().max(500) }).parse(req.body);
  try {
    const c = compilar(formula, await variablesDelEvento(eventoId));
    const filas = (await prisma.encuesta.findMany({ where: { fase: { eventoId } }, take: 5000, select: { respuestas: true, scoreIA: true } })).map(fila);
    res.json({ valida: true, variables: c.variables, vistaPrevia: evaluar(c, filas) });
  } catch (e) {
    if (e instanceof FormulaError) return res.json({ valida: false, error: e.message });
    throw e;
  }
}));

async function validarOFallar(d) {
  try { compilar(d.formula, await variablesDelEvento(d.eventoId)); }
  catch (e) { if (e instanceof FormulaError) { const err = new Error(e.message); err.status = 400; throw err; } throw e; }
}

router.post('/', soloAdmin, ah(async (req, res) => { const d = cuerpo.parse(req.body); await validarOFallar(d); res.status(201).json(await prisma.estadistico.create({ data: d })); }));
router.put('/:id', soloAdmin, ah(async (req, res) => {
  const d = cuerpo.partial().parse(req.body);
  if (d.formula) { const actual = await prisma.estadistico.findUniqueOrThrow({ where: { id: req.params.id } }); await validarOFallar({ eventoId: d.eventoId ?? actual.eventoId, formula: d.formula }); }
  res.json(await prisma.estadistico.update({ where: { id: req.params.id }, data: d }));
}));
router.delete('/:id', soloAdmin, ah(async (req, res) => { await prisma.estadistico.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

// Cálculo en tiempo real (footer): ?eventoId=&faseId=&zonaKey=
router.get('/calcular', ah(async (req, res) => {
  const eventoId = z.string().parse(req.query.eventoId);
  const where = { fase: { eventoId, ...(req.query.faseId && { id: String(req.query.faseId) }) }, ...(req.query.zonaKey && { zonaKey: String(req.query.zonaKey) }) };
  const [defs, encuestas] = await Promise.all([
    prisma.estadistico.findMany({ where: { eventoId, activo: true }, orderBy: { orden: 'asc' } }),
    prisma.encuesta.findMany({ where, take: 50000, select: { respuestas: true, scoreIA: true } }),
  ]);
  const filas = encuestas.map(fila);
  const resultados = defs.map((d) => {
    try { return { id: d.id, nombre: d.nombre, formato: d.formato, unidad: d.unidad, valor: evaluar(compilar(d.formula), filas) }; }
    catch (e) { if (e instanceof FormulaError) return { id: d.id, nombre: d.nombre, formato: d.formato, unidad: d.unidad, valor: null, error: e.message }; throw e; }
  });
  res.json({ totalEncuestas: filas.length, resultados });
}));

module.exports = router;
