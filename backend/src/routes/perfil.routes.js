const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');

// Perfil propio de cualquier usuario autenticado. El correo es la identidad de acceso y no se cambia desde acá.
const campos = { id: true, nombre: true, email: true, rol: true, telefono: true, documento: true, direccion: true, organizacionId: true, organizacion: { select: { id: true, nombre: true } } };

router.get('/', ah(async (req, res) => res.json(await prisma.usuario.findUniqueOrThrow({ where: { id: req.user.id }, select: campos }))));

router.put('/', ah(async (req, res) => {
  const d = z.object({
    nombre: z.string().min(2).max(100).optional(),
    telefono: z.string().max(30).nullable().optional(), documento: z.string().max(20).nullable().optional(), direccion: z.string().max(200).nullable().optional(),
  }).parse(req.body);
  res.json(await prisma.usuario.update({ where: { id: req.user.id }, data: d, select: campos }));
}));

router.post('/password', ah(async (req, res) => {
  const { actual, nueva } = z.object({ actual: z.string().min(1), nueva: z.string().min(10) }).parse(req.body);
  const u = await prisma.usuario.findUniqueOrThrow({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(actual, u.passwordHash))) throw httpError(400, 'La contraseña actual no es correcta');
  await prisma.usuario.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(nueva, 12) } });
  res.json({ ok: true });
}));

module.exports = router;
