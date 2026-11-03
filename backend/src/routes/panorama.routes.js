const router = require('express').Router();
const { ah, z } = require('../utils');
const { calcular } = require('../services/panorama');

const r1 = (x) => Math.round(x * 10) / 10;

// Panorama general: por zona, promedio del puntaje = Σ puntaje / viviendas relevadas de la zona
router.get('/:faseId', ah(async (req, res) => {
  const { objetivo, fuente, filas } = await calcular(req.params.faseId);
  const zonas = {};
  let suma = 0;
  for (const f of filas) {
    suma += f.puntaje;
    const acc = (zonas[f.zonaKey] ??= { n: 0, suma: 0 });
    acc.n++; acc.suma += f.puntaje;
  }
  res.json({
    objetivo, fuente, total: filas.length, promedio: filas.length ? r1(suma / filas.length) : 0,
    zonas: Object.fromEntries(Object.entries(zonas).filter(([k]) => k !== '_').map(([k, v]) => [k, { n: v.n, promedio: r1(v.suma / v.n) }])),
  });
}));

// Capa "casos más graves": viviendas cuyo puntaje supera el umbral (0–100) elegido por quien mira el mapa
router.get('/:faseId/graves', ah(async (req, res) => {
  const umbral = z.coerce.number().min(0).max(100).default(70).parse(req.query.umbral);
  const { objetivo, filas } = await calcular(req.params.faseId);
  const graves = filas.filter((f) => f.puntaje > umbral).sort((a, b) => b.puntaje - a.puntaje);
  res.json({ umbral, objetivo, total: graves.length, items: graves.slice(0, 1000).map((f) => ({ ...f, puntaje: r1(f.puntaje) })) });
}));

module.exports = router;
