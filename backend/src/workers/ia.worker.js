/**
 * Worker de clasificación por IA. Se ejecuta como Deployment separado (node src/workers/ia.worker.js).
 * Cola = tabla Encuesta (estadoIA). Reclama lotes con FOR UPDATE SKIP LOCKED → varias réplicas sin duplicar trabajo.
 */
require('dotenv').config();
const prisma = require('../db');

const IA_URL = process.env.IA_URL; // p. ej. http://clasificador.ia.svc.cluster.local:8080
const LOTE = Number(process.env.IA_LOTE || 32);
const MAX_INTENTOS = 5;
const TIMEOUT_MS = 30000;
let parar = false;

async function recuperarColgadas() {
  await prisma.$executeRaw`UPDATE "Encuesta" SET "estadoIA"='PENDIENTE' WHERE "estadoIA"='PROCESANDO' AND "iaActualizadoAt" < now() - interval '5 minutes'`;
}

function reclamarLote() {
  return prisma.$queryRaw`
    UPDATE "Encuesta" SET "estadoIA"='PROCESANDO', "iaIntentos"="iaIntentos"+1, "iaActualizadoAt"=now()
    WHERE id IN (
      SELECT id FROM "Encuesta"
      WHERE "estadoIA"='PENDIENTE' AND "iaProximoIntento" <= now()
      ORDER BY "createdAt" LIMIT ${LOTE} FOR UPDATE SKIP LOCKED)
    RETURNING id, "faseId", respuestas, latitud, longitud, "iaIntentos"`;
}

const cacheForm = new Map();
async function metaFase(faseId) {
  if (!cacheForm.has(faseId)) {
    const f = await prisma.formulario.findUnique({ where: { faseId }, include: { preguntas: true } });
    cacheForm.set(faseId, {
      objetivo: f?.preguntas.find((p) => p.id === f.variableObjetivoId)?.clave ?? null,
      causas: f?.preguntas.filter((p) => p.esCausaUrgencia).map((p) => p.clave) ?? [],
      pesos: Object.fromEntries((f?.preguntas ?? []).map((p) => [p.clave, p.peso])),
    });
    setTimeout(() => cacheForm.delete(faseId), 60000).unref();
  }
  return cacheForm.get(faseId);
}

async function llamarModelo(instancias) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${IA_URL}/v1/clasificar`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.IA_TOKEN || ''}` },
      body: JSON.stringify({ instancias }),
    });
    if (!r.ok) throw new Error(`IA respondió ${r.status}`);
    return r.json(); // { modelo_version, predicciones: [{id, score, prioridad, necesidades:[{categoria, confianza}]}] }
  } finally { clearTimeout(t); }
}

async function procesarLote() {
  const lote = await reclamarLote();
  if (!lote.length) return 0;
  try {
    const instancias = [];
    for (const e of lote) {
      const m = await metaFase(e.faseId);
      instancias.push({ id: e.id, variables: e.respuestas, lat: e.latitud, lng: e.longitud, objetivo: m.objetivo, causas_urgencia: m.causas, pesos: m.pesos });
    }
    const { modelo_version, predicciones } = await llamarModelo(instancias);
    const porId = new Map(predicciones.map((p) => [p.id, p]));
    await prisma.$transaction(lote.map((e) => {
      const p = porId.get(e.id);
      return p
        ? prisma.encuesta.update({ where: { id: e.id }, data: { estadoIA: 'CLASIFICADA', scoreIA: p.score, prioridad: p.prioridad, necesidadesPrimarias: p.necesidades, modeloVersion: modelo_version, iaActualizadoAt: new Date() } })
        : prisma.encuesta.update({ where: { id: e.id }, data: reintento(e) });
    }));
  } catch (err) {
    console.error('IA falló:', err.message);
    await prisma.$transaction(lote.map((e) => prisma.encuesta.update({ where: { id: e.id }, data: reintento(e) })));
  }
  return lote.length;
}

// Backoff exponencial; tras MAX_INTENTOS queda en ERROR (re-encolable desde la API)
const reintento = (e) => e.iaIntentos >= MAX_INTENTOS
  ? { estadoIA: 'ERROR' }
  : { estadoIA: 'PENDIENTE', iaProximoIntento: new Date(Date.now() + 2 ** e.iaIntentos * 5000) };

async function main() {
  if (!IA_URL) throw new Error('IA_URL no configurada');
  let ciclo = 0;
  while (!parar) {
    if (ciclo++ % 30 === 0) await recuperarColgadas();
    const n = await procesarLote().catch((e) => { console.error(e); return 0; });
    if (n < LOTE) await new Promise((r) => setTimeout(r, 2000)); // cola vacía → espera
  }
  await prisma.$disconnect();
}
['SIGTERM', 'SIGINT'].forEach((s) => process.on(s, () => { parar = true; }));
main();
