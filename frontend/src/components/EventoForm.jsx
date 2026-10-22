import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import MapUploader from './MapUploader';

const ESTADOS = ['ALERTA', 'RELEVAMIENTO', 'RECUPERACION', 'CERRADO'];
const msg = (e) => e.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || e.message;

// Alta de evento: nombre, tipo, estado y jurisdicción (mapa existente o uno nuevo en KML/KMZ/GeoJSON)
export function EventoNuevo({ onCreado }) {
  const [jurs, setJurs] = useState([]);
  const [f, setF] = useState({ nombre: '', tipo: '', estado: 'RELEVAMIENTO', jurisdiccionId: '' });
  const [subir, setSubir] = useState(false);
  const [error, setError] = useState(null);
  const cargar = () => api.get('/jurisdicciones').then(setJurs);
  useEffect(() => { cargar(); }, []);

  async function enviar(e) {
    e.preventDefault(); setError(null);
    try { onCreado(await api.post('/eventos', f)); } catch (x) { setError(msg(x)); }
  }
  return (
    <form className="panel sin-borde" onSubmit={enviar}>
      <h2>Nuevo evento</h2>
      <label>Nombre<input required value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Bahía Blanca 2024" /></label>
      <div className="fila">
        <label>Tipo<input required list="tipos-evento" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="Inundación" />
          <datalist id="tipos-evento">{['Inundación', 'Incendio', 'Sismo', 'Temporal'].map((t) => <option key={t} value={t} />)}</datalist></label>
        <label>Estado<select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value })}>{ESTADOS.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <label>Mapa de la zona a relevar
        <select required value={f.jurisdiccionId} onChange={(e) => setF({ ...f, jurisdiccionId: e.target.value })}>
          <option value="">Elegí un mapa cargado…</option>
          {jurs.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
        </select>
      </label>
      <button type="button" onClick={() => setSubir(!subir)}>{subir ? 'Ocultar carga de mapa' : 'Cargar un mapa nuevo'}</button>
      {subir && <MapUploader destino="jurisdiccion" onGuardado={async (j) => { await cargar(); setF((x) => ({ ...x, jurisdiccionId: j.id })); setSubir(false); }} />}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="acciones"><button className="primario" disabled={!f.jurisdiccionId}>Crear evento</button></div>
    </form>
  );
}

export function FaseNueva({ evento, onCreada }) {
  const [nombre, setNombre] = useState('');
  const [activa, setActiva] = useState(true);
  const [error, setError] = useState(null);
  async function enviar(e) {
    e.preventDefault(); setError(null);
    try { onCreada(await api.post(`/eventos/${evento.id}/fases`, { nombre, orden: evento.fases.length, activa })); } catch (x) { setError(msg(x)); }
  }
  return (
    <form className="panel sin-borde" onSubmit={enviar}>
      <h2>Nueva fase de relevamiento</h2>
      <p className="vacio">Evento: {evento.nombre}. Después de crearla definí su formulario en Configuración → Formulario.</p>
      <label>Nombre<input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Relevamiento" /></label>
      <label className="check"><input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />Marcar como fase activa</label>
      {error && <p role="alert" className="error">{error}</p>}
      <div className="acciones"><button className="primario">Crear fase</button></div>
    </form>
  );
}
