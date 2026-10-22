const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const { firmar, autenticar, soloAdmin } = require('../middleware/auth');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true });
// Hash ficticio para igualar tiempos cuando el usuario no existe (evita enumeración de cuentas)
const DUMMY = bcrypt.hashSync('no-existe', 12);

router.post('/login', limiter, ah(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const u = await prisma.usuario.findUnique({ where: { email: email.toLowerCase() } });
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY);
  if (!u || !u.activo || !ok) throw httpError(401, 'Credenciales inválidas');
  res.json({ token: firmar(u), usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, organizacionId: u.organizacionId } });
}));

router.get('/me', autenticar, ah(async (req, res) => {
  res.json(await prisma.usuario.findUniqueOrThrow({
    where: { id: req.user.id }, select: { id: true, nombre: true, email: true, rol: true, organizacionId: true },
  }));
}));

// Sólo un ADMIN da de alta usuarios
router.post('/usuarios', autenticar, soloAdmin, ah(async (req, res) => {
  const d = z.object({
    email: z.string().email(), nombre: z.string().min(2),
    password: z.string().min(10), rol: z.enum(['ADMIN', 'OPERADOR', 'ORGANIZACION']).default('OPERADOR'),
    organizacionId: z.string().optional().nullable(),
  }).parse(req.body);
  if (d.rol === 'ORGANIZACION' && !d.organizacionId) throw httpError(400, 'El rol Organización requiere elegir la organización');
  const u = await prisma.usuario.create({
    data: { email: d.email.toLowerCase(), nombre: d.nombre, rol: d.rol, organizacionId: d.organizacionId || null, passwordHash: await bcrypt.hash(d.password, 12) },
    select: { id: true, email: true, nombre: true, rol: true, organizacionId: true },
  });
  res.status(201).json(u);
}));

module.exports = router;
