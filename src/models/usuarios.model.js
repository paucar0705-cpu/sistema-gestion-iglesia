// RF-01  Usuarios, roles y recuperación de contraseña — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// División acordada con backend (Persona 2):
//  * Este modelo se encarga del ALMACENAMIENTO seguro:
//      - las contraseñas SIEMPRE se guardan como hash bcrypt (nunca en texto)
//      - los tokens de recuperación se guardan como hash SHA-256 con expiración
//      - ninguna función devuelve password_hash ni token_hash
//  * Backend se encarga de: validar formato de correo y requisitos de contraseña,
//    login y sesiones, permisos por rol y el flujo/pantallas de recuperación.
//
// Reglas de integridad:
//  * El correo es único (sin distinguir mayúsculas) y se guarda en minúsculas.
//  * Los usuarios no se borran: se desactivan.
//  * Siempre debe quedar al menos un Administrador activo.
//  * Un miembro solo puede estar vinculado a un usuario.
//  * Al desactivar a un usuario o cambiar su contraseña, sus tokens pendientes se anulan.
//
// Si algo no cumple las reglas se lanza ErrorDatos (ver errores.js).

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { ErrorDatos, esDuplicado } = require('./errores');

const COSTO_BCRYPT = 10;
const MINUTOS_VIGENCIA_TOKEN = 60;
const ROL_ADMIN = 'Administrador';

// Columnas públicas: NUNCA incluir password_hash
const COLUMNAS = `
  u.id, u.nombre, u.correo, u.rol_id, r.nombre AS rol, u.miembro_id, u.activo, u.creado_en,
  CASE WHEN mi.id IS NULL THEN NULL
       ELSE TRIM(mi.nombre || ' ' || COALESCE(mi.apellidos, '')) END AS miembro
`;
const UNIONES = `
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id
  LEFT JOIN miembros mi ON mi.id = u.miembro_id
`;

function aId(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizarCorreo(correo) {
  const texto = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  if (!texto) throw new ErrorDatos('CORREO_REQUERIDO', 'El correo es obligatorio.');
  return texto;
}

function nombreObligatorio(nombre) {
  const texto = typeof nombre === 'string' ? nombre.trim() : '';
  if (!texto) throw new ErrorDatos('NOMBRE_REQUERIDO', 'El nombre es obligatorio.');
  return texto;
}

// Los requisitos (longitud mínima, mayúsculas, etc.) los valida backend.
// Aquí solo se evita guardar algo vacío o que bcrypt recortaría (más de 72 bytes).
function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new ErrorDatos('PASSWORD_REQUERIDA', 'La contraseña es obligatoria.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new ErrorDatos('PASSWORD_MUY_LARGA', 'La contraseña no puede tener más de 72 caracteres.');
  }
  return bcrypt.hashSync(password, COSTO_BCRYPT);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function validarRol(rolId) {
  const id = aId(rolId);
  const rol = id && db.prepare('SELECT id, nombre FROM roles WHERE id = ?').get(id);
  if (!rol) throw new ErrorDatos('ROL_NO_VALIDO', 'Selecciona un rol válido.');
  return rol;
}

// Miembro opcional. Si se manda, debe existir, estar activo y no tener otro usuario.
function validarMiembro(miembroId, usuarioIdActual = null) {
  if (miembroId === null || miembroId === undefined || miembroId === '') return null;
  const id = aId(miembroId);
  const miembro = id && db.prepare('SELECT id FROM miembros WHERE id = ? AND activo = 1').get(id);
  if (!miembro) throw new ErrorDatos('MIEMBRO_NO_VALIDO', 'El miembro seleccionado no existe o está inactivo.');
  const otro = db.prepare('SELECT id FROM usuarios WHERE miembro_id = ? AND id IS NOT ?').get(id, usuarioIdActual);
  if (otro) throw new ErrorDatos('MIEMBRO_YA_VINCULADO', 'Ese miembro ya está vinculado a otro usuario.');
  return id;
}

function contarAdminsActivos(excluirId = null) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE r.nombre = ? AND u.activo = 1 AND u.id IS NOT ?
  `).get(ROL_ADMIN, excluirId).n;
}

function esAdminActivo(id) {
  return Boolean(db.prepare(`
    SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE u.id = ? AND u.activo = 1 AND r.nombre = ?
  `).get(id, ROL_ADMIN));
}

function protegerUltimoAdmin(id) {
  if (esAdminActivo(id) && contarAdminsActivos(id) === 0) {
    throw new ErrorDatos('ULTIMO_ADMIN', 'Debe quedar al menos un Administrador activo en el sistema.');
  }
}

function anularTokens(usuarioId) {
  db.prepare('UPDATE recuperacion_password SET usado = 1 WHERE usuario_id = ? AND usado = 0').run(usuarioId);
}

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

function listarRoles() {
  return db.prepare('SELECT id, nombre FROM roles ORDER BY id').all();
}

function listar({ incluirInactivos = true } = {}) {
  return db.prepare(`
    SELECT ${COLUMNAS} ${UNIONES}
    ${incluirInactivos ? '' : 'WHERE u.activo = 1'}
    ORDER BY u.activo DESC, u.nombre COLLATE NOCASE
  `).all();
}

function obtener(id) {
  return db.prepare(`SELECT ${COLUMNAS} ${UNIONES} WHERE u.id = ?`).get(aId(id));
}

// Sin hash. Útil, por ejemplo, para la pantalla de "¿Olvidaste tu contraseña?"
function buscarPorCorreo(correo) {
  const texto = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  if (!texto) return undefined;
  return db.prepare(`SELECT ${COLUMNAS} ${UNIONES} WHERE u.correo = ?`).get(texto);
}

// Para el login: devuelve { id, nombre, correo, rol } si el correo y la contraseña
// coinciden y el usuario está activo; si no, devuelve null.
// La sesión, los mensajes y los límites de intentos los maneja backend.
function verificarCredenciales(correo, password) {
  const texto = typeof correo === 'string' ? correo.trim().toLowerCase() : '';
  if (!texto || typeof password !== 'string') return null;
  const fila = db.prepare(`
    SELECT u.id, u.nombre, u.correo, u.password_hash, r.nombre AS rol
    FROM usuarios u JOIN roles r ON r.id = u.rol_id
    WHERE u.correo = ? AND u.activo = 1
  `).get(texto);
  if (!fila || !bcrypt.compareSync(password, fila.password_hash)) return null;
  return { id: fila.id, nombre: fila.nombre, correo: fila.correo, rol: fila.rol };
}

// Miembros activos sin usuario vinculado (para el <select> opcional del formulario).
function miembrosSinUsuario() {
  return db.prepare(`
    SELECT mi.id, mi.nombre, mi.apellidos FROM miembros mi
    WHERE mi.activo = 1 AND NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.miembro_id = mi.id)
    ORDER BY mi.nombre COLLATE NOCASE, mi.apellidos COLLATE NOCASE
  `).all();
}

// ----------------------------------------------------------------------------
// Altas y cambios
// ----------------------------------------------------------------------------

// Devuelve el id del usuario creado. La contraseña llega en texto y se guarda como hash.
function crear({ nombre, correo, password, rolId, miembroId }) {
  const datos = {
    nombre: nombreObligatorio(nombre),
    correo: normalizarCorreo(correo),
    rol: validarRol(rolId),
    miembro: validarMiembro(miembroId),
    hash: hashPassword(password),
  };
  try {
    const info = db.prepare(`
      INSERT INTO usuarios (nombre, correo, password_hash, rol_id, miembro_id) VALUES (?, ?, ?, ?, ?)
    `).run(datos.nombre, datos.correo, datos.hash, datos.rol.id, datos.miembro);
    return Number(info.lastInsertRowid);
  } catch (err) {
    if (esDuplicado(err, 'usuarios.correo')) {
      throw new ErrorDatos('CORREO_DUPLICADO', 'Ya existe un usuario con ese correo.');
    }
    throw err;
  }
}

// Cambia nombre, correo y miembro vinculado (no la contraseña ni el rol).
// Devuelve true si se actualizó, false si el usuario no existe.
function actualizar(id, { nombre, correo, miembroId }) {
  const idUsuario = aId(id);
  const datos = {
    nombre: nombreObligatorio(nombre),
    correo: normalizarCorreo(correo),
    miembro: validarMiembro(miembroId, idUsuario),
  };
  try {
    return db.prepare(`
      UPDATE usuarios SET nombre = ?, correo = ?, miembro_id = ? WHERE id = ?
    `).run(datos.nombre, datos.correo, datos.miembro, idUsuario).changes === 1;
  } catch (err) {
    if (esDuplicado(err, 'usuarios.correo')) {
      throw new ErrorDatos('CORREO_DUPLICADO', 'Ya existe un usuario con ese correo.');
    }
    throw err;
  }
}

function cambiarRol(id, rolId) {
  const idUsuario = aId(id);
  const rol = validarRol(rolId);
  if (rol.nombre !== ROL_ADMIN) protegerUltimoAdmin(idUsuario);
  return db.prepare('UPDATE usuarios SET rol_id = ? WHERE id = ?').run(rol.id, idUsuario).changes === 1;
}

// Cambio directo de contraseña (por el propio usuario o por el Administrador).
// Anula los tokens de recuperación pendientes.
function cambiarPassword(id, nuevaPassword) {
  const idUsuario = aId(id);
  const hash = hashPassword(nuevaPassword);
  return db.transaccion(() => {
    const cambiado = db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, idUsuario).changes === 1;
    if (cambiado) anularTokens(idUsuario);
    return cambiado;
  });
}

function desactivar(id) {
  const idUsuario = aId(id);
  protegerUltimoAdmin(idUsuario);
  return db.transaccion(() => {
    const cambiado = db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ? AND activo = 1').run(idUsuario).changes === 1;
    if (cambiado) anularTokens(idUsuario);
    return cambiado;
  });
}

function reactivar(id) {
  return db.prepare('UPDATE usuarios SET activo = 1 WHERE id = ? AND activo = 0').run(aId(id)).changes === 1;
}

// ----------------------------------------------------------------------------
// Recuperación de contraseña
// ----------------------------------------------------------------------------

// Crea un token de un solo uso con vigencia de 60 minutos.
// Devuelve { token, expiraEn }: el token va en el enlace (/restablecer/<token>);
// en la base de datos solo queda su hash. Anula los tokens anteriores del usuario.
// Si el usuario no existe o está inactivo devuelve null (backend debe mostrar el
// mismo mensaje en ambos casos para no revelar qué correos están registrados).
function crearTokenRecuperacion(usuarioId) {
  const idUsuario = aId(usuarioId);
  const usuario = idUsuario && db.prepare('SELECT id FROM usuarios WHERE id = ? AND activo = 1').get(idUsuario);
  if (!usuario) return null;

  const token = crypto.randomBytes(32).toString('hex');
  return db.transaccion(() => {
    anularTokens(idUsuario);
    db.prepare(`
      INSERT INTO recuperacion_password (usuario_id, token_hash, expira_en)
      VALUES (?, ?, datetime('now', 'localtime', ?))
    `).run(idUsuario, hashToken(token), `+${MINUTOS_VIGENCIA_TOKEN} minutes`);
    const { expira_en: expiraEn } = db.prepare(`
      SELECT expira_en FROM recuperacion_password WHERE id = last_insert_rowid()
    `).get();
    return { token, expiraEn };
  });
}

// Devuelve { id, nombre, correo } si el token es válido (existe, no se usó,
// no ha expirado y el usuario sigue activo); si no, null.
function validarToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const fila = db.prepare(`
    SELECT rp.id AS token_id, u.id, u.nombre, u.correo
    FROM recuperacion_password rp
    JOIN usuarios u ON u.id = rp.usuario_id
    WHERE rp.token_hash = ? AND rp.usado = 0 AND u.activo = 1
      AND rp.expira_en > datetime('now', 'localtime')
  `).get(hashToken(token));
  return fila ? { id: fila.id, nombre: fila.nombre, correo: fila.correo } : null;
}

// Valida el token, guarda la nueva contraseña (hash) y deja el token como usado.
// Devuelve { id, nombre, correo } del usuario. Lanza TOKEN_INVALIDO si no sirve.
function restablecerPassword(token, nuevaPassword) {
  const hash = hashPassword(nuevaPassword);
  return db.transaccion(() => {
    const usuario = validarToken(token);
    if (!usuario) {
      throw new ErrorDatos('TOKEN_INVALIDO', 'El enlace para restablecer la contraseña no es válido o ya expiró.');
    }
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hash, usuario.id);
    anularTokens(usuario.id);
    return usuario;
  });
}

module.exports = {
  MINUTOS_VIGENCIA_TOKEN,
  listarRoles,
  listar,
  obtener,
  buscarPorCorreo,
  verificarCredenciales,
  miembrosSinUsuario,
  crear,
  actualizar,
  cambiarRol,
  cambiarPassword,
  desactivar,
  reactivar,
  crearTokenRecuperacion,
  validarToken,
  restablecerPassword,
};
