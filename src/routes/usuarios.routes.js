// RF-01  Administración de usuarios y roles (solo Administrador)
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('usuarios'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'usuarios' }));

// TODO: GET /nuevo · POST / (hashear con bcrypt) · GET /:id/editar · POST /:id
//       POST /:id/desactivar · asignar rol (tabla roles)
module.exports = router;
