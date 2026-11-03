import { useMapa } from '../store/mapaStore';
import { api } from '../lib/api';
import { Globo, Capas, Papelera, Mas, Edificio, Mapa, Circulo, Alerta } from './Iconos';

const Interruptor = ({ activo, onChange, etiqueta }) => (
  <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} className="interruptor" onClick={onChange}><span /></button>
);

export default function Sidebar({ admin = false, onCargarCapa, colapsado = false, onToggleColapsar }) {
  const s = useMapa();
  const { evento, formulario, capas, visibles, preguntaActiva, activarPregunta, limpiarPregunta, cargarEvento } = s;

  if (!evento) return <aside className="sidebar" />;

  const general = capas.find((c) => c.tipo === 'GENERAL');
  const capaDe = Object.fromEntries(capas.map((c) => [c.id, c]));
  const geograficas = capas.filter((c) => c.geojson);

  // 1. Identificar el ID o clave de la variable objetivo configurada en el formulario
  const variableObjetivoId = formulario?.variableObjetivoId;

  // 2. Encontrar la pregunta que corresponde a la variable objetivo
  const objetivoP = formulario?.secciones
    ?.flatMap((sec) => sec.preguntas)
    ?.find((p) => p.id === variableObjetivoId || p.clave === variableObjetivoId);

  // 3. Filtrar las secciones y preguntas para EXCLUIR la variable objetivo del listado del mapa de necesidades
  const seccionesFiltradas = formulario?.secciones?.map((sec) => ({
    ...sec,
    preguntas: sec.preguntas.filter((p) => p.id !== variableObjetivoId && p.clave !== variableObjetivoId)
  })).filter((sec) => sec.preguntas.length > 0) ?? [];

  const preguntasFlat = seccionesFiltradas.flatMap((sec) => sec.preguntas.map((p) => ({ p, sec }))) ?? [];
  const activa = preguntasFlat.find(({ p }) => p.id === preguntaActiva?.preguntaId);
  const destinos = (p, sec) => [...new Set([sec.capaId, ...p.capasPregunta.map((c) => c.capaId), general?.id].filter(Boolean))];

  return (
    <aside className={`sidebar ${colapsado ? 'colapsada' : ''}`}>
      <button 
        type="button" 
        className="sb-toggle" 
        onClick={onToggleColapsar} 
        aria-label={colapsado ? "Expandir barra lateral" : "Colapsar barra lateral"}
        title={colapsado ? "Expandir" : "Colapsar"}
      >
        {colapsado ? '▶' : '◀'}
      </button>

      {!colapsado && (
        <div className="sidebar-content">
          <div className="necesidad">
            <small>Necesidad seleccionada</small>
            <strong>{activa ? activa.p.etiqueta : 'Panorama general'}</strong>
            {!activa && (
              <span className="necesidad-nota">
                {objetivoP ? `Mapa pintado por la variable objetivo: ${objetivoP.etiqueta}` : 'Se usa el puntaje de la IA'}
              </span>
            )}
          </div>

          <h2 className="sb-titulo">Mapa de necesidades</h2>
          
          {/* Botón Panorama General vinculado a la variable objetivo */}
          <button className={`item${!preguntaActiva ? ' on' : ''}`} onClick={limpiarPregunta}>
            <Globo />
            <span>Panorama general</span>
            {objetivoP && <em className="obj">{objetivoP.etiqueta}</em>}
          </button>

          {!formulario && <p className="sb-vacio">La fase no tiene formulario todavía.</p>}
          
          {/* Renderizado de secciones y preguntas SIN la variable objetivo */}
          {seccionesFiltradas.map((sec) => (
            <div key={sec.id}>
              <h3 className="sb-grupo">{sec.nombre}</h3>
              {sec.preguntas.map((p) => {
                const on = preguntaActiva?.preguntaId === p.id, dest = destinos(p, sec);
                return (
                  <div key={p.id}>
                    <button className={`item${on ? ' on' : ''}`} onClick={() => activarPregunta(p.id, dest[0])}>
                      <Capas />{p.etiqueta}{p.esCausaUrgencia && <abbr className="urgencia" title="Causa directa de urgencia">!</abbr>}
                    </button>
                    {on && dest.length > 1 && (
                      <div className="chips" aria-label="Capa de origen">
                        {dest.map((id) => <button key={id} className={preguntaActiva.capaId === id ? 'on' : ''} onClick={() => activarPregunta(p.id, id)}>{capaDe[id]?.nombre}</button>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div className="sb-cab">
            <h2 className="sb-titulo">Capas adicionales</h2>
            {admin && <button className="icono" onClick={onCargarCapa} aria-label="Cargar capa geográfica"><Mas /></button>}
          </div>
          <ul className="sb-capas">
            <li><Edificio /><span>Organizaciones</span><Interruptor activo={s.verOrganizaciones} onChange={s.toggleOrganizaciones} etiqueta="Organizaciones" /></li>
            <li><Circulo /><span>Encuestas</span><Interruptor activo={s.mostrarEncuestas} onChange={s.toggleEncuestas} etiqueta="Encuestas" /></li>
            <li><Alerta /><span>Casos más graves</span><Interruptor activo={s.verGraves} onChange={s.toggleGraves} etiqueta="Casos más graves" /></li>
            {s.verGraves && (
              <li className="umbral">
                <label>Mostrar casos con puntaje mayor a
                  <span className="umbral-fila">
                    <input type="range" min="0" max="100" value={s.umbral} onChange={(e) => s.setUmbral(e.target.value)} aria-label="Umbral" />
                    <input type="number" min="0" max="100" value={s.umbral} onChange={(e) => s.setUmbral(e.target.value)} aria-label="Umbral numérico" />
                  </span>
                </label>
                <small>{s.graves ? `${s.graves.total} casos por encima del umbral` : 'Calculando…'}</small>
              </li>
            )}
            {geograficas.map((c) => (
              <li key={c.id}>
                <Capas /><span>{c.nombre}</span>
                <Interruptor activo={!!visibles[c.id]} onChange={() => s.toggleCapa(c.id)} etiqueta={c.nombre} />
                {admin && <button className="icono" aria-label={`Eliminar ${c.nombre}`} onClick={async () => { if (confirm(`¿Eliminar la capa «${c.nombre}»?`)) { await api.del(`/capas/${c.id}`); cargarEvento(evento.id); } }}><Papelera /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}