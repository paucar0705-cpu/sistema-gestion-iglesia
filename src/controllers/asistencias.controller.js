// RF-03  Control de asistencias.
// La selección de convocados, persistencia y resúmenes pertenecen al modelo.

const Asistencias = require('../models/asistencias.model');
const { ROLES } = require('../config/permisos');

const TIPOS = ['culto', 'reunion', 'actividad', 'administrativo'];
const TIPOS_VALIDOS = new Set(TIPOS);
const AGRUPACIONES_VALIDAS = new Set(['semana', 'mes']);
const ROLES_AUTORIZADOS = new Set([
  ROLES.ADMIN,
  ROLES.PASTOR,
  ROLES.SECRETARIO,
]);

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function idPositivo(valor) {
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

function tienePermiso(req) {
  const rol = req.session && req.session.usuario && req.session.usuario.rol;
  return ROLES_AUTORIZADOS.has(rol);
}

function responderProhibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Tu rol no tiene permiso para consultar o registrar asistencias.',
  });
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Evento no encontrado',
    mensaje: 'El evento solicitado no existe.',
  });
}

function responderEventoNoDisponible(res, mensaje) {
  return res.status(422).render('error', {
    titulo: 'Asistencia no disponible',
    mensaje,
  });
}

function validarEvento(evento) {
  if (!evento) return { status: 404 };
  if (evento.estado === 'cancelado') {
    return { status: 422, mensaje: 'No se puede consultar ni registrar asistencia en un evento cancelado.' };
  }
  if (!['programado', 'realizado'].includes(evento.estado)) {
    return { status: 422, mensaje: 'El evento tiene un estado incompatible con el registro de asistencia.' };
  }
  return null;
}

function obtenerFiltros(query = {}, { meses, incluirAgrupacion = false }) {
  const desdeSolicitado = texto(query.desde);
  const hastaSolicitado = texto(query.hasta);
  const tipo = texto(query.tipo);
  const agrupacion = texto(query.agrupacion) || 'semana';
  const filtros = {
    desde: desdeSolicitado || Asistencias.inicioDeMesesAtras(meses),
    hasta: hastaSolicitado || Asistencias.hoy(),
    tipo,
  };
  if (incluirAgrupacion) filtros.agrupacion = agrupacion;

  const errores = [];
  if (!fechaISOValida(filtros.desde)) errores.push('La fecha inicial debe tener el formato YYYY-MM-DD.');
  if (!fechaISOValida(filtros.hasta)) errores.push('La fecha final debe tener el formato YYYY-MM-DD.');
  if (
    fechaISOValida(filtros.desde)
    && fechaISOValida(filtros.hasta)
    && filtros.desde > filtros.hasta
  ) {
    errores.push('La fecha inicial no puede ser posterior a la fecha final.');
  }
  if (tipo && !TIPOS_VALIDOS.has(tipo)) errores.push('El tipo de evento no es válido.');
  if (incluirAgrupacion && !AGRUPACIONES_VALIDAS.has(agrupacion)) {
    errores.push('La agrupación debe ser semanal o mensual.');
  }

  return { filtros, errores };
}

function valoresPresentes(body = {}) {
  const recibidos = body.presentes;
  if (recibidos === undefined || recibidos === null || recibidos === '') {
    return { ids: new Set(), errores: [] };
  }

  const valores = Array.isArray(recibidos) ? recibidos : [recibidos];
  const ids = new Set();
  const errores = [];

  if (valores.length > 10000) {
    return { ids, errores: ['Se recibieron demasiados identificadores de miembros.'] };
  }

  for (const valor of valores) {
    if (valor === '') continue;
    const id = idPositivo(valor);
    if (!id) {
      errores.push('La selección de asistentes contiene un identificador inválido.');
      break;
    }
    ids.add(id);
  }

  return { ids, errores };
}

function miembrosConSeleccion(miembros, idsPresentes) {
  return miembros.map((miembro) => ({
    ...miembro,
    presente: idsPresentes.has(miembro.id) ? 1 : 0,
  }));
}

// Contrato pendiente de la vista asistencias/eventos:
// { eventos, filtros: { desde, hasta, tipo }, tipos, errores, puedeRegistrar }
function listar(req, res) {
  if (!tienePermiso(req)) return responderProhibido(res);
  const { filtros, errores } = obtenerFiltros(req.query, { meses: 2 });
  if (errores.length) {
    return res.status(422).render('asistencias/eventos', {
      eventos: [],
      filtros,
      tipos: TIPOS,
      errores,
      puedeRegistrar: true,
    });
  }

  const eventos = Asistencias.listarEventos(filtros);
  return res.render('asistencias/eventos', {
    eventos,
    filtros,
    tipos: TIPOS,
    errores: [],
    puedeRegistrar: true,
  });
}

// Contrato pendiente de la vista asistencias/registro:
// { evento, miembros, errores, puedeRegistrar, mensaje }
function mostrarEvento(req, res) {
  if (!tienePermiso(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const evento = Asistencias.obtenerEvento(id);
  const problema = validarEvento(evento);
  if (problema && problema.status === 404) return responderNoEncontrado(res);
  if (problema) return responderEventoNoDisponible(res, problema.mensaje);

  const miembros = Asistencias.miembrosDelEvento(evento);
  const puedeRegistrar = evento.fecha <= Asistencias.hoy();
  return res.render('asistencias/registro', {
    evento,
    miembros,
    errores: [],
    puedeRegistrar,
    mensaje: req.query && req.query.guardado === '1'
      ? 'La asistencia se guardó correctamente.'
      : null,
  });
}

function guardar(req, res) {
  if (!tienePermiso(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const evento = Asistencias.obtenerEvento(id);
  const problema = validarEvento(evento);
  if (problema && problema.status === 404) return responderNoEncontrado(res);
  if (problema) return responderEventoNoDisponible(res, problema.mensaje);
  if (evento.fecha > Asistencias.hoy()) {
    return responderEventoNoDisponible(
      res,
      'No se puede registrar asistencia antes de la fecha del evento.',
    );
  }

  const miembros = Asistencias.miembrosDelEvento(evento);
  const { ids, errores } = valoresPresentes(req.body);
  const idsConvocados = new Set(miembros.map((miembro) => miembro.id));
  const idsAjenos = [...ids].filter((miembroId) => !idsConvocados.has(miembroId));

  if (idsAjenos.length) {
    errores.push('Uno o más miembros seleccionados no pertenecen a la convocatoria del evento.');
  }

  const usuarioId = idPositivo(req.session && req.session.usuario && req.session.usuario.id);
  if (!usuarioId) errores.push('La sesión no contiene un usuario válido para registrar la asistencia.');

  if (errores.length) {
    return res.status(422).render('asistencias/registro', {
      evento,
      miembros: miembrosConSeleccion(miembros, ids),
      errores,
      puedeRegistrar: true,
      mensaje: null,
    });
  }

  Asistencias.guardar(evento, ids, usuarioId);
  return res.redirect(`/asistencias/evento/${evento.id}?guardado=1`);
}

// Contrato pendiente de la vista asistencias/historial:
// { eventos, resumen, filtros: { desde, hasta, tipo, agrupacion }, tipos, errores }
function historial(req, res) {
  if (!tienePermiso(req)) return responderProhibido(res);
  const { filtros, errores } = obtenerFiltros(req.query, {
    meses: 6,
    incluirAgrupacion: true,
  });

  if (errores.length) {
    return res.status(422).render('asistencias/historial', {
      eventos: [],
      resumen: [],
      filtros,
      tipos: TIPOS,
      errores,
    });
  }

  const parametros = {
    desde: filtros.desde,
    hasta: filtros.hasta,
    tipo: filtros.tipo,
  };
  const eventos = Asistencias.listarEventos(parametros);
  const resumen = Asistencias.resumen({
    ...parametros,
    agrupacion: filtros.agrupacion,
  });

  return res.render('asistencias/historial', {
    eventos,
    resumen,
    filtros,
    tipos: TIPOS,
    errores: [],
  });
}

module.exports = {
  listar,
  mostrarEvento,
  guardar,
  historial,
};
