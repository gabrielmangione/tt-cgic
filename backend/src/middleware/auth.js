const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET (>=32 chars) es obligatorio');

exports.firmar = (u) =>
  jwt.sign({ rol: u.rol }, JWT_SECRET, { subject: u.id, expiresIn: process.env.JWT_TTL || '8h', algorithm: 'HS256' });

exports.autenticar = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    const p = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    req.user = { id: p.sub, rol: p.rol };
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o vencido' });
  }
};

exports.requerirRol = (...roles) => (req, res, next) =>
  roles.includes(req.user?.rol) ? next() : res.status(403).json({ error: 'Permisos insuficientes' });

exports.soloAdmin = exports.requerirRol('ADMIN');
