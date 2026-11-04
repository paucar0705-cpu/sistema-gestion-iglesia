// RF-04  Gestión de eventos
// Rutas: Persona 2 · Vistas y calendario: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const eventosController = require('../controllers/eventos.controller');
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('eventos'));

router.get('/', eventosController.listar);
router.get('/nuevo', eventosController.mostrarNuevo);
router.get('/:id/editar', eventosController.mostrarEditar);
router.post('/', eventosController.crear);
router.post('/:id/cancelar', eventosController.cancelar);
router.post('/:id', eventosController.actualizar);

module.exports = router;
