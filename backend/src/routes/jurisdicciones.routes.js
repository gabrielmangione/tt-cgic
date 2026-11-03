const router = require('express').Router();
const prisma = require('../db');
const { ah, z } = require('../utils');
const { soloAdmin } = require('../middleware/auth');
const geo = require('../services/geo.service');

// Mapa base de la zona a relevar: se guarda geometría + centro/bounds calculados en el servidor
const cuerpo = z.object({ nombre: z.string().min(2), geojson: z.any(), fuente: z.string().optional() });

router.get('/', ah(async (_req, res) => {
  res.json(await prisma.jurisdiccion.findMany({ select: { id: true, nombre: true, centro: true, bounds: true, fuente: true } }));
}));
router.get('/:id', ah(async (req, res) => res.json(await prisma.jurisdiccion.findUniqueOrThrow({ where: { id: req.params.id } }))));

router.post('/', soloAdmin, ah(async (req, res) => {
  const d = cuerpo.parse(req.body);
  const fc = geo.normalizar(d.geojson);
  const { bounds, centro } = geo.calcularBounds(fc);
  res.status(201).json(await prisma.jurisdiccion.create({ data: { nombre: d.nombre, fuente: d.fuente, geometria: fc, bounds, centro } }));
}));

router.put('/:id', soloAdmin, ah(async (req, res) => {
  const d = cuerpo.partial().parse(req.body);
  const data = { ...(d.nombre && { nombre: d.nombre }), ...(d.fuente && { fuente: d.fuente }) };
  if (d.geojson) { const fc = geo.normalizar(d.geojson); Object.assign(data, { geometria: fc, ...geo.calcularBounds(fc) }); }
  res.json(await prisma.jurisdiccion.update({ where: { id: req.params.id }, data }));
}));

router.delete('/:id', soloAdmin, ah(async (req, res) => {
  await prisma.evento.updateMany({
    where: { jurisdiccionId: req.params.id },
    data: { jurisdiccionId: null }
  });

  await prisma.jurisdiccion.delete({
    where: { id: req.params.id },
  });
  
  res.status(204).end();
}));

module.exports = router;
