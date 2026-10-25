// RF-06  Donaciones y aportaciones (SOLO Administrador y Tesorero)
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion, requireFinanciero } = require('../middlewares/auth');

router.use(requireSeccion('donaciones'), requireFinanciero);

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'donaciones' }));

// TODO: GET /?desde=&hasta= · GET /nuevo · POST /
//       Monto: el formulario recibe pesos -> guardar Math.round(pesos * 100) en monto_centavos
//       Donante opcional: miembro_id vacío = NULL (anónima)
//       GET /resumen -> SELECT * FROM v_ingresos_mensuales
module.exports = router;
