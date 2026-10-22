const { z } = require('zod');

// Catálogo cerrado de datos personales que un formulario puede pedir
const CATALOGO = {
  nombre: z.string().trim().min(1).max(100),
  apellido: z.string().trim().min(1).max(100),
  documento: z.string().trim().min(5).max(20),
  telefono: z.string().trim().regex(/^[0-9+()\-\s]{6,20}$/, 'teléfono inválido'),
  email: z.string().trim().email().max(120),
  direccion: z.string().trim().max(200),
  fecha_nacimiento: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'fecha inválida'),
};
exports.CLAVES = Object.keys(CATALOGO);

/** Esquema zod según lo que configuró el administrador en el formulario: [{clave, requerido}] */
exports.esquema = (campos) => z.object(Object.fromEntries(campos.map((c) => [
  c.clave,
  c.requerido ? CATALOGO[c.clave] : z.preprocess((v) => (v === '' ? undefined : v), CATALOGO[c.clave].optional().nullable()),
])));
