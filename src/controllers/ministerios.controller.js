// RF-05  Administración de ministerios.
// Toda persistencia y consulta se delega al modelo de Paola.

const Ministerios = require('../models/ministerios.model');
const { ErrorDatos } = require('../models/errores');
const { ROLES } = require('../config/permisos');

const ESTADOS = new Set(['activos', 'inactivos', 'todos']);
const LIMITE_NOMBRE = 120;
const LIMITE_DESCRIPCION = 2000;

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function idPositivo(valor) {
  if (Number.isSafeInteger(valor) && valor > 0) return valor;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function rolActual(req) {
  return req.session && req.session.usuario && req.session.usuario.rol;
}

function usuarioId(req) {
  return idPositivo(req.session && req.session.usuario && req.session.usuario.id);
}

function esAdministrador(req) {
  return rolActual(req) === ROLES.ADMIN;
}

function esCoordinadorActivo(req) {
  const id = usuarioId(req);
  return Boolean(
    id
    && Ministerios.coordinadoresDisponibles().some(
      (usuario) => usuario.id === id && usuario.rol === ROLES.COORDINADOR,
    ),
  );
}

function responderProhibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Tu rol no tiene permiso para realizar esta operación en Ministerios.',
  });
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Ministerio no encontrado',
    mensaje: 'El ministerio solicitado no existe.',
  });
}

function responderInactivo(res) {
  return res.status(422).render('error', {
    titulo: 'Ministerio inactivo',
    mensaje: 'Reactiva el ministerio antes de modificar sus datos o integrantes.',
  });
}

function puedeConsultar(req, ministerio) {
  const rol = rolActual(req);
  if (rol === ROLES.ADMIN) return true;
  if (rol === ROLES.PASTOR) return ministerio.activo === 1;
  if (rol === ROLES.COORDINADOR) {
    const idUsuario = usuarioId(req);
    return Boolean(
      ministerio.activo === 1
      && esCoordinadorActivo(req)
      && Ministerios.esCoordinador(idUsuario, ministerio.id),
    );
  }
  return false;
}

function normalizarFormulario(body = {}) {
  return {
    nombre: texto(body.nombre),
    descripcion: texto(body.descripcion),
    coordinador_id: texto(body.coordinador_id),
  };
}

function nombreComparable(nombre) {
  return nombre.normalize('NFKC').toLocaleLowerCase('es');
}

function validarFormulario(body, idActual = null) {
  const ministerio = normalizarFormulario(body);
  const errores = [];

  if (!ministerio.nombre) errores.push('El nombre del ministerio es obligatorio.');
  else if (ministerio.nombre.length > LIMITE_NOMBRE) {
    errores.push(`El nombre no puede exceder ${LIMITE_NOMBRE} caracteres.`);
  }

  if (ministerio.descripcion.length > LIMITE_DESCRIPCION) {
    errores.push(`La descripción no puede exceder ${LIMITE_DESCRIPCION} caracteres.`);
  }

  if (ministerio.coordinador_id && !idPositivo(ministerio.coordinador_id)) {
    errores.push('Selecciona un coordinador válido.');
  }

  if (ministerio.nombre) {
    const comparable = nombreComparable(ministerio.nombre);
    const duplicado = Ministerios.listar({ incluirInactivos: true }).some(
      (item) => item.id !== idActual && nombreComparable(item.nombre) === comparable,
    );
    if (duplicado) errores.push('Ya existe un ministerio con ese nombre.');
  }

  return { ministerio, errores };
}

function renderFormulario(res, ministerio, errores, modo, status = 200) {
  return res.status(status).render('ministerios/formulario', {
    ministerio,
    coordinadores: Ministerios.coordinadoresDisponibles(),
    errores,
    puedeEditar: true,
    modo,
  });
}

function datosDetalle(req, ministerio, incluirHistorial, errores = []) {
  const puedeEditar = esAdministrador(req) && ministerio.activo === 1;
  return {
    ministerio,
    integrantes: Ministerios.listarIntegrantes(ministerio.id, { incluirHistorial }),
    actividades: Ministerios.listarActividades(ministerio.id),
    miembrosDisponibles: puedeEditar ? Ministerios.miembrosDisponibles(ministerio.id) : [],
    errores,
    puedeEditar,
    puedeReactivar: esAdministrador(req) && ministerio.activo === 0,
    incluirHistorial,
  };
}

function renderDetalle(req, res, ministerio, errores = [], status = 200, historial = false) {
  return res.status(status).render(
    'ministerios/detalle',
    datosDetalle(req, ministerio, historial, errores),
  );
}

// ministerios/lista recibe: ministerios, estado, errores, puedeEditar.
function listar(req, res) {
  const rol = rolActual(req);
  if (![ROLES.ADMIN, ROLES.PASTOR, ROLES.COORDINADOR].includes(rol)) {
    return responderProhibido(res);
  }

  const estadoSolicitado = texto(req.query && req.query.estado) || 'activos';
  if (!ESTADOS.has(estadoSolicitado)) {
    return res.status(422).render('ministerios/lista', {
      ministerios: [],
      estado: estadoSolicitado,
      errores: ['El filtro de estado no es válido.'],
      puedeEditar: esAdministrador(req),
    });
  }

  if (rol !== ROLES.ADMIN && estadoSolicitado !== 'activos') {
    return responderProhibido(res);
  }

  let ministerios;
  if (rol === ROLES.COORDINADOR) {
    if (!esCoordinadorActivo(req)) return responderProhibido(res);
    const asignados = new Set(
      Ministerios.ministeriosDeCoordinador(usuarioId(req)).map((item) => item.id),
    );
    ministerios = Ministerios.listar().filter((item) => asignados.has(item.id));
  } else if (estadoSolicitado === 'activos') {
    ministerios = Ministerios.listar();
  } else {
    ministerios = Ministerios.listar({ incluirInactivos: true });
    if (estadoSolicitado === 'inactivos') {
      ministerios = ministerios.filter((item) => item.activo === 0);
    }
  }

  return res.render('ministerios/lista', {
    ministerios,
    estado: estadoSolicitado,
    errores: [],
    puedeEditar: esAdministrador(req),
  });
}

function mostrarNuevo(req, res) {
  if (!esAdministrador(req)) return responderProhibido(res);
  return renderFormulario(res, null, [], 'nuevo');
}

function crear(req, res, next) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const { ministerio, errores } = validarFormulario(req.body);
  if (errores.length) return renderFormulario(res, ministerio, errores, 'nuevo', 422);

  try {
    const id = Ministerios.crear({
      nombre: ministerio.nombre,
      descripcion: ministerio.descripcion,
      coordinadorId: ministerio.coordinador_id,
    });
    return res.redirect(`/ministerios/${id}`);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderFormulario(res, ministerio, [err.message], 'nuevo', 422);
    }
    return next(err);
  }
}

function detalle(req, res) {
  const rol = rolActual(req);
  if (![ROLES.ADMIN, ROLES.PASTOR, ROLES.COORDINADOR].includes(rol)) {
    return responderProhibido(res);
  }

  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (!puedeConsultar(req, ministerio)) return responderProhibido(res);

  const historialSolicitado = texto(req.query && req.query.historial);
  if (historialSolicitado && !['0', '1'].includes(historialSolicitado)) {
    return renderDetalle(
      req,
      res,
      ministerio,
      ['El filtro de historial no es válido.'],
      422,
      false,
    );
  }
  return renderDetalle(req, res, ministerio, [], 200, historialSolicitado === '1');
}

function mostrarEditar(req, res) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (ministerio.activo !== 1) return responderInactivo(res);
  return renderFormulario(res, ministerio, [], 'editar');
}

function actualizar(req, res, next) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const existente = Ministerios.obtener(id);
  if (!existente) return responderNoEncontrado(res);
  if (existente.activo !== 1) return responderInactivo(res);

  const { ministerio, errores } = validarFormulario(req.body, id);
  ministerio.id = id;
  ministerio.activo = existente.activo;
  if (errores.length) return renderFormulario(res, ministerio, errores, 'editar', 422);

  try {
    const actualizado = Ministerios.actualizar(id, {
      nombre: ministerio.nombre,
      descripcion: ministerio.descripcion,
      coordinadorId: ministerio.coordinador_id,
    });
    if (!actualizado) return responderNoEncontrado(res);
    return res.redirect(`/ministerios/${id}`);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderFormulario(res, ministerio, [err.message], 'editar', 422);
    }
    return next(err);
  }
}

function desactivar(req, res) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (ministerio.activo !== 1) {
    return res.status(422).render('error', {
      titulo: 'Ministerio ya inactivo',
      mensaje: 'El ministerio ya se encuentra desactivado.',
    });
  }
  Ministerios.desactivar(id);
  return res.redirect('/ministerios?estado=inactivos');
}

function reactivar(req, res) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (ministerio.activo !== 0) {
    return res.status(422).render('error', {
      titulo: 'Ministerio activo',
      mensaje: 'El ministerio ya se encuentra activo.',
    });
  }
  Ministerios.reactivar(id);
  return res.redirect(`/ministerios/${id}`);
}

function agregarIntegrante(req, res, next) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (ministerio.activo !== 1) return responderInactivo(res);

  const miembroId = idPositivo(req.body && req.body.miembro_id);
  if (!miembroId) {
    return renderDetalle(
      req,
      res,
      ministerio,
      ['Selecciona un miembro válido.'],
      422,
    );
  }

  try {
    Ministerios.agregarIntegrante(id, miembroId);
    return res.redirect(`/ministerios/${id}`);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderDetalle(req, res, ministerio, [err.message], 422);
    }
    return next(err);
  }
}

function quitarIntegrante(req, res, next) {
  if (!esAdministrador(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);
  const ministerio = Ministerios.obtener(id);
  if (!ministerio) return responderNoEncontrado(res);
  if (ministerio.activo !== 1) return responderInactivo(res);

  const miembroId = idPositivo(req.params && req.params.mid);
  if (!miembroId) {
    return renderDetalle(
      req,
      res,
      ministerio,
      ['El integrante seleccionado no es válido.'],
      422,
    );
  }

  try {
    const quitado = Ministerios.quitarIntegrante(id, miembroId);
    if (!quitado) {
      return renderDetalle(
        req,
        res,
        ministerio,
        ['El miembro no es un integrante activo de este ministerio.'],
        422,
      );
    }
    return res.redirect(`/ministerios/${id}?historial=1`);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderDetalle(req, res, ministerio, [err.message], 422);
    }
    return next(err);
  }
}

module.exports = {
  listar,
  mostrarNuevo,
  crear,
  detalle,
  mostrarEditar,
  actualizar,
  desactivar,
  reactivar,
  agregarIntegrante,
  quitarIntegrante,
};
