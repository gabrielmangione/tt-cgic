import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import Modal from './Modal';

const ESTADOS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' };
const TIPOS = { RELEVAMIENTO: 'Relevamiento', INTERVENCION: 'Intervención' };
const VACIA = { titulo: '', descripcion: '', tipo: 'RELEVAMIENTO', zonaIds: [], metaEncuestas: '', cupo: '', venceAt: '', organizacionId: '' };

const th = { padding: '10px', textAlign: 'left' };
const td = { padding: '12px 10px', verticalAlign: 'top' };
const campo = { width: '100%', padding: '8px', marginTop: '4px', borderRadius: '4px', border: '1px solid #ced4da', boxSizing: 'border-box' };
const label = { display: 'block', marginBottom: '12px', fontSize: '0.9rem' };

export default function Tareas({ usuario }) {
  const { fase } = useMapa();

  const rol = usuario?.rol;
  const admin = rol === 'ADMIN';
  const gestiona = rol === 'ADMIN' || rol === 'ORGANIZACION';

  const [lista, setLista] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState(VACIA);
  const [error, setError] = useState(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = useCallback(() => {
    if (!fase) return;
    api.get(`/tareas?faseId=${fase.id}`).then(setLista).catch(() => setLista([]));
  }, [fase?.id]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!gestiona) return;
    if (admin) {
      api.get('/organizaciones').then(setOrgs).catch(() => setOrgs([]));
    } else {
      api.get('/organizaciones/mia').then((o) => setOrgs(o ? [o] : [])).catch(() => setOrgs([]));
    }
  }, [admin, gestiona]);

  if (!fase) return <section className="panel"><p className="vacio">Elegí una fase para ver sus actividades.</p></section>;

  const orgId = admin ? f.organizacionId : orgs[0]?.id;
  const zonasOrg = admin
    ? (orgs.find((o) => o.id === orgId)?.zonas ?? [])
    : (orgs[0]?.zonas ?? []);

  const marcar = (id, on) =>
    setF((x) => ({ ...x, zonaIds: on ? [...x.zonaIds, id] : x.zonaIds.filter((z) => z !== id) }));

  // Devuelve true si salió bien, para poder cerrar el modal
  const guardia = async (fn) => {
    setError(null);
    try {
      await fn();
      cargar();
      return true;
    } catch (x) {
      setError(x.detalle?.detalle?.map?.((i) => i.message).join(' · ') || x.message);
      return false;
    }
  };

  const abrirForm = () => { setError(null); setF(VACIA); setMostrarForm(true); };
  const cerrarForm = () => { setMostrarForm(false); setError(null); };

  const crear = async (e) => {
    e.preventDefault();
    if (!gestiona) return; // defensa extra en el cliente (el backend también debe validar el rol)
    const ok = await guardia(() =>
      api.post('/tareas', {
        faseId: fase.id,
        titulo: f.titulo,
        descripcion: f.descripcion || null,
        tipo: f.tipo,
        zonaIds: f.zonaIds,
        metaEncuestas: f.metaEncuestas ? Number(f.metaEncuestas) : null,
        cupo: f.cupo ? Number(f.cupo) : null,
        venceAt: f.venceAt || null,
        ...(admin && f.organizacionId && { organizacionId: f.organizacionId }),
        ...(!admin && orgs[0]?.id && { organizacionId: orgs[0].id }),
      })
    );
    if (ok) { setF(VACIA); setMostrarForm(false); }
  };

  const columnas = 4;

  return (
    <section className="panel" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Gestión de Actividades · {fase.nombre}</h2>
        {gestiona && (
          <button type="button" className="primario" onClick={abrirForm} style={{ padding: '8px 14px', cursor: 'pointer' }}>
            + Nueva actividad
          </button>
        )}
      </div>

      {error && !mostrarForm && <p role="alert" className="error">{error}</p>}

      {/* TABLA DE ACTIVIDADES */}
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '8px', border: '1px solid #dee2e6', marginTop: '15px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #dee2e6', background: '#f8f9fa' }}>
              <th style={th}>Actividad / Descripción</th>
              <th style={th}>Zona de trabajo</th>
              <th style={{ ...th, textAlign: 'center' }}>Cupo / Inscriptos</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={columnas} style={{ padding: '30px', textAlign: 'center', color: '#6c757d' }}>
                  No hay actividades registradas en esta fase.
                </td>
              </tr>
            )}

            {lista.map((t) => {
              const hechas = t._count?.encuestas || 0;
              return (
                <tr key={t.id} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#212529' }}>{t.titulo}</div>
                    <div style={{ margin: '4px 0 6px 0', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span style={{ background: '#e7f1ff', color: '#0d6efd', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {TIPOS[t.tipo]}
                      </span>
                      {admin && t.organizacion?.nombre && (
                        <span style={{ color: '#6c757d', fontSize: '0.75rem' }}>· Org: {t.organizacion.nombre}</span>
                      )}
                    </div>
                    {t.descripcion
                      ? <p style={{ margin: '4px 0', color: '#495057', fontSize: '0.85rem' }}>{t.descripcion}</p>
                      : <span style={{ color: '#adb5bd', fontSize: '0.8rem', fontStyle: 'italic' }}>Sin descripción</span>}

                    {t.tipo === 'RELEVAMIENTO' && (
                      <div style={{ marginTop: '8px', maxWidth: '200px' }}>
                        <div style={{ background: '#e9ecef', height: '5px', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ background: '#0d6efd', height: '100%', width: `${t.metaEncuestas ? Math.min(100, (100 * hechas) / t.metaEncuestas) : 0}%` }} />
                        </div>
                        <small style={{ color: '#6c757d', fontSize: '0.75rem' }}>
                          {hechas}{t.metaEncuestas ? ` / ${t.metaEncuestas}` : ''} encuestas
                        </small>
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    {t.zonas?.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {t.zonas.map((z) => (
                          <span key={z.id} style={{ background: '#f8f9fa', border: '1px solid #ced4da', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            📍 {z.nombre}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#adb5bd', fontSize: '0.8rem', fontStyle: 'italic' }}>Sin zona asignada</span>
                    )}
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#333' }}>{t.inscriptos || 0}</span>
                    <span style={{ color: '#6c757d' }}>{t.cupo ? ` / ${t.cupo}` : ' (Sin límite)'}</span>
                  </td>

                  <td style={{ ...td, textAlign: 'center' }}>
                    {gestiona ? (
                      <select
                        value={t.estado}
                        onChange={(e) => guardia(() => api.put(`/tareas/${t.id}`, { estado: e.target.value }))}
                        aria-label={`Estado de ${t.titulo}`}
                        style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ced4da', fontSize: '0.85rem' }}
                      >
                        {Object.entries(ESTADOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                      </select>
                    ) : (
                      <span className={`badge ${t.vigente ? 'vigente' : 'no-relevado'}`}>{t.vigente ? 'Vigente' : ESTADOS[t.estado]}</span>
                    )}
                    {t.venceAt && (
                      <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '4px' }}>
                        Vence: {new Date(t.venceAt).toLocaleDateString('es-AR')}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL: NUEVA ACTIVIDAD (solo ADMIN / ORGANIZACION) */}
      {gestiona && mostrarForm && (
        <Modal titulo="Nueva actividad" onCerrar={cerrarForm} ancho={560}>
          <div className="panel sin-borde">
          <h2>Nueva actividad</h2>
          <form onSubmit={crear}>
            {error && <p role="alert" className="error">{error}</p>}

            {admin && (
              <label style={label}>Organización
                <select required value={f.organizacionId} onChange={(e) => setF({ ...f, organizacionId: e.target.value, zonaIds: [] })} style={campo}>
                  <option value="">Elegí una organización…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </label>
            )}

            <label style={label}>Título
              <input required minLength={3} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} style={campo} />
            </label>

            <label style={label}>Tipo
              <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} style={campo}>
                {Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>

            <label style={label}>Descripción
              <textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} style={campo} />
            </label>

            <fieldset style={{ border: '1px solid #ced4da', padding: '12px', marginBottom: '12px', borderRadius: '4px' }}>
              <legend style={{ fontWeight: 'bold', fontSize: '0.9rem', padding: '0 4px' }}>Zonas de trabajo</legend>
              {!zonasOrg.length && (
                <p className="vacio" style={{ fontSize: '0.85rem', margin: 0 }}>
                  {orgId ? 'La organización no tiene zonas asignadas.' : 'Elegí una organización o asegurate de tener zonas creadas.'}
                </p>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto', marginTop: '6px' }}>
                {zonasOrg.map((z) => (
                  <label key={z.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={f.zonaIds.includes(z.id)} onChange={(e) => marcar(z.id, e.target.checked)} />
                    {z.nombre}
                  </label>
                ))}
              </div>
            </fieldset>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <label style={{ fontSize: '0.9rem' }}>Cupo voluntarios
                <input type="number" min={1} value={f.cupo} onChange={(e) => setF({ ...f, cupo: e.target.value })} style={campo} />
              </label>
              <label style={{ fontSize: '0.9rem' }}>Meta encuestas
                <input type="number" min={1} value={f.metaEncuestas} onChange={(e) => setF({ ...f, metaEncuestas: e.target.value })} disabled={f.tipo !== 'RELEVAMIENTO'} style={campo} />
              </label>
            </div>

            <label style={{ ...label, marginBottom: '15px' }}>Fecha de vencimiento
              <input type="date" value={f.venceAt} onChange={(e) => setF({ ...f, venceAt: e.target.value })} style={campo} />
            </label>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="ghost" onClick={cerrarForm} style={{ cursor: 'pointer' }}>Cancelar</button>
              <button className="primario" disabled={!f.zonaIds.length} style={{ padding: '8px 16px', cursor: 'pointer' }}>Crear actividad</button>
            </div>
          </form>
          </div>
        </Modal>
      )}
    </section>
  );
}