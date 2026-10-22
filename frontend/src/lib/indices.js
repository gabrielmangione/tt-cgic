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

// Valor de la VARIABLE OBJETIVO por zona. BOOLEANO: % de hogares con «sí». ESCALA: promedio sobre el rango.
// SELECCIÓN: las opciones se ordenan de menos a más grave; se promedia su posición. NUMERO: promedio (se normaliza por el máximo).
export function valorObjetivo(p, resumenZona) {
  const r = resumenZona?.[p.id];
  if (!r) return null;
  switch (p.tipo) {
    case 'BOOLEANO': return r.n ? (100 * r.suma) / r.n : null;
    case 'ESCALA': { const min = p.min ?? 0, max = p.max ?? 10; return r.n ? Math.min(100, Math.max(0, (100 * (r.suma / r.n - min)) / (max - min || 1))) : null; }
    case 'SELECCION_UNICA': case 'SELECCION_MULTIPLE': {
      const ops = p.opciones ?? []; if (ops.length < 2) return null;
      let tot = 0, pes = 0;
      for (const [c, n] of Object.entries(r.categorias)) { const i = ops.indexOf(c); if (i >= 0) { tot += n; pes += (n * i) / (ops.length - 1); } }
      return tot ? (100 * pes) / tot : null;
    }
    case 'NUMERO': return r.n ? r.suma / r.n : null;
    default: return null;
  }
}

/**
 * Índice 0–100 por zona que pinta el mapa.
 *  · Pregunta elegida en el panel: su valor relativo al máximo.
 *  · Panorama general: la VARIABLE OBJETIVO del formulario; si no hay, el promedio del puntaje de IA.
 */
export function indicePorZona({ zonas, encuestas, resumenes, preguntaActiva, objetivo, generalId }) {
  const out = {};
  if (!preguntaActiva && objetivo) {
    const res = resumenes[generalId] ?? {};
    const vals = {};
    for (const z of zonas) { const v = valorObjetivo(objetivo, res[z.id]); if (v != null) vals[z.id] = v; }
    const max = Math.max(0, ...Object.values(vals));
    for (const [k, v] of Object.entries(vals)) out[k] = Math.round(objetivo.tipo === 'NUMERO' ? (max > 0 ? (100 * v) / max : 0) : v);
    return out;
  }
  if (!preguntaActiva) {
    const acc = {};
    for (const e of encuestas) if (e.scoreIA != null && e.zonaKey !== '_') (acc[e.zonaKey] ??= []).push(e.scoreIA);
    for (const [k, v] of Object.entries(acc)) out[k] = Math.round((100 * v.reduce((a, b) => a + b, 0)) / v.length);
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

// ¿Este hogar presenta la problemática de la pregunta?
export function tieneProblema(p, v) {
  if (v == null || v === '') return false;
  if (p.tipo === 'BOOLEANO') return v === true;
  if (p.tipo === 'NUMERO' || p.tipo === 'ESCALA') return Number(v) > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
