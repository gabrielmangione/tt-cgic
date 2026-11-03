const router = require('express').Router();
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const { soloAdmin, requerirRol } = require('../middleware/auth');

const cuerpo = z.object({
  nombre: z.string().min(2), descripcion: z.string().optional().nullable(), contacto: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(), telefono: z.string().max(30).optional().nullable(), direccion: z.string().max(200).optional().nullable(),
  zonaIds: z.array(z.string()).optional(),
});
const conZonas = { zonas: { select: { id: true, nombre: true } } };
const ids = (a) => a.map((id) => ({ id }));

router.get('/', ah(async (_req, res) => res.json(await prisma.organizacion.findMany({ include: conZonas, orderBy: { nombre: 'asc' } }))));
router.get('/mia', ah(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { organizacionId: true } });
  res.json(u?.organizacionId ? await prisma.organizacion.findUnique({ where: { id: u.organizacionId }, include: conZonas }) : null);
}));
// Perfil institucional: la organización edita sus datos; las ZONAS las asigna el administrador
router.put('/mia', requerirRol('ORGANIZACION'), ah(async (req, res) => {
  const u = await prisma.usuario.findUnique({ where: { id: req.user.id }, select: { organizacionId: true } });
  if (!u?.organizacionId) throw httpError(400, 'Tu usuario no está asociado a una organización');
  const { zonaIds, ...d } = cuerpo.partial().parse(req.body);
  res.json(await prisma.organizacion.update({ where: { id: u.organizacionId }, data: d, include: conZonas }));
}));
router.get('/:id', ah(async (req, res) => res.json(await prisma.organizacion.findUniqueOrThrow({ where: { id: req.params.id }, include: conZonas }))));

router.post('/', soloAdmin, ah(async (req, res) => {
  const { zonaIds = [], ...d } = cuerpo.parse(req.body);
  res.status(201).json(await prisma.organizacion.create({ data: { ...d, zonas: { connect: ids(zonaIds) } }, include: conZonas }));
}));

// `set` reemplaza TODA la presencia por la lista recibida; omitir zonaIds deja las zonas como están
router.put('/:id', soloAdmin, ah(async (req, res) => {
  const { zonaIds, ...d } = cuerpo.partial().parse(req.body);
  res.json(await prisma.organizacion.update({
    where: { id: req.params.id }, include: conZonas,
    data: { ...d, ...(zonaIds && { zonas: { set: ids(zonaIds) } }) },
  }));
}));

router.delete('/:id', soloAdmin, ah(async (req, res) => { await prisma.organizacion.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

module.exports = router;
