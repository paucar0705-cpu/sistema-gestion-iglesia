// RF-01  Inicio y cierre de sesión (versión básica para que el equipo pueda probar).
// Responsable: Persona 2 (Backend / seguridad)
// TODO Persona 2: validaciones, mensajes, recuperación de contraseña
//      (tabla recuperacion_password ya existe en la BD).

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/connection');

router.get('/login', (req, res) => {
  if (req.session.usuario) return res.redirect('/panel');
  res.render('login', { error: null, correo: '' });
});

router.post('/login', (req, res) => {
  const { correo = '', password = '' } = req.body;
  const usuario = db.prepare(`
    SELECT u.id, u.nombre, u.correo, u.password_hash, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE u.correo = ? AND u.activo = 1
  `).get(correo.trim());

  if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
    return res.status(401).render('login', { error: 'Correo o contraseña incorrectos', correo });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).send('Error de sesión');
    req.session.usuario = { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol };
    res.redirect('/panel');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// TODO Persona 2: GET/POST /recuperar  y  GET/POST /restablecer/:token

module.exports = router;
