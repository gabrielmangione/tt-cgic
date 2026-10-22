import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const FUNCIONES = [
  ['SUM()', 'Suma de una expresión por hogar'], ['AVG()', 'Promedio'], ['MIN()', 'Mínimo'], ['MAX()', 'Máximo'],
  ['COUNT()', 'Cantidad de hogares; con condición, los que la cumplen'], ['IF(,,)', 'Si condición, valor A, si no valor B'],
  ['PCT(,)', 'Porcentaje: 100 × a / b (0 si b = 0)'], ['DIV(,)', 'División segura'], ['ROUND(,1)', 'Redondeo'],
];
const VACIO = { nombre: '', descripcion: '', formula: '', formato: 'numero', unidad: '', activo: true };

export default function FormulaBuilder() {
  const { evento, formulario } = useMapa();
  const [lista, setLista] = useState([]);
  const [edit, setEdit] = useState(VACIO);
  const [chequeo, setChequeo] = useState(null);
  const [error, setError] = useState(null);
  const areaRef = useRef(null);

  const cargar = () => evento && api.get(`/estadisticos?eventoId=${evento.id}`).then(setLista);
  useEffect(() => { cargar(); }, [evento?.id]);

  const preguntas = formulario?.secciones.flatMap((s) => s.preguntas) ?? [];

  // Inserta texto en la posición del cursor; si hay paréntesis vacíos deja el cursor dentro
  function insertar(txt) {
    const el = areaRef.current, ini = el.selectionStart, fin = el.selectionEnd;
    const nueva = edit.formula.slice(0, ini) + txt + edit.formula.slice(fin);
    setEdit({ ...edit, formula: nueva }); setChequeo(null);
    requestAnimationFrame(() => { el.focus(); const p = ini + (txt.includes('(') ? txt.indexOf('(') + 1 : txt.length); el.setSelectionRange(p, p); });
  }

  async function validar() {
    setError(null);
    const r = await api.post('/estadisticos/validar', { eventoId: evento.id, formula: edit.formula });
    setChequeo(r);
  }

  async function guardar() {
    setError(null);
    try {
      const cuerpo = { ...edit, eventoId: evento.id, unidad: edit.unidad || null, descripcion: edit.descripcion || null };
      delete cuerpo.id; delete cuerpo.creadoAt;
      edit.id ? await api.put(`/estadisticos/${edit.id}`, cuerpo) : await api.post('/estadisticos', cuerpo);
      setEdit(VACIO); setChequeo(null); cargar();
    } catch (e) { setError(e.message); }
  }

  if (!evento) return <section className="panel"><p className="vacio">Elegí un evento.</p></section>;

  return (
    <section className="panel formulas">
      <h2>Estadísticos del evento</h2>
      <div className="formulas-grid">
        <ul className="lista-estadisticos">
          {lista.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setEdit(s); setChequeo(null); }}><strong>{s.nombre}</strong><code>{s.formula}</code></button>
              <button aria-label={`Eliminar ${s.nombre}`} onClick={async () => { await api.del(`/estadisticos/${s.id}`); cargar(); }}>×</button>
            </li>
          ))}
          {!lista.length && <li className="vacio">Todavía no hay estadísticos. Armá el primero a la derecha.</li>}
        </ul>

        <div className="editor">
          <label>Nombre<input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></label>
          <label>Fórmula
            <textarea ref={areaRef} rows={3} spellCheck={false} value={edit.formula} placeholder="PCT(COUNT(nivel_agua > 50), COUNT())"
              onChange={(e) => { setEdit({ ...edit, formula: e.target.value }); setChequeo(null); }} />
          </label>

          <div className="paleta">
            <span>Variables</span>
            {preguntas.map((p) => <button key={p.id} type="button" title={p.etiqueta} onClick={() => insertar(p.clave)}>{p.clave}</button>)}
            <button type="button" title="Puntaje de la IA (0–1)" onClick={() => insertar('score_ia')}>score_ia</button>
          </div>
          <div className="paleta">
            <span>Funciones</span>
            {FUNCIONES.map(([f, ayuda]) => <button key={f} type="button" title={ayuda} onClick={() => insertar(f)}>{f}</button>)}
            {['+', '-', '*', '/', '>', '>=', '==', '&&', '||'].map((o) => <button key={o} type="button" onClick={() => insertar(` ${o} `)}>{o}</button>)}
          </div>

          <div className="fila">
            <label>Formato<select value={edit.formato} onChange={(e) => setEdit({ ...edit, formato: e.target.value })}><option value="numero">Número</option><option value="entero">Entero</option><option value="porcentaje">Porcentaje</option></select></label>
            <label>Unidad<input value={edit.unidad ?? ''} onChange={(e) => setEdit({ ...edit, unidad: e.target.value })} placeholder="personas" /></label>
          </div>

          {chequeo && (chequeo.valida
            ? <p role="status" className="ok">Fórmula válida. Con los datos actuales da <strong>{Number(chequeo.vistaPrevia).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>.</p>
            : <p role="alert" className="error">{chequeo.error}</p>)}
          {error && <p role="alert" className="error">{error}</p>}

          <div className="acciones">
            <button onClick={validar} disabled={!edit.formula.trim()}>Probar fórmula</button>
            <button className="primario" onClick={guardar} disabled={!edit.nombre.trim() || !edit.formula.trim()}>{edit.id ? 'Guardar cambios' : 'Crear estadístico'}</button>
            {edit.id && <button onClick={() => { setEdit(VACIO); setChequeo(null); }}>Cancelar</button>}
          </div>
        </div>
      </div>
    </section>
  );
}
