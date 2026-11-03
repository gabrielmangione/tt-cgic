// Rampa amarillo → naranja → rojo (como el mapa de referencia). t en 0..1
export const rampa = (t) => {
  const s = [[242, 209, 107], [238, 155, 75], [200, 52, 43]];
  const x = Math.min(1, Math.max(0, t)) * 2, i = Math.min(1, Math.floor(x)), f = x - i;
  return `rgb(${s[i].map((c, k) => Math.round(c + (s[i + 1][k] - c) * f)).join(',')})`;
};

export function valorZona(resumenZona, preguntaId) {
  const p = resumenZona?.[preguntaId];
  if (!p) return null;
  if (Object.keys(p.categorias).length) return Object.values(p.categorias).reduce((a, b) => a + b, 0);
  return p.n ? p.suma : null;
}

/**
 * Índice 0–100 por zona que pinta el mapa.
 *  · Pregunta elegida en el panel: su valor relativo al máximo (resúmenes de la capa).
 *  · Panorama general: promedio del puntaje de la variable objetivo = Σ puntaje / viviendas relevadas de la zona (lo calcula el backend).
 */
export function indicePorZona({ zonas, resumenes, preguntaActiva, panorama }) {
  const out = {};
  if (!preguntaActiva) {
    for (const z of zonas) { const p = panorama?.zonas?.[z.id]; if (p?.n) out[z.id] = Math.round(p.promedio); }
    return out;
  }
  const res = resumenes[preguntaActiva.capaId] ?? {};
  const vals = {};
  for (const z of zonas) { const v = valorZona(res[z.id], preguntaActiva.preguntaId); if (v != null) vals[z.id] = v; }
  const max = Math.max(0, ...Object.values(vals));
  for (const [k, v] of Object.entries(vals)) out[k] = max > 0 ? Math.round((100 * v) / max) : 0;
  return out;
}

// Point-in-polygon en el cliente: vista previa de la zona detectada al cargar una encuesta (el backend decide la definitiva)
const enAnillo = (x, y, r) => { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d; } return d; };
const enPoligono = (x, y, rings) => enAnillo(x, y, rings[0]) && !rings.slice(1).some((h) => enAnillo(x, y, h));
export function zonaPorPunto(zonas, lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return zonas.find((z) => {
    const g = z.geometria?.type === 'Feature' ? z.geometria.geometry : z.geometria;
    return g?.type === 'Polygon' ? enPoligono(lng, lat, g.coordinates) : g?.type === 'MultiPolygon' ? g.coordinates.some((q) => enPoligono(lng, lat, q)) : false;
  }) ?? null;
}

// Centroide (punto medio) de una zona: [lat, lng]. Con MultiPolygon se usa el polígono de mayor área.
// Sirve para dibujar las encuestas que no tienen latitud/longitud.
function centroAnillo(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [x0, y0] = r[j], [x1, y1] = r[i], f = x0 * y1 - x1 * y0; a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f; }
  a /= 2;
  return a ? { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) } : null;
}
export function centroide(geom) {
  const g = geom?.type === 'Feature' ? geom.geometry : geom;
  const polis = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  let mejor = null;
  for (const p of polis) { const c = centroAnillo(p[0]); if (c && (!mejor || c.area > mejor.area)) mejor = c; }
  return mejor ? [mejor.y, mejor.x] : null;
}
