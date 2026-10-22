const router = require('express').Router();
const prisma = require('../db');
const { ah, z } = require('../utils');
const { soloAdmin } = require('../middleware/auth');

const cuerpo = z.object({
  nombre: z.string().min(2), tipo: z.string().min(2), estado: z.string().min(2), jurisdiccionId: z.string().min(1),
});
const incluir = { jurisdiccion: { select: { id: true, nombre: true, centro: true, bounds: true } }, fases: true };

// GET filtra eliminados por defecto. ?eliminados=incluir | solo (sólo ADMIN)
router.get('/', ah(async (req, res) => {
  const modo = req.user.rol === 'ADMIN' ? req.query.eliminados : undefined;
  const where = modo === 'solo' ? { eliminado: true } : modo === 'incluir' ? {} : { eliminado: false };
  res.json(await prisma.evento.findMany({ where, include: incluir, orderBy: { creadoAt: 'desc' } }));
}));

router.get('/:id', ah(async (req, res) => {
  const e = await prisma.evento.findFirstOrThrow({
    where: { id: req.params.id, ...(req.user.rol === 'ADMIN' && req.query.eliminados === 'incluir' ? {} : { eliminado: false }) },
    include: incluir,
  });
  res.json(e);
}));

router.post('/', soloAdmin, ah(async (req, res) => {
  const d = cuerpo.parse(req.body);
  const evento = await prisma.$transaction(async (tx) => {
    const e = await tx.evento.create({ data: d });
    // Capa GENERAL del evento: recibe el aporte de TODAS las preguntas
    await tx.capa.create({ data: { eventoId: e.id, nombre: 'General', tipo: 'GENERAL', color: '#B33A3A' } });
    return e;
  });
  res.status(201).json(evento);
}));

router.put('/:id', soloAdmin, ah(async (req, res) => {
  res.json(await prisma.evento.update({ where: { id: req.params.id }, data: cuerpo.partial().parse(req.body) }));
}));

// Baja lógica
router.delete('/:id', soloAdmin, ah(async (req, res) => {
  const e = await prisma.evento.update({ where: { id: req.params.id }, data: { eliminado: true, eliminadoAt: new Date() } });
  res.json({ id: e.id, eliminado: true });
}));

router.post('/:id/restaurar', soloAdmin, ah(async (req, res) => {
  res.json(await prisma.evento.update({ where: { id: req.params.id }, data: { eliminado: false, eliminadoAt: null } }));
}));

// Fases (asociadas al evento)
router.post('/:id/fases', soloAdmin, ah(async (req, res) => {
  const d = z.object({ nombre: z.string().min(2), orden: z.number().int().default(0), activa: z.boolean().default(false) }).parse(req.body);
  res.status(201).json(await prisma.$transaction(async (tx) => {
    if (d.activa) await tx.fase.updateMany({ where: { eventoId: req.params.id }, data: { activa: false } });
    return tx.fase.create({ data: { ...d, eventoId: req.params.id } });
  }));
}));
router.post('/fases/:faseId/activar', soloAdmin, ah(async (req, res) => {
  const f = await prisma.fase.findUniqueOrThrow({ where: { id: req.params.faseId } });
  await prisma.$transaction([
    prisma.fase.updateMany({ where: { eventoId: f.eventoId }, data: { activa: false } }),
    prisma.fase.update({ where: { id: f.id }, data: { activa: true } }),
  ]);
  res.json({ ok: true });
}));

module.exports = router;
