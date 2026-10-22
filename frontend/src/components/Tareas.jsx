import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const ESTADOS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' };
const VACIA = { titulo: '', descripcion: '', zonaIds: [], metaEncuestas: '', venceAt: '', organizacionId: '' };

// Tareas de relevamiento. ORGANIZACION: las de su organización. ADMIN: todas, y elige la organización al crear.
export default function Tareas({ usuario }) {
  const { fase } = useMapa();
  const admin = usuario?.rol === 'ADMIN';
  const [lista, setLista] = useState([]);
  const [orgs, setOrgs] = useState([]); // admin: todas; organización: sólo la propia
  const [f, setF] = useState(VACIA);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => fase && api.get(`/tareas?faseId=${fase.id}`).then(setLista), [fase?.id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { (admin ? api.get('/organizaciones') : api.get('/organizaciones/mia').then((o) => (o ? [o] : []))).then(setOrgs); }, [admin]);

  if (!fase) return <section className="panel"><p className="vacio">Elegí una fase para ver sus tareas.</p></section>;

  const orgId = admin ? f.organizacionId : orgs[0]?.id;
  const zonasOrg = orgs.find((o) => o.id === orgId)?.zonas ?? []; // sólo zonas donde la organización trabaja
  const marcar = (id, on) => setF((x) => ({ ...x, zonaIds: on ? [...x.zonaIds, id] : x.zonaIds.filter((z) => z !== id) }));

  async function crear(e) {
    e.preventDefault(); setError(null);
    try {
      await api.post('/tareas', { faseId: fase.id, titulo: f.titulo, descripcion: f.descripcion || null, zonaIds: f.zonaIds,
        metaEncuestas: f.metaEncuestas ? Number(f.metaEncuestas) : null, venceAt: f.venceAt || null, ...(admin && { organizacionId: f.organizacionId }) });
      setF(VACIA); cargar();
    } catch (x) { setError(x.detalle?.detalle?.map?.((i) => i.message).join(' · ') || x.message); }
  }
  const cambiarEstado = async (t, estado) => { setError(null); try { await api.put(`/tareas/${t.id}`, { estado }); cargar(); } catch (x) { setError(x.message); } };

  return (
    <section className="panel tareas">
      <h2>Tareas de relevamiento · {fase.nombre}</h2>
      {!admin && !orgs.length && <p className="error">Tu usuario no está asociado a una organización. Pedile al administrador que lo asigne.</p>}
      <div className="formulas-grid">
        <ul className="lista-tareas">
          {lista.map((t) => {
            const hechas = t._count.encuestas;
            return (
              <li key={t.id}>
                <div className="tarea-cab"><strong>{t.titulo}</strong>
                  <select value={t.estado} onChange={(e) => cambiarEstado(t, e.target.value)} aria-label={`Estado de ${t.titulo}`}>{Object.entries(ESTADOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <small>{admin && `${t.organizacion.nombre} · `}Zonas: {t.zonas.map((z) => z.nombre).join(', ')}{t.venceAt && ` · vence ${new Date(t.venceAt).toLocaleDateString('es-AR')}`}</small>
                {t.descripcion && <p>{t.descripcion}</p>}
                <div className="avance" aria-label="Avance"><div style={{ width: `${t.metaEncuestas ? Math.min(100, (100 * hechas) / t.metaEncuestas) : 0}%` }} /></div>
                <small>{hechas}{t.metaEncuestas ? ` de ${t.metaEncuestas}` : ''} encuestas</small>
              </li>
            );
          })}
          {!lista.length && <li className="vacio">No hay tareas en esta fase.</li>}
        </ul>

        <form className="editor" onSubmit={crear}>
          <h3>Nueva tarea</h3>
          {admin && <label>Organización<select required value={f.organizacionId} onChange={(e) => setF({ ...f, organizacionId: e.target.value, zonaIds: [] })}><option value="">Elegí…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>}
          <label>Título<input required minLength={3} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
          <label>Descripción<textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></label>
          <fieldset><legend>Zonas de trabajo</legend>
            {!zonasOrg.length && <p className="vacio">{orgId ? 'La organización todavía no tiene zonas asignadas (Configuración → Organizaciones).' : 'Elegí una organización.'}</p>}
            {zonasOrg.map((z) => <label key={z.id} className="check"><input type="checkbox" checked={f.zonaIds.includes(z.id)} onChange={(e) => marcar(z.id, e.target.checked)} />{z.nombre}</label>)}
          </fieldset>
          <div className="fila">
            <label>Meta de encuestas<input type="number" min={1} value={f.metaEncuestas} onChange={(e) => setF({ ...f, metaEncuestas: e.target.value })} /></label>
            <label>Vence<input type="date" value={f.venceAt} onChange={(e) => setF({ ...f, venceAt: e.target.value })} /></label>
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primario" disabled={!f.zonaIds.length}>Crear tarea</button>
        </form>
      </div>
    </section>
  );
}
