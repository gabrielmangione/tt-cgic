import { useState } from 'react';
import { useMapa } from '../store/mapaStore';
import CargaEncuestas from './CargaEncuestas';
import GestionEncuestas from './GestionEncuestas';
import FormularioEditor from './FormularioEditor';

export default function EncuestasAdminVista() {
  const { evento } = useMapa();
  const [pestania, setPestania] = useState('gestion'); // 'gestion', 'carga', 'formulario'

  if (!evento) {
    return (
      <div className="panel" style={{ padding: '24px', textAlign: 'center', margin: '40px' }}>
        <h2>Por favor, seleccioná un evento activo para gestionar las encuestas.</h2>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2>Gestión de Encuestas</h2>
        <p className="vacio">Administra las encuestas del evento «{evento.nombre}», carga nuevas o modifica la estructura del formulario.</p>
      </div>

      {/* Pestañas de navegación interna */}
      <div role="tablist" className="tabs" style={{ marginBottom: '20px' }}>
        <button 
          role="tab" 
          aria-selected={pestania === 'gestion'} 
          onClick={() => setPestania('gestion')}
        >
          Gestionar Encuestas
        </button>
        <button 
          role="tab" 
          aria-selected={pestania === 'carga'} 
          onClick={() => setPestania('carga')}
        >
          Cargar Encuestas
        </button>
        <button 
          role="tab" 
          aria-selected={pestania === 'formulario'} 
          onClick={() => setPestania('formulario')}
        >
          Modificar Formulario
        </button>
      </div>

      {/* Contenido dinámico sin duplicar tarjetas */}
      <div>
        {pestania === 'gestion' && <GestionEncuestas />}
        {pestania === 'carga' && <CargaEncuestas />}
        {pestania === 'formulario' && (
          <div className="panel" style={{ background: '#fff', padding: '20px', borderRadius: '8px' }}>
            <FormularioEditor />
          </div>
        )}
      </div>
    </div>
  );
}