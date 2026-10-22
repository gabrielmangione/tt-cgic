const router = require('express').Router();
const prisma = require('../db');
const { ah, z } = require('../utils');
const { soloAdmin } = require('../middleware/auth');

const cuerpo = z.object({
  nombre: z.string().min(2), geometria: z.any().optional().nullable(),
  jurisdiccionId: z.string().optional().nullable(), organizacionIds: z.array(z.string()).optional(),
});
const conOrgs = { organizaciones: { select: { id: true, nombre: true } } };
const ids = (a) => a.map((id) => ({ id }));

router.get('/', ah(async (req, res) => {
  const where = req.query.jurisdiccionId ? { jurisdiccionId: String(req.query.jurisdiccionId) } : {};
  res.json(await prisma.zona.findMany({ where, include: conOrgs, orderBy: { nombre: 'asc' } }));
}));
router.get('/:id', ah(async (req, res) => res.json(await prisma.zona.findUniqueOrThrow({ where: { id: req.params.id }, include: conOrgs }))));

router.post('/', soloAdmin, ah(async (req, res) => {
  const { organizacionIds = [], geometria, ...d } = cuerpo.parse(req.body);
  res.status(201).json(await prisma.zona.create({
    data: { ...d, ...(geometria && { geometria }), organizaciones: { connect: ids(organizacionIds) } }, include: conOrgs,
  }));
}));

router.put('/:id', soloAdmin, ah(async (req, res) => {
  const { organizacionIds, geometria, ...d } = cuerpo.partial().parse(req.body);
  res.json(await prisma.zona.update({
    where: { id: req.params.id }, include: conOrgs,
    data: { ...d, ...(geometria !== undefined && { geometria: geometria ?? undefined }), ...(organizacionIds && { organizaciones: { set: ids(organizacionIds) } }) },
  }));
}));

router.delete('/:id', soloAdmin, ah(async (req, res) => { await prisma.zona.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

module.exports = router;
