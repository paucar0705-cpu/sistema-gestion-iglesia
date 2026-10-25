// RF-05  Administración de ministerios
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('ministerios'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'ministerios' }));

// TODO: GET /:id (integrantes y actividades) · POST / · POST /:id
//       POST /:id/integrantes          -> INSERT en ministerio_miembros
//       POST /:id/integrantes/:mid/baja -> UPDATE activo = 0, fecha_salida = hoy
//       Coordinador: solo WHERE coordinador_id = req.session.usuario.id
module.exports = router;
