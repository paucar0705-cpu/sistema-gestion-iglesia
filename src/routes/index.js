// Registro de todas las rutas. Al crear un módulo nuevo, se agrega aquí.
const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');

router.use('/', require('./auth.routes'));
router.get('/', (req, res) => res.redirect('/panel'));

// Todo lo de abajo exige sesión iniciada
router.use(requireAuth);
router.use('/panel',         require('./panel.routes'));
router.use('/usuarios',      require('./usuarios.routes'));
router.use('/miembros',      require('./miembros.routes'));
router.use('/asistencias',   require('./asistencias.routes'));
router.use('/eventos',       require('./eventos.routes'));
router.use('/ministerios',   require('./ministerios.routes'));
router.use('/donaciones',    require('./donaciones.routes'));
router.use('/anuncios',      require('./anuncios.routes'));
router.use('/reportes',      require('./reportes.routes'));
router.use('/configuracion', require('./configuracion.routes'));

module.exports = router;
