import { useCallback, useEffect, useState } from 'react';
import { api, setToken, haySesion } from './lib/api';
import { useMapa } from './store/mapaStore';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import Footer from './components/Footer';
import CargaEncuestas from './components/CargaEncuestas';
import GestionEncuestas from './components/GestionEncuestas';
import Tareas from './components/Tareas';
import Configuracion from './components/Configuracion';
import FormulaBuilder from './components/FormulaBuilder';
import MapUploader from './components/MapUploader';
import Modal from './components/Modal';
import { EventoNuevo, FaseNueva } from './components/EventoForm';
import { Mas, Usuarios, Termometro } from './components/Iconos';
import './termometro.css';

function Login({ onOk }) {
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState(null);
  async function entrar(e) {
    e.preventDefault();
    try { const r = await api.post('/auth/login', f); setToken(r.token); onOk(r.usuario); } catch (x) { setErr(x.message); }
  }
  return (
    <form className="login" onSubmit={entrar}>
      <h1>Termómetro Territorial</h1>
      <label>Correo<input type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      {err && <p role="alert" className="error">{err}</p>}
      <button className="primario">Ingresar</button>
    </form>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [logueado, setLogueado] = useState(haySesion());
  const [eventos, setEventos] = useState([]);
  const [vista, setVista] = useState('mapa'); // mapa | carga | encuestas | tareas | config
  const [tabConfig, setTabConfig] = useState('usuarios');
  const [modal, setModal] = useState(null);   // mapa-capa | evento | fase | estadistico  (todos exclusivos de ADMIN)
  const [menu, setMenu] = useState(false);
  const { evento, fase, cargarEvento, seleccionarFase, refrescarDatos } = useMapa();

  const rol = usuario?.rol;
  const puedeTareas = rol === 'ADMIN' || rol === 'ORGANIZACION';
  const admin = usuario?.rol === 'ADMIN'; // sólo UX: el backend vuelve a exigir el rol en cada ruta
  const cerrar = useCallback(() => setModal(null), []);
  const cargarEventos = useCallback(() => api.get('/eventos').then((e) => { setEventos(e); return e; }), []);

  useEffect(() => { const h = () => setLogueado(false); window.addEventListener('tt:logout', h); return () => window.removeEventListener('tt:logout', h); }, []);
  useEffect(() => {
    if (!logueado) return;
    api.get('/auth/me').then(setUsuario);
    cargarEventos().then((e) => e[0] && cargarEvento(e[0].id));
  }, [logueado]);

  // El mapa se repinta solo cuando entran encuestas nuevas (de otros usuarios también)
  useEffect(() => {
    if (!logueado || vista !== 'mapa') return;
    const t = setInterval(() => refrescarDatos(), 30000);
    return () => clearInterval(t);
  }, [logueado, vista, refrescarDatos]);

  if (!logueado) return <Login onOk={(u) => { setUsuario(u); setLogueado(true); }} />;
  const iniciales = (usuario?.nombre ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const irConfig = (tab) => { setTabConfig(tab); setVista('config'); setMenu(false); };

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca"><Termometro /><h1>Termómetro Territorial</h1></div>

        <div className="selector">
          <select aria-label="Evento" value={evento?.id ?? ''} onChange={(e) => cargarEvento(e.target.value)}>
            {!eventos.length && <option value="">Sin eventos</option>}
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          {admin && <button className="mas" aria-label="Nuevo evento" onClick={() => setModal('evento')}><Mas /></button>}
        </div>
        {evento && (
          <div className="selector">
            <select aria-label="Fase" value={fase?.id ?? ''} onChange={(e) => seleccionarFase(e.target.value)}>
              {!evento.fases.length && <option value="">Sin fases</option>}
              {evento.fases.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
            {admin && <button className="mas" aria-label="Nueva fase" onClick={() => setModal('fase')}><Mas /></button>}
          </div>
        )}

        <div className="cab-der">
          {vista !== 'mapa' && <button className="ghost" onClick={() => setVista('mapa')}>← Volver al mapa</button>}
          {vista !== 'carga' && <button className="ghost" onClick={() => setVista('carga')}>Cargar encuestas</button>}
          {vista !== 'encuestas' && <button className="ghost" onClick={() => setVista('encuestas')}>Encuestas</button>}
          {puedeTareas && vista !== 'tareas' && <button className="ghost" onClick={() => setVista('tareas')}>Tareas</button>}
          {admin && <button className="ghost borde" onClick={() => irConfig('organizaciones')}><Usuarios />Organizaciones</button>}
          <div className="avatar-wrap">
            <button className="avatar" aria-label="Cuenta" aria-expanded={menu} onClick={() => setMenu(!menu)}>{iniciales}</button>
            {menu && (
              <div className="menu" role="menu">
                <p><strong>{usuario?.nombre}</strong><br /><small>{{ ADMIN: 'Administrador', ORGANIZACION: 'Organización', OPERADOR: 'Voluntario / Operador' }[rol]}</small></p>
                {admin && <button role="menuitem" onClick={() => irConfig('usuarios')}>Configuración</button>}
                <button role="menuitem" onClick={() => { setToken(null); setLogueado(false); }}>Salir</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={vista === 'mapa' && evento ? 'principal con-mapa' : 'principal'}>
        {vista === 'mapa' && evento && <><Sidebar admin={admin} onCargarCapa={() => setModal('mapa-capa')} /><MapView /></>}
        {vista === 'mapa' && !evento && (
          <div className="panel vacio-inicial">
            <h2>Todavía no hay eventos</h2>
            {admin ? <><p>Creá el primero: elegí el mapa de la zona a relevar y definí su formulario.</p><button className="primario" onClick={() => setModal('evento')}>Crear evento</button></>
                  : <p>Pedile a un administrador que cree un evento.</p>}
          </div>
        )}
        {vista === 'carga' && <CargaEncuestas usuario={usuario} />}
        {vista === 'encuestas' && <GestionEncuestas usuario={usuario} />}
        {vista === 'tareas' && puedeTareas && <Tareas usuario={usuario} />}
        {vista === 'config' && admin && <Configuracion key={tabConfig} usuario={usuario} tabInicial={tabConfig} />}
      </main>

      {vista === 'mapa' && evento && <Footer admin={admin} onAgregar={() => setModal('estadistico')} />}

      {admin && modal === 'evento' && (
        <Modal titulo="Nuevo evento" onCerrar={cerrar} ancho={720}>
          <EventoNuevo onCreado={async (ev) => { await cargarEventos(); await cargarEvento(ev.id); cerrar(); }} />
        </Modal>
      )}
      {admin && modal === 'fase' && evento && (
        <Modal titulo="Nueva fase" onCerrar={cerrar} ancho={520}>
          <FaseNueva evento={evento} onCreada={async () => { await cargarEvento(evento.id); cerrar(); }} />
        </Modal>
      )}
      {admin && modal === 'mapa-capa' && evento && (
        <Modal titulo="Cargar capa geográfica" onCerrar={cerrar}>
          <MapUploader destino="capa" eventoId={evento.id} onGuardado={async () => { await cargarEvento(evento.id); cerrar(); }} />
        </Modal>
      )}
      {admin && modal === 'estadistico' && (
        <Modal titulo="Estadísticos" onCerrar={() => { cerrar(); refrescarDatos(); }} ancho={1000}>
          <FormulaBuilder />
        </Modal>
      )}
    </div>
  );
}
