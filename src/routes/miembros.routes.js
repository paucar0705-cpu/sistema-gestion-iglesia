// RF-02  Gestión de miembros
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('miembros'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'miembros' }));

// TODO: búsqueda por nombre (?q=) y filtro (?estado=activos|inactivos)
//       GET /nuevo · POST / · GET /:id/editar · POST /:id
//       POST /:id/desactivar  -> UPDATE activo = 0, fecha_baja = hoy (NUNCA DELETE)
//       Solo Administrador y Secretario pueden registrar/editar; los demás solo consultan.
module.exports = router;
