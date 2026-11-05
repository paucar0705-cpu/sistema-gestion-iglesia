// RF-06 - Donaciones y aportaciones.
// La persistencia y las consultas se delegan a los modelos de Paola.

const Donaciones = require('../models/donaciones.model');
const Usuarios = require('../models/usuarios.model');
const { ErrorDatos } = require('../models/errores');
const { ROLES } = require('../config/permisos');

const ROLES_FINANCIEROS = new Set([ROLES.ADMIN, ROLES.TESORERO]);
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

function usuarioFinanciero(req) {
  const sesion = req.session && req.session.usuario;
  const id = idPositivo(sesion && sesion.id);
  if (!id || !ROLES_FINANCIEROS.has(sesion.rol)) return null;

  const usuario = Usuarios.obtener(id);
  if (!usuario || usuario.activo !== 1 || usuario.rol !== sesion.rol) return null;
  return usuario;
}

function responderProhibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    mensaje: 'Solo Administrador y Tesorero pueden consultar o registrar aportaciones.',
  });
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Aportación no encontrada',
    mensaje: 'La aportación solicitada no existe.',
  });
}

function fechaLocalISO() {
  const ahora = new Date();
  const anio = ahora.getFullYear();
  const mes = String(ahora.getMonth() + 1).padStart(2, '0');
  const dia = String(ahora.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaISOValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.startsWith('0000-')) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function leerConsulta(query, nombre) {
  if (!Object.hasOwn(query, nombre)) return { presente: false, valor: '' };
  if (typeof query[nombre] !== 'string') return { presente: true, valor: '', invalido: true };
  return { presente: true, valor: query[nombre].trim(), invalido: false };
}

function filtrosPorDefecto(tipo) {
  const hasta = fechaLocalISO();
  const desde = tipo === 'resumen' ? `${hasta.slice(0, 4)}-01-01` : `${hasta.slice(0, 7)}-01`;
  return { desde, hasta };
}

function validarFiltros(query = {}, tipo = 'lista') {
  const predeterminados = filtrosPorDefecto(tipo);
  const campos = {
    desde: leerConsulta(query, 'desde'),
    hasta: leerConsulta(query, 'hasta'),
    concepto: leerConsulta(query, 'concepto'),
    metodo: leerConsulta(query, 'metodo'),
    soloAnonimas: leerConsulta(query, 'soloAnonimas'),
  };
  const errores = [];

  for (const [nombre, campo] of Object.entries(campos)) {
    if (campo.invalido) errores.push(`El filtro ${nombre} no es válido.`);
  }

  const filtros = {
    desde: campos.desde.valor || predeterminados.desde,
    hasta: campos.hasta.valor || predeterminados.hasta,
    concepto: campos.concepto.valor,
    metodo: campos.metodo.valor,
    soloAnonimas: false,
  };

  if (!fechaISOValida(filtros.desde) || !fechaISOValida(filtros.hasta)) {
    errores.push('Las fechas deben ser reales y usar el formato YYYY-MM-DD.');
  } else if (filtros.desde > filtros.hasta) {
    errores.push('La fecha inicial no puede ser posterior a la fecha final.');
  }

  if (filtros.concepto && !Object.hasOwn(Donaciones.CONCEPTOS, filtros.concepto)) {
    errores.push('El concepto seleccionado no es válido.');
  }
  if (filtros.metodo && !Object.hasOwn(Donaciones.METODOS, filtros.metodo)) {
    errores.push('El método seleccionado no es válido.');
  }

  const anonimas = campos.soloAnonimas.valor;
  if (['1', 'true', 'on'].includes(anonimas)) filtros.soloAnonimas = true;
  else if (anonimas && anonimas !== '0' && anonimas !== 'false') {
    errores.push('El filtro de aportaciones anónimas no es válido.');
  }

  return { filtros, errores };
}

function catalogos() {
  return {
    conceptos: Donaciones.CONCEPTOS,
    metodos: Donaciones.METODOS,
  };
}

function totalesVacios() {
  return { aportaciones: 0, total_centavos: 0, total: 0, anonimas: 0 };
}

function normalizarFormulario(body = {}) {
  let miembroId = body.miembro_id;
  if (miembroId === null || miembroId === undefined) miembroId = '';
  else if (typeof miembroId === 'string') miembroId = miembroId.trim();
  else if (!Number.isSafeInteger(miembroId)) miembroId = '__id_invalido__';

  let monto = body.monto;
  if (monto === null || monto === undefined) monto = '';
  else if (typeof monto === 'string') monto = monto.trim();
  else if (typeof monto === 'number' && Number.isFinite(monto)) monto = String(monto);
  else monto = '';

  return {
    fecha: texto(body.fecha),
    monto,
    concepto: texto(body.concepto),
    metodo: texto(body.metodo),
    descripcion: texto(body.descripcion),
    miembro_id: miembroId,
  };
}

function validarFormulario(body = {}) {
  const donacion = normalizarFormulario(body);
  const errores = [];

  if (!donacion.fecha) errores.push('La fecha es obligatoria.');
  if (!donacion.monto) errores.push('El monto es obligatorio.');
  if (!donacion.concepto) errores.push('El concepto es obligatorio.');
  else if (!Object.hasOwn(Donaciones.CONCEPTOS, donacion.concepto)) {
    errores.push('Selecciona un concepto válido.');
  }
  if (!donacion.metodo) errores.push('El método de recepción es obligatorio.');
  else if (!Object.hasOwn(Donaciones.METODOS, donacion.metodo)) {
    errores.push('Selecciona un método de recepción válido.');
  }
  if (donacion.descripcion.length > LIMITE_DESCRIPCION) {
    errores.push(`La descripción no puede exceder ${LIMITE_DESCRIPCION} caracteres.`);
  }
  if (donacion.miembro_id !== '' && !idPositivo(donacion.miembro_id)) {
    errores.push('Selecciona un donante válido o deja el campo vacío para una aportación anónima.');
  }

  return { donacion, errores };
}

function renderFormulario(res, donacion, errores, status = 200) {
  return res.status(status).render('donaciones/formulario', {
    donacion,
    donantes: Donaciones.donantesDisponibles(),
    ...catalogos(),
    errores,
  });
}

function listar(req, res, next) {
  if (!usuarioFinanciero(req)) return responderProhibido(res);
  const { filtros, errores } = validarFiltros(req.query, 'lista');
  if (errores.length) {
    return res.status(422).render('donaciones/index', {
      donaciones: [],
      filtros,
      totales: totalesVacios(),
      ...catalogos(),
      errores,
    });
  }

  try {
    return res.render('donaciones/index', {
      donaciones: Donaciones.listarPorPeriodo(filtros),
      filtros,
      totales: Donaciones.totalesPorPeriodo(filtros),
      ...catalogos(),
      errores: [],
    });
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return res.status(422).render('donaciones/index', {
        donaciones: [],
        filtros,
        totales: totalesVacios(),
        ...catalogos(),
        errores: [err.message],
      });
    }
    return next(err);
  }
}

function mostrarNuevo(req, res) {
  if (!usuarioFinanciero(req)) return responderProhibido(res);
  return renderFormulario(res, null, []);
}

function crear(req, res, next) {
  const usuario = usuarioFinanciero(req);
  if (!usuario) return responderProhibido(res);

  const { donacion, errores } = validarFormulario(req.body);
  if (errores.length) return renderFormulario(res, donacion, errores, 422);

  try {
    const id = Donaciones.registrar({
      fecha: donacion.fecha,
      monto: donacion.monto,
      concepto: donacion.concepto,
      metodo: donacion.metodo,
      descripcion: donacion.descripcion,
      miembroId: donacion.miembro_id,
      registradoPor: usuario.id,
    });
    return res.redirect(`/donaciones/${id}`);
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return renderFormulario(res, donacion, [err.message], 422);
    }
    return next(err);
  }
}

function detalle(req, res) {
  if (!usuarioFinanciero(req)) return responderProhibido(res);
  const id = idPositivo(req.params && req.params.id);
  if (!id) return responderNoEncontrado(res);

  const donacion = Donaciones.obtener(id);
  if (!donacion) return responderNoEncontrado(res);
  return res.render('donaciones/detalle', { donacion, ...catalogos() });
}

function resumen(req, res, next) {
  if (!usuarioFinanciero(req)) return responderProhibido(res);
  const { filtros, errores } = validarFiltros(req.query, 'resumen');
  if (errores.length) {
    return res.status(422).render('donaciones/resumen', {
      resumen: [],
      filtros,
      ingresosMes: Donaciones.ingresosDelMes(),
      conceptos: Donaciones.CONCEPTOS,
      errores,
    });
  }

  try {
    return res.render('donaciones/resumen', {
      resumen: Donaciones.resumenMensual(filtros),
      filtros: { desde: filtros.desde, hasta: filtros.hasta },
      ingresosMes: Donaciones.ingresosDelMes(),
      conceptos: Donaciones.CONCEPTOS,
      errores: [],
    });
  } catch (err) {
    if (err instanceof ErrorDatos) {
      return res.status(422).render('donaciones/resumen', {
        resumen: [],
        filtros,
        ingresosMes: Donaciones.ingresosDelMes(),
        conceptos: Donaciones.CONCEPTOS,
        errores: [err.message],
      });
    }
    return next(err);
  }
}

module.exports = {
  listar,
  mostrarNuevo,
  crear,
  detalle,
  resumen,
};
