import { useMapa } from '../store/mapaStore';
import { api } from '../lib/api';
import { Globo, Capas, Papelera, Mas, Edificio, Mapa, Circulo } from './Iconos';

const Interruptor = ({ activo, onChange, etiqueta }) => (
  <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} className="interruptor" onClick={onChange}><span /></button>
);

export default function Sidebar({ admin = false, onCargarCapa }) {
  const s = useMapa();
  const { evento, formulario, capas, visibles, preguntaActiva, activarPregunta, limpiarPregunta, cargarEvento } = s;
  if (!evento) return <aside className="sidebar" />;

  const general = capas.find((c) => c.tipo === 'GENERAL');
  const capaDe = Object.fromEntries(capas.map((c) => [c.id, c]));
  const geograficas = capas.filter((c) => c.geojson);
  const preguntas = formulario?.secciones.flatMap((sec) => sec.preguntas.map((p) => ({ p, sec }))) ?? [];
  const activa = preguntas.find(({ p }) => p.id === preguntaActiva?.preguntaId);
  const objetivoP = preguntas.find(({ p }) => p.id === formulario?.variableObjetivoId)?.p;
  const destinos = (p, sec) => [...new Set([sec.capaId, ...p.capasPregunta.map((c) => c.capaId), general?.id].filter(Boolean))];

  return (
    <aside className="sidebar">
      <div className="necesidad">
        <small>Necesidad seleccionada</small>
        <strong>{activa ? activa.p.etiqueta : 'Panorama general'}</strong>
        {!activa && <span className="necesidad-nota">{objetivoP ? `Mapa pintado por la variable objetivo: ${objetivoP.etiqueta}` : 'Sin variable objetivo: se usa el puntaje de la IA'}</span>}
      </div>

      <h2 className="sb-titulo">Mapa de necesidades</h2>
      <button className={`item${!preguntaActiva ? ' on' : ''}`} onClick={limpiarPregunta}><Globo />Panorama general</button>

      {!formulario && <p className="sb-vacio">La fase no tiene formulario todavía.</p>}
      {formulario?.secciones.filter((sec) => sec.preguntas.length).map((sec) => (
        <div key={sec.id}>
          <h3 className="sb-grupo">{sec.nombre}</h3>
          {sec.preguntas.map((p) => {
            const on = preguntaActiva?.preguntaId === p.id, dest = destinos(p, sec);
            return (
              <div key={p.id}>
                <button className={`item${on ? ' on' : ''}`} onClick={() => activarPregunta(p.id, dest[0])}>
                  <Capas />{p.etiqueta}{formulario.variableObjetivoId === p.id && <em className="obj">objetivo</em>}{p.esCausaUrgencia && <abbr className="urgencia" title="Causa directa de urgencia">!</abbr>}
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
        <li><Mapa /><span>Límites barriales</span><Interruptor activo={s.verLimites} onChange={s.toggleLimites} etiqueta="Límites barriales" /></li>
        <li><Edificio /><span>Organizaciones</span><Interruptor activo={s.verOrganizaciones} onChange={s.toggleOrganizaciones} etiqueta="Organizaciones" /></li>
        <li><Circulo /><span>Encuestas</span><Interruptor activo={s.mostrarEncuestas} onChange={s.toggleEncuestas} etiqueta="Encuestas" /></li>
        {geograficas.map((c) => (
          <li key={c.id}>
            <Capas /><span>{c.nombre}</span>
            <Interruptor activo={!!visibles[c.id]} onChange={() => s.toggleCapa(c.id)} etiqueta={c.nombre} />
            {admin && <button className="icono" aria-label={`Eliminar ${c.nombre}`} onClick={async () => { if (confirm(`¿Eliminar la capa «${c.nombre}»?`)) { await api.del(`/capas/${c.id}`); cargarEvento(evento.id); } }}><Papelera /></button>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
