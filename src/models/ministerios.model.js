// RF-05  Administración de ministerios — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// Reglas del módulo:
//  * Los ministerios no se borran: se desactivan (activo = 0).
//  * El coordinador es un USUARIO (no un miembro), para saber qué ministerios
//    tiene a su cargo la persona que inició sesión.
//  * Al quitar a un integrante NO se borra su fila: se marca activo = 0 y fecha_salida.
//    Así se conserva el historial para el reporte de participación.
//  * Un miembro no puede estar dos veces activo en el mismo ministerio
//    (lo garantiza también el índice ux_ministerio_miembro_activo).
//  * Solo cuentan como integrantes los miembros activos de la iglesia.
//  * Las actividades del ministerio son los eventos con ese ministerio_id.
//
// Los id pueden llegar como número o como texto del formulario ('3').
// Si algo no cumple las reglas se lanza ErrorDatos (ver errores.js).

const db = require('../db/connection');
const { ErrorDatos, esDuplicado } = require('./errores');

function aId(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function nombreObligatorio(nombre) {
  const texto = typeof nombre === 'string' ? nombre.trim() : '';
  if (!texto) throw new ErrorDatos('NOMBRE_REQUERIDO', 'El nombre del ministerio es obligatorio.');
  return texto;
}

function textoOpcional(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

// ----------------------------------------------------------------------------
// Ministerios
// ----------------------------------------------------------------------------

// Lista de ministerios con su coordinador, número de integrantes y próximas actividades.
// opciones.incluirInactivos = true para ver también los desactivados.
function listar({ incluirInactivos = false } = {}) {
  return db.prepare(`
    SELECT
      m.id, m.nombre, m.descripcion, m.activo, m.coordinador_id,
      u.nombre AS coordinador,
      (SELECT COUNT(*)
         FROM ministerio_miembros mm
         JOIN miembros mi ON mi.id = mm.miembro_id
         WHERE mm.ministerio_id = m.id AND mm.activo = 1 AND mi.activo = 1) AS integrantes,
      (SELECT COUNT(*)
         FROM eventos e
         WHERE e.ministerio_id = m.id AND e.estado = 'programado'
           AND e.fecha >= date('now', 'localtime'))                       AS proximas_actividades
    FROM ministerios m
    LEFT JOIN usuarios u ON u.id = m.coordinador_id
    ${incluirInactivos ? '' : 'WHERE m.activo = 1'}
    ORDER BY m.activo DESC, m.nombre COLLATE NOCASE
  `).all();
}

function obtener(id) {
  return db.prepare(`
    SELECT m.id, m.nombre, m.descripcion, m.activo, m.coordinador_id, m.creado_en,
           u.nombre AS coordinador
    FROM ministerios m
    LEFT JOIN usuarios u ON u.id = m.coordinador_id
    WHERE m.id = ?
  `).get(aId(id));
}

// Usuarios activos que se pueden asignar como coordinador (para el <select>).
// Primero los de rol Coordinador, luego los demás.
function coordinadoresDisponibles() {
  return db.prepare(`
    SELECT u.id, u.nombre, r.nombre AS rol
    FROM usuarios u
    JOIN roles r ON r.id = u.rol_id
    WHERE u.activo = 1
    ORDER BY CASE WHEN r.nombre = 'Coordinador' THEN 0 ELSE 1 END, u.nombre COLLATE NOCASE
  `).all();
}

// Sin coordinador = null. Si se manda uno, debe ser un usuario activo.
function validarCoordinador(coordinadorId) {
  if (coordinadorId === null || coordinadorId === undefined || coordinadorId === '') return null;
  const id = aId(coordinadorId);
  const usuario = id && db.prepare('SELECT id FROM usuarios WHERE id = ? AND activo = 1').get(id);
  if (!usuario) throw new ErrorDatos('COORDINADOR_NO_VALIDO', 'El coordinador seleccionado no existe o está inactivo.');
  return id;
}

// Devuelve el id del ministerio creado.
function crear({ nombre, descripcion, coordinadorId }) {
  const coordinador = validarCoordinador(coordinadorId);
  try {
    const info = db.prepare(`
      INSERT INTO ministerios (nombre, descripcion, coordinador_id) VALUES (?, ?, ?)
    `).run(nombreObligatorio(nombre), textoOpcional(descripcion), coordinador);
    return Number(info.lastInsertRowid);
  } catch (err) {
    if (esDuplicado(err, 'ministerios.nombre')) {
      throw new ErrorDatos('NOMBRE_DUPLICADO', 'Ya existe un ministerio con ese nombre.');
    }
    throw err;
  }
}

// Devuelve true si se actualizó, false si el ministerio no existe.
function actualizar(id, { nombre, descripcion, coordinadorId }) {
  const coordinador = validarCoordinador(coordinadorId);
  try {
    const info = db.prepare(`
      UPDATE ministerios SET nombre = ?, descripcion = ?, coordinador_id = ? WHERE id = ?
    `).run(nombreObligatorio(nombre), textoOpcional(descripcion), coordinador, aId(id));
    return info.changes === 1;
  } catch (err) {
    if (esDuplicado(err, 'ministerios.nombre')) {
      throw new ErrorDatos('NOMBRE_DUPLICADO', 'Ya existe un ministerio con ese nombre.');
    }
    throw err;
  }
}

function desactivar(id) {
  return db.prepare('UPDATE ministerios SET activo = 0 WHERE id = ? AND activo = 1').run(aId(id)).changes === 1;
}

function reactivar(id) {
  return db.prepare('UPDATE ministerios SET activo = 1 WHERE id = ? AND activo = 0').run(aId(id)).changes === 1;
}

// ----------------------------------------------------------------------------
// Integrantes
// ----------------------------------------------------------------------------

// Integrantes actuales. Con { incluirHistorial: true } también los que ya salieron.
function listarIntegrantes(ministerioId, { incluirHistorial = false } = {}) {
  return db.prepare(`
    SELECT mi.id AS miembro_id, mi.nombre, mi.apellidos, mi.telefono, mi.correo,
           mm.fecha_union, mm.fecha_salida, mm.activo
    FROM ministerio_miembros mm
    JOIN miembros mi ON mi.id = mm.miembro_id
    WHERE mm.ministerio_id = ?
      ${incluirHistorial ? '' : 'AND mm.activo = 1 AND mi.activo = 1'}
    ORDER BY mm.activo DESC, mi.nombre COLLATE NOCASE, mi.apellidos COLLATE NOCASE, mm.fecha_union DESC
  `).all(aId(ministerioId));
}

// Miembros activos que todavía NO están en el ministerio (para el <select> de "Agregar").
function miembrosDisponibles(ministerioId) {
  return db.prepare(`
    SELECT mi.id, mi.nombre, mi.apellidos
    FROM miembros mi
    WHERE mi.activo = 1
      AND NOT EXISTS (
        SELECT 1 FROM ministerio_miembros mm
        WHERE mm.ministerio_id = ? AND mm.miembro_id = mi.id AND mm.activo = 1
      )
    ORDER BY mi.nombre COLLATE NOCASE, mi.apellidos COLLATE NOCASE
  `).all(aId(ministerioId));
}

function agregarIntegrante(ministerioId, miembroId) {
  const idMinisterio = aId(ministerioId);
  const idMiembro = aId(miembroId);

  const ministerio = idMinisterio && db.prepare('SELECT activo FROM ministerios WHERE id = ?').get(idMinisterio);
  if (!ministerio) throw new ErrorDatos('MINISTERIO_NO_EXISTE', 'El ministerio no existe.');
  if (ministerio.activo !== 1) throw new ErrorDatos('MINISTERIO_INACTIVO', 'El ministerio está desactivado.');

  const miembro = idMiembro && db.prepare('SELECT activo FROM miembros WHERE id = ?').get(idMiembro);
  if (!miembro || miembro.activo !== 1) {
    throw new ErrorDatos('MIEMBRO_NO_VALIDO', 'El miembro seleccionado no existe o está inactivo.');
  }

  try {
    db.prepare(`
      INSERT INTO ministerio_miembros (ministerio_id, miembro_id) VALUES (?, ?)
    `).run(idMinisterio, idMiembro);
  } catch (err) {
    if (err && err.errcode === 2067) {
      throw new ErrorDatos('YA_ES_INTEGRANTE', 'Este miembro ya forma parte del ministerio.');
    }
    throw err;
  }
}

// No borra: marca la salida. Devuelve true si se quitó, false si no era integrante.
function quitarIntegrante(ministerioId, miembroId) {
  return db.prepare(`
    UPDATE ministerio_miembros
    SET activo = 0, fecha_salida = date('now', 'localtime')
    WHERE ministerio_id = ? AND miembro_id = ? AND activo = 1
  `).run(aId(ministerioId), aId(miembroId)).changes === 1;
}

// ----------------------------------------------------------------------------
// Actividades y coordinadores
// ----------------------------------------------------------------------------

// Eventos del ministerio. Con { soloProximas: true } solo los programados desde hoy.
function listarActividades(ministerioId, { soloProximas = false } = {}) {
  return db.prepare(`
    SELECT id, titulo, tipo, fecha, hora, lugar, estado
    FROM eventos
    WHERE ministerio_id = ?
      ${soloProximas ? "AND estado = 'programado' AND fecha >= date('now', 'localtime')" : ''}
    ORDER BY fecha ${soloProximas ? 'ASC' : 'DESC'}, hora
  `).all(aId(ministerioId));
}

// Ministerios activos a cargo de un usuario (para limitar al Coordinador).
function ministeriosDeCoordinador(usuarioId) {
  return db.prepare(`
    SELECT id, nombre FROM ministerios
    WHERE coordinador_id = ? AND activo = 1
    ORDER BY nombre COLLATE NOCASE
  `).all(aId(usuarioId));
}

// ¿Este usuario coordina este ministerio? Útil para validar permisos en rutas.
function esCoordinador(usuarioId, ministerioId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM ministerios WHERE id = ? AND coordinador_id = ? AND activo = 1
  `).get(aId(ministerioId), aId(usuarioId)));
}

module.exports = {
  listar,
  obtener,
  coordinadoresDisponibles,
  crear,
  actualizar,
  desactivar,
  reactivar,
  listarIntegrantes,
  miembrosDisponibles,
  agregarIntegrante,
  quitarIntegrante,
  listarActividades,
  ministeriosDeCoordinador,
  esCoordinador,
};
