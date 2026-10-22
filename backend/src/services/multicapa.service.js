/**
 * Flujo multicapa: una respuesta modifica (a) la capa GENERAL del evento, (b) la capa de la SECCIÓN de cada
 * pregunta y (c) las capas listadas en capasPregunta. Se actualiza ResumenCapa de forma incremental.
 * signo = +1 al cargar, -1 al revertir (borrado de encuesta).
 */
const geo = require('./geo.service');

const valorNumerico = (p, v) => (p.tipo === 'BOOLEANO' ? (v ? 1 : 0) : p.tipo === 'NUMERO' || p.tipo === 'ESCALA' ? Number(v) || 0 : 0);

exports.zonaParaPunto = async (tx, jurisdiccionId, lat, lng) => {
  if (lat == null || lng == null) return '_';
  const zonas = await tx.zona.findMany({ where: { jurisdiccionId, geometria: { not: null } }, select: { id: true, geometria: true } });
  return zonas.find((z) => geo.puntoEnGeometria(lat, lng, z.geometria))?.id ?? '_';
};

exports.aplicar = async (tx, { eventoId, zonaKey, respuestas }, preguntas, signo = 1) => {
  const general = await tx.capa.findFirst({ where: { eventoId, tipo: 'GENERAL' }, select: { id: true } });
  const ops = new Map(); // `${capa}|${preg}|${cat}` → {n, suma}
  const acumular = (capaId, p, categoria, suma) => {
    const k = `${capaId}|${p.id}|${categoria}`;
    const o = ops.get(k) ?? { capaId, preguntaId: p.id, categoria, n: 0, suma: 0 };
    o.n += signo; o.suma += signo * suma; ops.set(k, o);
  };
  for (const p of preguntas) {
    const v = respuestas[p.clave];
    if (v === undefined || v === null || v === '') continue;
    const capas = new Set([general?.id, p.seccion?.capaId, ...p.capasPregunta.map((c) => c.capaId)].filter(Boolean));
    const categorias = p.tipo === 'SELECCION_UNICA' ? [String(v)] : p.tipo === 'SELECCION_MULTIPLE' ? v.map(String) : null;
    for (const capaId of capas) {
      if (categorias) categorias.forEach((c) => acumular(capaId, p, c, 0));
      else acumular(capaId, p, '', valorNumerico(p, v));
    }
  }
  for (const o of ops.values()) {
    await tx.resumenCapa.upsert({
      where: { capaId_zonaKey_preguntaId_categoria: { capaId: o.capaId, zonaKey, preguntaId: o.preguntaId, categoria: o.categoria } },
      create: { capaId: o.capaId, zonaKey, preguntaId: o.preguntaId, categoria: o.categoria, n: o.n, suma: o.suma },
      update: { n: { increment: o.n }, suma: { increment: o.suma } },
    });
  }
};
