import { create } from 'zustand';
import { api } from '../lib/api';

/**
 * Estado multicapa: qué capas se ven, qué pregunta ("necesidad") colorea las zonas y de qué capa toma sus resúmenes.
 * resumenes[capaId] = { [zonaKey]: { [preguntaId]: { n, suma, categorias } } }
 */
export const useMapa = create((set, get) => ({
  evento: null, jurisdiccion: null, fase: null, formulario: null,
  capas: [], zonas: [], encuestas: [], resumenes: {},
  visibles: {}, mostrarEncuestas: true, verLimites: true, verOrganizaciones: false,
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
    if (!fase) return set({ fase: null, formulario: null, encuestas: [], resumenes: {}, preguntaActiva: null, actualizadoAt: new Date() });
    const [formulario, enc] = await Promise.all([api.get(`/formularios/fase/${fase.id}`).catch(() => null), api.get(`/encuestas/fase/${fase.id}?limit=2000`)]);
    set({ fase, formulario, encuestas: enc.items, resumenes: {}, preguntaActiva: null, actualizadoAt: new Date() });
    const general = get().capas.find((c) => c.tipo === 'GENERAL');
    if (general) await get().cargarResumen(general.id);
  },

  async seleccionarFase(faseId) {
    const { evento } = get();
    const capas = await api.get(`/capas?eventoId=${evento.id}`);
    set({ capas });
    await get().cargarFase(evento.fases.find((f) => f.id === faseId));
  },

  async cargarResumen(capaId) {
    const r = await api.get(`/capas/${capaId}/resumen`);
    set((s) => ({ resumenes: { ...s.resumenes, [capaId]: r } }));
  },

  toggleCapa: (id) => set((s) => ({ visibles: { ...s.visibles, [id]: !s.visibles[id] } })),
  toggleEncuestas: () => set((s) => ({ mostrarEncuestas: !s.mostrarEncuestas })),
  toggleLimites: () => set((s) => ({ verLimites: !s.verLimites })),
  toggleOrganizaciones: () => set((s) => ({ verOrganizaciones: !s.verOrganizaciones })),

  async activarPregunta(preguntaId, capaId) {
    set({ preguntaActiva: { preguntaId, capaId } });
    if (!get().resumenes[capaId]) await get().cargarResumen(capaId);
  },
  limpiarPregunta: () => set({ preguntaActiva: null }),
  seleccionar: (seleccion) => set({ seleccion }),

  async refrescarDatos() {
    const { fase, resumenes } = get();
    if (!fase) return;
    const [enc] = await Promise.all([api.get(`/encuestas/fase/${fase.id}?limit=2000`), ...Object.keys(resumenes).map((id) => get().cargarResumen(id))]);
    set({ encuestas: enc.items, actualizadoAt: new Date() });
  },
}));
