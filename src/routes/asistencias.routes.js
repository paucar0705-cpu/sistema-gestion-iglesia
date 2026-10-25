// RF-03  Control de asistencia
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('asistencias'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'asistencias' }));

// TODO: GET /evento/:id  -> lista de miembros activos con casilla presente/ausente
//       POST /evento/:id -> guardar UNA fila por miembro (presente = 1 o 0)
//                           usar INSERT ... ON CONFLICT(evento_id, miembro_id) DO UPDATE
//       GET /historial   -> SELECT * FROM v_asistencia_por_evento
module.exports = router;
