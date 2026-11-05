// RF-07  Comunicados y anuncios
// Rutas y controlador: Persona 4 · Vistas: Persona 1 · Consultas: Persona 3
// Contrato con las vistas: docs/INTEGRACION_RF07_RF10.md
const router = require('express').Router();
const anunciosController = require('../controllers/anuncios.controller');
const { requireSeccion, requireRoles } = require('../middlewares/auth');

router.use(requireSeccion('anuncios'));

const requireGestionAnuncios = requireRoles(...anunciosController.ROLES_EDICION);

// Pendiente: coordinar tokens CSRF con las vistas cuando se integren al proyecto.
router.get('/', anunciosController.listar);
router.get('/nuevo', requireGestionAnuncios, anunciosController.mostrarNuevo);
router.get('/:id/editar', requireGestionAnuncios, anunciosController.mostrarEditar);
router.post('/', requireGestionAnuncios, anunciosController.crear);
router.post('/:id/eliminar', requireGestionAnuncios, anunciosController.eliminar);
router.post('/:id', requireGestionAnuncios, anunciosController.actualizar);

module.exports = router;
