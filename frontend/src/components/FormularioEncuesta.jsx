import { useMemo, useState } from 'react';
import { zonaPorPunto } from '../lib/indices';
import { DATOS_PERSONALES } from '../lib/personales';

function Campo({ p, valor, onChange }) {
  const id = `q-${p.clave}`;
  switch (p.tipo) {
    case 'NUMERO': return <input id={id} type="number" inputMode="decimal" min={p.min ?? undefined} max={p.max ?? undefined} value={valor ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
    case 'ESCALA': return <input id={id} type="range" min={p.min ?? 0} max={p.max ?? 10} value={valor ?? p.min ?? 0} onChange={(e) => onChange(Number(e.target.value))} />;
    case 'BOOLEANO': return <select id={id} value={valor === undefined || valor === null ? '' : String(valor)} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}><option value="">—</option><option value="true">Sí</option><option value="false">No</option></select>;
    case 'SELECCION_UNICA': return <select id={id} value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)}><option value="">—</option>{p.opciones?.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'SELECCION_MULTIPLE': return <fieldset id={id}>{p.opciones?.map((o) => <label key={o} className="check"><input type="checkbox" checked={valor?.includes(o) ?? false} onChange={(e) => onChange(e.target.checked ? [...(valor ?? []), o] : (valor ?? []).filter((x) => x !== o))} />{o}</label>)}</fieldset>;
    case 'FECHA': return <input id={id} type="date" value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
    default: return <textarea id={id} rows={2} value={valor ?? ''} onChange={(e) => onChange(e.target.value || undefined)} />;
  }
}

const num = (v) => (v === '' || v == null ? null : Number(v));

/**
 * Formulario de una encuesta (alta y edición). Zona: la determinan las coordenadas; si no hay coordenadas
 * válidas (o caen fuera de toda zona) se usa la zona elegida a mano.
 */
export default function FormularioEncuesta({ formulario, zonas, tareas = [], inicial, etiquetaBoton = 'Guardar encuesta', conMotivo = false, onEnviar }) {
  const [resp, setResp] = useState(inicial?.respuestas ?? {});
  const [coord, setCoord] = useState({ latitud: inicial?.latitud ?? '', longitud: inicial?.longitud ?? '' });
  const [zonaId, setZonaId] = useState(inicial?.zonaOrigen === 'MANUAL' ? inicial.zonaKey : '');
  const [tareaId, setTareaId] = useState(inicial?.tareaId ?? '');
  const [datos, setDatos] = useState(inicial?.datosPersonales ?? {});
  const [consent, setConsent] = useState(inicial?.consentimientoDatos ?? false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const lat = num(coord.latitud), lng = num(coord.longitud);
  const coordsValidas = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const detectada = useMemo(() => (coordsValidas ? zonaPorPunto(zonas, lat, lng) : null), [zonas, lat, lng, coordsValidas]);

  const ubicar = () => navigator.geolocation?.getCurrentPosition(
    (p) => setCoord({ latitud: p.coords.latitude.toFixed(6), longitud: p.coords.longitude.toFixed(6) }),
    () => setMsg({ tipo: 'error', texto: 'No se pudo obtener la ubicación. Elegí la zona a mano.' }),
  );

  const campos = formulario.pideDatosPersonales ? formulario.datosPersonalesCampos ?? [] : [];

  async function enviar(e) {
    e.preventDefault(); setMsg(null); setEnviando(true);
    try {
      const r = await onEnviar({
        latitud: coordsValidas ? lat : null, longitud: coordsValidas ? lng : null, zonaId: zonaId || null, tareaId: tareaId || null,
        respuestas: resp, datosPersonales: campos.length ? datos : undefined, consentimientoDatos: consent, ...(conMotivo && { motivo }),
      });
      if (!inicial) { setResp({}); setDatos({}); setConsent(false); }
      setMsg({ tipo: 'ok', texto: r?.zonaOrigen === 'COORDENADAS' ? 'Guardada. Zona asignada por las coordenadas.' : r?.zonaOrigen === 'MANUAL' ? 'Guardada. Zona asignada manualmente.' : 'Guardada sin zona (no hay coordenadas ni zona elegida).' });
    } catch (err) {
      setMsg({ tipo: 'error', texto: err.detalle?.detalle?.map?.((i) => `${i.path.join('.')}: ${i.message}`).join(' · ') || err.message });
    } finally { setEnviando(false); }
  }

  return (
    <form onSubmit={enviar}>
      <fieldset className="ubicacion">
        <legend>Ubicación del hogar</legend>
        <label>Latitud<input value={coord.latitud} onChange={(e) => setCoord({ ...coord, latitud: e.target.value })} inputMode="decimal" /></label>
        <label>Longitud<input value={coord.longitud} onChange={(e) => setCoord({ ...coord, longitud: e.target.value })} inputMode="decimal" /></label>
        <button type="button" onClick={ubicar}>Usar mi ubicación</button>
        <label className="ancho">Zona {coordsValidas ? '(respaldo si las coordenadas no caen en ninguna)' : '(obligatoria si no hay coordenadas)'}
          <select value={zonaId} onChange={(e) => setZonaId(e.target.value)}>
            <option value="">{coordsValidas ? 'Automática por coordenadas' : 'Elegí la zona…'}</option>
            {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
        </label>
        <p className="ancho nota" role="status">
          {coordsValidas ? (detectada ? <>Zona detectada: <strong>{detectada.nombre}</strong></> : 'Las coordenadas no caen en ninguna zona conocida.') : 'Sin coordenadas válidas: se usará la zona elegida.'}
        </p>
      </fieldset>

      {tareas.length > 0 && (
        <label>Tarea de relevamiento (opcional)
          <select value={tareaId} onChange={(e) => setTareaId(e.target.value)}><option value="">Sin tarea</option>{tareas.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}</select>
        </label>
      )}

      {formulario.secciones.map((s) => (
        <fieldset key={s.id}>
          <legend>{s.nombre}</legend>
          {s.preguntas.map((p) => (
            <div className="campo" key={p.id}>
              <label htmlFor={`q-${p.clave}`}>{p.etiqueta}{p.requerida && ' *'}</label>
              <Campo p={p} valor={resp[p.clave]} onChange={(v) => setResp((r) => ({ ...r, [p.clave]: v }))} />
              {p.ayuda && <small>{p.ayuda}</small>}
            </div>
          ))}
        </fieldset>
      ))}

      {campos.length > 0 && (
        <fieldset>
          <legend>Datos personales</legend>
          <p className="nota">Se usarán para: {formulario.datosPersonalesFinalidad}. Se guardan aparte de las respuestas y sólo los ve el administrador y quien carga la encuesta.</p>
          {campos.map((c) => (
            <label key={c.clave}>{DATOS_PERSONALES[c.clave].etiqueta}{c.requerido && ' *'}
              <input type={DATOS_PERSONALES[c.clave].type} value={datos[c.clave] ?? ''} onChange={(e) => setDatos({ ...datos, [c.clave]: e.target.value })} />
            </label>
          ))}
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />La persona fue informada y acepta el tratamiento de estos datos</label>
        </fieldset>
      )}

      {conMotivo && <label>Motivo del cambio<input value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. corrección de dirección" /></label>}
      {msg && <p role={msg.tipo === 'error' ? 'alert' : 'status'} className={msg.tipo}>{msg.texto}</p>}
      <button className="primario" type="submit" disabled={enviando}>{etiquetaBoton}</button>
    </form>
  );
}
