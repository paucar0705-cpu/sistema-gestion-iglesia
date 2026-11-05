// RF-01  Administración de usuarios y roles (solo Administrador).
const router = require('express').Router();
const usuariosController = require('../controllers/usuarios.controller');
const { requireSeccion, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/permisos');

router.use(requireSeccion('usuarios'));
router.use(requireRoles(ROLES.ADMIN));

router.get('/', usuariosController.listar);
router.get('/nuevo', usuariosController.mostrarNuevo);
router.get('/:id/editar', usuariosController.mostrarEditar);

router.post('/', usuariosController.crear);
router.post('/:id/desactivar', usuariosController.desactivar);
router.post('/:id', usuariosController.actualizar);

module.exports = router;
