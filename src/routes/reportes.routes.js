// RF-09  Reportes y exportación
// Rutas, exportación (ExcelJS) e integración: Persona 4 · Vistas: Persona 1 · Vistas SQL: Persona 3
const router = require('express').Router();
const { requireSeccion, requireFinanciero } = require('../middlewares/auth');

router.use(requireSeccion('reportes'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'reportes' }));

// TODO (usar las vistas de schema.sql):
//   GET /miembros       -> miembros + v_movimiento_miembros
//   GET /asistencia     -> v_asistencia_por_evento  (filtros: desde, hasta, tipo)
//   GET /ministerios    -> v_participacion_ministerio
//   GET /ingresos       -> v_ingresos_mensuales      (agregar requireFinanciero)
//   GET /:tipo/excel    -> exportar con ExcelJS
router.get('/ingresos', requireFinanciero, (req, res) =>
  res.render('en-construccion', { seccion: 'reportes' }));

module.exports = router;
