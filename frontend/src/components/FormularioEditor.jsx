import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const TIPOS = [['NUMERO', 'Número'], ['BOOLEANO', 'Sí / No'], ['SELECCION_UNICA', 'Opción única'], ['SELECCION_MULTIPLE', 'Opción múltiple'], ['ESCALA', 'Escala'], ['TEXTO', 'Texto'], ['FECHA', 'Fecha']];
const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, '_$1').slice(0, 40);
let n = 0;
const uid = () => `u${++n}`;
const preguntaVacia = () => ({ uid: uid(), etiqueta: '', clave: '', tipo: 'NUMERO', opcionesTxt: '', requerida: false, esCausaUrgencia: false, peso: 1, capasPregunta: [] });

function aEstado(f) {
  if (!f) return { titulo: 'Relevamiento', secciones: [{ uid: uid(), nombre: 'General', capaId: null, preguntas: [preguntaVacia()] }], objetivo: null };
  let objetivo = null;
  const secciones = f.secciones.map((s) => ({
    uid: uid(), id: s.id, nombre: s.nombre, capaId: s.capaId,
    preguntas: s.preguntas.map((p) => {
      const u = uid(); if (p.id === f.variableObjetivoId) objetivo = u;
      return { uid: u, id: p.id, etiqueta: p.etiqueta, clave: p.clave, tipo: p.tipo, opcionesTxt: (p.opciones ?? []).join(', '), requerida: p.requerida, esCausaUrgencia: p.esCausaUrgencia, peso: p.peso, capasPregunta: p.capasPregunta.map(({ capaId, agregacion }) => ({ capaId, agregacion })) };
    }),
  }));
  return { titulo: f.titulo, descripcion: f.descripcion, secciones, objetivo };
}

export default function FormularioEditor() {
  const { evento, fase, formulario, capas, seleccionarFase } = useMapa();
  const [est, setEst] = useState(() => aEstado(formulario));
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  useEffect(() => { setEst(aEstado(formulario)); }, [formulario, fase?.id]);
  if (!fase) return <p className="vacio">Primero creá una fase (botón + junto al selector de fase).</p>;

  const capasDestino = capas.filter((c) => c.tipo === 'ADICIONAL');
  const setSec = (si, cambio) => setEst((e) => ({ ...e, secciones: e.secciones.map((s, i) => (i === si ? { ...s, ...cambio } : s)) }));
  const setPreg = (si, pi, cambio) => setEst((e) => ({ ...e, secciones: e.secciones.map((s, i) => (i !== si ? s : { ...s, preguntas: s.preguntas.map((p, j) => (j === pi ? { ...p, ...cambio } : p)) })) }));
  const quitar = (si, pi) => setEst((e) => ({ ...e, secciones: e.secciones.map((s, i) => (i !== si ? s : { ...s, preguntas: s.preguntas.filter((_, j) => j !== pi) })) }));
  const alternarCapa = (si, pi, capaId, on) => { const p = est.secciones[si].preguntas[pi]; setPreg(si, pi, { capasPregunta: on ? [...p.capasPregunta, { capaId, agregacion: 'SUMA' }] : p.capasPregunta.filter((c) => c.capaId !== capaId) }); };

  async function guardar() {
    setError(null); setOk(false);
    try {
      const usadas = new Set(), claves = {};
      const secciones = [];
      for (const s of est.secciones) {
        // cada sección tiene su propia capa de resumen: se crea la primera vez
        const capaId = s.capaId ?? (await api.post('/capas', { eventoId: evento.id, nombre: s.nombre, tipo: 'SECCION' })).id;
        const preguntas = s.preguntas.filter((p) => p.etiqueta.trim()).map((p) => {
          let clave = p.clave || slug(p.etiqueta) || 'pregunta'; const base = clave; let i = 2;
          while (usadas.has(clave)) clave = `${base}_${i++}`;
          usadas.add(clave); claves[p.uid] = clave;
          return { ...(p.id && { id: p.id }), clave, etiqueta: p.etiqueta.trim(), tipo: p.tipo, requerida: p.requerida, esCausaUrgencia: p.esCausaUrgencia, peso: Number(p.peso) || 1, capasPregunta: p.capasPregunta,
            opciones: p.tipo.startsWith('SELECCION') ? p.opcionesTxt.split(',').map((x) => x.trim()).filter(Boolean) : null };
        });
        secciones.push({ ...(s.id && { id: s.id }), nombre: s.nombre, capaId, preguntas });
      }
      await api.put(`/formularios/fase/${fase.id}`, { titulo: est.titulo, descripcion: est.descripcion ?? null, variableObjetivoClave: claves[est.objetivo] ?? null, secciones });
      await seleccionarFase(fase.id);
      setOk(true);
    } catch (e) { setError(e.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || e.message); }
  }

  return (
    <>
      <h2>Formulario de «{fase.nombre}»</h2>
      <label>Título<input value={est.titulo} onChange={(e) => setEst({ ...est, titulo: e.target.value })} /></label>
      {est.secciones.map((s, si) => (
        <fieldset key={s.uid}>
          <legend>Sección</legend>
          <div className="fila-sec"><input value={s.nombre} onChange={(e) => setSec(si, { nombre: e.target.value })} aria-label="Nombre de la sección" />
            <button type="button" onClick={() => setEst((e) => ({ ...e, secciones: e.secciones.filter((_, i) => i !== si) }))} disabled={est.secciones.length === 1}>Quitar sección</button></div>
          {s.preguntas.map((p, pi) => (
            <div className="pregunta-ed" key={p.uid}>
              <input value={p.etiqueta} onChange={(e) => setPreg(si, pi, { etiqueta: e.target.value })} placeholder="Pregunta (ej. Nivel de agua en la vivienda)" aria-label="Pregunta" />
              <select value={p.tipo} onChange={(e) => setPreg(si, pi, { tipo: e.target.value })} aria-label="Tipo">{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
              <button type="button" onClick={() => quitar(si, pi)} aria-label="Quitar pregunta">×</button>
              {p.tipo.startsWith('SELECCION') && <input className="ancho" value={p.opcionesTxt} onChange={(e) => setPreg(si, pi, { opcionesTxt: e.target.value })} placeholder="Opciones separadas por coma" aria-label="Opciones" />}
              <div className="ancho marcas">
                <label className="check"><input type="checkbox" checked={p.requerida} onChange={(e) => setPreg(si, pi, { requerida: e.target.checked })} />Obligatoria</label>
                <label className="check"><input type="checkbox" checked={p.esCausaUrgencia} onChange={(e) => setPreg(si, pi, { esCausaUrgencia: e.target.checked })} />Causa de urgencia</label>
                <label className="check"><input type="radio" name="objetivo" checked={est.objetivo === p.uid} onChange={() => setEst({ ...est, objetivo: p.uid })} />Variable objetivo</label>
                {capasDestino.map((c) => <label className="check" key={c.id}><input type="checkbox" checked={p.capasPregunta.some((x) => x.capaId === c.id)} onChange={(e) => alternarCapa(si, pi, c.id, e.target.checked)} />Aporta a «{c.nombre}»</label>)}
              </div>
            </div>
          ))}
          <button type="button" onClick={() => setSec(si, { preguntas: [...s.preguntas, preguntaVacia()] })}>Agregar pregunta</button>
        </fieldset>
      ))}
      <div className="acciones">
        <button type="button" onClick={() => setEst((e) => ({ ...e, secciones: [...e.secciones, { uid: uid(), nombre: 'Nueva sección', capaId: null, preguntas: [preguntaVacia()] }] }))}>Agregar sección</button>
        <button className="primario" onClick={guardar}>Guardar formulario</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {ok && <p role="status" className="ok">Formulario guardado.</p>}
    </>
  );
}
