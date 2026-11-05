// RF-02  Gestión de miembros
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const miembrosController = require('../controllers/miembros.controller');
const { requireSeccion, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/permisos');

router.use(requireSeccion('miembros'));

const requireGestionMiembros = requireRoles(ROLES.ADMIN, ROLES.SECRETARIO);

// Pendiente: coordinar tokens CSRF con las vistas cuando se integren al proyecto.
router.get('/', miembrosController.listar);
router.get('/nuevo', requireGestionMiembros, miembrosController.mostrarNuevo);
router.get('/:id/editar', requireGestionMiembros, miembrosController.mostrarEditar);
router.post('/', requireGestionMiembros, miembrosController.crear);
router.post('/:id/desactivar', requireGestionMiembros, miembrosController.desactivar);
router.post('/:id', requireGestionMiembros, miembrosController.actualizar);

module.exports = router;
