import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import Modal from './Modal';
import FormularioEncuesta from './FormularioEncuesta';
import { useZonasPermitidas, useTareas } from './CargaEncuestas';

const ESTADOS = [['VIGENTE', 'Vigentes'], ['NO_RELEVADO', 'No relevado (anteriores y anuladas)'], ['todas', 'Todas']];
const ORIGEN = { COORDENADAS: 'por coordenadas', MANUAL: 'manual', SIN_ZONA: 'sin zona', POR_DEFECTO: 'por defecto (zona de la actividad)' };
const fecha = (d) => new Date(d).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const Etiqueta = ({ e }) => <span className={`badge ${e === 'VIGENTE' ? 'vigente' : 'no-relevado'}`}>{e === 'VIGENTE' ? 'Vigente' : 'No relevado'}</span>;

export default function GestionEncuestas({ usuario }) {
  const { fase, formulario, zonas, refrescarDatos } = useMapa();
  const zonasPermitidas = useZonasPermitidas(usuario);
  const tareas = useTareas(usuario);
  const [estado, setEstado] = useState('VIGENTE');
  const [datos, setDatos] = useState({ total: 0, items: [] });
  const [editando, setEditando] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => fase && api.get(`/encuestas/fase/${fase.id}?estado=${estado}&limit=300`).then(setDatos).catch((e) => setError(e.message)), [fase?.id, estado]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!fase || !formulario) return <section className="panel"><p className="vacio">La fase activa necesita un formulario.</p></section>;

  const preguntas = formulario.secciones.flatMap((s) => s.preguntas);
  const objetivo = preguntas.find((p) => p.id === formulario.variableObjetivoId);
  const zonaNombre = (k) => (k === '_' ? '—' : zonas.find((z) => z.id === k)?.nombre ?? k);
  const puede = (e) => usuario?.rol === 'ADMIN' || e.cargadaPorId === usuario?.id;
  const tras = async () => { await Promise.all([cargar(), refrescarDatos()]); };
  const valor = (v) => (Array.isArray(v) ? v.join(', ') : v === true ? 'Sí' : v === false ? 'No' : v ?? '—');

  async function anular(e) {
    const motivo = prompt('Motivo de la anulación (opcional):') ?? null;
    if (motivo === null) return;
    setError(null);
    try { await api.del(`/encuestas/${e.id}?motivo=${encodeURIComponent(motivo || 'Anulada')}`); tras(); } catch (x) { setError(x.message); }
  }
  async function restaurar(e) { setError(null); try { await api.post(`/encuestas/${e.id}/restaurar`); tras(); } catch (x) { setError(x.message); } }

  return (
    <section className="panel gestion">
      <h2>Encuestas · {fase.nombre}</h2>
      <p className="vacio">Al modificar una encuesta se crea una versión nueva; la anterior se conserva como <strong>no relevado</strong> y deja de contar en el mapa y en las estadísticas.</p>
      <label className="filtro">Mostrar<select value={estado} onChange={(e) => setEstado(e.target.value)}>{ESTADOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="tabla-scroll">
        <table className="tabla-vars">
          <thead><tr><th>Fecha</th><th>Ver.</th><th>Estado</th><th>Zona</th>{objetivo && <th>{objetivo.etiqueta}</th>}<th>Prioridad IA</th><th>Cargó</th><th></th></tr></thead>
          <tbody>
            {datos.items.map((e) => (
              <tr key={e.id} className={e.estado === 'NO_RELEVADO' ? 'tenue' : ''}>
                <td>{fecha(e.createdAt)}</td><td>v{e.version}</td><td><Etiqueta e={e.estado} /></td>
                <td>{zonaNombre(e.zonaKey)}<br /><small>{ORIGEN[e.zonaOrigen]}</small></td>
                {objetivo && <td>{valor(e.respuestas?.[objetivo.clave])}</td>}
                <td>{e.prioridad ?? (e.estadoIA === 'PENDIENTE' ? 'en cola' : '—')}</td>
                <td>{e.cargadaPor?.nombre}</td>
                <td className="acciones-fila">
                  <button onClick={() => setHistorial(e)}>Historial</button>
                  {puede(e) && e.estado === 'VIGENTE' && <><button onClick={() => setEditando(e)}>Modificar</button><button onClick={() => anular(e)}>Anular</button></>}
                  {puede(e) && e.estado === 'NO_RELEVADO' && <button onClick={() => restaurar(e)}>Restaurar</button>}
                </td>
              </tr>
            ))}
            {!datos.items.length && <tr><td colSpan={8} className="vacio">No hay encuestas para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="vacio">{datos.items.length} de {datos.total}</p>

      {editando && (
        <Modal titulo="Modificar encuesta" onCerrar={() => setEditando(null)} ancho={820}>
          <div className="panel sin-borde">
            <h2>Modificar encuesta (se creará la versión {editando.version + 1})</h2>
            <FormularioEncuesta formulario={formulario} zonas={zonasPermitidas.length ? zonasPermitidas : zonas} tareas={tareas} inicial={editando} etiquetaBoton="Guardar nueva versión" conMotivo
              onEnviar={async (p) => { const r = await api.put(`/encuestas/${editando.id}`, p); setEditando(null); tras(); return r; }} />
          </div>
        </Modal>
      )}
      {historial && <Historial encuesta={historial} preguntas={preguntas} zonaNombre={zonaNombre} onCerrar={() => setHistorial(null)} valor={valor} />}
    </section>
  );
}

function Historial({ encuesta, preguntas, zonaNombre, onCerrar, valor }) {
  const [versiones, setVersiones] = useState(null);
  useEffect(() => { api.get(`/encuestas/${encuesta.id}/historial`).then(setVersiones); }, [encuesta.id]);
  return (
    <Modal titulo="Historial de versiones" onCerrar={onCerrar} ancho={820}>
      <div className="panel sin-borde">
        <h2>Historial de versiones</h2>
        {!versiones && <p className="vacio">Cargando…</p>}
        {versiones?.map((v) => (
          <article key={v.id} className={`version${v.estado === 'NO_RELEVADO' ? ' tenue' : ''}`}>
            <header><strong>Versión {v.version}</strong> <Etiqueta e={v.estado} /> <small>{fecha(v.createdAt)}{v.modificadaPorNombre && ` · modificada por ${v.modificadaPorNombre}`}</small></header>
            {v.motivoCambio && <p className="nota">Motivo: {v.motivoCambio}</p>}
            <p className="nota">Zona: {zonaNombre(v.zonaKey)} ({ORIGEN[v.zonaOrigen]})</p>
            <dl className="rejilla">{preguntas.filter((p) => v.respuestas?.[p.clave] !== undefined).map((p) => <div key={p.id}><dt>{p.etiqueta}</dt><dd>{valor(v.respuestas[p.clave])}</dd></div>)}</dl>
            {v.datosPersonales && <p className="nota">Datos personales: {Object.entries(v.datosPersonales).map(([k, x]) => `${k}: ${x}`).join(' · ')}</p>}
          </article>
        ))}
      </div>
    </Modal>
  );
}
