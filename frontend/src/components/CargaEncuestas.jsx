import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import FormularioEncuesta from './FormularioEncuesta';

// Zonas que la persona puede usar: el rol Organización sólo ve las de su organización
export function useZonasPermitidas(usuario) {
  const { zonas } = useMapa();
  const [propias, setPropias] = useState(null);
  useEffect(() => {
    if (usuario?.rol === 'ORGANIZACION') api.get('/organizaciones/mia').then((o) => setPropias(new Set((o?.zonas ?? []).map((z) => z.id)))).catch(() => setPropias(new Set()));
  }, [usuario?.rol]);
  return usuario?.rol === 'ORGANIZACION' ? zonas.filter((z) => propias?.has(z.id)) : zonas;
}

export function useTareas() {
  const { fase } = useMapa();
  const [tareas, setTareas] = useState([]);
  useEffect(() => { if (fase) api.get(`/tareas?faseId=${fase.id}`).then((t) => setTareas(t.filter((x) => x.estado === 'PENDIENTE' || x.estado === 'EN_CURSO'))).catch(() => setTareas([])); }, [fase?.id]);
  return tareas;
}

export default function CargaEncuestas({ usuario }) {
  const { fase, formulario, refrescarDatos } = useMapa();
  const zonas = useZonasPermitidas(usuario);
  const tareas = useTareas();
  const [tab, setTab] = useState('individual');
  const [msg, setMsg] = useState(null);
  const [csv, setCsv] = useState({ archivo: null, resultado: null, tareaId: '' });

  if (!fase || !formulario) return <section className="panel"><p className="vacio">Se necesita una fase activa con formulario para cargar encuestas.</p></section>;

  async function procesarCsv(soloValidar) {
    setMsg(null);
    const q = [soloValidar && 'soloValidar=true', csv.tareaId && `tareaId=${csv.tareaId}`].filter(Boolean).join('&');
    try {
      const r = await api.subir(`/encuestas/fase/${fase.id}/csv${q ? `?${q}` : ''}`, csv.archivo);
      setCsv((c) => ({ ...c, resultado: r }));
      if (!soloValidar) { setMsg({ tipo: 'ok', texto: `${r.guardadas} encuestas importadas.` }); refrescarDatos(); }
    } catch (err) {
      if (err.status === 422 && err.detalle?.errores) setCsv((c) => ({ ...c, resultado: err.detalle }));
      else setMsg({ tipo: 'error', texto: err.message });
    }
  }

  const columnas = ['lat', 'lng', 'zona', ...formulario.secciones.flatMap((s) => s.preguntas.map((p) => p.clave)),
    ...(formulario.pideDatosPersonales ? [...(formulario.datosPersonalesCampos ?? []).map((c) => `dp_${c.clave}`), 'consentimiento'] : [])].join(',');

  return (
    <section className="panel carga">
      <h2>Carga de encuestas · {fase.nombre}</h2>
      <div role="tablist" className="tabs">
        <button role="tab" aria-selected={tab === 'individual'} onClick={() => setTab('individual')}>Una por una</button>
        <button role="tab" aria-selected={tab === 'csv'} onClick={() => setTab('csv')}>Importar CSV</button>
      </div>
      {tab === 'individual' ? (
        <FormularioEncuesta formulario={formulario} zonas={zonas} tareas={tareas}
          onEnviar={async (payload) => { const r = await api.post(`/encuestas/fase/${fase.id}`, payload); refrescarDatos(); return r; }} />
      ) : (
        <div>
          {msg && <p role={msg.tipo === 'error' ? 'alert' : 'status'} className={msg.tipo}>{msg.texto}</p>}
          <p>Una fila por hogar. Columnas: <code>{columnas}</code>. La zona se toma de <code>lat</code>/<code>lng</code>; si faltan, de <code>zona</code> (nombre o id). Selección múltiple: separar con <code>|</code>.</p>
          {tareas.length > 0 && <label>Asociar a la tarea<select value={csv.tareaId} onChange={(e) => setCsv({ ...csv, tareaId: e.target.value })}><option value="">Sin tarea</option>{tareas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}</select></label>}
          <input type="file" accept=".csv,text/csv" onChange={(e) => setCsv({ ...csv, archivo: e.target.files?.[0] ?? null, resultado: null })} />
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
