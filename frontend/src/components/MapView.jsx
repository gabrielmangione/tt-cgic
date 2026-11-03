import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapa } from '../store/mapaStore';
import { indicePorZona, rampa, centroide } from '../lib/indices';

const COLOR_PRIORIDAD = { ALTA: '#C8342B', MEDIA: '#E0A100', BAJA: '#2F8F5B' };

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
  const { jurisdiccion, zonas, capas, visibles, encuestas, mostrarEncuestas, verLimites, verOrganizaciones, preguntaActiva, resumenes, seleccionar, formulario, panorama, graves, verGraves, cargarGraves, umbral } = useMapa();
  
  const objetivo = useMemo(() => formulario?.secciones.flatMap((s) => s.preguntas).find((p) => p.id === formulario.variableObjetivoId) ?? null, [formulario]);
  const generalId = capas.find((c) => c.tipo === 'GENERAL')?.id;

  // Si no hay pregunta activa pero existe una variable objetivo, la usamos como contexto efectivo para calcular los índices
  const preguntaEfectiva = useMemo(() => {
    if (preguntaActiva) return preguntaActiva;
    if (formulario?.variableObjetivoId) {
      return { preguntaId: formulario.variableObjetivoId, capaId: generalId };
    }
    return null;
  }, [preguntaActiva, formulario, generalId]);

  const indices = useMemo(() => indicePorZona({ zonas, encuestas, resumenes, preguntaActiva: preguntaEfectiva }), [zonas, encuestas, resumenes, preguntaEfectiva]);

  const centros = useMemo(() => Object.fromEntries(zonas.map((z) => [z.id, centroide(z.geometria)])), [zonas]);
  const aproximadas = useMemo(() => {
    const g = {};
    for (const e of encuestas) if (e.latitud == null && e.zonaKey !== '_' && centros[e.zonaKey]) (g[e.zonaKey] ??= []).push(e);
    return Object.entries(g).map(([zonaKey, items]) => ({ zona: zonas.find((z) => z.id === zonaKey), items, centro: centros[zonaKey] }));
  }, [encuestas, centros, zonas]);

  useEffect(() => {
    if (!verGraves) return;
    const t = setTimeout(cargarGraves, 300);
    return () => clearTimeout(t);
  }, [verGraves, umbral, cargarGraves]);

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

        {/* Zonas coloreadas por la variable objetivo (en panorama general) o por la necesidad activa */}
        {zonas.filter((z) => z.geometria).map((z) => {
          const idx = indices[z.id], conOrg = verOrganizaciones && z.organizaciones?.length;
          const viv = !preguntaActiva ? panorama?.zonas?.[z.id]?.n : null;
          return (
            <GeoJSON
              key={`z-${z.id}-${preguntaEfectiva?.preguntaId ?? 'g'}-${idx}-${!!conOrg}`}
              data={z.geometria}
              style={{ color: conOrg ? '#2A6FDB' : '#fff', weight: conOrg ? 3 : 1.5, fillColor: idx == null ? '#9FB4C0' : rampa(idx / 100), fillOpacity: idx == null ? 0.15 : 0.62 }}
              onEachFeature={(_f, layer) => {
                const el = document.createElement('span');
                el.textContent = `${z.nombre} — ${idx == null ? 'sin datos' : `${objetivo && !preguntaActiva ? objetivo.etiqueta + ': ' : 'Índice '}${idx}/100`}${viv ? ` · ${viv} viviendas` : ''}`;
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

        {mostrarEncuestas && aproximadas.map((a) => (
          <Marker key={`ap-${a.zona.id}-${a.items.length}`} position={a.centro}
            icon={L.divIcon({ className: 'tt-aprox', html: `<span title="Ubicación aproximada">${a.items.length}</span>`, iconSize: [30, 30] })}
            eventHandlers={{ click: () => seleccionar({ tipo: 'aproximadas', zona: a.zona, items: a.items }) }} />
        ))}

        {verGraves && graves?.items.map((g) => {
          const pos = g.latitud != null ? [g.latitud, g.longitud] : centros[g.zonaKey];
          return pos && (
            <CircleMarker key={`g-${g.id}`} center={pos} radius={12} className="tt-grave"
              pathOptions={{ color: '#7A0F0F', weight: 3, fillColor: '#C8342B', fillOpacity: 0.35 }}
              eventHandlers={{ click: () => seleccionar({ tipo: 'grave', caso: g, aproximada: g.latitud == null }) }} />
          );
        })}
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
  } else if (seleccion.tipo === 'aproximadas') {
    const cuenta = { ALTA: 0, MEDIA: 0, BAJA: 0, 'Sin clasificar': 0 };
    for (const e of seleccion.items) cuenta[e.prioridad ?? 'Sin clasificar']++;
    titulo = `${seleccion.zona.nombre} · ubicación aproximada`;
    cuerpo = (
      <>
        <p>{seleccion.items.length} viviendas sin coordenadas, dibujadas en el punto medio de la zona.</p>
        <dl>{Object.entries(cuenta).filter(([, n]) => n).map(([k, n]) => <div key={k}><dt>{k}</dt><dd>{n}</dd></div>)}</dl>
      </>
    );
  } else if (seleccion.tipo === 'grave') {
    const g = seleccion.caso;
    titulo = `Caso grave · puntaje ${g.puntaje}`;
    cuerpo = <>{g.prioridad && <p>Prioridad IA: {g.prioridad}</p>}{seleccion.aproximada && <p>Sin coordenadas: se muestra en el centro de su zona.</p>}</>;
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