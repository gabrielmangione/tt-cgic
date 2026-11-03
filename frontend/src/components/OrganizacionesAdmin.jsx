import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';

const msgError = (e) => e.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || e.message;

export default function OrganizacionesAdmin() {
  const { zonas, jurisdiccion } = useMapa();
  const VACIA = { nombre: '', descripcion: '', contacto: '', zonaIds: [] };
  const [lista, setLista] = useState([]);
  const [edit, setEdit] = useState(VACIA);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/organizaciones').then(setLista);
  useEffect(() => { cargar(); }, []);

  async function guardar(e) {
    e.preventDefault(); 
    setError(null);
    const cuerpo = { 
      nombre: edit.nombre, 
      descripcion: edit.descripcion || null, 
      contacto: edit.contacto || null, 
      zonaIds: edit.zonaIds 
    };
    try { 
      edit.id ? await api.put(`/organizaciones/${edit.id}`, cuerpo) : await api.post('/organizaciones', cuerpo); 
      setEdit(VACIA); 
      cargar(); 
    } catch (x) { 
      setError(msgError(x)); 
    }
  }

  const marcar = (id, on) => setEdit((o) => ({ 
    ...o, 
    zonaIds: on ? [...o.zonaIds, id] : o.zonaIds.filter((z) => z !== id) 
  }));

  // Alternar zona haciendo clic directamente en el mapa o en el checkbox
  const toggleZonaPorNombre = (nombreZona) => {
    const zonaEncontrada = zonas.find((z) => z.nombre.toLowerCase() === nombreZona.toLowerCase());
    if (!zonaEncontrada) return;
    const yaIncluida = edit.zonaIds.includes(zonaEncontrada.id);
    marcar(zonaEncontrada.id, !yaIncluida);
  };

  return (
    <div className="panel" style={{ padding: '24px', maxWidth: '1100px', margin: '20px auto' }}>
      <h2>Gestión de Organizaciones</h2>
      <p className="vacio">Listado de organizaciones territoriales y sus zonas de presencia.</p>
      
      {error && <p role="alert" className="error">{error}</p>}

      {/* Listado de organizaciones en formato de tabla por filas */}
      <table className="tabla-vars" style={{ marginTop: '16px', marginBottom: '30px' }}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Contacto</th>
            <th>Zonas con presencia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((o) => (
            <tr key={o.id}>
              <td><strong>{o.nombre}</strong></td>
              <td>{o.descripcion || '—'}</td>
              <td>{o.contacto || '—'}</td>
              <td><code>{o.zonas.map((z) => z.nombre).join(', ') || 'Sin zonas'}</code></td>
              <td>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    type="button"
                    className="ghost"
                    style={{ background: '#f0f0f0', color: '#333', border: '1px solid #ccc', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={() => setEdit({ 
                      id: o.id, 
                      nombre: o.nombre, 
                      descripcion: o.descripcion ?? '', 
                      contacto: o.contacto ?? '', 
                      zonaIds: o.zonas.map((z) => z.id) 
                    })}
                  >
                    Modificar
                  </button>
                  <button 
                    type="button" 
                    className="ghost peligro" 
                    style={{ background: '#fdf2f2', color: '#d9534f', border: '1px solid #f5c6cb', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={async () => { 
                      if (confirm(`¿Eliminar ${o.nombre}?`)) { 
                        await api.del(`/organizaciones/${o.id}`); 
                        cargar(); 
                      } 
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!lista.length && (
            <tr>
              <td colSpan={5} className="vacio">No hay organizaciones registradas.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Formulario de Agregar / Modificar */}
      <form onSubmit={guardar} className="panel" style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #dee2e6' }}>
        <h3 style={{ marginTop: 0 }}>{edit.id ? `Modificar organización: ${edit.nombre}` : 'Agregar nueva organización'}</h3>
        
        <div className="fila" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <label>Nombre
            <input required value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} placeholder="Ej: Comedor Barrial" />
          </label>
          <label>Contacto
            <input value={edit.contacto} onChange={(e) => setEdit({ ...edit, contacto: e.target.value })} placeholder="Teléfono o correo" />
          </label>
        </div>

        <label style={{ marginTop: '10px', display: 'block' }}>Descripción
          <input value={edit.descripcion} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} placeholder="Breve descripción de la organización" />
        </label>

        {/* Zonas en grilla multiconlumna (estilo imagen) */}
        
        <fieldset style={{ border: '1px solid #ccc', padding: '15px', marginTop: '15px', borderRadius: '6px', background: '#fff' }}>
          <legend style={{ padding: '0 8px', fontWeight: 'bold', color: '#333' }}>Zonas donde tiene presencia (Seleccioná en la grilla o haz clic en el mapa)</legend>
          
          {zonas.length === 0 && <p className="vacio">Primero creá zonas en Configuración → Zonas.</p>}
          
          {/* Grilla multi-columna idéntica a la referencia visual */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginTop: '10px' }}>
            {zonas.map((z) => {
              const seleccionado = edit.zonaIds.includes(z.id);
              return (
                <label 
                  key={z.id} 
                  className="check" 
                  style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    background: seleccionado ? '#e7f1ff' : 'transparent',
                    border: seleccionado ? '1px solid #b6d4fe' : '1px solid transparent',
                    fontSize: '0.9rem'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={seleccionado} 
                    onChange={(e) => marcar(z.id, e.target.checked)} 
                  />
                  <span style={{ fontWeight: seleccionado ? '600' : 'normal' }}>{z.nombre}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="acciones" style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
          <button className="primario" type="submit">{edit.id ? 'Guardar cambios' : 'Crear organización'}</button>
          {edit.id && (
            <button type="button" onClick={() => setEdit(VACIA)} style={{ background: '#e0e0e0', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>
    </div>
  );
}