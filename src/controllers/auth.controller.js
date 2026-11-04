// RF-01  Autenticación y recuperación de contraseña.
// La persistencia de credenciales y tokens se delega al modelo de usuarios.

const Usuarios = require('../models/usuarios.model');
const { ErrorDatos } = require('../models/errores');

const MAX_INTENTOS = 5;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;
const BLOQUEO_MS = 15 * 60 * 1000;
const intentosLogin = new Map();
const solicitudesRecuperacion = new Map();

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function correoValido(correo) {
  return correo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

function validarPassword(password, confirmacion) {
  const errores = [];
  if (typeof password !== 'string' || password.length < 8) {
    errores.push('La contraseña debe tener al menos 8 caracteres.');
  } else {
    if (!/[a-záéíóúñ]/.test(password)) errores.push('La contraseña debe incluir una letra minúscula.');
    if (!/[A-ZÁÉÍÓÚÑ]/.test(password)) errores.push('La contraseña debe incluir una letra mayúscula.');
    if (!/\d/.test(password)) errores.push('La contraseña debe incluir un número.');
    if (Buffer.byteLength(password, 'utf8') > 72) {
      errores.push('La contraseña no puede exceder 72 bytes.');
    }
  }
  if (password !== confirmacion) errores.push('Las contraseñas no coinciden.');
  return errores;
}

function claveSolicitud(req, correo) {
  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'sin-ip';
  return `${ip}|${correo}`;
}

function obtenerRegistro(mapa, clave) {
  const ahora = Date.now();
  const registro = mapa.get(clave);
  if (!registro || ahora - registro.inicio >= VENTANA_INTENTOS_MS) {
    const nuevo = { inicio: ahora, intentos: 0, bloqueadoHasta: 0 };
    mapa.set(clave, nuevo);
    return nuevo;
  }
  return registro;
}

function estaBloqueado(mapa, clave) {
  const registro = obtenerRegistro(mapa, clave);
  return registro.bloqueadoHasta > Date.now();
}

function registrarFallo(mapa, clave) {
  const registro = obtenerRegistro(mapa, clave);
  registro.intentos += 1;
  if (registro.intentos >= MAX_INTENTOS) registro.bloqueadoHasta = Date.now() + BLOQUEO_MS;
}

function limpiarIntentos(mapa, clave) {
  mapa.delete(clave);
}

function mostrarLogin(req, res) {
  if (req.session && req.session.usuario) return res.redirect('/panel');
  return res.render('login', {
    error: null,
    correo: '',
    mensaje: req.query && req.query.password === 'actualizada'
      ? 'La contraseña se actualizó correctamente. Inicia sesión de nuevo.'
      : null,
  });
}

function iniciarSesion(req, res, next) {
  const correo = texto(req.body && req.body.correo).toLowerCase();
  const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
  const clave = claveSolicitud(req, correo);

  if (estaBloqueado(intentosLogin, clave)) {
    return res.status(429).render('login', {
      error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentarlo.',
      correo,
      mensaje: null,
    });
  }

  if (!correoValido(correo) || !password || Buffer.byteLength(password, 'utf8') > 72) {
    registrarFallo(intentosLogin, clave);
    return res.status(401).render('login', {
      error: 'Correo o contraseña incorrectos.',
      correo,
      mensaje: null,
    });
  }

  let usuario;
  try {
    usuario = Usuarios.verificarCredenciales(correo, password);
  } catch (err) {
    return next(err);
  }

  if (!usuario) {
    registrarFallo(intentosLogin, clave);
    return res.status(401).render('login', {
      error: 'Correo o contraseña incorrectos.',
      correo,
      mensaje: null,
    });
  }

  limpiarIntentos(intentosLogin, clave);
  return req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.usuario = usuario;
    return req.session.save((errorGuardado) => {
      if (errorGuardado) return next(errorGuardado);
      return res.redirect('/panel');
    });
  });
}

function cerrarSesion(req, res, next) {
  if (!req.session) {
    res.clearCookie('connect.sid', { path: '/' });
    return res.redirect('/login');
  }
  return req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid', { path: '/' });
    return res.redirect('/login');
  });
}

// Contrato de la vista pendiente auth/recuperar:
// { errores: string[], correo: string, mensaje: string|null }
function mostrarRecuperacion(req, res) {
  return res.render('auth/recuperar', { errores: [], correo: '', mensaje: null });
}

function solicitarRecuperacion(req, res, next) {
  const correo = texto(req.body && req.body.correo).toLowerCase();
  const clave = claveSolicitud(req, correo);

  if (!correoValido(correo)) {
    return res.status(422).render('auth/recuperar', {
      errores: ['Ingresa un correo electrónico válido.'],
      correo,
      mensaje: null,
    });
  }

  if (estaBloqueado(solicitudesRecuperacion, clave)) {
    return res.status(429).render('auth/recuperar', {
      errores: ['Demasiadas solicitudes. Intenta nuevamente en 15 minutos.'],
      correo,
      mensaje: null,
    });
  }

  registrarFallo(solicitudesRecuperacion, clave);
  try {
    const usuario = Usuarios.buscarPorCorreo(correo);
    if (usuario && usuario.activo) {
      // El token nunca se guarda ni se muestra en texto plano. La integración
      // de correo deberá enviar inmediatamente el enlace que contiene token.
      Usuarios.crearTokenRecuperacion(usuario.id);
    }
  } catch (err) {
    return next(err);
  }

  return res.render('auth/recuperar', {
    errores: [],
    correo: '',
    mensaje: 'Si el correo corresponde a una cuenta activa, recibirás instrucciones para restablecer la contraseña.',
  });
}

// Contrato de la vista pendiente auth/restablecer:
// { token: string, usuario: object|null, errores: string[] }
function mostrarRestablecimiento(req, res) {
  const token = texto(req.params && req.params.token);
  const usuario = Usuarios.validarToken(token);
  if (!usuario) {
    return res.status(422).render('auth/restablecer', {
      token: '',
      usuario: null,
      errores: ['El enlace no es válido o ya expiró.'],
    });
  }
  return res.render('auth/restablecer', { token, usuario, errores: [] });
}

function restablecerPassword(req, res, next) {
  const token = texto(req.params && req.params.token);
  const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';
  const confirmacion = typeof (req.body && req.body.confirmar_password) === 'string'
    ? req.body.confirmar_password
    : '';
  const usuario = Usuarios.validarToken(token);

  if (!usuario) {
    return res.status(422).render('auth/restablecer', {
      token: '',
      usuario: null,
      errores: ['El enlace no es válido o ya expiró.'],
    });
  }

  const errores = validarPassword(password, confirmacion);
  if (errores.length) {
    return res.status(422).render('auth/restablecer', { token, usuario, errores });
  }

  try {
    Usuarios.restablecerPassword(token, password);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return res.status(422).render('auth/restablecer', {
        token: '',
        usuario: null,
        errores: [err.message],
      });
    }
    return next(err);
  }

  return req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid', { path: '/' });
    return res.redirect('/login?password=actualizada');
  });
}

module.exports = {
  mostrarLogin,
  iniciarSesion,
  cerrarSesion,
  mostrarRecuperacion,
  solicitarRecuperacion,
  mostrarRestablecimiento,
  restablecerPassword,
  validarPassword,
};
