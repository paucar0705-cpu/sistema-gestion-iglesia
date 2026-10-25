// RF-04  Gestión de eventos
// Rutas: Persona 2 · Vistas y calendario: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('eventos'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'eventos' }));

// TODO: GET /calendario?mes=YYYY-MM · GET /nuevo · POST / · GET /:id/editar · POST /:id
//       POST /:id/cancelar -> UPDATE estado = 'cancelado'
//       Coordinador: solo eventos de sus ministerios (ministerios.coordinador_id)
module.exports = router;
