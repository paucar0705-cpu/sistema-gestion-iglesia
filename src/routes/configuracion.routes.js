// RF-10  Configuración de la iglesia (solo Administrador)
// Rutas: Persona 2 · Vistas: Persona 1 · Consultas: Persona 3
const router = require('express').Router();
const { requireSeccion } = require('../middlewares/auth');

router.use(requireSeccion('configuracion'));

router.get('/', (req, res) => res.render('en-construccion', { seccion: 'configuracion' }));

// TODO: POST / -> UPDATE configuracion_iglesia SET ... WHERE id = 1
//       Logotipo: guardar el archivo en public/img/ y la ruta en logo_ruta
module.exports = router;
