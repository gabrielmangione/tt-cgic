import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import { EventoModificar } from './EventoForm'; 
import Modal from './Modal'; 

const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-AR') : '—');
const TIPOS = { RELEVAMIENTO: 'Relevamiento', INTERVENCION: 'Intervención' };

export default function PanelAdmin({ onCambioEventos }) {
  const [tab, setTab] = useState('vigentes');
  return (
    <section className="panel panel-ancho">
      <h2>Panel de control</h2>
      <div role="tablist" className="tabs">
        <button role="tab" aria-selected={tab === 'vigentes'} onClick={() => setTab('vigentes')}>Vigentes y zonas</button>
        <button role="tab" aria-selected={tab === 'historico'} onClick={() => setTab('historico')}>Histórico de eventos y fases</button>
      </div>
      {tab === 'vigentes' ? <Vigentes /> : <Historico onCambio={onCambioEventos} />}
    </section>
  );
}

// Actividades vigentes y zonas precisas donde trabaja cada organización
function Vigentes() {
  const { evento, zonas, jurisdiccion } = useMapa();
  const [todos, setTodos] = useState(!evento);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const cargar = useCallback(() => api.get(`/panel/vigencia${!todos && evento ? `?eventoId=${evento.id}` : ''}`).then(setD).catch((e) => setError(e.message)), [todos, evento?.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const porZona = useMemo(() => Object.fromEntries((d?.zonas ?? []).map((z) => [z.id, z])), [d]);
  if (error) return <p role="alert" className="error">{error}</p>;
  if (!d) return <p className="vacio">Cargando…</p>;
  const orgsActivas = new Set(d.actividades.map((a) => a.organizacionId)).size;

  return (
    <>
      {evento && <label className="check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Incluir todos los eventos (hoy: {evento.nombre})</label>}
      <div className="resumen-panel">
        <div className="tarjeta"><b>{d.actividades.length}</b><span>actividades vigentes</span></div>
        <div className="tarjeta"><b>{orgsActivas}</b><span>organizaciones con actividad</span></div>
        <div className="tarjeta"><b>{d.zonas.length}</b><span>zonas con trabajo en curso</span></div>
      </div>

      {jurisdiccion && zonas.length > 0 && (
        <MapContainer className="mini-mapa" bounds={jurisdiccion.bounds} scrollWheelZoom={false}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          {zonas.filter((z) => z.geometria).map((z) => {
            const w = porZona[z.id];
            return (
              <GeoJSON key={`${z.id}-${w?.organizaciones.length ?? 0}`} data={z.geometria}
                style={{ color: '#10161D', weight: 1, fillColor: w ? '#E2492F' : '#9FB4C0', fillOpacity: w ? Math.min(0.8, 0.35 + 0.2 * w.organizaciones.length) : 0.12 }}
                onEachFeature={(_f, layer) => { const el = document.createElement('span'); el.textContent = `${z.nombre}: ${w ? w.organizaciones.map((o) => o.nombre).join(', ') : 'sin actividad vigente'}`; layer.bindTooltip(el, { sticky: true }); }} />
            );
          })}
        </MapContainer>
      )}

      <h3>Actividades vigentes</h3>
      <div className="tabla-scroll">
        <table className="tabla-vars">
          <thead><tr><th>Actividad</th><th>Organización</th><th>Evento · fase</th><th>Zonas</th><th>Voluntarios</th><th>Encuestas</th><th>Vence</th></tr></thead>
          <tbody>
            {d.actividades.map((a) => (
              <tr key={a.id}>
                <td><strong>{a.titulo}</strong><br /><span className="badge tipo">{TIPOS[a.tipo]}</span></td>
                <td>{a.organizacion.nombre}</td>
                <td>{a.fase.evento.nombre}<br /><small>{a.fase.nombre}</small></td>
                <td><div className="chips-zona">{a.zonas.map((z) => <span className="chip" key={z.id}>{z.nombre}</span>)}</div></td>
                <td>{a._count.inscripciones}{a.cupo ? `/${a.cupo}` : ''}</td>
                <td>{a._count.encuestas}{a.metaEncuestas ? `/${a.metaEncuestas}` : ''}</td>
                <td>{fecha(a.venceAt)}</td>
              </tr>
            ))}
            {!d.actividades.length && <tr><td colSpan={7} className="vacio">No hay actividades vigentes.</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Zonas de cada organización</h3>
      <div className="tabla-scroll">
        <table className="tabla-vars">
          <thead><tr><th>Organización</th><th>Zonas donde trabaja (asignadas)</th><th>Actividades vigentes</th></tr></thead>
          <tbody>
            {d.organizaciones.map((o) => (
              <tr key={o.id}>
                <td>{o.nombre}</td>
                <td><div className="chips-zona">{o.zonasPresencia.length ? o.zonasPresencia.map((z) => <span className="chip" key={z.id}>{z.nombre}</span>) : <span className="vacio">Sin zonas</span>}</div></td>
                <td>{o.actividadesVigentes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
// Todos los eventos y fases que existieron, incluidos los eliminados
function Historico({ onCambio }) {
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState(null);
  const [eventoEditando, setEventoEditando] = useState(null); // Estado para controlar qué evento se está editando
  
  const cargar = useCallback(() => api.get('/panel/historico').then(setEventos).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!eventos) return <p className="vacio">Cargando…</p>;

  return (
    <>
      <p className="vacio">{eventos.length} eventos en total · {eventos.filter((e) => e.eliminado).length} eliminados.</p>
      {eventos.map((e) => (
        <details className="evento-hist" key={e.id}>
          <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', cursor: 'pointer', padding: '8px 0' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: '1' }}>
              <strong>{e.nombre}</strong>
              <span className="chip">{e.tipo}</span>
              <span className="chip">{e.estado}</span>
              {e.eliminado && <span className="badge eliminado">Eliminado {fecha(e.eliminadoAt)}</span>}
              <small>Creado {fecha(e.creadoAt)} · {e.jurisdiccion?.nombre || 'Sin jurisdicción'} · {e.fases.length} fases</small>
            </div>
            
            {/* Acciones para Eventos */}
            <div className="acciones-fila" style={{ display: 'inline-flex', gap: '8px', flexShrink: 0 }} onClick={(ev) => ev.stopPropagation()}>
              {!e.eliminado ? (
                <>
                  <button 
                    type="button" 
                    style={{ background: '#f0f0f0', color: '#333', border: '1px solid #ccc', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }} 
                    onClick={() => setEventoEditando(e)} // Abre el modal pasándole los datos del evento
                  >
                    Modificar
                  </button>
                  <button 
                    type="button" 
                    style={{ background: '#fdf2f2', color: '#d9534f', border: '1px solid #f5c6cb', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500' }} 
                    onClick={async () => {
                      if (confirm(`¿Estás seguro de eliminar el evento «${e.nombre}»?`)) {
                        await api.del(`/eventos/${e.id}`);
                        cargar();
                        onCambio?.();
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </>
              ) : (
                <button 
                  type="button" 
                  style={{ padding: '4px 10px', cursor: 'pointer' }}
                  onClick={async (ev) => { 
                    ev.preventDefault(); 
                    const eventoRestaurado = await api.post(`/eventos/${e.id}/restaurar`); 
                    cargar();       // Refresca la tabla histórica
                    onCambio?.();   // Actualiza la lista general de eventos en App.jsx
                  }}
                >
                  Restaurar
                </button>
              )}
            </div>
          </summary>

          {/* Tabla de fases */}
          <table className="tabla-vars">
            <thead>
              <tr>
                <th>Fase</th>
                <th>Creada</th>
                <th>Estado</th>
                <th>Vigentes</th>
                <th>No relevado</th>
                <th>Tareas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {e.fases.map((f) => (
                <tr key={f.id} style={f.eliminado ? { opacity: 0.6 } : {}}>
                  <td>
                    {f.nombre}
                    {f.eliminado && (
                      <>
                        <br />
                        <small className="badge eliminado">Eliminada {fecha(f.eliminadoAt)}</small>
                      </>
                    )}
                  </td>
                  <td>{fecha(f.createdAt)}</td>
                  <td>{f.activa ? <span className="badge activa">Activa</span> : 'Cerrada'}</td>
                  <td>{f.encuestasVigentes}</td>
                  <td>{f.encuestasNoRelevado}</td>
                  <td>{f._count?.tareas ?? 0}</td>
                  <td>
                    <div className="acciones-fila" style={{ display: 'flex', gap: '6px' }}>
                      {!f.eliminado ? (
                        <>
                          <button 
                            type="button" 
                            style={{ background: '#f0f0f0', color: '#333', border: '1px solid #ccc', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={async () => {
                              const nuevoNombreFase = prompt("Modificar nombre de la fase:", f.nombre);
                              if (nuevoNombreFase) {
                                await api.put(`/eventos/fases/${f.id}`, { nombre: nuevoNombreFase });
                                cargar();
                              }
                            }}
                          >
                            Modificar
                          </button>
                          <button 
                            type="button" 
                            style={{ background: '#fdf2f2', color: '#d9534f', border: '1px solid #f5c6cb', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                            onClick={async () => {
                              if (confirm(`¿Estás seguro de eliminar la fase «${f.nombre}»?`)) {
                                await api.del(`/eventos/fases/${f.id}`);
                                cargar();
                                onCambio?.();
                              }
                            }}
                          >
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <button 
                          type="button" 
                          style={{ background: '#f0f0f0', color: '#333', border: '1px solid #ccc', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                          onClick={async () => {
                            await api.post(`/eventos/fases/${f.id}/restaurar`);
                            cargar();
                            onCambio?.();
                          }}
                        >
                          Restaurar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!e.fases.length && <tr><td colSpan={7} className="vacio">Sin fases.</td></tr>}
            </tbody>
          </table>
        </details>
      ))}

      {/* Modal para Modificar Evento */}
      {eventoEditando && (
        <Modal titulo="Modificar evento" onCerrar={() => setEventoEditando(null)} ancho={720}>
          <EventoModificar 
            evento={eventoEditando} 
            onModificado={async () => { 
              await cargar(); 
              onCambio?.(); 
              setEventoEditando(null); 
            }} 
          />
        </Modal>
      )}
    </>
  );
} 