const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');

// Se monta en app.js detrás de `soloAdmin`: ningún OPERADOR llega hasta acá.
const campos = { id: true, email: true, nombre: true, rol: true, activo: true, creadoAt: true };

router.get('/', ah(async (_req, res) => res.json(await prisma.usuario.findMany({ select: campos, orderBy: { nombre: 'asc' } }))));

router.put('/:id', ah(async (req, res) => {
  const d = z.object({
    nombre: z.string().min(2).optional(), rol: z.enum(['ADMIN', 'OPERADOR']).optional(),
    activo: z.boolean().optional(), password: z.string().min(10).optional(),
  }).parse(req.body);
  // Un admin no puede quitarse a sí mismo el acceso (evita quedarse sin administradores)
  if (req.params.id === req.user.id && (d.rol === 'OPERADOR' || d.activo === false)) throw httpError(400, 'No podés quitarte tu propio acceso de administrador');
  const { password, ...resto } = d;
  res.json(await prisma.usuario.update({
    where: { id: req.params.id }, select: campos,
    data: { ...resto, ...(password && { passwordHash: await bcrypt.hash(password, 12) }) },
  }));
}));

module.exports = router;
