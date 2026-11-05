// RF-06 - Donaciones y aportaciones (solo Administrador y Tesorero).
// Rutas: Persona 2 | Vistas: Persona 1 | Consultas: Persona 3.

const router = require('express').Router();
const { requireSeccion, requireFinanciero } = require('../middlewares/auth');
const controller = require('../controllers/donaciones.controller');

router.use(requireSeccion('donaciones'), requireFinanciero);

router.get('/', controller.listar);
router.get('/nuevo', controller.mostrarNuevo);
router.post('/', controller.crear);
router.get('/resumen', controller.resumen);
router.get('/:id', controller.detalle);

module.exports = router;
