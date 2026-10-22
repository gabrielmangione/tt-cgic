require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { autenticar, soloAdmin } = require('./middleware/auth');
const { errorHandler } = require('./utils');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? false }));

// Rutas con GeoJSON grande: límite de body mayor, ANTES del parser global
const grande = express.json({ limit: '30mb' });
app.use('/api/capas', grande);
app.use('/api/jurisdicciones', grande);
app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api', autenticar); // todo lo demás exige JWT
app.use('/api/jurisdicciones', require('./routes/jurisdicciones.routes'));
app.use('/api/usuarios', soloAdmin, require('./routes/usuarios.routes'));
app.use('/api/geo', require('./routes/geo.routes'));
app.use('/api/eventos', require('./routes/eventos.routes'));
app.use('/api/organizaciones', require('./routes/organizaciones.routes'));
app.use('/api/zonas', require('./routes/zonas.routes'));
app.use('/api/capas', require('./routes/capas.routes'));
app.use('/api/formularios', require('./routes/formularios.routes'));
app.use('/api/encuestas', require('./routes/encuestas.routes'));
app.use('/api/tareas', require('./routes/tareas.routes'));
app.use('/api/estadisticos', require('./routes/estadisticos.routes'));
app.use(errorHandler);

if (require.main === module) app.listen(process.env.PORT || 3000, () => console.log('API lista'));
module.exports = app;
