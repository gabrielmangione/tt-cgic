import { useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

function Campo({ p, valor, onChange }) {
  const id = `q-${p.clave}`;
  switch (p.tipo) {
    case 'NUMERO': return <input id={id} type="number" inputMode="decimal" min={p.min ?? undefined} max={p.max ?? undefined} value={valor ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'ESCALA': return <input id={id} type="range" min={p.min ?? 0} max={p.max ?? 10} value={valor ?? p.min ?? 0} onChange={(e) => onChange(Number(e.target.value))} />;
    case 'BOOLEANO': return <select id={id} value={valor === undefined ? '' : String(valor)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">—</option><option value="true">Sí</option><option value="false">No</option></select>;
    case 'SELECCION_UNICA': return <select id={id} value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)}><option value="">—</option>{p.opciones?.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'SELECCION_MULTIPLE': return (
      <fieldset id={id}>{p.opciones?.map((o) => (
        <label key={o} className="check"><input type="checkbox" checked={valor?.includes(o) ?? false} onChange={(e) => onChange(e.target.checked ? [...(valor ?? []), o] : (valor ?? []).filter((x) => x !== o))} />{o}</label>
      ))}</fieldset>
    );
    case 'FECHA': return <input id={id} type="date" value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
    default: return <textarea id={id} rows={2} value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
}

export default function CargaEncuestas() {
  const { fase, formulario, refrescarDatos } = useMapa();
  const [tab, setTab] = useState('individual');
  const [resp, setResp] = useState({});
  const [coord, setCoord] = useState({ latitud: '', longitud: '' });
  const [msg, setMsg] = useState(null);
  const [csv, setCsv] = useState({ archivo: null, resultado: null });

  if (!fase || !formulario) return <section className="panel"><p className="vacio">Se necesita una fase activa con formulario para cargar encuestas.</p></section>;

  const ubicar = () => navigator.geolocation?.getCurrentPosition(
    (p) => setCoord({ latitud: p.coords.latitude.toFixed(6), longitud: p.coords.longitude.toFixed(6) }),
    () => setMsg({ tipo: 'error', texto: 'No se pudo obtener la ubicación. Ingresala a mano.' }),
  );

  async function enviar(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post(`/encuestas/fase/${fase.id}`, {
        latitud: coord.latitud === '' ? undefined : Number(coord.latitud),
        longitud: coord.longitud === '' ? undefined : Number(coord.longitud),
        respuestas: resp,
      });
      setResp({}); setMsg({ tipo: 'ok', texto: 'Encuesta guardada. La IA la clasificará en unos segundos.' });
      refrescarDatos();
    } catch (err) {
      const det = err.detalle?.detalle?.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');
      setMsg({ tipo: 'error', texto: det || err.message });
    }
  }

  async function procesarCsv(soloValidar) {
    setMsg(null);
    try {
      const r = await api.subir(`/encuestas/fase/${fase.id}/csv${soloValidar ? '?soloValidar=true' : ''}`, csv.archivo);
      setCsv((c) => ({ ...c, resultado: r }));
      if (!soloValidar) { setMsg({ tipo: 'ok', texto: `${r.guardadas} encuestas importadas.` }); refrescarDatos(); }
    } catch (err) {
      if (err.status === 422 && err.detalle?.errores) setCsv((c) => ({ ...c, resultado: err.detalle }));
      else setMsg({ tipo: 'error', texto: err.message });
    }
  }

  const columnas = ['lat', 'lng', ...formulario.secciones.flatMap((s) => s.preguntas.map((p) => p.clave))].join(',');

  return (
    <section className="panel carga">
      <h2>Carga de encuestas · {fase.nombre}</h2>
      <div role="tablist" className="tabs">
        <button role="tab" aria-selected={tab === 'individual'} onClick={() => setTab('individual')}>Una por una</button>
        <button role="tab" aria-selected={tab === 'csv'} onClick={() => setTab('csv')}>Importar CSV</button>
      </div>
      {msg && <p role={msg.tipo === 'error' ? 'alert' : 'status'} className={msg.tipo}>{msg.texto}</p>}

      {tab === 'individual' ? (
        <form onSubmit={enviar}>
          <fieldset className="ubicacion">
            <legend>Ubicación del hogar</legend>
            <label>Latitud<input value={coord.latitud} onChange={(e) => setCoord({ ...coord, latitud: e.target.value })} inputMode="decimal" /></label>
            <label>Longitud<input value={coord.longitud} onChange={(e) => setCoord({ ...coord, longitud: e.target.value })} inputMode="decimal" /></label>
            <button type="button" onClick={ubicar}>Usar mi ubicación</button>
          </fieldset>
          {formulario.secciones.map((s) => (
            <fieldset key={s.id}>
              <legend>{s.nombre}</legend>
              {s.preguntas.map((p) => (
                <div className="campo" key={p.id}>
                  <label htmlFor={`q-${p.clave}`}>{p.etiqueta}{p.requerida && ' *'}</label>
                  <Campo p={p} valor={resp[p.clave]} onChange={(v) => setResp((r) => ({ ...r, [p.clave]: v }))} />
                  {p.ayuda && <small>{p.ayuda}</small>}
                </div>
              ))}
            </fieldset>
          ))}
          <button className="primario" type="submit">Guardar encuesta</button>
        </form>
      ) : (
        <div>
          <p>Una fila por hogar. Columnas esperadas: <code>{columnas}</code>. En preguntas de selección múltiple separá las opciones con <code>|</code>.</p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setCsv({ archivo: e.target.files?.[0] ?? null, resultado: null })} />
          <div className="acciones">
            <button disabled={!csv.archivo} onClick={() => procesarCsv(true)}>Validar sin guardar</button>
            <button className="primario" disabled={!csv.archivo} onClick={() => procesarCsv(false)}>Importar</button>
          </div>
          {csv.resultado && (
            <div className="resultado-csv">
              <p>{csv.resultado.validas} filas válidas · {csv.resultado.errores.length} con errores</p>
              <ul>{csv.resultado.errores.slice(0, 50).map((x) => <li key={x.fila}>Fila {x.fila}: {x.errores.join('; ')}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
