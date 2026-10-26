// RF-06  Donaciones y aportaciones — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// Reglas del módulo:
//  * El monto se RECIBE en pesos (ej. 1500 o '1500.50') y se GUARDA en centavos
//    (150050) para que las sumas no tengan errores de redondeo.
//    Todas las funciones DEVUELVEN el monto en pesos (monto) y en centavos (monto_centavos).
//  * Donante opcional: miembroId vacío o null = aportación anónima.
//  * Concepto y método solo aceptan los valores del catálogo (ver CONCEPTOS y METODOS),
//    así los reportes no tienen "Diezmo", "diezmo" y "Diesmo" como grupos distintos.
//  * Las donaciones no se editan ni se borran (registro financiero).
//  * Acceso SOLO para Administrador y Tesorero: eso lo valida el backend en las rutas.
//
// Si algo no cumple las reglas se lanza ErrorDatos (ver errores.js).

const db = require('../db/connection');
const { ErrorDatos } = require('./errores');

// Valores permitidos (coinciden con los CHECK de schema.sql). Úsenlos para los <select>.
const CONCEPTOS = {
  diezmo: 'Diezmo',
  ofrenda: 'Ofrenda',
  donacion_especial: 'Donación especial',
  otro: 'Otro',
};
const METODOS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

const MONTO_MAXIMO_CENTAVOS = 100000000; // $1,000,000.00 por aportación

function aId(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

// '1,500.50' | '1500.5' | 1500.5 | '$1500'  ->  150050
// Se hace con texto, no multiplicando decimales (1.005 * 100 = 100.49999...).
function pesosACentavos(monto) {
  const texto = String(monto === null || monto === undefined ? '' : monto)
    .trim()
    .replace(/^\$/, '')
    .replace(/,/g, '');
  const partes = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto);
  if (!partes) {
    throw new ErrorDatos('MONTO_INVALIDO', 'El monto debe ser un número con máximo dos decimales (ej. 1500.50).');
  }
  const centavos = Number(partes[1]) * 100 + Number((partes[2] || '0').padEnd(2, '0'));
  if (centavos <= 0) throw new ErrorDatos('MONTO_INVALIDO', 'El monto debe ser mayor a cero.');
  if (centavos > MONTO_MAXIMO_CENTAVOS) {
    throw new ErrorDatos('MONTO_INVALIDO', 'El monto excede el máximo permitido por aportación ($1,000,000.00).');
  }
  return centavos;
}

// ----------------------------------------------------------------------------
// Registro
// ----------------------------------------------------------------------------

// Devuelve el id de la donación creada.
function registrar({ fecha, monto, concepto, metodo, descripcion, miembroId, registradoPor }) {
  if (!fechaValida(fecha)) throw new ErrorDatos('FECHA_INVALIDA', 'La fecha debe tener el formato YYYY-MM-DD.');
  const hoy = db.prepare("SELECT date('now', 'localtime') AS hoy").get().hoy;
  if (fecha > hoy) throw new ErrorDatos('FECHA_FUTURA', 'No se pueden registrar aportaciones con fecha futura.');

  if (!Object.hasOwn(CONCEPTOS, concepto)) throw new ErrorDatos('CONCEPTO_INVALIDO', 'Selecciona un concepto válido.');
  if (!Object.hasOwn(METODOS, metodo)) throw new ErrorDatos('METODO_INVALIDO', 'Selecciona un método de recepción válido.');

  const centavos = pesosACentavos(monto);

  // Donante opcional: vacío = anónima. Si se elige uno, debe ser un miembro activo.
  let donante = null;
  if (miembroId !== null && miembroId !== undefined && miembroId !== '') {
    donante = aId(miembroId);
    const miembro = donante && db.prepare('SELECT id FROM miembros WHERE id = ? AND activo = 1').get(donante);
    if (!miembro) throw new ErrorDatos('DONANTE_NO_VALIDO', 'El donante seleccionado no existe o está inactivo.');
  }

  const usuario = aId(registradoPor);
  if (!usuario) throw new ErrorDatos('USUARIO_REQUERIDO', 'No se identificó al usuario que registra la aportación.');

  const texto = typeof descripcion === 'string' ? descripcion.trim() : '';
  const info = db.prepare(`
    INSERT INTO donaciones (fecha, monto_centavos, concepto, metodo, descripcion, miembro_id, registrado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(fecha, centavos, concepto, metodo, texto || null, donante, usuario);
  return Number(info.lastInsertRowid);
}

// Miembros activos para el <select> de donante (la opción vacía = anónima la pone la vista).
function donantesDisponibles() {
  return db.prepare(`
    SELECT id, nombre, apellidos FROM miembros
    WHERE activo = 1
    ORDER BY nombre COLLATE NOCASE, apellidos COLLATE NOCASE
  `).all();
}

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

const COLUMNAS = `
  d.id, d.fecha, d.concepto, d.metodo, d.descripcion, d.miembro_id, d.creado_en,
  d.monto_centavos,
  d.monto_centavos / 100.0 AS monto,
  CASE WHEN d.miembro_id IS NULL THEN 'Anónimo'
       ELSE TRIM(mi.nombre || ' ' || COALESCE(mi.apellidos, '')) END AS donante,
  u.nombre AS registrado_por
`;
const UNIONES = `
  FROM donaciones d
  LEFT JOIN miembros mi ON mi.id = d.miembro_id
  LEFT JOIN usuarios u  ON u.id = d.registrado_por
`;

function obtener(id) {
  return db.prepare(`SELECT ${COLUMNAS} ${UNIONES} WHERE d.id = ?`).get(aId(id));
}

// Filtros comunes: desde, hasta (obligatorios), concepto, metodo, soloAnonimas
function armarFiltros({ desde, hasta, concepto, metodo, soloAnonimas }) {
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    throw new ErrorDatos('PERIODO_INVALIDO', 'Las fechas del periodo deben tener el formato YYYY-MM-DD.');
  }
  const condiciones = ['d.fecha BETWEEN ? AND ?'];
  const parametros = desde <= hasta ? [desde, hasta] : [hasta, desde];
  if (concepto && Object.hasOwn(CONCEPTOS, concepto)) {
    condiciones.push('d.concepto = ?');
    parametros.push(concepto);
  }
  if (metodo && Object.hasOwn(METODOS, metodo)) {
    condiciones.push('d.metodo = ?');
    parametros.push(metodo);
  }
  if (soloAnonimas) condiciones.push('d.miembro_id IS NULL');
  return { where: `WHERE ${condiciones.join(' AND ')}`, parametros };
}

// Aportaciones de un periodo, de la más reciente a la más antigua.
function listarPorPeriodo(filtros) {
  const { where, parametros } = armarFiltros(filtros);
  return db.prepare(`
    SELECT ${COLUMNAS} ${UNIONES} ${where}
    ORDER BY d.fecha DESC, d.id DESC
  `).all(...parametros);
}

// Totales del mismo periodo y filtros (para mostrar arriba o abajo de la tabla).
function totalesPorPeriodo(filtros) {
  const { where, parametros } = armarFiltros(filtros);
  return db.prepare(`
    SELECT
      COUNT(*)                                            AS aportaciones,
      COALESCE(SUM(d.monto_centavos), 0)                  AS total_centavos,
      COALESCE(SUM(d.monto_centavos), 0) / 100.0          AS total,
      SUM(CASE WHEN d.miembro_id IS NULL THEN 1 ELSE 0 END) AS anonimas
    FROM donaciones d ${where}
  `).get(...parametros);
}

// Resumen mensual: una fila por mes con el total y el desglose por concepto.
function resumenMensual({ desde, hasta }) {
  const { where, parametros } = armarFiltros({ desde, hasta });
  return db.prepare(`
    SELECT
      strftime('%Y-%m', d.fecha)                                              AS mes,
      COUNT(*)                                                                AS aportaciones,
      SUM(d.monto_centavos) / 100.0                                           AS total,
      SUM(CASE WHEN d.concepto = 'diezmo'            THEN d.monto_centavos ELSE 0 END) / 100.0 AS diezmos,
      SUM(CASE WHEN d.concepto = 'ofrenda'           THEN d.monto_centavos ELSE 0 END) / 100.0 AS ofrendas,
      SUM(CASE WHEN d.concepto = 'donacion_especial' THEN d.monto_centavos ELSE 0 END) / 100.0 AS especiales,
      SUM(CASE WHEN d.concepto = 'otro'              THEN d.monto_centavos ELSE 0 END) / 100.0 AS otros,
      SUM(CASE WHEN d.miembro_id IS NULL THEN 1 ELSE 0 END)                  AS anonimas
    FROM donaciones d ${where}
    GROUP BY mes
    ORDER BY mes DESC
  `).all(...parametros);
}

// Total del mes actual (para el panel del Administrador y Tesorero).
function ingresosDelMes() {
  return db.prepare(`
    SELECT COALESCE(SUM(monto_centavos), 0) / 100.0 AS total, COUNT(*) AS aportaciones
    FROM donaciones
    WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')
  `).get();
}

module.exports = {
  CONCEPTOS,
  METODOS,
  pesosACentavos,
  registrar,
  donantesDisponibles,
  obtener,
  listarPorPeriodo,
  totalesPorPeriodo,
  resumenMensual,
  ingresosDelMes,
};
