// RF-03  Control de asistencia — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// Reglas del módulo:
//  * Se guarda UNA fila por miembro y evento, presente (1) o ausente (0).
//    Sin los ausentes no se puede calcular el porcentaje de asistencia.
//  * Evento general (sin ministerio): se toma lista a los miembros activos que ya
//    habían ingresado en la fecha del evento.
//  * Evento de un ministerio: se toma lista solo a sus integrantes activos.
//  * Si alguien ya tiene asistencia registrada en el evento, siempre aparece en la
//    lista aunque después se haya dado de baja (así no se pierde el historial).
//  * Al guardar la asistencia, el evento pasa de 'programado' a 'realizado'.

const db = require('../db/connection');

function hoy() {
  return db.prepare("SELECT date('now', 'localtime') AS hoy").get().hoy;
}

function haceDias(dias) {
  return db.prepare("SELECT date('now', 'localtime', ?) AS fecha").get(`-${dias} days`).fecha;
}

function inicioDeMesesAtras(meses) {
  return db.prepare("SELECT date('now', 'localtime', 'start of month', ?) AS fecha")
    .get(`-${meses} months`).fecha;
}

// Historial: eventos del periodo con su conteo de asistencia
function listarEventos({ desde, hasta, tipo }) {
  const parametros = [desde, hasta];
  let filtroTipo = '';
  if (tipo) {
    filtroTipo = 'AND e.tipo = ?';
    parametros.push(tipo);
  }

  return db.prepare(`
    SELECT
      e.id, e.titulo, e.tipo, e.fecha, e.hora, e.lugar, e.estado,
      m.nombre                                   AS ministerio,
      COUNT(a.id)                                AS registrados,
      COALESCE(SUM(a.presente), 0)               AS presentes,
      COUNT(a.id) - COALESCE(SUM(a.presente), 0) AS ausentes,
      ROUND(100.0 * SUM(a.presente) / NULLIF(COUNT(a.id), 0), 1) AS porcentaje
    FROM eventos e
    LEFT JOIN ministerios m ON m.id = e.ministerio_id
    LEFT JOIN asistencias a ON a.evento_id = e.id
    WHERE e.estado <> 'cancelado'
      AND e.fecha BETWEEN ? AND ?
      ${filtroTipo}
    GROUP BY e.id
    ORDER BY e.fecha DESC, e.hora DESC, e.id DESC
  `).all(...parametros);
}

function obtenerEvento(id) {
  return db.prepare(`
    SELECT e.id, e.titulo, e.tipo, e.fecha, e.hora, e.lugar, e.estado, e.ministerio_id,
           m.nombre AS ministerio
    FROM eventos e
    LEFT JOIN ministerios m ON m.id = e.ministerio_id
    WHERE e.id = ?
  `).get(id);
}

// Lista de miembros a los que se les toma asistencia en un evento.
// presente = 1 / 0 si ya se registró, NULL si todavía no.
function miembrosDelEvento(evento) {
  const convocados = evento.ministerio_id
    ? `SELECT mm.miembro_id AS id
       FROM ministerio_miembros mm
       JOIN miembros mi ON mi.id = mm.miembro_id
       WHERE mm.ministerio_id = @ministerioId AND mm.activo = 1 AND mi.activo = 1`
    : `SELECT id FROM miembros
       WHERE activo = 1 AND fecha_ingreso <= @fecha`;

  return db.prepare(`
    SELECT mi.id, mi.nombre, mi.apellidos, mi.activo, a.presente
    FROM miembros mi
    LEFT JOIN asistencias a ON a.miembro_id = mi.id AND a.evento_id = @eventoId
    WHERE mi.id IN (${convocados})
       OR a.id IS NOT NULL
    ORDER BY mi.nombre COLLATE NOCASE, mi.apellidos COLLATE NOCASE, mi.id
  `).all(evento.ministerio_id
    ? { eventoId: evento.id, ministerioId: evento.ministerio_id }
    : { eventoId: evento.id, fecha: evento.fecha });
}

// Guarda la asistencia de TODOS los miembros del evento en una sola transacción.
// idsPresentes: Set con los id de los miembros marcados como presentes.
function guardar(evento, idsPresentes, usuarioId) {
  const guardarFila = db.prepare(`
    INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (evento_id, miembro_id) DO UPDATE SET
      presente       = excluded.presente,
      registrado_por = excluded.registrado_por,
      registrado_en  = datetime('now', 'localtime')
  `);
  const marcarRealizado = db.prepare(`
    UPDATE eventos SET estado = 'realizado'
    WHERE id = ? AND estado = 'programado'
  `);

  return db.transaccion(() => {
    const miembros = miembrosDelEvento(evento);
    let presentes = 0;
    for (const m of miembros) {
      const presente = idsPresentes.has(m.id) ? 1 : 0;
      presentes += presente;
      guardarFila.run(evento.id, m.id, presente, usuarioId);
    }
    marcarRealizado.run(evento.id);
    return { presentes, ausentes: miembros.length - presentes };
  });
}

// Resumen semanal o mensual (RF-03 y reporte de asistencia de RF-09)
// agrupacion: 'semana' (lunes de cada semana) o 'mes' (YYYY-MM)
function resumen({ agrupacion, desde, hasta, tipo }) {
  const periodo = agrupacion === 'semana'
    ? "date(e.fecha, '-' || ((CAST(strftime('%w', e.fecha) AS INTEGER) + 6) % 7) || ' days')"
    : "strftime('%Y-%m', e.fecha)";

  const parametros = [desde, hasta];
  let filtroTipo = '';
  if (tipo) {
    filtroTipo = 'AND e.tipo = ?';
    parametros.push(tipo);
  }

  return db.prepare(`
    SELECT
      ${periodo}                    AS periodo,
      COUNT(DISTINCT e.id)          AS eventos,
      COUNT(a.id)                   AS registros,
      SUM(a.presente)               AS presentes,
      COUNT(a.id) - SUM(a.presente) AS ausentes,
      ROUND(1.0 * SUM(a.presente) / COUNT(DISTINCT e.id), 1)    AS promedio_por_evento,
      ROUND(100.0 * SUM(a.presente) / NULLIF(COUNT(a.id), 0), 1) AS porcentaje
    FROM eventos e
    JOIN asistencias a ON a.evento_id = e.id
    WHERE e.estado <> 'cancelado'
      AND e.fecha BETWEEN ? AND ?
      ${filtroTipo}
    GROUP BY periodo
    ORDER BY periodo DESC
  `).all(...parametros);
}

module.exports = {
  hoy,
  haceDias,
  inicioDeMesesAtras,
  listarEventos,
  obtenerEvento,
  miembrosDelEvento,
  guardar,
  resumen,
};
