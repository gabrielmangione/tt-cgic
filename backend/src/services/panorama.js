const prisma = require('../db');

const acotar = (x) => Math.max(0, Math.min(100, x));

/**
 * Puntaje 0–100 de una vivienda (encuesta).
 *  · Con variable objetivo: su valor normalizado (sí/no → 100/0; escala → posición en el rango; opciones ordenadas de menos a más
 *    grave → posición de la opción; número → relativo al máximo de la fase). Sin respuesta cuenta 0.
 *  · Sin variable objetivo: puntaje de la IA × 100.
 */
function puntaje(obj, r, maxNum, scoreIA) {
  if (!obj) return acotar((scoreIA ?? 0) * 100);
  const v = r?.[obj.clave];
  if (v == null || v === '') return 0;
  const ops = Array.isArray(obj.opciones) ? obj.opciones : [];
  switch (obj.tipo) {
    case 'BOOLEANO': return v === true ? 100 : 0;
    case 'ESCALA': { const min = obj.min ?? 0, max = obj.max ?? 10; return acotar((100 * (Number(v) - min)) / (max - min || 1)); }
    case 'SELECCION_UNICA': { const i = ops.indexOf(v); return ops.length > 1 && i >= 0 ? (100 * i) / (ops.length - 1) : 0; }
    case 'SELECCION_MULTIPLE': {
      const idx = (Array.isArray(v) ? v : []).map((x) => ops.indexOf(x)).filter((i) => i >= 0);
      return ops.length > 1 && idx.length ? (100 * idx.reduce((a, b) => Math.max(a, b), 0)) / (ops.length - 1) : 0;
    }
    case 'NUMERO': return maxNum > 0 ? acotar((100 * Number(v)) / maxNum) : 0;
    default: return 0;
  }
}

/** Puntaje de cada vivienda VIGENTE de la fase. */
exports.calcular = async (faseId) => {
  const form = await prisma.formulario.findUnique({ where: { faseId }, include: { preguntas: true } });
  const obj = form?.preguntas.find((p) => p.id === form.variableObjetivoId) ?? null;
  const filas = await prisma.encuesta.findMany({
    where: { faseId, estado: 'VIGENTE' }, take: 50000,
    select: { id: true, zonaKey: true, latitud: true, longitud: true, respuestas: true, scoreIA: true, prioridad: true },
  });
  const maxNum = obj?.tipo === 'NUMERO' ? filas.reduce((m, f) => Math.max(m, Number(f.respuestas?.[obj.clave]) || 0), 0) : 0;
  return {
    objetivo: obj && { id: obj.id, etiqueta: obj.etiqueta, tipo: obj.tipo },
    fuente: obj ? 'OBJETIVO' : 'IA',
    filas: filas.map(({ respuestas, ...f }) => ({ ...f, puntaje: puntaje(obj, respuestas, maxNum, f.scoreIA) })),
  };
};
