import { useCallback, useEffect, useState } from 'react';
import { api, setToken, haySesion } from './lib/api';
import { useMapa } from './store/mapaStore';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import Footer from './components/Footer';
import CargaEncuestas from './components/CargaEncuestas';
import GestionEncuestas from './components/GestionEncuestas';
import Tareas from './components/Tareas';
import Voluntarios from './components/Voluntarios';
import Perfil from './components/Perfil';
import PanelAdmin from './components/PanelAdmin';
import Configuracion from './components/Configuracion';
import FormulaBuilder from './components/FormulaBuilder';
import MapUploader from './components/MapUploader';
import Modal from './components/Modal';
import { EventoNuevo, FaseNueva } from './components/EventoForm';
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
  const [vista, setVista] = useState('mapa'); // mapa | carga | encuestas | tareas | voluntarios | perfil | panel | config
  const [tabConfig, setTabConfig] = useState('usuarios');
  const [modal, setModal] = useState(null);   // mapa-capa | evento | fase | estadistico  (todos exclusivos de ADMIN)
  const [menu, setMenu] = useState(false);
  
  const [sidebarColapsado, setSidebarColapsado] = useState(false);

  const { evento, fase, cargarEvento, seleccionarFase, refrescarDatos } = useMapa();

  const rol = usuario?.rol;
  const puedeTareas = rol === 'ADMIN' || rol === 'ORGANIZACION';
  const admin = usuario?.rol === 'ADMIN'; 
  const cerrar = useCallback(() => setModal(null), []);
  
  const recargarYResetearEventos = useCallback(async () => {
    try {
      const lista = await api.get('/eventos');
      setEventos(lista);
      
      if (lista.length === 0) {
        setVista('mapa');
      }
      return lista;
    } catch (e) {
      console.error("Error al recargar eventos:", e);
    }
  }, []);

  useEffect(() => { const h = () => setLogueado(false); window.addEventListener('tt:logout', h); return () => window.removeEventListener('tt:logout', h); }, []);
  useEffect(() => {
    if (!logueado) return;
    api.get('/auth/me').then(setUsuario);
    recargarYResetearEventos().then((lista) => {
      if (lista && lista.length > 0) cargarEvento(lista[0].id);
    });
  }, [logueado, recargarYResetearEventos, cargarEvento]);

  useEffect(() => {
    if (!logueado || vista !== 'mapa') return;
    const t = setInterval(() => refrescarDatos(), 30000);
    return () => clearInterval(t);
  }, [logueado, vista, refrescarDatos]);

  if (!logueado) return <Login onOk={(u) => { setUsuario(u); setLogueado(true); }} />;
  
  const irConfig = (tab) => { setTabConfig(tab); setVista('config'); setMenu(false); };
  const ir = (v) => { setVista(v); setMenu(false); };

  return (
    <div className="app">
      {/* Componente Header independiente */}
      <Header 
        evento={evento}
        eventos={eventos}
        fase={fase}
        usuario={usuario}
        admin={admin}
        puedeTareas={puedeTareas}
        vista={vista}
        menu={menu}
        setMenu={setMenu}
        cargarEvento={cargarEvento}
        seleccionarFase={seleccionarFase}
        setModal={setModal}
        setVista={setVista}
        irConfig={irConfig}
        ir={ir}
        setToken={setToken}
        setLogueado={setLogueado}
      />

      <main className={vista === 'mapa' && evento ? `principal con-mapa ${sidebarColapsado ? 'sidebar-colapsada' : ''}` : 'principal'}>
        {vista === 'mapa' && evento && (
          <>
            <Sidebar 
              admin={admin} 
              onCargarCapa={() => setModal('mapa-capa')} 
              colapsado={sidebarColapsado}
              onToggleColapsar={() => setSidebarColapsado(!sidebarColapsado)}
            />
            <MapView />
          </>
        )}
        {vista === 'mapa' && !evento && (
          <div className="panel vacio-inicial">
            <h2>Todavía no hay eventos</h2>
            {admin ? <><p>Creá el primero: elegí el mapa de la zona a relevar y definí su formulario.</p><button className="primario" onClick={() => setModal('evento')}>Crear evento</button></>
                  : <p>Pedile a un administrador que cree un evento.</p>}
          </div>
        )}
        {vista === 'carga' && <CargaEncuestas usuario={usuario} />}
        {vista === 'encuestas' && <GestionEncuestas usuario={usuario} />}
        {vista === 'tareas' && <Tareas usuario={usuario} />}
        {vista === 'voluntarios' && puedeTareas && <Voluntarios usuario={usuario} />}
        {vista === 'perfil' && <Perfil usuario={usuario} onActualizado={(u) => setUsuario((x) => ({ ...x, ...u }))} />}
        {vista === 'panel' && admin && <PanelAdmin onCambioEventos={recargarYResetearEventos} />}
        {vista === 'config' && admin && <Configuracion key={tabConfig} usuario={usuario} tabInicial={tabConfig} />}
      </main>

      {vista === 'mapa' && evento && <Footer admin={admin} onAgregar={() => setModal('estadistico')} />}

      {admin && modal === 'evento' && (
        <Modal titulo="Nuevo evento" onCerrar={cerrar} ancho={720}>
          <EventoNuevo onCreado={async (ev) => { await recargarYResetearEventos(); await cargarEvento(ev.id); cerrar(); }} />
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