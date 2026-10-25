// RF-07  Comunicados y anuncios
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('anuncios'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'anuncios' }));

// TODO: GET /nuevo · POST / · GET /:id/editar · POST /:id · POST /:id/eliminar
module.exports = router;
