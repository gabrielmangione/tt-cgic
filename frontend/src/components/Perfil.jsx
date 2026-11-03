import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const ROLES = { ADMIN: 'Administrador', ORGANIZACION: 'Organización', OPERADOR: 'Voluntario / Operador' };
const limpio = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

function Mensaje({ m }) { return m ? <p role={m.tipo === 'error' ? 'alert' : 'status'} className={m.tipo}>{m.texto}</p> : null; }
const msgError = (x) => x.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || x.message;

// Perfil propio (todos los roles) y perfil institucional (rol Organización)
export default function Perfil({ usuario, onActualizado }) {
  const [tab, setTab] = useState('personal');
  return (
    <section className="panel">
      <h2>Mi perfil</h2>
      <div role="tablist" className="tabs">
        <button role="tab" aria-selected={tab === 'personal'} onClick={() => setTab('personal')}>Mis datos</button>
        {usuario?.rol === 'ORGANIZACION' && <button role="tab" aria-selected={tab === 'org'} onClick={() => setTab('org')}>Mi organización</button>}
      </div>
      {tab === 'personal' ? <Personal onActualizado={onActualizado} /> : <Institucional />}
    </section>
  );
}

function Personal({ onActualizado }) {
  const [p, setP] = useState(null);
  const [m, setM] = useState(null);
  const [clave, setClave] = useState({ actual: '', nueva: '' });
  const [mc, setMc] = useState(null);
  useEffect(() => { api.get('/perfil').then(setP); }, []);
  if (!p) return <p className="vacio">Cargando…</p>;
  const campo = (k) => ({ value: p[k] ?? '', onChange: (e) => setP({ ...p, [k]: e.target.value }) });

  async function guardar(e) {
    e.preventDefault(); setM(null);
    try {
      const r = await api.put('/perfil', limpio({ nombre: p.nombre, telefono: p.telefono ?? '', documento: p.documento ?? '', direccion: p.direccion ?? '' }));
      setP(r); onActualizado?.(r); setM({ tipo: 'ok', texto: 'Datos guardados.' });
    } catch (x) { setM({ tipo: 'error', texto: msgError(x) }); }
  }
  async function cambiarClave(e) {
    e.preventDefault(); setMc(null);
    try { await api.post('/perfil/password', clave); setClave({ actual: '', nueva: '' }); setMc({ tipo: 'ok', texto: 'Contraseña actualizada.' }); }
    catch (x) { setMc({ tipo: 'error', texto: msgError(x) }); }
  }
  return (
    <>
      <form onSubmit={guardar}>
        <div className="fila">
          <label>Nombre<input required minLength={2} {...campo('nombre')} /></label>
          <label>Correo (tu usuario de acceso)<input value={p.email} readOnly /></label>
        </div>
        <div className="fila">
          <label>Teléfono<input {...campo('telefono')} /></label>
          <label>Documento<input {...campo('documento')} /></label>
        </div>
        <label>Dirección<input {...campo('direccion')} /></label>
        <p className="nota">Rol: {ROLES[p.rol]}{p.organizacion && ` · Organización: ${p.organizacion.nombre}`}</p>
        <Mensaje m={m} />
        <button className="primario">Guardar cambios</button>
      </form>
      <form onSubmit={cambiarClave} className="bloque-clave">
        <h3>Cambiar contraseña</h3>
        <div className="fila">
          <label>Contraseña actual<input type="password" autoComplete="current-password" required value={clave.actual} onChange={(e) => setClave({ ...clave, actual: e.target.value })} /></label>
          <label>Nueva (mín. 10 caracteres)<input type="password" autoComplete="new-password" required minLength={10} value={clave.nueva} onChange={(e) => setClave({ ...clave, nueva: e.target.value })} /></label>
        </div>
        <Mensaje m={mc} />
        <button>Actualizar contraseña</button>
      </form>
    </>
  );
}

function Institucional() {
  const [o, setO] = useState(undefined);
  const [m, setM] = useState(null);
  useEffect(() => { api.get('/organizaciones/mia').then(setO); }, []);
  if (o === undefined) return <p className="vacio">Cargando…</p>;
  if (o === null) return <p className="error">Tu usuario no está asociado a una organización.</p>;
  const campo = (k) => ({ value: o[k] ?? '', onChange: (e) => setO({ ...o, [k]: e.target.value }) });
  async function guardar(e) {
    e.preventDefault(); setM(null);
    try {
      const r = await api.put('/organizaciones/mia', limpio({ nombre: o.nombre, descripcion: o.descripcion ?? '', contacto: o.contacto ?? '', email: o.email ?? '', telefono: o.telefono ?? '', direccion: o.direccion ?? '' }));
      setO(r); setM({ tipo: 'ok', texto: 'Datos de la organización guardados.' });
    } catch (x) { setM({ tipo: 'error', texto: msgError(x) }); }
  }
  return (
    <form onSubmit={guardar}>
      <label>Nombre de la organización<input required minLength={2} {...campo('nombre')} /></label>
      <label>Descripción<textarea rows={3} {...campo('descripcion')} /></label>
      <div className="fila">
        <label>Persona de contacto<input {...campo('contacto')} /></label>
        <label>Correo institucional<input type="email" {...campo('email')} /></label>
      </div>
      <div className="fila">
        <label>Teléfono<input {...campo('telefono')} /></label>
        <label>Dirección<input {...campo('direccion')} /></label>
      </div>
      <fieldset><legend>Zonas donde trabaja (las asigna el administrador)</legend>
        <div className="chips-zona">{o.zonas.length ? o.zonas.map((z) => <span className="chip" key={z.id}>{z.nombre}</span>) : <span className="vacio">Todavía no tiene zonas asignadas.</span>}</div>
      </fieldset>
      <Mensaje m={m} />
      <button className="primario">Guardar</button>
    </form>
  );
}
