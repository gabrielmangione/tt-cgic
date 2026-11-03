import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import MapUploader from './MapUploader';
import FormulaBuilder from './FormulaBuilder';
import FormularioEditor from './FormularioEditor';

const msgError = (e) => e.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || e.message;

function Usuarios({ yo }) {
  const [lista, setLista] = useState([]);
  const [nuevo, setNuevo] = useState({ nombre: '', email: '', password: '', rol: 'OPERADOR', organizacionId: '' });
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(null);
  const cargar = () => api.get('/usuarios').then(setLista);
  useEffect(() => { cargar(); api.get('/organizaciones').then(setOrgs); }, []);
  const cambiar = async (id, d) => { setError(null); try { await api.put(`/usuarios/${id}`, d); cargar(); } catch (e) { setError(msgError(e)); } };
  async function crear(e) {
    e.preventDefault(); setError(null);
    try { await api.post('/auth/usuarios', { ...nuevo, organizacionId: nuevo.organizacionId || null }); setNuevo({ nombre: '', email: '', password: '', rol: 'OPERADOR', organizacionId: '' }); cargar(); } catch (x) { setError(msgError(x)); }
  }
  return (
    <>
      <h2>Usuarios</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <table className="tabla-vars">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Organización</th><th>Activo</th></tr></thead>
        <tbody>{lista.map((u) => (
          <tr key={u.id}>
            <td>{u.nombre}</td><td>{u.email}</td>
            <td><select value={u.rol} onChange={(e) => cambiar(u.id, { rol: e.target.value })} disabled={u.id === yo?.id}><option value="ADMIN">Administrador</option><option value="OPERADOR">Voluntario / Operador</option><option value="ORGANIZACION">Organización</option></select></td>
            <td><select value={u.organizacionId ?? ''} onChange={(e) => cambiar(u.id, { organizacionId: e.target.value || null })} aria-label={`Organización de ${u.nombre}`}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></td>
            <td><input type="checkbox" checked={u.activo} disabled={u.id === yo?.id} onChange={(e) => cambiar(u.id, { activo: e.target.checked })} aria-label={`Activo: ${u.nombre}`} /></td>
          </tr>
        ))}</tbody>
      </table>
      <form className="form-alta" onSubmit={crear}>
        <h3>Nuevo usuario</h3>
        <label>Nombre<input required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
        <label>Correo<input required type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></label>
        <label>Contraseña (mín. 10 caracteres)<input required type="password" minLength={10} autoComplete="new-password" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} /></label>
        <label>Rol<select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}><option value="OPERADOR">Voluntario / Operador</option><option value="ORGANIZACION">Organización</option><option value="ADMIN">Administrador</option></select></label>
        <label>Organización {nuevo.rol === 'ORGANIZACION' && '*'}<select required={nuevo.rol === 'ORGANIZACION'} value={nuevo.organizacionId} onChange={(e) => setNuevo({ ...nuevo, organizacionId: e.target.value })}><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>
        <button className="primario">Crear usuario</button>
      </form>
    </>
  );
}

function Organizaciones() {
  const { zonas } = useMapa();
  const VACIA = { nombre: '', descripcion: '', contacto: '', zonaIds: [] };
  const [lista, setLista] = useState([]);
  const [edit, setEdit] = useState(VACIA);
  const [error, setError] = useState(null);
  const cargar = () => api.get('/organizaciones').then(setLista);
  useEffect(() => { cargar(); }, []);
  async function guardar(e) {
    e.preventDefault(); setError(null);
    const cuerpo = { nombre: edit.nombre, descripcion: edit.descripcion || null, contacto: edit.contacto || null, zonaIds: edit.zonaIds };
    try { edit.id ? await api.put(`/organizaciones/${edit.id}`, cuerpo) : await api.post('/organizaciones', cuerpo); setEdit(VACIA); cargar(); } catch (x) { setError(msgError(x)); }
  }
  const marcar = (id, on) => setEdit((o) => ({ ...o, zonaIds: on ? [...o.zonaIds, id] : o.zonaIds.filter((z) => z !== id) }));
  return (
    <>
      <h2>Organizaciones</h2>
      <div className="formulas-grid">
        <ul className="lista-estadisticos">
          {lista.map((o) => (
            <li key={o.id}>
              <button onClick={() => setEdit({ id: o.id, nombre: o.nombre, descripcion: o.descripcion ?? '', contacto: o.contacto ?? '', zonaIds: o.zonas.map((z) => z.id) })}>
                <strong>{o.nombre}</strong><code>{o.zonas.map((z) => z.nombre).join(', ') || 'Sin zonas'}</code>
              </button>
              <button aria-label={`Eliminar ${o.nombre}`} onClick={async () => { if (confirm(`¿Eliminar ${o.nombre}?`)) { await api.del(`/organizaciones/${o.id}`); cargar(); } }}>×</button>
            </li>
          ))}
          {!lista.length && <li className="vacio">Todavía no hay organizaciones.</li>}
        </ul>
        <form onSubmit={guardar} className="editor">
          <label>Nombre<input required value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></label>
          <label>Descripción<input value={edit.descripcion} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} /></label>
          <label>Contacto<input value={edit.contacto} onChange={(e) => setEdit({ ...edit, contacto: e.target.value })} /></label>
          <fieldset><legend>Zonas donde tiene presencia</legend>
            {zonas.length === 0 && <p className="vacio">Primero creá zonas en la pestaña Zonas.</p>}
            {zonas.map((z) => <label key={z.id} className="check"><input type="checkbox" checked={edit.zonaIds.includes(z.id)} onChange={(e) => marcar(z.id, e.target.checked)} />{z.nombre}</label>)}
          </fieldset>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="acciones">
            <button className="primario">{edit.id ? 'Guardar cambios' : 'Crear organización'}</button>
            {edit.id && <button type="button" onClick={() => setEdit(VACIA)}>Cancelar</button>}
          </div>
        </form>
      </div>
    </>
  );
}

// Zonas: se crean a partir de los polígonos del mapa base de la jurisdicción del evento
const nombreDe = (f, i) => Object.entries(f.properties || {}).find(([k, v]) => /^(name|nombre|barrio|zona)$/i.test(k) && typeof v === 'string')?.[1] ?? `Elemento ${i + 1}`;
function Zonas() {
  const { jurisdiccion, zonas, evento, cargarEvento } = useMapa();
  const [error, setError] = useState(null);
  if (!jurisdiccion) return <p className="vacio">Elegí un evento con mapa base.</p>;
  const poligonos = jurisdiccion.geometria.features.map((f, i) => ({ f, i })).filter(({ f }) => /Polygon/.test(f.geometry.type));
  const recargar = () => cargarEvento(evento.id);
  const crear = async (f, i) => { setError(null); try { await api.post('/zonas', { nombre: nombreDe(f, i), geometria: f, jurisdiccionId: jurisdiccion.id }); recargar(); } catch (e) { setError(msgError(e)); } };
  const yaCreada = (n) => zonas.some((z) => z.nombre === n);
  return (
    <>
      <h2>Zonas de {jurisdiccion.nombre}</h2>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="formulas-grid">
        <div><h3>Zonas creadas</h3>
          <ul className="lista-estadisticos">
            {zonas.map((z) => <li key={z.id}><span style={{ flex: 1 }}>{z.nombre}</span><button aria-label={`Eliminar ${z.nombre}`} onClick={async () => { await api.del(`/zonas/${z.id}`); recargar(); }}>×</button></li>)}
            {!zonas.length && <li className="vacio">Sin zonas todavía.</li>}
          </ul></div>
        <div><h3>Polígonos del mapa base</h3>
          <ul className="lista-estadisticos">
            {poligonos.map(({ f, i }) => { const n = nombreDe(f, i); return <li key={i}><span style={{ flex: 1 }}>{n}</span><button disabled={yaCreada(n)} onClick={() => crear(f, i)}>{yaCreada(n) ? 'Creada' : 'Crear zona'}</button></li>; })}
            {!poligonos.length && <li className="vacio">El mapa base no tiene polígonos.</li>}
          </ul></div>
      </div>
    </>
  );
}

function MapasYCapas() {
  const { evento, jurisdiccion, cargarEvento } = useMapa();
  const [error, setError] = useState(null);
  const recargar = () => cargarEvento(evento.id);

  // Función para modificar datos del mapa base (jurisdicción)
  const editarJurisdiccion = async (id, d) => {
    setError(null);
    try {
      await api.put(`/jurisdicciones/${id}`, d);
      recargar();
    } catch (e) {
      setError(msgError(e));
    }
  };

  // Función para desvincular o eliminar el mapa base principal del evento
  const eliminarMapaBase = async () => {
    if (!jurisdiccion) return;
    if (!confirm(`¿Estás seguro de eliminar el mapa base «${jurisdiccion.nombre}»?`)) return;
    setError(null);
    try {
      // Llamamos directamente a la ruta DELETE del backend de jurisdicciones
      await api.del(`/jurisdicciones/${jurisdiccion.id}`);
      recargar();
    } catch (e) {
      setError(msgError(e));
    } 
  };

  return (
    <div className="columna">
      {error && <p role="alert" className="error">{error}</p>}
      
      {/* Sección del Mapa Base / Principal */}
      <section className="panel" style={{ marginBottom: '20px' }}>
        <h2>Mapa Base / Jurisdicción Principal</h2>
        {jurisdiccion ? (
          <div style={{ marginTop: '12px' }}>
            <table className="tabla-vars">
              <thead>
                <tr>
                  <th>Nombre del Mapa Base</th>
                  <th>Polígonos / Zonas base</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <input 
                      defaultValue={jurisdiccion.nombre} 
                      onBlur={(e) => e.target.value !== jurisdiccion.nombre && editarJurisdiccion(jurisdiccion.id, { nombre: e.target.value })} 
                      style={{ width: '100%' }} 
                    />
                  </td>
                  <td>
                    <span className="badge">
                      {jurisdiccion.geometria?.features?.length ?? 0} elementos
                    </span>
                  </td>
                  <td>
                    <button 
                      className="ghost" 
                      onClick={eliminarMapaBase}
                    >
                      Quitar principal
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="vacio" style={{ marginTop: '8px' }}>
              Puedes renombrar el mapa haciendo clic sobre su nombre o quitarlo para asignar uno nuevo.
            </p>
          </div>
        ) : (
          <p className="vacio">Este evento no tiene un mapa base asignado todavía.</p>
        )}

        <div style={{ marginTop: '20px' }}>
          <h3>Cargar o Reemplazar Mapa Base</h3>
          <MapUploader 
            destino="jurisdiccion" 
            onGuardado={async (j) => { 
              await api.put(`/eventos/${evento.id}`, { jurisdiccionId: j.id }); 
              recargar(); 
            }} 
          />
        </div>
      </section>

      {/* Sección de Capas Adicionales */}
      <MapUploader destino="capa" eventoId={evento.id} onGuardado={recargar} />
    </div>
  );
}

const TABS = [['usuarios', 'Usuarios'], ['organizaciones', 'Organizaciones'], ['zonas', 'Zonas'], ['mapas', 'Mapas y capas'], ['formulario', 'Formulario'], ['estadisticos', 'Estadísticos']];

// Montado en App.jsx sólo si usuario.rol === 'ADMIN'. El backend vuelve a exigir el rol en cada ruta.
export default function Configuracion({ usuario, tabInicial = 'usuarios' }) {
  const { evento } = useMapa();
  const [tab, setTab] = useState(tabInicial);
  return (
    <div className="config">
      <div role="tablist" className="tabs">
        {TABS.map(([k, t]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{t}</button>)}
      </div>
      <section className={tab === 'mapas' ? '' : 'panel'}>
        {tab === 'usuarios' && <Usuarios yo={usuario} />}
        {tab === 'organizaciones' && <Organizaciones />}
        {tab === 'zonas' && <Zonas />}
        {tab === 'mapas' && (evento ? <MapasYCapas /> : <p className="vacio">Elegí un evento.</p>)}
        {tab === 'formulario' && (evento ? <FormularioEditor /> : <p className="vacio">Elegí un evento.</p>)}
        {tab === 'estadisticos' && <FormulaBuilder />}
      </section>
    </div>
  );
}
