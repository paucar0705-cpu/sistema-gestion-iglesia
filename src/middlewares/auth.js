// Middlewares de sesión y permisos.
// Responsable: Persona 2 (Backend / seguridad)
// Los permisos SIEMPRE se validan aquí en el servidor, no solo ocultando el menú.

const { SECCIONES, ROLES_FINANCIEROS } = require('../config/permisos');

// Exige sesión iniciada
function requireAuth(req, res, next) {
  if (req.session && req.session.usuario) return next();
  return res.redirect('/login');
}

// Exige que el rol del usuario tenga acceso a la sección
function requireSeccion(seccion) {
  return (req, res, next) => {
    const rol = req.session.usuario && req.session.usuario.rol;
    if (SECCIONES[seccion] && SECCIONES[seccion].roles.includes(rol)) return next();
    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      mensaje: 'Tu rol no tiene permiso para entrar a esta sección.',
    });
  };
}

// Exige rol con acceso a información financiera
function requireFinanciero(req, res, next) {
  const rol = req.session.usuario && req.session.usuario.rol;
  if (ROLES_FINANCIEROS.includes(rol)) return next();
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Solo Administrador y Tesorero pueden ver información financiera.',
  });
}

module.exports = { requireAuth, requireSeccion, requireFinanciero };
