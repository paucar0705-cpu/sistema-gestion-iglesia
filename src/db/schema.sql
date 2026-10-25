-- =====================================================================
--  SISTEMA DE GESTIÓN DE IGLESIAS — Esquema de base de datos (SQLite)
--  Responsable: Persona 3 (Base de datos)
--
--  Convenciones:
--   * Fechas como TEXT ISO: 'YYYY-MM-DD'; horas 'HH:MM'; marcas 'YYYY-MM-DD HH:MM:SS'
--   * Booleanos como INTEGER 0/1
--   * Dinero en CENTAVOS (INTEGER) para evitar errores de redondeo
--   * Los miembros nunca se borran: se desactivan (activo = 0, fecha_baja)
--
--  Para recrear la BD:  npm run db:reset
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- RF-01  Usuarios y roles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id      INTEGER PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- RF-02  Miembros
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS miembros (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL,
  apellidos       TEXT,
  telefono        TEXT,
  correo          TEXT,
  fecha_ingreso   TEXT NOT NULL,
  activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  fecha_baja      TEXT,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  actualizado_en  TEXT
);

CREATE TABLE IF NOT EXISTS usuarios (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre         TEXT NOT NULL,
  correo         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash  TEXT NOT NULL,
  rol_id         INTEGER NOT NULL REFERENCES roles(id),
  miembro_id     INTEGER REFERENCES miembros(id) ON DELETE SET NULL,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Tokens para recuperar contraseña (se guarda el hash del token, no el token)
CREATE TABLE IF NOT EXISTS recuperacion_password (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expira_en   TEXT NOT NULL,
  usado       INTEGER NOT NULL DEFAULT 0 CHECK (usado IN (0, 1)),
  creado_en   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- RF-05  Ministerios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ministerios (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre          TEXT NOT NULL UNIQUE,
  descripcion     TEXT,
  coordinador_id  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  activo          INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Integrantes de cada ministerio. Al salir se marca activo = 0 y fecha_salida,
-- así se conserva el historial para el reporte de participación.
CREATE TABLE IF NOT EXISTS ministerio_miembros (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ministerio_id  INTEGER NOT NULL REFERENCES ministerios(id) ON DELETE CASCADE,
  miembro_id     INTEGER NOT NULL REFERENCES miembros(id),
  fecha_union    TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  fecha_salida   TEXT,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);
-- Un miembro no puede estar dos veces ACTIVO en el mismo ministerio
CREATE UNIQUE INDEX IF NOT EXISTS ux_ministerio_miembro_activo
  ON ministerio_miembros (ministerio_id, miembro_id) WHERE activo = 1;

-- ---------------------------------------------------------------------
-- RF-04  Eventos  (cada culto/reunión es un registro distinto)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo          TEXT NOT NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('culto', 'reunion', 'actividad', 'administrativo')),
  fecha           TEXT NOT NULL,
  hora            TEXT,
  lugar           TEXT,
  descripcion     TEXT,
  responsable_id  INTEGER REFERENCES miembros(id) ON DELETE SET NULL,
  ministerio_id   INTEGER REFERENCES ministerios(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'programado'
                  CHECK (estado IN ('programado', 'realizado', 'cancelado')),
  creado_por      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- RF-03  Asistencias  (una fila por miembro y evento, presente o ausente)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS asistencias (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id       INTEGER NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
  miembro_id      INTEGER NOT NULL REFERENCES miembros(id),
  presente        INTEGER NOT NULL CHECK (presente IN (0, 1)),
  registrado_por  INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  registrado_en   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (evento_id, miembro_id)
);

-- ---------------------------------------------------------------------
-- RF-06  Donaciones  (miembro_id NULL = aportación anónima)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donaciones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha           TEXT NOT NULL,
  monto_centavos  INTEGER NOT NULL CHECK (monto_centavos > 0),
  concepto        TEXT NOT NULL CHECK (concepto IN ('diezmo', 'ofrenda', 'donacion_especial', 'otro')),
  metodo          TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'tarjeta', 'otro')),
  descripcion     TEXT,
  miembro_id      INTEGER REFERENCES miembros(id) ON DELETE SET NULL,
  registrado_por  INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- RF-07  Anuncios
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS anuncios (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo             TEXT NOT NULL,
  contenido          TEXT NOT NULL,
  fecha_publicacion  TEXT NOT NULL DEFAULT (date('now', 'localtime')),
  importante         INTEGER NOT NULL DEFAULT 0 CHECK (importante IN (0, 1)),
  autor_id           INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  actualizado_en     TEXT
);

-- ---------------------------------------------------------------------
-- RF-10  Configuración de la iglesia  (siempre un solo registro, id = 1)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_iglesia (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  nombre          TEXT NOT NULL,
  logo_ruta       TEXT,
  direccion       TEXT,
  telefono        TEXT,
  correo          TEXT,
  horarios        TEXT,
  actualizado_en  TEXT
);

-- ---------------------------------------------------------------------
-- Índices para búsquedas y reportes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_miembros_nombre       ON miembros (nombre, apellidos);
CREATE INDEX IF NOT EXISTS ix_miembros_activo       ON miembros (activo);
CREATE INDEX IF NOT EXISTS ix_eventos_fecha         ON eventos (fecha);
CREATE INDEX IF NOT EXISTS ix_eventos_ministerio    ON eventos (ministerio_id);
CREATE INDEX IF NOT EXISTS ix_asistencias_evento    ON asistencias (evento_id);
CREATE INDEX IF NOT EXISTS ix_asistencias_miembro   ON asistencias (miembro_id);
CREATE INDEX IF NOT EXISTS ix_donaciones_fecha      ON donaciones (fecha);
CREATE INDEX IF NOT EXISTS ix_anuncios_fecha        ON anuncios (fecha_publicacion);

-- =====================================================================
--  VISTAS para el panel (RF-08) y reportes (RF-09)
--  Uso desde el backend:  SELECT * FROM v_... WHERE ...
-- =====================================================================

-- Indicadores del panel principal (NO incluye datos financieros)
CREATE VIEW IF NOT EXISTS v_indicadores_panel AS
SELECT
  (SELECT COUNT(*) FROM miembros WHERE activo = 1)                    AS miembros_activos,
  (SELECT COUNT(*) FROM miembros WHERE activo = 0)                    AS miembros_inactivos,
  (SELECT COUNT(*) FROM eventos
     WHERE estado = 'programado' AND fecha >= date('now', 'localtime')) AS proximos_eventos,
  (SELECT COUNT(*) FROM asistencias WHERE presente = 1)               AS asistencias_registradas,
  (SELECT COUNT(*) FROM ministerios WHERE activo = 1)                 AS ministerios_activos;

-- Asistencia por evento (filtrar por fecha, tipo)
CREATE VIEW IF NOT EXISTS v_asistencia_por_evento AS
SELECT
  e.id                                   AS evento_id,
  e.titulo,
  e.tipo,
  e.fecha,
  strftime('%Y-%W', e.fecha)             AS semana,
  strftime('%Y-%m', e.fecha)             AS mes,
  e.ministerio_id,
  COUNT(a.id)                            AS total_registrados,
  COALESCE(SUM(a.presente), 0)           AS presentes,
  COUNT(a.id) - COALESCE(SUM(a.presente), 0) AS ausentes,
  ROUND(100.0 * SUM(a.presente) / NULLIF(COUNT(a.id), 0), 1) AS porcentaje_asistencia
FROM eventos e
LEFT JOIN asistencias a ON a.evento_id = e.id
WHERE e.estado <> 'cancelado'
GROUP BY e.id;

-- Participación por ministerio
CREATE VIEW IF NOT EXISTS v_participacion_ministerio AS
SELECT
  m.id                AS ministerio_id,
  m.nombre            AS ministerio,
  u.nombre            AS coordinador,
  (SELECT COUNT(*) FROM ministerio_miembros mm
     WHERE mm.ministerio_id = m.id AND mm.activo = 1)            AS integrantes_activos,
  (SELECT COUNT(*) FROM eventos e
     WHERE e.ministerio_id = m.id AND e.estado <> 'cancelado')    AS actividades,
  (SELECT ROUND(100.0 * SUM(a.presente) / NULLIF(COUNT(a.id), 0), 1)
     FROM asistencias a JOIN eventos e ON e.id = a.evento_id
     WHERE e.ministerio_id = m.id)                                AS porcentaje_asistencia
FROM ministerios m
LEFT JOIN usuarios u ON u.id = m.coordinador_id
WHERE m.activo = 1;

-- Ingresos por mes, concepto y método  (SOLO Administrador y Tesorero)
CREATE VIEW IF NOT EXISTS v_ingresos_mensuales AS
SELECT
  strftime('%Y-%m', fecha)      AS mes,
  concepto,
  metodo,
  COUNT(*)                      AS num_aportaciones,
  SUM(CASE WHEN miembro_id IS NULL THEN 1 ELSE 0 END) AS anonimas,
  SUM(monto_centavos)           AS total_centavos,
  SUM(monto_centavos) / 100.0   AS total
FROM donaciones
GROUP BY mes, concepto, metodo;

-- Altas y bajas de miembros por mes
CREATE VIEW IF NOT EXISTS v_movimiento_miembros AS
SELECT mes, SUM(altas) AS altas, SUM(bajas) AS bajas
FROM (
  SELECT strftime('%Y-%m', fecha_ingreso) AS mes, 1 AS altas, 0 AS bajas FROM miembros
  UNION ALL
  SELECT strftime('%Y-%m', fecha_baja), 0, 1 FROM miembros WHERE fecha_baja IS NOT NULL
)
GROUP BY mes;
