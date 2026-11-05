// RF-04  Gestión de eventos
// Consultas, permisos y validación del módulo. Las vistas pertenecen a Persona 1.

const db = require('../db/connection');
const { ROLES } = require('../config/permisos');

const TIPOS_VALIDOS = new Set(['culto', 'reunion', 'actividad', 'administrativo']);
const ROLES_CONSULTA = new Set([
  ROLES.ADMIN,
  ROLES.SECRETARIO,
  ROLES.PASTOR,
  ROLES.COORDINADOR,
]);
const ROLES_EDICION = new Set([ROLES.ADMIN, ROLES.SECRETARIO]);
const LIMITES = {
  titulo: 150,
  lugar: 200,
  descripcion: 2000,
};

function normalizarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function obtenerId(valor) {
  if (Number.isSafeInteger(valor) && valor > 0) return valor;
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fechaISOValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.startsWith('0000-')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function mesValido(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) && !valor.startsWith('0000-');
}

function horaValida(valor) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

function obtenerUsuarioAutenticado(req) {
  const sesion = req.session && req.session.usuario;
  const id = obtenerId(sesion && sesion.id);
  if (!id) return null;

  const usuario = db.prepare(`
    SELECT u.id, r.nombre AS rol
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1
  `).get(id);

  if (!usuario || usuario.rol !== sesion.rol) return null;
  return usuario;
}

function puedeEditar(usuario) {
  return Boolean(usuario && ROLES_EDICION.has(usuario.rol));
}

function responderProhibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Tu rol no tiene permiso para realizar esta operación.',
  });
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Evento no encontrado',
    mensaje: 'El evento solicitado no existe.',
  });
}

function responderMesInvalido(res) {
  return res.status(422).render('error', {
    titulo: 'Mes inválido',
    mensaje: 'El mes debe tener el formato YYYY-MM.',
  });
}

function mesActual() {
  return db.prepare("SELECT strftime('%Y-%m', 'now', 'localtime') AS mes").get().mes;
}

function obtenerOpcionesFormulario() {
  const responsables = db.prepare(`
    SELECT id, nombre, apellidos
    FROM miembros
    WHERE activo = ?
    ORDER BY nombre COLLATE NOCASE, apellidos COLLATE NOCASE, id
  `).all(1);

  const ministerios = db.prepare(`
    SELECT id, nombre
    FROM ministerios
    WHERE activo = ?
    ORDER BY nombre COLLATE NOCASE, id
  `).all(1);

  return { responsables, ministerios };
}

function buscarEventoPorId(id) {
  return db.prepare(`
    SELECT id, titulo, tipo, fecha, hora, lugar, descripcion,
           responsable_id, ministerio_id, estado, creado_por
    FROM eventos
    WHERE id = ?
  `).get(id);
}

function normalizarIdFormulario(valor) {
  if (valor === null || typeof valor === 'undefined') return '';
  if (typeof valor === 'string') return valor.trim();
  if (Number.isSafeInteger(valor)) return valor;
  return '__id_invalido__';
}

function validarIdOpcional(valor, etiqueta, errores) {
  if (valor === '') return null;
  const id = obtenerId(valor);
  if (!id) errores.push(`${etiqueta} no es válido.`);
  return id;
}

function validarDatos(datos = {}) {
  const evento = {
    titulo: normalizarTexto(datos.titulo),
    tipo: normalizarTexto(datos.tipo),
    fecha: normalizarTexto(datos.fecha),
    hora: normalizarTexto(datos.hora),
    lugar: normalizarTexto(datos.lugar),
    descripcion: normalizarTexto(datos.descripcion),
    responsable_id: normalizarIdFormulario(datos.responsable_id),
    ministerio_id: normalizarIdFormulario(datos.ministerio_id),
  };
  const errores = [];

  if (!evento.titulo) {
    errores.push('El título es obligatorio.');
  } else if (evento.titulo.length > LIMITES.titulo) {
    errores.push(`El título no puede exceder ${LIMITES.titulo} caracteres.`);
  }

  if (!evento.tipo) {
    errores.push('El tipo de evento es obligatorio.');
  } else if (!TIPOS_VALIDOS.has(evento.tipo)) {
    errores.push('El tipo de evento no es válido.');
  }

  if (!evento.fecha) {
    errores.push('La fecha es obligatoria.');
  } else if (!fechaISOValida(evento.fecha)) {
    errores.push('La fecha debe ser una fecha válida en formato YYYY-MM-DD.');
  }

  if (evento.hora && !horaValida(evento.hora)) {
    errores.push('La hora debe tener un formato válido HH:MM.');
  }

  if (evento.lugar.length > LIMITES.lugar) {
    errores.push(`El lugar no puede exceder ${LIMITES.lugar} caracteres.`);
  }

  if (evento.descripcion.length > LIMITES.descripcion) {
    errores.push(`La descripción no puede exceder ${LIMITES.descripcion} caracteres.`);
  }

  const responsableId = validarIdOpcional(
    evento.responsable_id,
    'El responsable seleccionado',
    errores,
  );
  const ministerioId = validarIdOpcional(
    evento.ministerio_id,
    'El ministerio seleccionado',
    errores,
  );

  if (responsableId) {
    const responsable = db.prepare(
      'SELECT id FROM miembros WHERE id = ? AND activo = ?',
    ).get(responsableId, 1);
    if (!responsable) errores.push('El responsable seleccionado no existe o está inactivo.');
  }

  if (ministerioId) {
    const ministerio = db.prepare(
      'SELECT id FROM ministerios WHERE id = ? AND activo = ?',
    ).get(ministerioId, 1);
    if (!ministerio) errores.push('El ministerio seleccionado no existe o está inactivo.');
  }

  if (responsableId) evento.responsable_id = responsableId;
  if (ministerioId) evento.ministerio_id = ministerioId;
  if (evento.responsable_id === '') evento.responsable_id = null;
  if (evento.ministerio_id === '') evento.ministerio_id = null;

  return {
    evento,
    errores,
    valoresDb: { responsableId, ministerioId },
  };
}

function renderFormulario(res, usuario, evento, errores, estadoHttp = 200) {
  const { responsables, ministerios } = obtenerOpcionesFormulario();
  return res.status(estadoHttp).render('eventos/formulario', {
    evento,
    errores,
    responsables,
    ministerios,
    puedeEditar: puedeEditar(usuario),
  });
}

function redirigirAlMes(res, fecha) {
  return res.redirect(`/eventos?mes=${fecha.slice(0, 7)}`);
}

function listar(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!usuario || !ROLES_CONSULTA.has(usuario.rol)) return responderProhibido(res);

  const mesSolicitado = normalizarTexto(req.query && req.query.mes);
  const mes = mesSolicitado || mesActual();
  if (!mesValido(mes)) return responderMesInvalido(res);

  const inicio = `${mes}-01`;
  const parametros = [inicio, inicio];
  let filtroCoordinador = '';

  if (usuario.rol === ROLES.COORDINADOR) {
    filtroCoordinador = `
      AND EXISTS (
        SELECT 1
        FROM ministerios m
        WHERE m.id = e.ministerio_id AND m.coordinador_id = ?
      )
    `;
    parametros.push(usuario.id);
  }

  const eventos = db.prepare(`
    SELECT e.id, e.titulo, e.tipo, e.fecha, e.hora, e.lugar, e.estado
    FROM eventos e
    WHERE e.fecha >= ? AND e.fecha < date(?, '+1 month')
    ${filtroCoordinador}
    ORDER BY e.fecha,
             CASE WHEN e.hora IS NULL OR e.hora = '' THEN 1 ELSE 0 END,
             e.hora,
             e.id
  `).all(...parametros);

  return res.render('eventos/calendario', {
    eventos,
    mes,
    puedeEditar: puedeEditar(usuario),
  });
}

function mostrarNuevo(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!puedeEditar(usuario)) return responderProhibido(res);
  return renderFormulario(res, usuario, null, []);
}

function mostrarEditar(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!puedeEditar(usuario)) return responderProhibido(res);

  const id = obtenerId(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const evento = buscarEventoPorId(id);
  if (!evento) return responderNoEncontrado(res);
  return renderFormulario(res, usuario, evento, []);
}

function crear(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!puedeEditar(usuario)) return responderProhibido(res);

  const { evento, errores, valoresDb } = validarDatos(req.body);
  if (errores.length) return renderFormulario(res, usuario, evento, errores, 422);

  db.prepare(`
    INSERT INTO eventos (
      titulo, tipo, fecha, hora, lugar, descripcion,
      responsable_id, ministerio_id, creado_por
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evento.titulo,
    evento.tipo,
    evento.fecha,
    evento.hora || null,
    evento.lugar || null,
    evento.descripcion || null,
    valoresDb.responsableId,
    valoresDb.ministerioId,
    usuario.id,
  );

  return redirigirAlMes(res, evento.fecha);
}

function actualizar(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!puedeEditar(usuario)) return responderProhibido(res);

  const id = obtenerId(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const existente = buscarEventoPorId(id);
  if (!existente) return responderNoEncontrado(res);

  const { evento, errores, valoresDb } = validarDatos(req.body);
  evento.id = id;
  evento.estado = existente.estado;

  if (errores.length) return renderFormulario(res, usuario, evento, errores, 422);

  db.prepare(`
    UPDATE eventos
    SET titulo = ?, tipo = ?, fecha = ?, hora = ?, lugar = ?, descripcion = ?,
        responsable_id = ?, ministerio_id = ?
    WHERE id = ?
  `).run(
    evento.titulo,
    evento.tipo,
    evento.fecha,
    evento.hora || null,
    evento.lugar || null,
    evento.descripcion || null,
    valoresDb.responsableId,
    valoresDb.ministerioId,
    id,
  );

  return redirigirAlMes(res, evento.fecha);
}

function cancelar(req, res) {
  const usuario = obtenerUsuarioAutenticado(req);
  if (!puedeEditar(usuario)) return responderProhibido(res);

  const id = obtenerId(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const resultado = db.prepare(`
    UPDATE eventos
    SET estado = 'cancelado'
    WHERE id = ? AND estado = 'programado'
  `).run(id);

  if (resultado.changes === 1) {
    const eventoCancelado = buscarEventoPorId(id);
    return redirigirAlMes(res, eventoCancelado.fecha);
  }

  const evento = buscarEventoPorId(id);
  if (!evento) return responderNoEncontrado(res);

  if (evento.estado === 'realizado') {
    return res.status(422).render('error', {
      titulo: 'No se puede cancelar el evento',
      mensaje: 'Los eventos realizados no pueden cancelarse.',
    });
  }

  return redirigirAlMes(res, evento.fecha);
}

module.exports = {
  listar,
  mostrarNuevo,
  mostrarEditar,
  crear,
  actualizar,
  cancelar,
};
