import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

export default function MisEncuestas({ usuario }) {
  const { fase, zonas } = useMapa();
  const [misEncuestas, setMisEncuestas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [encuestaEditando, setEncuestaEditando] = useState(null);

  const cargarMisEncuestas = async () => {
    if (!fase) return;
    try {
      setCargando(true);
      const res = await api.get(`/encuestas/fase/${fase.id}/mis-encuestas`);
      setMisEncuestas(res.items || res);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarMisEncuestas();
  }, [fase]);

  // Función auxiliar para obtener un nombre de zona legible en lugar del ID
  const obtenerNombreZona = (zonaKey) => {
    const zonaEncontrada = zonas.find((z) => z.id === zonaKey || z.nombre === zonaKey);
    return zonaEncontrada ? zonaEncontrada.nombre : (zonaKey || 'Zona general');
  };

  return (
    <div className="panel" style={{ padding: '16px', maxWidth: '800px', margin: '10px auto', width: '100%' }}>
      <h2>Mis Encuestas Realizadas</h2>
      <p className="vacio">Historial de relevamientos cargados por vos en esta fase.</p>

      {error && <p role="alert" className="error">{error}</p>}
      {cargando && <p className="vacio">Cargando tus encuestas...</p>}

      {!cargando && misEncuestas.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <p className="vacio">Todavía no registraste ninguna encuesta.</p>
        </div>
      )}

      {/* Listado en tarjetas adaptado para móviles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
        {misEncuestas.map((e, index) => {
          const nombreZonaLegible = obtenerNombreZona(e.zonaKey || e.zonaId);
          const fechaFormateada = new Date(e.createdAt || e.fecha).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });

          return (
            <div 
              key={e.id} 
              style={{ 
                background: '#fff', 
                border: '1px solid #dee2e6', 
                borderRadius: '8px', 
                padding: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#0d6efd' }}>
                  Encuesta #{index + 1}
                </span>
                <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                  {fechaFormateada}
                </span>
              </div>
              
              <div style={{ marginBottom: '12px' }}>
                <p style={{ margin: '4px 0', fontSize: '1rem' }}>
                  <strong>📍 Zona:</strong> {nombreZonaLegible}
                </p>
                {e.prioridad && (
                  <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
                    <strong>Prioridad:</strong> <span className={`badge ${e.prioridad.toLowerCase()}`}>{e.prioridad}</span>
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #f1f3f5', paddingTop: '10px' }}>
                <button 
                  className="ghost" 
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                  onClick={() => alert(`Modificar encuesta con ID: ${e.id}`)}
                >
                  ✏️ Modificar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}