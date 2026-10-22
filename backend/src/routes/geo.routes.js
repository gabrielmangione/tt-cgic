const router = require('express').Router();
const multer = require('multer');
const prisma = require('../db');
const { ah, z, httpError } = require('../utils');
const { soloAdmin } = require('../middleware/auth');
const geo = require('../services/geo.service');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

/**
 * Paso 1 (sin persistir): sube KML/KMZ/GeoJSON → devuelve GeoJSON normalizado, bounds, centro y lista de variables.
 * El frontend deja editar nombre, color, alias y variables activas, y luego guarda con
 * POST /api/capas  o  POST /api/jurisdicciones.
 */
router.post('/parse', soloAdmin, upload.single('archivo'), ah(async (req, res) => {
  if (!req.file) throw httpError(400, 'Falta el campo "archivo"');
  res.json({ nombreArchivo: req.file.originalname, ...geo.parsearArchivo(req.file.buffer, req.file.originalname) });
}));

module.exports = router;
