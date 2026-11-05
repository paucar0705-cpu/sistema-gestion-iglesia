// RF-01  Inicio, cierre y recuperación de sesión.
const router = require('express').Router();
const authController = require('../controllers/auth.controller');

router.get('/login', authController.mostrarLogin);
router.post('/login', authController.iniciarSesion);
router.post('/logout', authController.cerrarSesion);

router.get('/recuperar', authController.mostrarRecuperacion);
router.post('/recuperar', authController.solicitarRecuperacion);
router.get('/restablecer/:token', authController.mostrarRestablecimiento);
router.post('/restablecer/:token', authController.restablecerPassword);

module.exports = router;
