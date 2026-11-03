import { Termometro, Usuarios } from './Iconos';

export default function Header({ 
  evento, 
  eventos, 
  fase, 
  usuario, 
  admin, 
  puedeTareas, 
  vista, 
  menu, 
  setMenu, 
  cargarEvento, 
  seleccionarFase, 
  setModal, 
  setVista, 
  irConfig, 
  ir, 
  setToken, 
  setLogueado 
}) {
  const iniciales = (usuario?.nombre ?? '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const rol = usuario?.rol;

  return (
    <header className="cabecera">
      <div 
        className="marca" 
        onClick={() => setVista('mapa')} 
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
        title="Ir al mapa principal"
      >
        <Termometro />
        <h1 style={{ lineHeight: '1.1', fontSize: '1.1rem', margin: 0 }}>
          Termómetro<br />Territorial
        </h1>
      </div>


      <div className="cab-der">
        <div className="selector">
        <select aria-label="Evento" value={evento?.id ?? ''} onChange={(e) => cargarEvento(e.target.value)}>
          {!eventos.length && <option value="">Sin eventos</option>}
          {eventos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        {admin && <button className="mas" aria-label="Nuevo evento" onClick={() => setModal('evento')}><span className="mas-icon">+</span></button>}
      </div>

      {evento && (
        <div className="selector">
          <select aria-label="Fase" value={fase?.id ?? ''} onChange={(e) => seleccionarFase(e.target.value)}>
            {!evento.fases.length && <option value="">Sin fases</option>}
            {evento.fases.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
          </select>
          {admin && <button className="mas" aria-label="Nueva fase" onClick={() => setModal('fase')}><span className="mas-icon">+</span></button>}
        </div>
      )}
        <div className="avatar-wrap">
          <button className="avatar" aria-label="Cuenta" aria-expanded={menu} onClick={() => setMenu(!menu)}>{iniciales}</button>
          {menu && (
            <div className="menu" role="menu">
              <p><strong>{usuario?.nombre}</strong><br /><small>{{ ADMIN: 'Administrador', ORGANIZACION: 'Organización', OPERADOR: 'Voluntario / Operador' }[rol]}</small></p>
              <button role="menuitem" onClick={() => ir('perfil')}>Mi perfil</button>
              {puedeTareas && <button role="menuitem" onClick={() => ir('voluntarios')}>Voluntarios</button>}
              {admin && <button role="menuitem" onClick={() => ir('panel')}>Panel de control</button>}
              {admin && <button role="menuitem" onClick={() => ir('organizaciones')}>Organizaciones</button>}
              {admin && <button role="menuitem" onClick={() => irConfig('usuarios')}>Configuración</button>}
              <button role="menuitem" onClick={() => { setToken(null); setLogueado(false); }}>Salir</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}