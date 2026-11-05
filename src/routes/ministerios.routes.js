// RF-05 - Administración de ministerios.
// Rutas: Persona 2 | Vistas: Persona 1 | Consultas: Persona 3.

const router = require('express').Router();
const { requireSeccion, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/permisos');
const controller = require('../controllers/ministerios.controller');

router.use(requireSeccion('ministerios'));

const soloAdministrador = requireRoles(ROLES.ADMIN);

router.get('/', controller.listar);
router.get('/nuevo', soloAdministrador, controller.mostrarNuevo);
router.post('/', soloAdministrador, controller.crear);

router.get('/:id/editar', soloAdministrador, controller.mostrarEditar);
router.post('/:id/desactivar', soloAdministrador, controller.desactivar);
router.post('/:id/reactivar', soloAdministrador, controller.reactivar);
router.post('/:id/integrantes', soloAdministrador, controller.agregarIntegrante);
router.post(
  '/:id/integrantes/:mid/baja',
  soloAdministrador,
  controller.quitarIntegrante,
);
router.post('/:id', soloAdministrador, controller.actualizar);
router.get('/:id', controller.detalle);

module.exports = router;
