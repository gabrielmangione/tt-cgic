import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapa } from '../store/mapaStore';
import { indicePorZona, rampa } from '../lib/indices';

const COLOR_PRIORIDAD = { ALTA: '#C8342B', MEDIA: '#E0A100', BAJA: '#2F8F5B' };

// Centro y límites salen del GeoJSON de la jurisdicción (calculados por el backend)
function AjustarLimites({ bounds }) {
  const map = useMap();
  useEffect(() => { if (bounds) map.fitBounds(bounds, { padding: [24, 24] }); }, [bounds, map]);
  return null;
}

const iconoCapa = (capa) => L.divIcon({
  className: 'tt-marcador',
  html: `<span style="background:${capa.color}">${(capa.icon && !capa.icon.startsWith('http') ? capa.icon : '●').slice(0, 2)}</span>`,
  iconSize: [26, 26],
});

export default function MapView() {
  const { jurisdiccion, zonas, capas, visibles, encuestas, mostrarEncuestas, verLimites, verOrganizaciones, preguntaActiva, resumenes, seleccionar, formulario } = useMapa();
  // Variable objetivo del formulario: define el color de las zonas (Panorama general)
  const objetivo = useMemo(() => formulario?.secciones.flatMap((s) => s.preguntas).find((p) => p.id === formulario.variableObjetivoId) ?? null, [formulario]);
  const generalId = capas.find((c) => c.tipo === 'GENERAL')?.id;
  const indices = useMemo(() => indicePorZona({ zonas, encuestas, resumenes, preguntaActiva, objetivo, generalId }), [zonas, encuestas, resumenes, preguntaActiva, objetivo, generalId]);
  const critica = useMemo(() => {
    const top = Object.entries(indices).sort((a, b) => b[1] - a[1])[0];
    return top ? { zona: zonas.find((z) => z.id === top[0]), valor: top[1] } : null;
  }, [indices, zonas]);

  if (!jurisdiccion) return <div className="mapa-vacio">Elegí un evento para ver el mapa.</div>;

  return (
    <div className="mapa">
      <MapContainer center={jurisdiccion.centro} zoom={12} className="mapa-leaflet" preferCanvas>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AjustarLimites bounds={jurisdiccion.bounds} />

        {verLimites && <GeoJSON key={`j-${jurisdiccion.id}`} data={jurisdiccion.geometria} style={{ color: '#0E1B26', weight: 2, fill: false }} interactive={false} />}

        {/* Zonas coloreadas por índice de necesidad (0–100) */}
        {zonas.filter((z) => z.geometria).map((z) => {
          const idx = indices[z.id], conOrg = verOrganizaciones && z.organizaciones?.length;
          return (
            <GeoJSON
              key={`z-${z.id}-${preguntaActiva?.preguntaId ?? 'g'}-${idx}-${!!conOrg}`}
              data={z.geometria}
              style={{ color: conOrg ? '#2A6FDB' : '#fff', weight: conOrg ? 3 : 1.5, fillColor: idx == null ? '#9FB4C0' : rampa(idx / 100), fillOpacity: idx == null ? 0.15 : 0.62 }}
              onEachFeature={(_f, layer) => {
                const el = document.createElement('span'); // textContent: el nombre viene de archivos subidos, nunca HTML
                el.textContent = `${z.nombre} — ${idx == null ? 'sin datos' : `Índice ${idx}/100`}`;
                layer.bindTooltip(el, { sticky: true });
                layer.on('click', () => seleccionar({ tipo: 'zona', zona: z }));
              }}
            />
          );
        })}

        {capas.filter((c) => c.geojson && visibles[c.id]).map((c) => (
          <GeoJSON
            key={`c-${c.id}-${c.color}-${c.icon}-${c.geojson.features.length}`}
            data={c.geojson}
            style={{ color: c.color, weight: 2, fillColor: c.color, fillOpacity: 0.15 }}
            pointToLayer={(_f, ll) => L.marker(ll, { icon: iconoCapa(c) })}
            onEachFeature={(f, layer) => layer.on('click', () => seleccionar({ tipo: 'feature', capa: c, propiedades: f.properties }))}
          />
        ))}

        {mostrarEncuestas && encuestas.filter((e) => e.latitud != null).map((e) => (
          <CircleMarker key={e.id} center={[e.latitud, e.longitud]} radius={6}
            pathOptions={{ color: '#fff', weight: 1, fillOpacity: 0.95, fillColor: COLOR_PRIORIDAD[e.prioridad] ?? '#C9A227' }}
            eventHandlers={{ click: () => seleccionar({ tipo: 'encuesta', encuesta: e }) }} />
        ))}
      </MapContainer>

      {critica?.zona && (
        <div className="critica" role="status">
          <small>Zona más crítica</small>
          <strong>{critica.zona.nombre}</strong>
          <span className="critica-sub">{preguntaActiva ? 'Índice de la necesidad seleccionada' : objetivo ? `Variable objetivo: ${objetivo.etiqueta}` : 'Índice de prioridad territorial'}</span>
          <div className="critica-num"><b>{critica.valor}</b><span>/100</span></div>
        </div>
      )}
      <div className="leyenda" aria-label="Escala de colores">
        <span>Menor</span><i /><span>Mayor</span>
      </div>
      <DialogoFlotante />
    </div>
  );
}

// Resumen ejecutivo al hacer clic. Se renderiza con React (texto escapado).
function DialogoFlotante() {
  const { seleccion, seleccionar, formulario, capas, resumenes } = useMapa();
  if (!seleccion) return null;
  const general = capas.find((c) => c.tipo === 'GENERAL');
  const preguntas = formulario?.secciones.flatMap((s) => s.preguntas) ?? [];

  let titulo, cuerpo;
  if (seleccion.tipo === 'zona') {
    const z = seleccion.zona, res = resumenes[general?.id]?.[z.id] ?? {};
    titulo = z.nombre;
    cuerpo = (
      <>
        {z.organizaciones?.length > 0 && <p>Organizaciones presentes: {z.organizaciones.map((o) => o.nombre).join(', ')}</p>}
        <dl>
          {preguntas.filter((p) => res[p.id]).map((p) => {
            const r = res[p.id], cats = Object.entries(r.categorias).sort((a, b) => b[1] - a[1]);
            return <div key={p.id}><dt>{p.etiqueta}</dt><dd>{cats.length ? cats.slice(0, 3).map(([k, n]) => `${k} (${n})`).join(' · ') : p.tipo === 'BOOLEANO' ? `${r.suma} de ${r.n} hogares` : p.tipo === 'ESCALA' ? `promedio ${(r.suma / r.n).toFixed(1)}` : r.suma}</dd></div>;
          })}
        </dl>
        {!Object.keys(res).length && <p>Todavía no hay encuestas en esta zona.</p>}
      </>
    );
  } else if (seleccion.tipo === 'feature') {
    titulo = seleccion.capa.nombre;
    cuerpo = <dl>{Object.entries(seleccion.propiedades).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{String(v)}</dd></div>)}</dl>;
  } else {
    const e = seleccion.encuesta;
    titulo = `Encuesta · prioridad ${e.prioridad ?? 'sin clasificar'}`;
    cuerpo = <>{e.scoreIA != null && <p>Score IA: {e.scoreIA.toFixed(2)}</p>}{e.necesidadesPrimarias?.length > 0 && <p>Necesidades: {e.necesidadesPrimarias.map((n) => n.categoria).join(', ')}</p>}</>;
  }
  return (
    <aside className="dialogo" role="dialog" aria-label={titulo}>
      <header><h3>{titulo}</h3><button onClick={() => seleccionar(null)} aria-label="Cerrar">×</button></header>
      {cuerpo}
    </aside>
  );
}
