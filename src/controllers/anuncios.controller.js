// RF-07  Comunicados y anuncios
// Controlador: Persona 4 · Vistas: Persona 1 · Consultas: Persona 3 (anuncios.model.js)
//
// Las consultas y las reglas de datos (título y contenido obligatorios, fecha
// YYYY-MM-DD, autor válido) viven en el modelo, que lanza ErrorDatos. Aquí solo
// se validan identificadores y longitudes, y se decide qué responder.
// Contrato con las vistas: docs/INTEGRACION_RF07_RF10.md

const Anuncios = require('../models/anuncios.model');
const { ErrorDatos } = require('../models/errores');
const { ROLES } = require('../config/permisos');

// Roles que pueden publicar, editar y eliminar. Hoy coinciden con los que entran
// a la sección (permisos.js); si el equipo decide que alguno solo consulte,
// basta con quitarlo de aquí.
const ROLES_EDICION = [ROLES.ADMIN, ROLES.PASTOR, ROLES.SECRETARIO];

const LIMITES = { titulo: 150, contenido: 5000 };
const LIMITE_IMPORTANTES = 5;

// ?aviso=... después de una redirección. Solo se aceptan claves conocidas.
const AVISOS = {
  creado: 'El anuncio se publicó correctamente.',
  programado: 'El anuncio quedó programado y se mostrará en su fecha de publicación.',
  actualizado: 'El anuncio se actualizó correctamente.',
  eliminado: 'El anuncio se eliminó.',
};

// Object.hasOwn evita que ?aviso=constructor devuelva algo heredado de Object.prototype.
function aviso(clave) {
  return typeof clave === 'string' && Object.hasOwn(AVISOS, clave) ? AVISOS[clave] : null;
}

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function obtenerId(valor) {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function puedeEditar(req) {
  const rol = req.session && req.session.usuario && req.session.usuario.rol;
  return ROLES_EDICION.includes(rol);
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Anuncio no encontrado',
    mensaje: 'El anuncio solicitado no existe o ya fue eliminado.',
  });
}

// Datos del formulario con los mismos nombres de columna que devuelve el modelo,
// para que la vista use un solo formato al crear, editar o volver a mostrar errores.
function leerFormulario(body = {}) {
  return {
    titulo: texto(body.titulo),
    contenido: texto(body.contenido),
    fecha_publicacion: texto(body.fecha_publicacion),
    importante: ['on', '1', 'true'].includes(texto(body.importante).toLowerCase()) ? 1 : 0,
  };
}

function validarLongitudes(anuncio) {
  const errores = [];
  if (anuncio.titulo.length > LIMITES.titulo) {
    errores.push(`El título no puede exceder ${LIMITES.titulo} caracteres.`);
  }
  if (anuncio.contenido.length > LIMITES.contenido) {
    errores.push(`El contenido no puede exceder ${LIMITES.contenido} caracteres.`);
  }
  return errores;
}

function aModelo(anuncio) {
  return {
    titulo: anuncio.titulo,
    contenido: anuncio.contenido,
    fechaPublicacion: anuncio.fecha_publicacion,
    importante: anuncio.importante,
  };
}

function renderFormulario(req, res, { anuncio, errores, modo, status = 200 }) {
  return res.status(status).render('anuncios/formulario', {
    anuncio,
    errores,
    modo,
    puedeEditar: puedeEditar(req),
  });
}

function listar(req, res) {
  return res.render('anuncios/index', {
    anuncios: Anuncios.listar(),
    importantes: Anuncios.importantes(LIMITE_IMPORTANTES),
    puedeEditar: puedeEditar(req),
    mensaje: aviso(req.query.aviso),
  });
}

function mostrarNuevo(req, res) {
  return renderFormulario(req, res, { anuncio: null, errores: [], modo: 'nuevo' });
}

function mostrarEditar(req, res) {
  const id = obtenerId(req.params.id);
  const anuncio = id && Anuncios.obtener(id);
  if (!anuncio) return responderNoEncontrado(res);
  return renderFormulario(req, res, { anuncio, errores: [], modo: 'editar' });
}

function crear(req, res) {
  const anuncio = leerFormulario(req.body);
  const errores = validarLongitudes(anuncio);
  if (errores.length) {
    return renderFormulario(req, res, { anuncio, errores, modo: 'nuevo', status: 422 });
  }

  let id;
  try {
    id = Anuncios.crear({ ...aModelo(anuncio), autorId: req.session.usuario.id });
  } catch (err) {
    if (!(err instanceof ErrorDatos)) throw err;
    return renderFormulario(req, res, { anuncio, errores: [err.message], modo: 'nuevo', status: 422 });
  }

  const creado = Anuncios.obtener(id);
  return res.redirect(`/anuncios?aviso=${creado && creado.programado ? 'programado' : 'creado'}`);
}

function actualizar(req, res) {
  const id = obtenerId(req.params.id);
  if (!id || !Anuncios.obtener(id)) return responderNoEncontrado(res);

  const anuncio = { id, ...leerFormulario(req.body) };
  const errores = validarLongitudes(anuncio);
  if (errores.length) {
    return renderFormulario(req, res, { anuncio, errores, modo: 'editar', status: 422 });
  }

  let actualizado;
  try {
    actualizado = Anuncios.actualizar(id, aModelo(anuncio));
  } catch (err) {
    if (!(err instanceof ErrorDatos)) throw err;
    return renderFormulario(req, res, { anuncio, errores: [err.message], modo: 'editar', status: 422 });
  }
  // Pudo eliminarse entre la comprobación y el UPDATE.
  if (!actualizado) return responderNoEncontrado(res);

  return res.redirect('/anuncios?aviso=actualizado');
}

function eliminar(req, res) {
  const id = obtenerId(req.params.id);
  if (!id || !Anuncios.eliminar(id)) return responderNoEncontrado(res);
  return res.redirect('/anuncios?aviso=eliminado');
}

module.exports = {
  ROLES_EDICION,
  LIMITES,
  listar,
  mostrarNuevo,
  mostrarEditar,
  crear,
  actualizar,
  eliminar,
};
