// RF-03  Control de asistencias.
const router = require('express').Router();
const asistenciasController = require('../controllers/asistencias.controller');
const { requireSeccion, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/permisos');

router.use(requireSeccion('asistencias'));

const requireGestionAsistencias = requireRoles(
  ROLES.ADMIN,
  ROLES.PASTOR,
  ROLES.SECRETARIO,
);

// Pendiente: coordinar tokens CSRF cuando existan los formularios EJS.
router.get('/', asistenciasController.listar);
router.get('/historial', asistenciasController.historial);
router.get('/evento/:id', asistenciasController.mostrarEvento);
router.post('/evento/:id', requireGestionAsistencias, asistenciasController.guardar);

module.exports = router;
