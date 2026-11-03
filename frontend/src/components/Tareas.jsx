import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const ESTADOS = { PENDIENTE: 'Pendiente', EN_CURSO: 'En curso', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' };
const TIPOS = { RELEVAMIENTO: 'Relevamiento', INTERVENCION: 'Intervención' };
const VACIA = { titulo: '', descripcion: '', tipo: 'RELEVAMIENTO', zonaIds: [], metaEncuestas: '', cupo: '', venceAt: '', organizacionId: '' };

/**
 * Actividades (relevamiento o intervención).
 *  · ORGANIZACION / ADMIN: crean y gestionan actividades; ven los voluntarios anotados.
 *  · OPERADOR (voluntario): ve las actividades de su organización y se anota o se da de baja.
 */
export default function Tareas({ usuario }) {
  const { fase } = useMapa();
  const gestiona = usuario?.rol === 'ADMIN' || usuario?.rol === 'ORGANIZACION';
  const admin = usuario?.rol === 'ADMIN';
  const [lista, setLista] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState(VACIA);
  const [error, setError] = useState(null);

  const cargar = useCallback(() => fase && api.get(`/tareas?faseId=${fase.id}`).then(setLista), [fase?.id]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (gestiona) (admin ? api.get('/organizaciones') : api.get('/organizaciones/mia').then((o) => (o ? [o] : []))).then(setOrgs);
  }, [admin, gestiona]);

  if (!fase) return <section className="panel"><p className="vacio">Elegí una fase para ver sus actividades.</p></section>;

  const orgId = admin ? f.organizacionId : orgs[0]?.id;
  const zonasOrg = orgs.find((o) => o.id === orgId)?.zonas ?? []; // sólo zonas donde la organización trabaja
  const marcar = (id, on) => setF((x) => ({ ...x, zonaIds: on ? [...x.zonaIds, id] : x.zonaIds.filter((z) => z !== id) }));
  const guardia = async (fn) => { setError(null); try { await fn(); cargar(); } catch (x) { setError(x.detalle?.detalle?.map?.((i) => i.message).join(' · ') || x.message); } };

  const crear = (e) => {
    e.preventDefault();
    guardia(async () => {
      await api.post('/tareas', { faseId: fase.id, titulo: f.titulo, descripcion: f.descripcion || null, tipo: f.tipo, zonaIds: f.zonaIds,
        metaEncuestas: f.metaEncuestas ? Number(f.metaEncuestas) : null, cupo: f.cupo ? Number(f.cupo) : null, venceAt: f.venceAt || null, ...(admin && { organizacionId: f.organizacionId }) });
      setF(VACIA);
    });
  };

  return (
    <section className="panel tareas panel-ancho">
      <h2>Actividades · {fase.nombre}</h2>
      {!gestiona && !usuario?.organizacionId && <p className="error">Todavía no formás parte de una organización. Pedile a tu organización que te dé de alta.</p>}
      {gestiona && !admin && !orgs.length && <p className="error">Tu usuario no está asociado a una organización. Pedile al administrador que lo asigne.</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <div className={gestiona ? 'formulas-grid' : ''}>
        <ul className="lista-tareas">
          {lista.map((t) => {
            const hechas = t._count.encuestas, completo = t.cupo && t.inscriptos >= t.cupo;
            return (
              <li key={t.id}>
                <div className="tarea-cab">
                  <strong>{t.titulo}</strong>
                  {gestiona
                    ? <select value={t.estado} onChange={(e) => guardia(() => api.put(`/tareas/${t.id}`, { estado: e.target.value }))} aria-label={`Estado de ${t.titulo}`}>{Object.entries(ESTADOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
                    : <span className={`badge ${t.vigente ? 'vigente' : 'no-relevado'}`}>{t.vigente ? 'Vigente' : ESTADOS[t.estado]}</span>}
                </div>
                <div className="chips-zona"><span className="badge tipo">{TIPOS[t.tipo]}</span>{t.zonas.map((z) => <span className="chip" key={z.id}>{z.nombre}</span>)}</div>
                <small>{admin && `${t.organizacion.nombre} · `}{t.venceAt ? `vence ${new Date(t.venceAt).toLocaleDateString('es-AR')}` : 'sin fecha de cierre'} · {t.inscriptos}{t.cupo ? `/${t.cupo}` : ''} voluntarios</small>
                {t.descripcion && <p>{t.descripcion}</p>}
                {t.tipo === 'RELEVAMIENTO' && <><div className="avance" aria-label="Avance"><div style={{ width: `${t.metaEncuestas ? Math.min(100, (100 * hechas) / t.metaEncuestas) : 0}%` }} /></div><small>{hechas}{t.metaEncuestas ? ` de ${t.metaEncuestas}` : ''} encuestas</small></>}

                {gestiona && t.voluntarios?.length > 0 && <details><summary>Voluntarios anotados ({t.voluntarios.length})</summary><ul>{t.voluntarios.map((v) => <li key={v.id}>{v.nombre}</li>)}</ul></details>}
                {!gestiona && (t.yoInscripto
                  ? <button onClick={() => guardia(() => api.del(`/tareas/${t.id}/inscripcion`))}>Darme de baja</button>
                  : <button className="primario" disabled={!t.vigente || completo} onClick={() => guardia(() => api.post(`/tareas/${t.id}/inscripcion`))}>{completo ? 'Sin cupos' : 'Anotarme'}</button>)}
              </li>
            );
          })}
          {!lista.length && <li className="vacio">No hay actividades en esta fase.</li>}
        </ul>

        {gestiona && (
          <form className="editor" onSubmit={crear}>
            <h3>Nueva actividad</h3>
            {admin && <label>Organización<select required value={f.organizacionId} onChange={(e) => setF({ ...f, organizacionId: e.target.value, zonaIds: [] })}><option value="">Elegí…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>}
            <div className="fila">
              <label>Título<input required minLength={3} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
              <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
            </div>
            <label>Descripción<textarea rows={2} value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} /></label>
            <fieldset><legend>Zonas de trabajo</legend>
              {!zonasOrg.length && <p className="vacio">{orgId ? 'La organización todavía no tiene zonas asignadas (Configuración → Organizaciones).' : 'Elegí una organización.'}</p>}
              {zonasOrg.map((z) => <label key={z.id} className="check"><input type="checkbox" checked={f.zonaIds.includes(z.id)} onChange={(e) => marcar(z.id, e.target.checked)} />{z.nombre}</label>)}
            </fieldset>
            <div className="fila">
              <label>Cupo de voluntarios<input type="number" min={1} value={f.cupo} onChange={(e) => setF({ ...f, cupo: e.target.value })} /></label>
              <label>Meta de encuestas<input type="number" min={1} value={f.metaEncuestas} onChange={(e) => setF({ ...f, metaEncuestas: e.target.value })} disabled={f.tipo !== 'RELEVAMIENTO'} /></label>
            </div>
            <label>Vence<input type="date" value={f.venceAt} onChange={(e) => setF({ ...f, venceAt: e.target.value })} /></label>
            <button className="primario" disabled={!f.zonaIds.length}>Crear actividad</button>
          </form>
        )}
      </div>
    </section>
  );
}
