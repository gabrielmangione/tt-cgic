import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useMapa } from '../store/mapaStore';
import { tieneProblema } from '../lib/indices';
import { Mas } from './Iconos';

const fmt = (v, f) => (v == null ? '—' : f === 'porcentaje' ? `${v.toFixed(1)} %` : f === 'entero' ? Math.round(v).toLocaleString('es-AR') : v.toLocaleString('es-AR', { maximumFractionDigits: 2 }));

export default function Footer({ admin, onAgregar }) {
  const { evento, fase, encuestas, formulario, preguntaActiva, actualizadoAt } = useMapa();
  const [datos, setDatos] = useState(null);

  // Tiempo real: recalcula al refrescar datos y cada 20 s (otros operadores también cargan)
  useEffect(() => {
    if (!evento) return;
    const calcular = () => api.get(`/estadisticos/calcular?eventoId=${evento.id}${fase ? `&faseId=${fase.id}` : ''}`).then(setDatos).catch(() => {});
    calcular();
    const t = setInterval(calcular, 20000);
    return () => clearInterval(t);
  }, [evento?.id, fase?.id, actualizadoAt]);

  const total = encuestas.length;
  const pregunta = formulario?.secciones.flatMap((s) => s.preguntas).find((p) => p.id === preguntaActiva?.preguntaId);
  const conProblema = encuestas.filter((e) => (pregunta ? tieneProblema(pregunta, e.respuestas?.[pregunta.clave]) : e.prioridad === 'ALTA')).length;
  const afectadas = datos?.resultados.find((r) => /personas afectadas/i.test(r.nombre));
  const otros = datos?.resultados.filter((r) => r !== afectadas) ?? [];

  return (
    <footer className="pie">
      <div className="stat"><span>Total hogares relevados</span><b>{total.toLocaleString('es-AR')}</b></div>
      <div className="stat"><span>{pregunta ? 'Hogares con la problemática' : 'Hogares con prioridad alta'}</span><b>{conProblema}</b><small>{total ? Math.round((100 * conProblema) / total) : 0}% del total</small></div>
      <div className="stat" title={afectadas ? afectadas.error : 'Creá un estadístico llamado «Personas afectadas»'}><span>Personas afectadas</span><b>{afectadas ? fmt(afectadas.valor, afectadas.formato) : '—'}</b></div>
      {otros.map((r) => <div className="stat" key={r.id} title={r.error}><span>{r.nombre}{r.unidad ? ` (${r.unidad})` : ''}</span><b>{fmt(r.valor, r.formato)}</b></div>)}
      <div className="stat"><span>Última actualización</span><b>{actualizadoAt ? actualizadoAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
      {admin && <button className="agregar" onClick={onAgregar}><Mas />Agregar estadístico</button>}
    </footer>
  );
}
