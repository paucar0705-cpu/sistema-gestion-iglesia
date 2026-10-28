// RF-09 · Reportes y exportación a Excel. Persona 4.
const router = require('express').Router();
const ExcelJS = require('exceljs');
const db = require('../db/connection');
const { requireSeccion, requireFinanciero } = require('../middlewares/auth');
const { ROLES_FINANCIEROS } = require('../config/permisos');

router.use(requireSeccion('reportes'));

// Lista fija: los parámetros de la URL nunca se convierten en nombres de tablas SQL.
const REPORTES = {
  miembros: {
    titulo: 'Reporte general de miembros',
    columnas: [
      ['nombre', 'Nombre'], ['telefono', 'Teléfono'], ['correo', 'Correo'],
      ['fecha_ingreso', 'Fecha de ingreso'], ['estado', 'Estado'],
    ],
  },
  asistencia: {
    titulo: 'Asistencia por evento',
    columnas: [
      ['titulo', 'Evento'], ['tipo', 'Tipo'], ['fecha', 'Fecha'],
      ['total_registrados', 'Registrados'], ['presentes', 'Presentes'],
      ['ausentes', 'Ausentes'], ['porcentaje_asistencia', 'Asistencia (%)'],
    ],
  },
  ministerios: {
    titulo: 'Participación por ministerio',
    columnas: [
      ['ministerio', 'Ministerio'], ['coordinador', 'Coordinador'],
      ['integrantes_activos', 'Integrantes activos'], ['actividades', 'Actividades'],
      ['porcentaje_asistencia', 'Asistencia (%)'],
    ],
  },
  ingresos: {
    titulo: 'Ingresos por periodo',
    columnas: [
      ['mes', 'Mes'], ['concepto', 'Concepto'], ['metodo', 'Método'],
      ['aportaciones', 'Aportaciones'], ['anonimas', 'Anónimas'], ['total', 'Total (MXN)'],
    ],
  },
};
const TIPOS_EVENTO = ['', 'culto', 'reunion', 'actividad', 'administrativo'];

function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(valor + 'T00:00:00Z');
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function filtros(req) {
  const desde = typeof req.query.desde === 'string' ? req.query.desde.trim() : '';
  const hasta = typeof req.query.hasta === 'string' ? req.query.hasta.trim() : '';
  const tipoEvento = typeof req.query.tipo === 'string' ? req.query.tipo.trim() : '';
  if ((desde && !fechaValida(desde)) || (hasta && !fechaValida(hasta))) {
    throw new Error('Ingresa fechas válidas en formato YYYY-MM-DD.');
  }
  if (desde && hasta && desde > hasta) {
    throw new Error('La fecha inicial no puede ser posterior a la final.');
  }
  if (!TIPOS_EVENTO.includes(tipoEvento)) throw new Error('El tipo de evento es inválido.');
  return { desde, hasta, tipoEvento };
}

function consultar(tipo, filtro) {
  if (tipo === 'miembros') {
    return db.prepare(`
      SELECT TRIM(nombre || ' ' || COALESCE(apellidos, '')) AS nombre,
             COALESCE(telefono, '') AS telefono, COALESCE(correo, '') AS correo,
             fecha_ingreso, CASE WHEN activo = 1 THEN 'Activo' ELSE 'Inactivo' END AS estado
      FROM miembros ORDER BY nombre COLLATE NOCASE
    `).all();
  }
  if (tipo === 'ministerios') {
    return db.prepare(`
      SELECT ministerio, COALESCE(coordinador, '') AS coordinador,
             integrantes_activos, actividades, porcentaje_asistencia
      FROM v_participacion_ministerio ORDER BY ministerio COLLATE NOCASE
    `).all();
  }
  const condiciones = [];
  const valores = [];
  if (filtro.desde) { condiciones.push('fecha >= ?'); valores.push(filtro.desde); }
  if (filtro.hasta) { condiciones.push('fecha <= ?'); valores.push(filtro.hasta); }
  if (tipo === 'asistencia') {
    if (filtro.tipoEvento) { condiciones.push('tipo = ?'); valores.push(filtro.tipoEvento); }
    const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
    return db.prepare(`
      SELECT titulo, tipo, fecha, total_registrados, presentes, ausentes,
             porcentaje_asistencia FROM v_asistencia_por_evento ${where}
      ORDER BY fecha DESC, titulo
    `).all(...valores);
  }
  if (tipo === 'ingresos') {
    const where = condiciones.length ? 'WHERE ' + condiciones.join(' AND ') : '';
    // Se filtra antes de agrupar para que el rango de días sea exacto.
    return db.prepare(`
      SELECT strftime('%Y-%m', fecha) AS mes, concepto, metodo,
             COUNT(*) AS aportaciones,
             SUM(CASE WHEN miembro_id IS NULL THEN 1 ELSE 0 END) AS anonimas,
             ROUND(SUM(monto_centavos) / 100.0, 2) AS total
      FROM donaciones ${where}
      GROUP BY mes, concepto, metodo ORDER BY mes DESC, concepto, metodo
    `).all(...valores);
  }
  return [];
}

function acceso(req, res, next) {
  if (!Object.hasOwn(REPORTES, req.params.reporte)) {
    return res.status(404).render('error', {
      titulo: 'No encontrado', mensaje: 'Ese reporte no existe.',
    });
  }
  if (req.params.reporte === 'ingresos') return requireFinanciero(req, res, next);
  return next();
}

function obtenerDatos(req, res) {
  let filtro;
  try { filtro = filtros(req); }
  catch (error) {
    res.status(422).render('error', { titulo: 'Filtros incorrectos', mensaje: error.message });
    return null;
  }
  const reporte = req.params.reporte;
  return { reporte, configuracion: REPORTES[reporte], filtro, filas: consultar(reporte, filtro) };
}

router.get('/', (req, res) => {
  res.render('reportes/index', {
    reportes: Object.entries(REPORTES)
      .filter(([tipo]) => tipo !== 'ingresos' || ROLES_FINANCIEROS.includes(req.session.usuario.rol))
      .map(([tipo, config]) => ({ tipo, titulo: config.titulo })),
  });
});

router.get('/:reporte/excel', acceso, async (req, res, next) => {
  const datos = obtenerDatos(req, res);
  if (!datos) return;
  try {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de Gestión de Iglesias';
    const hoja = libro.addWorksheet('Reporte');
    hoja.columns = datos.configuracion.columnas.map(([key, header]) => ({ key, header, width: 24 }));
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
        hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: datos.configuracion.columnas.length },
    };

    datos.filas.forEach(fila => hoja.addRow(fila));

    if (datos.reporte === 'ingresos') {
      hoja.getColumn('total').numFmt = '"$"#,##0.00';
    }

    const contenido = await libro.xlsx.writeBuffer();

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reporte-' + datos.reporte + '.xlsx"',
      'Cache-Control': 'no-store',
    });

    return res.end(Buffer.from(contenido));
  } catch (error) { return next(error); }
});

router.get('/:reporte', acceso, (req, res) => {
  const datos = obtenerDatos(req, res);
  if (!datos) return;
  return res.render('reportes/detalle', datos);
});

module.exports = router;
