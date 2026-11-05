// RF-10  Configuración de la iglesia (solo Administrador)
// Rutas y controlador: Persona 4 · Vistas: Persona 1 · Consultas: Persona 3
// Contrato con las vistas: docs/INTEGRACION_RF07_RF10.md
const router = require('express').Router();
const configuracionController = require('../controllers/configuracion.controller');
const { requireSeccion, requireRoles } = require('../middlewares/auth');
const { ROLES } = require('../config/permisos');

// La sección ya es solo para Administrador (permisos.js); requireRoles lo vuelve
// a exigir en el POST por si algún día se abre la consulta a otros roles.
router.use(requireSeccion('configuracion'));

// Pendiente: coordinar tokens CSRF con las vistas cuando se integren al proyecto.
// Pendiente: subida del archivo del logotipo (ver el documento de integración).
router.get('/', configuracionController.mostrar);
router.post('/', requireRoles(ROLES.ADMIN), configuracionController.actualizar);

module.exports = router;
