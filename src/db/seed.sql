-- =====================================================================
--  Datos iniciales y de PRUEBA
--  Responsable: Persona 3 (Base de datos)
--
--  Todos los usuarios de prueba tienen la contraseña:  Iglesia2026!
--  (hash bcrypt incluido abajo). Cambiarla antes de una entrega real.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------- Datos obligatorios ----------------
INSERT INTO roles (id, nombre) VALUES
  (1, 'Administrador'),
  (2, 'Pastor'),
  (3, 'Secretario'),
  (4, 'Tesorero'),
  (5, 'Coordinador');

INSERT INTO configuracion_iglesia (id, nombre, direccion, telefono, correo, horarios) VALUES
  (1, 'Iglesia Comunidad de Fe', 'Calle 60 #123, Centro', '999 123 4567',
   'contacto@iglesia.test', 'Domingo 10:00 culto general; Miércoles 19:00 estudio bíblico; Sábado 17:00 jóvenes');

-- ---------------- Miembros de prueba ----------------
INSERT INTO miembros (id, nombre, apellidos, telefono, correo, fecha_ingreso, activo, fecha_baja) VALUES
  (1,  'Juan',      'Pérez Gómez',     '9991000001', 'juan.perez@correo.test',     '2023-02-12', 1, NULL),
  (2,  'María',     'López Canul',     '9991000002', 'maria.lopez@correo.test',    '2023-05-07', 1, NULL),
  (3,  'Carlos',    'Ramírez Pech',    '9991000003', 'carlos.ramirez@correo.test', '2024-01-14', 1, NULL),
  (4,  'Ana',       'Martínez Chan',   '9991000004', 'ana.martinez@correo.test',   '2024-03-03', 1, NULL),
  (5,  'Luis',      'Hernández May',   '9991000005', NULL,                         '2024-06-16', 1, NULL),
  (6,  'Sofía',     'García Uc',       '9991000006', 'sofia.garcia@correo.test',   '2024-09-01', 1, NULL),
  (7,  'Pedro',     'Sánchez Dzul',    '9991000007', NULL,                         '2025-01-19', 1, NULL),
  (8,  'Laura',     'Torres Cauich',   '9991000008', 'laura.torres@correo.test',   '2025-04-27', 1, NULL),
  (9,  'Diego',     'Flores Ek',       '9991000009', 'diego.flores@correo.test',   '2025-08-10', 1, NULL),
  (10, 'Valeria',   'Cruz Poot',       '9991000010', NULL,                         '2026-02-08', 1, NULL),
  (11, 'Jorge',     'Morales Tun',     '9991000011', 'jorge.morales@correo.test',  '2026-07-05', 1, NULL),
  (12, 'Gabriela',  'Ruiz Couoh',      '9991000012', 'gabriela.ruiz@correo.test',  '2026-09-13', 1, NULL),
  (13, 'Ricardo',   'Vázquez Kú',      '9991000013', NULL,                         '2023-08-20', 0, '2026-06-30'),
  (14, 'Elena',     'Castillo Balam',  '9991000014', 'elena.castillo@correo.test', '2024-11-17', 0, '2026-09-15');

-- ---------------- Usuarios de prueba (uno por rol) ----------------
-- Contraseña de todos: Iglesia2026!
INSERT INTO usuarios (id, nombre, correo, password_hash, rol_id, miembro_id) VALUES
  (1, 'Admin General',      'admin@iglesia.test',       '$2b$10$O0Mx7xQTSGLzVPZcPcxqLOespwhkkH1yZYqH4gIaGLqDTLeSAzbhy', 1, NULL),
  (2, 'Pastor Juan Pérez',  'pastor@iglesia.test',      '$2b$10$O0Mx7xQTSGLzVPZcPcxqLOespwhkkH1yZYqH4gIaGLqDTLeSAzbhy', 2, 1),
  (3, 'María López',        'secretario@iglesia.test',  '$2b$10$O0Mx7xQTSGLzVPZcPcxqLOespwhkkH1yZYqH4gIaGLqDTLeSAzbhy', 3, 2),
  (4, 'Carlos Ramírez',     'tesorero@iglesia.test',    '$2b$10$O0Mx7xQTSGLzVPZcPcxqLOespwhkkH1yZYqH4gIaGLqDTLeSAzbhy', 4, 3),
  (5, 'Ana Martínez',       'coordinador@iglesia.test', '$2b$10$O0Mx7xQTSGLzVPZcPcxqLOespwhkkH1yZYqH4gIaGLqDTLeSAzbhy', 5, 4);

-- ---------------- Ministerios ----------------
INSERT INTO ministerios (id, nombre, descripcion, coordinador_id) VALUES
  (1, 'Música',     'Alabanza y adoración en los cultos',      5),
  (2, 'Jóvenes',    'Reuniones y actividades para jóvenes',    5),
  (3, 'Niños',      'Escuela dominical infantil',              NULL),
  (4, 'Enseñanza',  'Estudios bíblicos y discipulado',         2),
  (5, 'Servicio',   'Bienvenida, limpieza y logística',        3);

INSERT INTO ministerio_miembros (ministerio_id, miembro_id, fecha_union, fecha_salida, activo) VALUES
  (1, 4, '2024-03-10', NULL, 1), (1, 6, '2024-09-08', NULL, 1), (1, 9, '2025-08-17', NULL, 1),
  (2, 6, '2024-09-08', NULL, 1), (2, 9, '2025-08-17', NULL, 1), (2, 10, '2026-02-15', NULL, 1),
  (2, 11, '2026-07-12', NULL, 1), (2, 13, '2023-09-01', '2026-06-30', 0),
  (3, 8, '2025-05-04', NULL, 1), (3, 2, '2023-06-01', NULL, 1),
  (4, 1, '2023-02-12', NULL, 1), (4, 3, '2024-02-01', NULL, 1), (4, 7, '2025-02-02', NULL, 1),
  (5, 5, '2024-06-23', NULL, 1), (5, 7, '2025-01-26', NULL, 1), (5, 12, '2026-09-20', NULL, 1);

-- ---------------- Eventos ----------------
INSERT INTO eventos (id, titulo, tipo, fecha, hora, lugar, descripcion, responsable_id, ministerio_id, estado, creado_por) VALUES
  (1,  'Culto dominical',          'culto',          '2026-09-27', '10:00', 'Templo principal', NULL,                         1, NULL, 'realizado',  3),
  (2,  'Culto dominical',          'culto',          '2026-10-04', '10:00', 'Templo principal', NULL,                         1, NULL, 'realizado',  3),
  (3,  'Culto dominical',          'culto',          '2026-10-11', '10:00', 'Templo principal', NULL,                         1, NULL, 'realizado',  3),
  (4,  'Reunión de jóvenes',       'reunion',        '2026-10-17', '17:00', 'Salón anexo',      'Tema: propósito',            6, 2,    'realizado',  5),
  (5,  'Culto dominical',          'culto',          '2026-10-18', '10:00', 'Templo principal', NULL,                         1, NULL, 'realizado',  3),
  (6,  'Estudio bíblico',          'reunion',        '2026-10-21', '19:00', 'Salón anexo',      'Libro de Hechos',            3, 4,    'realizado',  3),
  (7,  'Culto dominical',          'culto',          '2026-10-25', '10:00', 'Templo principal', NULL,                         1, NULL, 'programado', 3),
  (8,  'Ensayo de alabanza',       'actividad',      '2026-10-29', '18:00', 'Templo principal', NULL,                         4, 1,    'programado', 5),
  (9,  'Junta de líderes',         'administrativo', '2026-10-30', '19:30', 'Oficina',          'Planeación de noviembre',    1, NULL, 'programado', 3),
  (10, 'Culto dominical',          'culto',          '2026-11-01', '10:00', 'Templo principal', NULL,                         1, NULL, 'programado', 3),
  (11, 'Convivio de jóvenes',      'actividad',      '2026-11-07', '16:00', 'Parque de la colonia', NULL,                     9, 2,    'programado', 5),
  (12, 'Campaña de limpieza',      'actividad',      '2026-10-24', '08:00', 'Templo principal', 'Cancelada por lluvia',       5, 5,    'cancelado',  3);

-- ---------------- Asistencias (una fila por miembro activo, presente o ausente) ----------------
-- Cultos: se registran todos los miembros activos
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 1, id, CASE WHEN id % 4 = 0 THEN 0 ELSE 1 END, 3 FROM miembros WHERE activo = 1 AND fecha_ingreso <= '2026-09-27';
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 2, id, CASE WHEN id % 5 = 0 THEN 0 ELSE 1 END, 3 FROM miembros WHERE activo = 1;
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 3, id, CASE WHEN id % 3 = 0 THEN 0 ELSE 1 END, 3 FROM miembros WHERE activo = 1;
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 5, id, CASE WHEN id IN (7, 11) THEN 0 ELSE 1 END, 3 FROM miembros WHERE activo = 1;
-- Reuniones de ministerio: solo sus integrantes
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 4, miembro_id, CASE WHEN miembro_id = 10 THEN 0 ELSE 1 END, 5
  FROM ministerio_miembros WHERE ministerio_id = 2 AND activo = 1;
INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por)
  SELECT 6, miembro_id, 1, 3 FROM ministerio_miembros WHERE ministerio_id = 4 AND activo = 1;

-- ---------------- Donaciones (miembro_id NULL = anónima) ----------------
INSERT INTO donaciones (fecha, monto_centavos, concepto, metodo, descripcion, miembro_id, registrado_por) VALUES
  ('2026-08-02', 150000, 'diezmo',            'transferencia', NULL,                      1,    4),
  ('2026-08-02',  85050, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-08-16',  50000, 'diezmo',            'efectivo',      NULL,                      5,    4),
  ('2026-08-30',  92000, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-09-06', 150000, 'diezmo',            'transferencia', NULL,                      1,    4),
  ('2026-09-06',  78500, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-09-13', 300000, 'donacion_especial', 'transferencia', 'Para reparación del techo', NULL, 4),
  ('2026-09-20',  60000, 'diezmo',            'tarjeta',       NULL,                      8,    4),
  ('2026-09-27',  88000, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-10-04', 150000, 'diezmo',            'transferencia', NULL,                      1,    4),
  ('2026-10-04',  95500, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-10-11',  40000, 'diezmo',            'efectivo',      NULL,                      9,    4),
  ('2026-10-11',  81000, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4),
  ('2026-10-18', 100000, 'donacion_especial', 'efectivo',      'Convivio de jóvenes',     6,    4),
  ('2026-10-18',  90250, 'ofrenda',           'efectivo',      'Ofrenda culto dominical', NULL, 4);

-- ---------------- Anuncios ----------------
INSERT INTO anuncios (titulo, contenido, fecha_publicacion, importante, autor_id) VALUES
  ('Cambio de horario',     'A partir de noviembre el culto dominical será a las 10:30.', '2026-10-20', 1, 2),
  ('Convivio de jóvenes',   'Todos los jóvenes están invitados el sábado 7 de noviembre.', '2026-10-21', 0, 3),
  ('Campaña de limpieza',   'La campaña del 24 de octubre se reprogramará.',                '2026-10-23', 0, 3);
