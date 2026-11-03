import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const VACIO = { nombre: '', email: '', password: '', telefono: '', documento: '', organizacionId: '' };

// Alta y gestión de voluntarios. ORGANIZACION: los de su organización. ADMIN: todos, y elige la organización.
export default function Voluntarios({ usuario }) {
  const admin = usuario?.rol === 'ADMIN';
  const [lista, setLista] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState(VACIO);
  const [error, setError] = useState(null);
  const cargar = useCallback(() => api.get('/voluntarios').then(setLista).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); if (admin) api.get('/organizaciones').then(setOrgs); }, [cargar, admin]);

  const guardia = async (fn) => { setError(null); try { await fn(); cargar(); } catch (x) { setError(x.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || x.message); } };
  const crear = (e) => {
    e.preventDefault();
    guardia(async () => {
      await api.post('/voluntarios', { ...f, telefono: f.telefono || null, documento: f.documento || null, organizacionId: admin ? f.organizacionId : undefined });
      setF(VACIO);
    });
  };

  return (
    <section className="panel panel-ancho">
      <h2>Voluntarios</h2>
      <p className="vacio">Los voluntarios entran con su correo y contraseña, ven las actividades de su organización y se anotan a las que quieran.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="tabla-scroll">
        <table className="tabla-vars">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Teléfono</th>{admin && <th>Organización</th>}<th>Actividades</th><th>Activo</th><th></th></tr></thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id} className={v.activo ? '' : 'tenue'}>
                <td>{v.nombre}</td><td>{v.email}</td><td>{v.telefono ?? '—'}</td>{admin && <td>{v.organizacion?.nombre}</td>}
                <td>{v._count.inscripciones}</td>
                <td><input type="checkbox" checked={v.activo} onChange={(e) => guardia(() => api.put(`/voluntarios/${v.id}`, { activo: e.target.checked }))} aria-label={`Activo: ${v.nombre}`} /></td>
                <td><button onClick={() => { const p = prompt(`Nueva contraseña para ${v.nombre} (mínimo 10 caracteres):`); if (p) guardia(() => api.put(`/voluntarios/${v.id}`, { password: p })); }}>Restablecer clave</button></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="vacio">Todavía no hay voluntarios.</td></tr>}
          </tbody>
        </table>
      </div>

      <form className="form-alta" onSubmit={crear}>
        <h3>Nuevo voluntario</h3>
        {admin && <label>Organización *<select required value={f.organizacionId} onChange={(e) => setF({ ...f, organizacionId: e.target.value })}><option value="">Elegí…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>}
        <label>Nombre *<input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></label>
        <label>Correo *<input required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Contraseña inicial * (mín. 10)<input required type="password" minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label>Teléfono<input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} /></label>
        <label>Documento<input value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></label>
        <button className="primario">Dar de alta</button>
      </form>
    </section>
  );
}
