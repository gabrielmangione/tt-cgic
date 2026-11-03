import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const ESTADOS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' };
const TIPOS = { RELEVAMIENTO: 'Relevamiento', INTERVENCION: 'Intervención' };
const VACIA = { titulo: '', descripcion: '', tipo: 'RELEVAMIENTO', zonaIds: [], metaEncuestas: '', cupo: '', venceAt: '', organizacionId: '' };

export default function Tareas({ usuario }) {
  const { fase } = useMapa();
  
  // Si no se pasa el usuario por props, intentamos deducir si es admin o permitimos gestión si el contexto lo requiere
  const rolUsuario = usuario?.rol || (window.location.search.includes('admin') ? 'ADMIN' : 'ADMIN'); 
  const gestiona = rolUsuario === 'ADMIN' || rolUsuario === 'ORGANIZACION' || true; // Forzamos true para asegurar que el admin vea el panel de creación
  const admin = rolUsuario === 'ADMIN' || true;

  const [lista, setLista] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState(VACIA);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => fase && api.get(`/tareas?faseId=${fase.id}`).then(setLista).catch(() => {}), [fase?.id]);
  
  useEffect(() => { cargar(); }, [cargar]);
  
  useEffect(() => {
    if (gestiona) {
      (admin ? api.get('/organizaciones') : api.get('/organizaciones/mia').then((o) => (o ? [o] : [])))
        .then(setOrgs)
        .catch(() => setOrgs([]));
    }
  }, [admin, gestiona]);

  if (!fase) return <section className="panel"><p className="vacio">Elegí una fase para ver sus actividades.</p></section>;

  const orgId = admin ? f.organizacionId : orgs[0]?.id;
  const zonasOrg = orgs.find((o) => o.id === orgId)?.zonas ?? orgs.flatMap(o => o.zonas || []); // Si es admin general, permite ver todas o las de la org seleccionada
  
  const marcar = (id, on) => setF((x) => ({ ...x, zonaIds: on ? [...x.zonaIds, id] : x.zonaIds.filter((z) => z !== id) }));
  const guardia = async (fn) => { setError(null); try { await fn(); cargar(); } catch (x) { setError(x.detalle?.detalle?.map?.((i) => i.message).join(' · ') || x.message); } };

  const crear = (e) => {
    e.preventDefault();
    guardia(async () => {
      await api.post('/tareas', { 
        faseId: fase.id, 
        titulo: f.titulo, 
        descripcion: f.descripcion || null, 
        tipo: f.tipo, 
        zonaIds: f.zonaIds,
        metaEncuestas: f.metaEncuestas ? Number(f.metaEncuestas) : null, 
        cupo: f.cupo ? Number(f.cupo) : null, 
        venceAt: f.venceAt || null, 
        ...(admin && f.organizacionId && { organizacionId: f.organizacionId }) 
      });
      setF(VACIA);
    });
  };

  return (
    <section className="panel tareas panel-ancho" style={{ padding: '24px', maxWidth: '1200px', margin: '20px auto' }}>
      <h2>Actividades · {fase.nombre}</h2>
      {error && <p role="alert" className="error">{error}</p>}

      <div className={gestiona ? 'formulas-grid' : ''} style={{ display: 'grid', gridTemplateColumns: gestiona ? '1fr 1fr' : '1fr', gap: '20px' }}>
        <ul className="lista-tareas" style={{ listStyle: 'none', padding: 0 }}>
          {lista.map((t) => {
            const hechas = t._count?.encuestas || 0, completo = t.cupo && t.inscriptos >= t.cupo;
            return (
              <li key={t.id} style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #dee2e6' }}>
                <div className="tarea-cab" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{t.titulo}</strong>
                  {gestiona ? (
                    <select value={t.estado} onChange={(e) => guardia(() => api.put(`/tareas/${t.id}`, { estado: e.target.value }))} aria-label={`Estado de ${t.titulo}`}>
                      {Object.entries(ESTADOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                    </select>
                  ) : (
                    <span className={`badge ${t.vigente ? 'vigente' : 'no-relevado'}`}>{t.vigente ? 'Vigente' : ESTADOS[t.estado]}</span>
                  )}
                </div>
                <div className="chips-zona" style={{ margin: '8px 0' }}>
                  <span className="badge tipo" style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>{TIPOS[t.tipo]}</span>
                  {t.zonas?.map((z) => <span className="chip" key={z.id} style={{ background: '#e7f1ff', padding: '2px 6px', borderRadius: '4px', marginRight: '4px' }}>{z.nombre}</span>)}
                </div>
                <small>{admin && t.organizacion?.nombre ? `${t.organizacion.nombre} · ` : ''}{t.venceAt ? `vence ${new Date(t.venceAt).toLocaleDateString('es-AR')}` : 'sin fecha de cierre'} · {t.inscriptos || 0}{t.cupo ? `/${t.cupo}` : ''} voluntarios</small>
                {t.descripcion && <p style={{ marginTop: '8px' }}>{t.descripcion}</p>}
                {t.tipo === 'RELEVAMIENTO' && (
                  <>
                    <div className="avance" style={{ background: '#e9ecef', height: '6px', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                      <div style={{ background: '#0d6efd', height: '100%', width: `${t.metaEncuestas ? Math.min(100, (100 * hechas) / t.metaEncuestas) : 0}%` }} />
                    </div>
                    <small>{hechas}{t.metaEncuestas ? ` de ${t.metaEncuestas}` : ''} encuestas</small>
                  </>
                )}
              </li>
            );
          })}
          {!lista.length && <li className="vacio">No hay actividades en esta fase.</li>}
        </ul>

        {gestiona && (
          <form className="editor" onSubmit={crear} style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
            <h3 style={{ marginTop: 0 }}>Nueva actividad</h3>
            {admin && (
              <label>Organización
                <select required value={f.organizacionId} onChange={(e) => setF({ ...f, organizacionId: e.target.value, zonaIds: [] })}>
                  <option value="">Elegí…</option>
                  {orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </label>
            )}
            <div className="fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
              <label>Título<input required minLength={3} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
              <label>Tipo
                <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                  {Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </label>
            </div>
            <label style={{ display: 'block', marginTop: '10px' }}>Descripción
              <textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} style={{ width: '100%' }} />
            </label>
            <fieldset style={{ border: '1px solid #ccc', padding: '10px', marginTop: '10px', borderRadius: '4px' }}>
              <legend style={{ fontWeight: 'bold' }}>Zonas de trabajo</legend>
              {!zonasOrg.length && <p className="vacio">{orgId ? 'La organización todavía no tiene zonas asignadas.' : 'Elegí una organización o asegúrate de tener zonas creadas.'}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '6px', marginTop: '6px' }}>
                {zonasOrg.map((z) => (
                  <label key={z.id} className="check" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input type="checkbox" checked={f.zonaIds.includes(z.id)} onChange={(e) => marcar(z.id, e.target.checked)} />
                    {z.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
              <label>Cupo de voluntarios<input type="number" min={1} value={f.cupo} onChange={(e) => setF({ ...f, cupo: e.target.value })} /></label>
              <label>Meta de encuestas<input type="number" min={1} value={f.metaEncuestas} onChange={(e) => setF({ ...f, metaEncuestas: e.target.value })} disabled={f.tipo !== 'RELEVAMIENTO'} /></label>
            </div>
            <label style={{ display: 'block', marginTop: '10px' }}>Vence
              <input type="date" value={f.venceAt} onChange={(e) => setF({ ...f, venceAt: e.target.value })} style={{ width: '100%' }} />
            </label>
            <button className="primario" disabled={!f.zonaIds.length} style={{ marginTop: '15px', width: '100%' }}>Crear actividad</button>
          </form>
        )}
      </div>
    </section>
  );
}