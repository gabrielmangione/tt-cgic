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

/** Índice 0–100 por zona. Panorama general: promedio del score de IA. Pregunta activa: valor relativo al máximo. */
export function indicePorZona({ zonas, encuestas, resumenes, preguntaActiva }) {
  const out = {};
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

// ¿Este hogar presenta la problemática de la pregunta?
export function tieneProblema(p, v) {
  if (v == null || v === '') return false;
  if (p.tipo === 'BOOLEANO') return v === true;
  if (p.tipo === 'NUMERO' || p.tipo === 'ESCALA') return Number(v) > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
