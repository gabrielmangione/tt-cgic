import { create } from 'zustand';
import { api } from '../lib/api';

/**
- Estado multicapa: qué capas se ven, qué pregunta ("necesidad") colorea las zonas y de qué capa toma sus resúmenes.
- resumenes[capaId] = { [zonaKey]: { [preguntaId]: { n, suma, categorias } } }
 */
export const useMapa = create((set, get) => ({
  evento: null, jurisdiccion: null, fase: null, formulario: null,
  capas: [], zonas: [], encuestas: [], resumenes: {},
  visibles: {}, mostrarEncuestas: true, verLimites: true, verOrganizaciones: false, verActividades: false, // <-- Añadido verActividades
  panorama: null,         // { zonas: { [zonaId]: { n, promedio } }, objetivo, total, promedio }
  graves: null, verGraves: false, umbral: 70, // capa «casos más graves»
  preguntaActiva: null,   // { preguntaId, capaId } — null = Panorama general
  seleccion: null,        // diálogo flotante
  actualizadoAt: null, cargando: false, error: null,

  async cargarEvento(eventoId) {
    set({ cargando: true, error: null });
    try {
      const evento = await api.get(`/eventos/${eventoId}`);
      const [jurisdiccion, capas, zonas] = await Promise.all([
        api.get(`/jurisdicciones/${evento.jurisdiccionId}`),
        api.get(`/capas?eventoId=${eventoId}`),
        api.get(`/zonas?jurisdiccionId=${evento.jurisdiccionId}`),
      ]);
      const fase = evento.fases.find((f) => f.activa) ?? evento.fases[0] ?? null;
      set({ evento, jurisdiccion, capas, zonas, visibles: Object.fromEntries(capas.map((c) => [c.id, c.visible])), preguntaActiva: null, seleccion: null });
      await get().cargarFase(fase);
      set({ cargando: false });
    } catch (e) { set({ error: e.message, cargando: false }); }
  },

  // Cambiar de fase: formulario + encuestas + resúmenes de esa fase
  async cargarFase(fase) {
    if (!fase) return set({ fase: null, formulario: null, encuestas: [], resumenes: {}, preguntaActiva: null, panorama: null, graves: null, actualizadoAt: new Date() });
    const [formulario, enc] = await Promise.all([api.get(`/formularios/fase/${fase.id}`).catch(() => null), api.get(`/encuestas/fase/${fase.id}?limit=2000&liviano=1`)]);
    let umbral = 70;
    try { const g = localStorage.getItem(`tt_umbral_${fase.id}`); if (g !== null) umbral = Number(g); } catch { /* sin storage */ }
    set({ fase, formulario, encuestas: enc.items, resumenes: {}, preguntaActiva: null, umbral, actualizadoAt: new Date() });
    const general = get().capas.find((c) => c.tipo === 'GENERAL');
    if (general) await get().cargarResumen(general.id);
    await Promise.all([get().cargarPanorama(), get().cargarGraves()]);
  },

  async seleccionarFase(faseId) {
    const { evento } = get();
    const capas = await api.get(`/capas?eventoId=${evento.id}`);
    set({ capas });
    await get().cargarFase(evento.fases.find((f) => f.id === faseId));
  },

  // Panorama general: promedio del puntaje de la variable objetivo por zona (lo calcula el backend)
  async cargarPanorama() {
    const { fase } = get();
    if (!fase) return;
    set({ panorama: await api.get(`/panorama/${fase.id}`).catch(() => null) });
  },
  // Casos más graves: viviendas con puntaje mayor al umbral
  async cargarGraves() {
    const { fase, verGraves, umbral } = get();
    if (!fase || !verGraves) return set({ graves: null });
    set({ graves: await api.get(`/panorama/${fase.id}/graves?umbral=${umbral}`).catch(() => null) });
  },
  toggleGraves() { set((s) => ({ verGraves: !s.verGraves })); get().cargarGraves(); },
  setUmbral(valor) {
    const v = Math.max(0, Math.min(100, Number(valor) || 0));
    const f = get().fase;
    try { if (f) localStorage.setItem(`tt_umbral_${f.id}`, String(v)); } catch { /* sin storage */ }
    set({ umbral: v });
  },

  async cargarResumen(capaId) {
    const r = await api.get(`/capas/${capaId}/resumen`);
    set((s) => ({ resumenes: { ...s.resumenes, [capaId]: r } }));
  },

  toggleCapa: (id) => set((s) => ({ visibles: { ...s.visibles, [id]: !s.visibles[id] } })),
  toggleEncuestas: () => set((s) => ({ mostrarEncuestas: !s.mostrarEncuestas })),
  toggleLimites: () => set((s) => ({ verLimites: !s.verLimites })),
  toggleOrganizaciones: () => set((s) => ({ verOrganizaciones: !s.verOrganizaciones })),
  toggleActividades: () => set((s) => ({ verActividades: !s.verActividades })), // <-- Función toggle añadida

  async activarPregunta(preguntaId, capaId) {
    set({ preguntaActiva: { preguntaId, capaId } });
    if (!get().resumenes[capaId]) await get().cargarResumen(capaId);
  },
  limpiarPregunta: () => set({ preguntaActiva: null }),
  seleccionar: (seleccion) => set({ seleccion }),

  async refrescarDatos() {
    const { fase, resumenes } = get();
    if (!fase) return;
    const [enc] = await Promise.all([api.get(`/encuestas/fase/${fase.id}?limit=2000&liviano=1`), ...Object.keys(resumenes).map((id) => get().cargarResumen(id))]);
    set({ encuestas: enc.items, actualizadoAt: new Date() });
    await Promise.all([get().cargarPanorama(), get().cargarGraves()]);
  },
}));