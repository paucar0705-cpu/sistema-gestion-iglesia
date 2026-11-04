// RF-01  Administración de usuarios. Persistencia delegada al modelo de Paola.

const db = require('../db/connection');
const Usuarios = require('../models/usuarios.model');
const { ErrorDatos } = require('../models/errores');
const { ROLES } = require('../config/permisos');
const { validarPassword } = require('./auth.controller');

const LIMITE_NOMBRE = 120;

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function idPositivo(valor) {
  if (Number.isSafeInteger(valor) && valor > 0) return valor;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function esAdministrador(req) {
  return Boolean(
    req.session
    && req.session.usuario
    && req.session.usuario.rol === ROLES.ADMIN,
  );
}

function prohibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Solo el Administrador puede gestionar usuarios.',
  });
}

function noEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Usuario no encontrado',
    mensaje: 'El usuario solicitado no existe.',
  });
}

function normalizarFormulario(body = {}) {
  return {
    nombre: texto(body.nombre),
    correo: texto(body.correo).toLowerCase(),
    rol_id: texto(body.rol_id),
    miembro_id: texto(body.miembro_id),
  };
}

function validarFormulario(body, { nuevo }) {
  const usuario = normalizarFormulario(body);
  const errores = [];

  if (!usuario.nombre) errores.push('El nombre es obligatorio.');
  else if (usuario.nombre.length > LIMITE_NOMBRE) {
    errores.push(`El nombre no puede exceder ${LIMITE_NOMBRE} caracteres.`);
  }

  if (!usuario.correo) errores.push('El correo es obligatorio.');
  else if (usuario.correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario.correo)) {
    errores.push('Ingresa un correo electrónico válido.');
  }

  if (!idPositivo(usuario.rol_id)) errores.push('Selecciona un rol válido.');
  if (usuario.miembro_id && !idPositivo(usuario.miembro_id)) {
    errores.push('Selecciona un miembro válido.');
  }

  if (nuevo) {
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmacion = typeof body.confirmar_password === 'string'
      ? body.confirmar_password
      : '';
    errores.push(...validarPassword(password, confirmacion));
  }

  return { usuario, errores };
}

function opcionesFormulario(usuarioActual = null) {
  const roles = Usuarios.listarRoles();
  const miembros = Usuarios.miembrosSinUsuario();
  const miembroIdActual = usuarioActual
    && (usuarioActual.miembro_id_original || usuarioActual.miembro_id);
  const miembroActual = usuarioActual
    && (usuarioActual.miembro_original || usuarioActual.miembro);

  if (miembroIdActual && !miembros.some((miembro) => miembro.id === miembroIdActual)) {
    miembros.push({
      id: miembroIdActual,
      nombre: miembroActual,
      apellidos: '',
    });
  }

  miembros.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', {
    sensitivity: 'base',
  }));
  return { roles, miembros };
}

function renderFormulario(res, usuario, errores, modo, status = 200) {
  const { roles, miembros } = opcionesFormulario(modo === 'editar' ? usuario : null);
  return res.status(status).render('usuarios/formulario', {
    usuario,
    errores,
    roles,
    miembros,
    puedeEditar: true,
    modo,
  });
}

function listar(req, res) {
  if (!esAdministrador(req)) return prohibido(res);
  const usuarios = Usuarios.listar({ incluirInactivos: true });
  return res.render('usuarios/lista', { usuarios, puedeEditar: true });
}

function mostrarNuevo(req, res) {
  if (!esAdministrador(req)) return prohibido(res);
  return renderFormulario(res, null, [], 'nuevo');
}

function crear(req, res, next) {
  if (!esAdministrador(req)) return prohibido(res);
  const { usuario, errores } = validarFormulario(req.body, { nuevo: true });
  if (errores.length) return renderFormulario(res, usuario, errores, 'nuevo', 422);

  try {
    Usuarios.crear({
      nombre: usuario.nombre,
      correo: usuario.correo,
      password: req.body.password,
      rolId: usuario.rol_id,
      miembroId: usuario.miembro_id,
    });
    return res.redirect('/usuarios');
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderFormulario(res, usuario, [err.message], 'nuevo', 422);
    }
    return next(err);
  }
}

function mostrarEditar(req, res) {
  if (!esAdministrador(req)) return prohibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return noEncontrado(res);

  const usuario = Usuarios.obtener(id);
  if (!usuario) return noEncontrado(res);
  return renderFormulario(res, usuario, [], 'editar');
}

function actualizar(req, res, next) {
  if (!esAdministrador(req)) return prohibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return noEncontrado(res);

  const existente = Usuarios.obtener(id);
  if (!existente) return noEncontrado(res);

  const { usuario, errores } = validarFormulario(req.body, { nuevo: false });
  usuario.id = id;
  usuario.activo = existente.activo;
  usuario.miembro = existente.miembro;
  usuario.miembro_id_original = existente.miembro_id;
  usuario.miembro_original = existente.miembro;
  if (errores.length) return renderFormulario(res, usuario, errores, 'editar', 422);

  try {
    db.transaccion(() => {
      Usuarios.actualizar(id, {
        nombre: usuario.nombre,
        correo: usuario.correo,
        miembroId: usuario.miembro_id,
      });
      Usuarios.cambiarRol(id, usuario.rol_id);
    });
    return res.redirect('/usuarios');
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderFormulario(res, usuario, [err.message], 'editar', 422);
    }
    return next(err);
  }
}

function desactivar(req, res, next) {
  if (!esAdministrador(req)) return prohibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return noEncontrado(res);

  const usuario = Usuarios.obtener(id);
  if (!usuario) return noEncontrado(res);
  if (id === req.session.usuario.id) {
    return res.status(422).render('error', {
      titulo: 'No se puede desactivar la cuenta',
      mensaje: 'No puedes desactivar tu propia cuenta mientras la estás utilizando.',
    });
  }
  if (!usuario.activo) return res.redirect('/usuarios');

  try {
    Usuarios.desactivar(id);
    return res.redirect('/usuarios');
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return res.status(422).render('error', {
        titulo: 'No se puede desactivar la cuenta',
        mensaje: err.message,
      });
    }
    return next(err);
  }
}

module.exports = {
  listar,
  mostrarNuevo,
  crear,
  mostrarEditar,
  actualizar,
  desactivar,
};
