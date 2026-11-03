const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');

// Se monta con requerirRol('ADMIN','ORGANIZACION'). Un voluntario es un Usuario OPERADOR vinculado a una organización.
const campos = { id: true, nombre: true, email: true, telefono: true, documento: true, activo: true, creadoAt: true, organizacionId: true, organizacion: { select: { nombre: true } }, _count: { select: { inscripciones: true } } };
const orgDe = async (u) => (await prisma.usuario.findUnique({ where: { id: u.id }, select: { organizacionId: true } }))?.organizacionId ?? null;

// ORGANIZACION sólo opera sobre su propia organización; ADMIN sobre cualquiera
async function ambito(req) {
  if (req.user.rol === 'ADMIN') return req.query.organizacionId ? { organizacionId: String(req.query.organizacionId) } : { organizacionId: { not: null } };
  const org = await orgDe(req.user);
  if (!org) throw httpError(403, 'Tu usuario no está asociado a una organización');
  return { organizacionId: org };
}

router.get('/', ah(async (req, res) => {
  res.json(await prisma.usuario.findMany({ where: { rol: 'OPERADOR', ...(await ambito(req)) }, select: campos, orderBy: { nombre: 'asc' } }));
}));

router.post('/', ah(async (req, res) => {
  const d = z.object({
    nombre: z.string().min(2).max(100), email: z.string().email(), password: z.string().min(10),
    telefono: z.string().max(30).optional().nullable(), documento: z.string().max(20).optional().nullable(), organizacionId: z.string().optional(),
  }).parse(req.body);
  const organizacionId = req.user.rol === 'ADMIN' ? d.organizacionId : await orgDe(req.user);
  if (!organizacionId) throw httpError(400, req.user.rol === 'ADMIN' ? 'Elegí la organización' : 'Tu usuario no está asociado a una organización');
  const v = await prisma.usuario.create({
    data: { nombre: d.nombre, email: d.email.toLowerCase(), telefono: d.telefono || null, documento: d.documento || null, rol: 'OPERADOR', organizacionId, passwordHash: await bcrypt.hash(d.password, 12) },
    select: campos,
  });
  res.status(201).json(v);
}));

router.put('/:id', ah(async (req, res) => {
  const d = z.object({
    nombre: z.string().min(2).max(100).optional(), telefono: z.string().max(30).nullable().optional(), documento: z.string().max(20).nullable().optional(),
    activo: z.boolean().optional(), password: z.string().min(10).optional(),
  }).parse(req.body);
  // sólo voluntarios (OPERADOR) de su ámbito: no se puede tocar a otros roles ni a otras organizaciones
  await prisma.usuario.findFirstOrThrow({ where: { id: req.params.id, rol: 'OPERADOR', ...(await ambito(req)) }, select: { id: true } });
  const { password, ...resto } = d;
  res.json(await prisma.usuario.update({ where: { id: req.params.id }, select: campos, data: { ...resto, ...(password && { passwordHash: await bcrypt.hash(password, 12) }) } }));
}));

module.exports = router;
