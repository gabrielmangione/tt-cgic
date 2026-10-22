const { DOMParser } = require('@xmldom/xmldom');
const togeojson = require('@tmcw/togeojson');
const AdmZip = require('adm-zip');
const path = require('path');
const { httpError } = require('../utils');

const MAX_KMZ_DESCOMPRIMIDO = 80 * 1024 * 1024;
const TIPOS_GEOM = new Set(['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection']);

function kmlAGeoJSON(texto) {
  const dom = new DOMParser({ onError: () => {} }).parseFromString(texto, 'text/xml');
  return togeojson.kml(dom);
}

function leerKMZ(buffer) {
  const zip = new AdmZip(buffer);
  const entradas = zip.getEntries().filter((e) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.kml'));
  if (!entradas.length) throw httpError(422, 'El KMZ no contiene ningún .kml');
  const e = entradas.find((x) => path.basename(x.entryName).toLowerCase() === 'doc.kml') || entradas[0];
  if (e.header.size > MAX_KMZ_DESCOMPRIMIDO) throw httpError(413, 'KMZ descomprimido demasiado grande'); // anti zip-bomb
  return e.getData().toString('utf8');
}

function normalizar(fc) {
  let features;
  if (fc?.type === 'FeatureCollection') features = fc.features;
  else if (fc?.type === 'Feature') features = [fc];
  else if (TIPOS_GEOM.has(fc?.type)) features = [{ type: 'Feature', properties: {}, geometry: fc }];
  else throw httpError(422, 'GeoJSON no reconocido');
  features = (features || [])
    .filter((f) => f?.geometry && TIPOS_GEOM.has(f.geometry.type))
    .map((f, i) => ({ type: 'Feature', id: f.id ?? i, properties: f.properties || {}, geometry: f.geometry }));
  if (!features.length) throw httpError(422, 'El archivo no contiene geometrías válidas');
  return { type: 'FeatureCollection', features };
}

function* coordenadas(g) {
  if (!g) return;
  if (g.type === 'GeometryCollection') { for (const x of g.geometries) yield* coordenadas(x); return; }
  const rec = function* (c) { if (typeof c[0] === 'number') yield c; else for (const x of c) yield* rec(x); };
  yield* rec(g.coordinates);
}

function calcularBounds(fc) {
  let a = 90, b = 180, c = -90, d = -180;
  for (const f of fc.features) for (const [lng, lat] of coordenadas(f.geometry)) {
    if (lat < a) a = lat; if (lat > c) c = lat; if (lng < b) b = lng; if (lng > d) d = lng;
  }
  if (a > c) throw httpError(422, 'No se pudieron calcular los límites');
  return { bounds: [[a, b], [c, d]], centro: [(a + c) / 2, (b + d) / 2] }; // formato [lat,lng] (Leaflet)
}

/** Parsea KML / KMZ / GeoJSON → { geojson, bounds, centro, variables } */
exports.parsearArchivo = (buffer, nombre) => {
  const ext = path.extname(nombre || '').toLowerCase();
  let fc;
  try {
    if (ext === '.kmz') fc = kmlAGeoJSON(leerKMZ(buffer));
    else if (ext === '.kml') fc = kmlAGeoJSON(buffer.toString('utf8'));
    else if (ext === '.geojson' || ext === '.json') fc = JSON.parse(buffer.toString('utf8'));
    else throw httpError(415, 'Formato no soportado (usar .kml, .kmz, .geojson)');
  } catch (e) {
    if (e.status) throw e;
    throw httpError(422, 'No se pudo leer el archivo: ' + e.message);
  }
  const geojson = normalizar(fc);
  const claves = new Set();
  geojson.features.forEach((f) => Object.keys(f.properties).forEach((k) => claves.add(k)));
  return {
    geojson,
    ...calcularBounds(geojson),
    variables: [...claves].map((clave) => ({ clave, alias: clave, activa: true })),
    totalFeatures: geojson.features.length,
  };
};
exports.calcularBounds = calcularBounds;
exports.normalizar = normalizar;

// ── point-in-polygon (ray casting, soporta huecos y MultiPolygon) ──
const enAnillo = (x, y, r) => {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};
const enPoligono = (x, y, rings) => enAnillo(x, y, rings[0]) && !rings.slice(1).some((h) => enAnillo(x, y, h));
exports.puntoEnGeometria = (lat, lng, geom) => {
  const g = geom?.type === 'Feature' ? geom.geometry : geom;
  if (!g) return false;
  if (g.type === 'Polygon') return enPoligono(lng, lat, g.coordinates);
  if (g.type === 'MultiPolygon') return g.coordinates.some((p) => enPoligono(lng, lat, p));
  return false;
};
