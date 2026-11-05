// RF-07  Comunicados y anuncios — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// Reglas del módulo:
//  * Cada anuncio tiene fecha de publicación (por defecto hoy). Si se pone una fecha
//    futura, el anuncio queda "programado" y no aparece en el panel hasta ese día.
//  * importante = 1 lo destaca en el panel principal.
//  * Los anuncios SÍ se pueden eliminar (el documento pide "edición y eliminación").
//
// Si algo no cumple las reglas se lanza ErrorDatos (ver errores.js).

const db = require('../db/connection');
const { ErrorDatos } = require('./errores');

const LIMITE_POR_DEFECTO = 5;

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

function hoy() {
  return db.prepare("SELECT date('now', 'localtime') AS hoy").get().hoy;
}

// Casilla del formulario: 'on', '1', 'true', true o 1 = importante
function aBooleano(valor) {
  return ['on', '1', 'true', 'si', 'sí'].includes(String(valor).trim().toLowerCase()) || valor === true || valor === 1
    ? 1 : 0;
}

function aLimite(limite) {
  const n = Number(limite);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 100) : LIMITE_POR_DEFECTO;
}

function validarDatos({ titulo, contenido, fechaPublicacion, importante, autorId }) {
  const datos = {
    titulo: typeof titulo === 'string' ? titulo.trim() : '',
    contenido: typeof contenido === 'string' ? contenido.trim() : '',
    fecha: fechaPublicacion === undefined || fechaPublicacion === null || fechaPublicacion === ''
      ? hoy()
      : fechaPublicacion,
    importante: aBooleano(importante),
    autor: null,
  };
  if (!datos.titulo) throw new ErrorDatos('TITULO_REQUERIDO', 'El título del anuncio es obligatorio.');
  if (!datos.contenido) throw new ErrorDatos('CONTENIDO_REQUERIDO', 'El contenido del anuncio es obligatorio.');
  if (!fechaValida(datos.fecha)) {
    throw new ErrorDatos('FECHA_INVALIDA', 'La fecha de publicación debe tener el formato YYYY-MM-DD.');
  }
  if (autorId !== undefined && autorId !== null && autorId !== '') {
    datos.autor = aId(autorId);
    const usuario = datos.autor && db.prepare('SELECT id FROM usuarios WHERE id = ?').get(datos.autor);
    if (!usuario) throw new ErrorDatos('AUTOR_NO_VALIDO', 'No se identificó al usuario que publica.');
  }
  return datos;
}

const COLUMNAS = `
  a.id, a.titulo, a.contenido, a.fecha_publicacion, a.importante, a.autor_id,
  a.creado_en, a.actualizado_en,
  u.nombre AS autor,
  CASE WHEN a.fecha_publicacion > date('now', 'localtime') THEN 1 ELSE 0 END AS programado
`;
const UNIONES = 'FROM anuncios a LEFT JOIN usuarios u ON u.id = a.autor_id';

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

// Todos los anuncios para la pantalla de administración (incluye programados).
// Más recientes primero.
function listar() {
  return db.prepare(`
    SELECT ${COLUMNAS} ${UNIONES}
    ORDER BY a.fecha_publicacion DESC, a.id DESC
  `).all();
}

function obtener(id) {
  return db.prepare(`SELECT ${COLUMNAS} ${UNIONES} WHERE a.id = ?`).get(aId(id));
}

// Anuncios ya publicados (fecha de publicación hoy o antes).
// Para el panel: primero los importantes, luego los más recientes.
function publicados(limite = LIMITE_POR_DEFECTO) {
  return db.prepare(`
    SELECT ${COLUMNAS} ${UNIONES}
    WHERE a.fecha_publicacion <= date('now', 'localtime')
    ORDER BY a.importante DESC, a.fecha_publicacion DESC, a.id DESC
    LIMIT ?
  `).all(aLimite(limite));
}

// Solo los importantes ya publicados (más recientes primero).
function importantes(limite = LIMITE_POR_DEFECTO) {
  return db.prepare(`
    SELECT ${COLUMNAS} ${UNIONES}
    WHERE a.importante = 1 AND a.fecha_publicacion <= date('now', 'localtime')
    ORDER BY a.fecha_publicacion DESC, a.id DESC
    LIMIT ?
  `).all(aLimite(limite));
}

// ----------------------------------------------------------------------------
// Altas, cambios y eliminación
// ----------------------------------------------------------------------------

// Devuelve el id del anuncio creado.
function crear(datosAnuncio) {
  const d = validarDatos(datosAnuncio);
  const info = db.prepare(`
    INSERT INTO anuncios (titulo, contenido, fecha_publicacion, importante, autor_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(d.titulo, d.contenido, d.fecha, d.importante, d.autor);
  return Number(info.lastInsertRowid);
}

// Cambia título, contenido, fecha e importante (el autor original se conserva).
// Devuelve true si se actualizó, false si el anuncio no existe.
function actualizar(id, { titulo, contenido, fechaPublicacion, importante }) {
  const d = validarDatos({ titulo, contenido, fechaPublicacion, importante });
  return db.prepare(`
    UPDATE anuncios
    SET titulo = ?, contenido = ?, fecha_publicacion = ?, importante = ?,
        actualizado_en = datetime('now', 'localtime')
    WHERE id = ?
  `).run(d.titulo, d.contenido, d.fecha, d.importante, aId(id)).changes === 1;
}

// Devuelve true si se eliminó, false si no existía.
function eliminar(id) {
  return db.prepare('DELETE FROM anuncios WHERE id = ?').run(aId(id)).changes === 1;
}

module.exports = {
  listar,
  obtener,
  publicados,
  importantes,
  crear,
  actualizar,
  eliminar,
};
