const { z } = require('zod');
exports.ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
exports.z = z;
exports.hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
exports.httpError = (status, message) => Object.assign(new Error(message), { status });
exports.errorHandler = (err, req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Datos inválidos', detalle: err.issues });
  if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Valor duplicado', campos: err.meta?.target });
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
};
