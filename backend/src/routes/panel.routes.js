const router = require('express').Router();
const prisma = require('../db');
const { ah } = require('../utils');

// Se monta con soloAdmin.
const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

// Actividades vigentes (pendientes o en curso, no vencidas, de eventos no eliminados) y zonas donde trabaja cada organización
router.get('/vigencia', ah(async (req, res) => {
  const actividades = await prisma.tarea.findMany({
    where: {
      estado: { in: ['PENDIENTE', 'EN_CURSO'] }, 
      OR: [{ venceAt: null }, { venceAt: { gte: hoy() } }],
      fase: { ...(req.query.eventoId && { eventoId: String(req.query.eventoId) }), evento: { eliminado: false } },
    },
    include: {
      organizacion: { select: { id: true, nombre: true } }, 
      zonas: { select: { id: true, nombre: true } },
      fase: { select: { id: true, nombre: true, evento: { select: { id: true, nombre: true } } } },
      // Conteo correcto de inscripciones y encuestas vigentes a nivel de tarea
      _count: { select: { inscripciones: true, encuestas: { where: { estado: 'VIGENTE' } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const porZona = {};
  for (const t of actividades) for (const zn of t.zonas) {
    const e = (porZona[zn.id] ??= { id: zn.id, nombre: zn.nombre, organizaciones: new Map(), actividades: 0 });
    e.organizaciones.set(t.organizacion.id, t.organizacion.nombre); e.actividades++;
  }

  const organizaciones = await prisma.organizacion.findMany({ 
    include: { zonas: { select: { id: true, nombre: true } } }, 
    orderBy: { nombre: 'asc' } 
  });

  res.json({
    actividades,
    zonas: Object.values(porZona).map((e) => ({ ...e, organizaciones: [...e.organizaciones].map(([id, nombre]) => ({ id, nombre })) })),
    organizaciones: organizaciones.map((o) => ({ id: o.id, nombre: o.nombre, zonasPresencia: o.zonas, actividadesVigentes: actividades.filter((t) => t.organizacionId === o.id).length })),
  });
}));

// Histórico completo: todos los eventos (también los eliminados) con sus fases y conteos de encuestas y tareas
router.get('/historico', ah(async (_req, res) => {
  const [eventos, grupos] = await Promise.all([
    prisma.evento.findMany({
      orderBy: { creadoAt: 'desc' },
      include: { 
        jurisdiccion: { select: { nombre: true } }, 
        fases: { 
          orderBy: [{ orden: 'asc' }, { createdAt: 'asc' }], 
          include: { 
            _count: { 
              select: { 
                tareas: true // Conteo correcto de tareas por fase (las inscripciones se calculan dentro de las tareas, no de las fases)
              } 
            } 
          } 
        } 
      },
    }),
    prisma.encuesta.groupBy({ by: ['faseId', 'estado'], _count: { _all: true } }),
  ]);

  const cuenta = {};
  for (const g of grupos) (cuenta[g.faseId] ??= {})[g.estado] = g._count._all;

  res.json(eventos.map((e) => ({
    ...e, 
    fases: e.fases.map((f) => ({ 
      ...f, 
      encuestasVigentes: cuenta[f.id]?.VIGENTE ?? 0, 
      encuestasNoRelevado: cuenta[f.id]?.NO_RELEVADO ?? 0 
    })),
  })));
}));

module.exports = router;