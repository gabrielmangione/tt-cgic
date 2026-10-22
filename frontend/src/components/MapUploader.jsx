import { useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import { api } from '../lib/api';

function Ajustar({ bounds }) { const m = useMap(); m.fitBounds(bounds, { padding: [10, 10] }); return null; }

/**
 * destino="jurisdiccion": mapa base de la zona a relevar.   destino="capa": capa adicional del evento.
 * Paso 1: el backend parsea KML/KMZ/GeoJSON (sin guardar). Paso 2: la persona edita nombre, color, alias y variables visibles.
 */
export default function MapUploader({ destino = 'capa', eventoId, onGuardado }) {
  const [prev, setPrev] = useState(null);
  const [form, setForm] = useState({ nombre: '', color: '#1F6F8B', icon: '' });
  const [vars, setVars] = useState([]);
  const [estado, setEstado] = useState({ cargando: false, error: null });

  async function elegir(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setEstado({ cargando: true, error: null });
    try {
      const r = await api.subir('/geo/parse', archivo);
      setPrev(r); setVars(r.variables);
      setForm((f) => ({ ...f, nombre: f.nombre || r.nombreArchivo.replace(/\.[^.]+$/, '') }));
      setEstado({ cargando: false, error: null });
    } catch (err) { setPrev(null); setEstado({ cargando: false, error: err.message }); }
  }

  const editarVar = (clave, cambio) => setVars((vs) => vs.map((v) => (v.clave === clave ? { ...v, ...cambio } : v)));

  async function guardar() {
    setEstado({ cargando: true, error: null });
    try {
      const guardado = destino === 'jurisdiccion'
        ? await api.post('/jurisdicciones', { nombre: form.nombre, geojson: prev.geojson, fuente: prev.nombreArchivo })
        : await api.post('/capas', {
            eventoId, nombre: form.nombre, tipo: 'ADICIONAL', color: form.color, icon: form.icon || null, geojson: prev.geojson,
            aliasVariables: Object.fromEntries(vars.filter((v) => v.alias && v.alias !== v.clave).map((v) => [v.clave, v.alias])),
            variablesActivas: vars.filter((v) => v.activa).map((v) => v.clave),
          });
      setPrev(null); setVars([]); setEstado({ cargando: false, error: null });
      onGuardado?.(guardado);
    } catch (err) { setEstado({ cargando: false, error: err.message }); }
  }

  return (
    <section className="panel uploader">
      <h2>{destino === 'jurisdiccion' ? 'Mapa base de la zona a relevar' : 'Nueva capa geográfica'}</h2>
      <label className="archivo">
        Archivo (.kml, .kmz, .geojson)
        <input type="file" accept=".kml,.kmz,.geojson,.json" onChange={elegir} />
      </label>
      {estado.error && <p role="alert" className="error">{estado.error}</p>}

      {prev && (
        <>
          <div className="uploader-grid">
            <div>
              <label>Nombre<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
              {destino === 'capa' && (
                <>
                  <label>Color<input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
                  <label>Ícono (emoji)<input maxLength={2} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} /></label>
                </>
              )}
              <p>{prev.totalFeatures} elementos · {vars.length} variables</p>
            </div>
            <MapContainer className="uploader-mapa" bounds={prev.bounds} zoom={10} scrollWheelZoom={false}>
              <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <GeoJSON data={prev.geojson} style={{ color: form.color, weight: 2, fillOpacity: 0.2 }} />
              <Ajustar bounds={prev.bounds} />
            </MapContainer>
          </div>

          {destino === 'capa' && vars.length > 0 && (
            <table className="tabla-vars">
              <thead><tr><th>Mostrar</th><th>Variable original</th><th>Nombre a mostrar</th></tr></thead>
              <tbody>
                {vars.map((v) => (
                  <tr key={v.clave}>
                    <td><input type="checkbox" checked={v.activa} onChange={(e) => editarVar(v.clave, { activa: e.target.checked })} aria-label={`Mostrar ${v.clave}`} /></td>
                    <td><code>{v.clave}</code></td>
                    <td><input value={v.alias} onChange={(e) => editarVar(v.clave, { alias: e.target.value })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="primario" disabled={estado.cargando || !form.nombre.trim()} onClick={guardar}>
            {destino === 'jurisdiccion' ? 'Guardar mapa base' : 'Guardar capa'}
          </button>
        </>
      )}
    </section>
  );
}
