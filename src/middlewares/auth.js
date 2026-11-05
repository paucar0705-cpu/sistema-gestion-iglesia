// Middlewares de sesión y permisos. Las autorizaciones se validan en servidor.

const { SECCIONES, ROLES_FINANCIEROS } = require('../config/permisos');
const Usuarios = require('../models/usuarios.model');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.usuario) return res.redirect('/login');

  let usuario;
  try {
    usuario = Usuarios.obtener(req.session.usuario.id);
  } catch (err) {
    return next(err);
  }

  if (!usuario || !usuario.activo) {
    return req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid', { path: '/' });
      return res.redirect('/login');
    });
  }

  // Hace efectivos los cambios de rol o cuenta sin esperar a que expire la sesión.
  req.session.usuario = {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
  };
  res.locals.usuario = req.session.usuario;
  res.locals.menu = Object.entries(SECCIONES)
    .filter(([, seccion]) => seccion.roles.includes(usuario.rol));
  return next();
}

function requireSeccion(seccion) {
  return (req, res, next) => {
    const rol = req.session && req.session.usuario && req.session.usuario.rol;
    if (SECCIONES[seccion] && SECCIONES[seccion].roles.includes(rol)) return next();
    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      mensaje: 'Tu rol no tiene permiso para entrar a esta sección.',
    });
  };
}

function requireRoles(...rolesPermitidos) {
  return (req, res, next) => {
    const rol = req.session && req.session.usuario && req.session.usuario.rol;
    if (rolesPermitidos.includes(rol)) return next();
    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      mensaje: 'Tu rol no tiene permiso para realizar esta operación.',
    });
  };
}

function requireFinanciero(req, res, next) {
  const rol = req.session && req.session.usuario && req.session.usuario.rol;
  if (ROLES_FINANCIEROS.includes(rol)) return next();
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Solo Administrador y Tesorero pueden ver información financiera.',
  });
}

module.exports = { requireAuth, requireSeccion, requireRoles, requireFinanciero };
