const router = require('express').Router();
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const { requerirRol } = require('../middleware/auth');

const gestiona = requerirRol('ADMIN', 'ORGANIZACION');
const incluir = {
  zonas: { select: { id: true, nombre: true } },
  organizacion: { select: { id: true, nombre: true } },
  _count: { select: { encuestas: { where: { estado: 'VIGENTE' } } } }, // avance = encuestas vigentes asociadas
};
const orgDe = async (userId) => (await prisma.usuario.findUnique({ where: { id: userId }, select: { organizacionId: true } }))?.organizacionId ?? null;

const cuerpo = z.object({
  faseId: z.string(), organizacionId: z.string().optional(), titulo: z.string().min(3).max(120), descripcion: z.string().max(1000).optional().nullable(),
  zonaIds: z.array(z.string()).min(1, 'Elegí al menos una zona'), metaEncuestas: z.number().int().positive().optional().nullable(),
  venceAt: z.coerce.date().optional().nullable(), estado: z.enum(['PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'CANCELADA']).optional(),
});

// Las zonas de una tarea deben ser zonas donde la organización trabaja
async function validarZonas(orgId, zonaIds) {
  const ok = await prisma.zona.count({ where: { id: { in: zonaIds }, organizaciones: { some: { id: orgId } } } });
  if (ok !== new Set(zonaIds).size) throw httpError(400, 'La organización no trabaja en alguna de las zonas elegidas');
}

// ADMIN ve todas; el resto, sólo las de su organización
router.get('/', ah(async (req, res) => {
  const where = { ...(req.query.faseId && { faseId: String(req.query.faseId) }) };
  if (req.user.rol !== 'ADMIN') {
    const org = await orgDe(req.user.id);
    if (!org) return res.json([]);
    where.organizacionId = org;
  } else if (req.query.organizacionId) where.organizacionId = String(req.query.organizacionId);
  res.json(await prisma.tarea.findMany({ where, include: incluir, orderBy: { createdAt: 'desc' } }));
}));

router.post('/', gestiona, ah(async (req, res) => {
  const d = cuerpo.parse(req.body);
  const orgId = req.user.rol === 'ADMIN' ? d.organizacionId : await orgDe(req.user.id);
  if (!orgId) throw httpError(400, req.user.rol === 'ADMIN' ? 'Elegí la organización' : 'Tu usuario no está asociado a una organización');
  await validarZonas(orgId, d.zonaIds);
  const { zonaIds, organizacionId, estado, ...resto } = d;
  res.status(201).json(await prisma.tarea.create({
    data: { ...resto, organizacionId: orgId, creadaPorId: req.user.id, zonas: { connect: zonaIds.map((id) => ({ id })) } }, include: incluir,
  }));
}));

router.put('/:id', gestiona, ah(async (req, res) => {
  const t = await prisma.tarea.findUniqueOrThrow({ where: { id: req.params.id } });
  if (req.user.rol !== 'ADMIN' && t.organizacionId !== (await orgDe(req.user.id))) throw httpError(403, 'No es una tarea de tu organización');
  const { zonaIds, faseId, organizacionId, ...d } = cuerpo.partial().parse(req.body);
  if (zonaIds) await validarZonas(t.organizacionId, zonaIds);
  res.json(await prisma.tarea.update({ where: { id: t.id }, data: { ...d, ...(zonaIds && { zonas: { set: zonaIds.map((id) => ({ id })) } }) }, include: incluir }));
}));

router.delete('/:id', requerirRol('ADMIN'), ah(async (req, res) => { await prisma.tarea.delete({ where: { id: req.params.id } }); res.status(204).end(); }));

module.exports = router;
