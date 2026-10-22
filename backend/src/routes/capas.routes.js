const router = require('express').Router();
const prisma = require('../db');
const { ah, z, hex } = require('../utils');
const { soloAdmin } = require('../middleware/auth');
const geo = require('../services/geo.service');

const cuerpo = z.object({
  eventoId: z.string(), nombre: z.string().min(1).max(80),
  tipo: z.enum(['GENERAL', 'SECCION', 'BASE', 'ADICIONAL']).default('ADICIONAL'),
  color: hex.default('#1F6F8B'), icon: z.string().max(300).nullable().optional(),
  geojson: z.any().optional(),
  aliasVariables: z.record(z.string().max(80)).default({}),
  variablesActivas: z.array(z.string()).default([]),
  orden: z.number().int().default(0), visible: z.boolean().default(true),
});

/** Aplica alias y visibilidad: sólo viajan al cliente las variables activas, con su alias. */
function proyectar(capa) {
  if (!capa.geojson) return capa;
  const activas = new Set(capa.variablesActivas || []);
  const alias = capa.aliasVariables || {};
  const features = capa.geojson.features.map((f) => ({
    ...f,
    properties: Object.fromEntries(Object.entries(f.properties || {}).filter(([k]) => activas.has(k)).map(([k, v]) => [alias[k] || k, v])),
  }));
  return { ...capa, geojson: { ...capa.geojson, features } };
}

router.get('/', ah(async (req, res) => {
  const eventoId = z.string().parse(req.query.eventoId);
  const capas = await prisma.capa.findMany({ where: { eventoId }, orderBy: { orden: 'asc' } });
  res.json(capas.map(proyectar)); // proyectar también para el rol OPERADOR: nunca ve variables ocultas
}));

router.get('/:id', ah(async (req, res) => {
  const c = await prisma.capa.findUniqueOrThrow({ where: { id: req.params.id } });
  // ?crudo=1 (sólo ADMIN) devuelve todas las propiedades para poder editar alias/variables
  res.json(req.user.rol === 'ADMIN' && req.query.crudo === '1' ? c : proyectar(c));
}));

router.post('/', soloAdmin, ah(async (req, res) => {
  const d = cuerpo.parse(req.body);
  if (d.geojson) d.geojson = geo.normalizar(d.geojson);
  res.status(201).json(await prisma.capa.create({ data: d }));
}));

// Edición: nombre, color, icon, alias, variables activas, orden, visibilidad (y opcionalmente reemplazar geometría)
router.put('/:id', soloAdmin, ah(async (req, res) => {
  const { eventoId, tipo, ...d } = cuerpo.partial().parse(req.body);
  if (d.geojson) d.geojson = geo.normalizar(d.geojson);
  res.json(await prisma.capa.update({ where: { id: req.params.id }, data: d }));
}));

router.delete('/:id', soloAdmin, ah(async (req, res) => { await prisma.capa.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

// Resumen agregado de la capa (alimenta coropletas y diálogos del mapa)
router.get('/:id/resumen', ah(async (req, res) => {
  const filas = await prisma.resumenCapa.findMany({
    where: { capaId: req.params.id, ...(req.query.preguntaId && { preguntaId: String(req.query.preguntaId) }) },
  });
  const porZona = {};
  for (const r of filas) {
    const z_ = (porZona[r.zonaKey] ??= {});
    const p = (z_[r.preguntaId] ??= { n: 0, suma: 0, categorias: {} });
    p.n += r.categoria ? 0 : r.n; p.suma += r.suma;
    if (r.categoria) p.categorias[r.categoria] = r.n;
  }
  res.json(porZona);
}));

module.exports = router;
