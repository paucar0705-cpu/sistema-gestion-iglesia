// RF-02  Gestión de miembros
// Consultas y validación del módulo. Las vistas pertenecen a Persona 1.

const db = require('../db/connection');
const { ROLES } = require('../config/permisos');

const LIMITES = {
  nombre: 100,
  apellidos: 150,
  telefono: 30,
  correo: 254,
  busqueda: 200,
};

const ESTADOS = new Set(['activos', 'inactivos', 'todos']);
const ROLES_EDICION = [ROLES.ADMIN, ROLES.SECRETARIO];
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizarTexto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function puedeEditar(req) {
  const rol = req.session && req.session.usuario && req.session.usuario.rol;
  return ROLES_EDICION.includes(rol);
}

function obtenerId(valor) {
  if (typeof valor !== 'string' || !/^\d+$/.test(valor)) return null;
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function fechaISOValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

function validarDatos(datos = {}) {
  const miembro = {
    nombre: normalizarTexto(datos.nombre),
    apellidos: normalizarTexto(datos.apellidos),
    telefono: normalizarTexto(datos.telefono),
    correo: normalizarTexto(datos.correo),
    fecha_ingreso: normalizarTexto(datos.fecha_ingreso),
  };
  const errores = [];

  if (!miembro.nombre) {
    errores.push('El nombre es obligatorio.');
  } else if (miembro.nombre.length > LIMITES.nombre) {
    errores.push(`El nombre no puede exceder ${LIMITES.nombre} caracteres.`);
  }

  if (miembro.apellidos.length > LIMITES.apellidos) {
    errores.push(`Los apellidos no pueden exceder ${LIMITES.apellidos} caracteres.`);
  }

  if (miembro.telefono.length > LIMITES.telefono) {
    errores.push(`El teléfono no puede exceder ${LIMITES.telefono} caracteres.`);
  }

  if (miembro.correo.length > LIMITES.correo) {
    errores.push(`El correo no puede exceder ${LIMITES.correo} caracteres.`);
  } else if (miembro.correo && !REGEX_CORREO.test(miembro.correo)) {
    errores.push('Ingresa un correo electrónico válido.');
  }

  if (!miembro.fecha_ingreso) {
    errores.push('La fecha de ingreso es obligatoria.');
  } else if (!fechaISOValida(miembro.fecha_ingreso)) {
    errores.push('La fecha de ingreso debe ser una fecha válida en formato YYYY-MM-DD.');
  }

  return { miembro, errores };
}

function escaparLike(valor) {
  return valor.replace(/[\\%_]/g, '\\$&');
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Miembro no encontrado',
    mensaje: 'El miembro solicitado no existe.',
  });
}

function buscarPorId(id) {
  return db.prepare(`
    SELECT id, nombre, apellidos, telefono, correo, fecha_ingreso, activo, fecha_baja
    FROM miembros
    WHERE id = ?
  `).get(id);
}

function listar(req, res) {
  const q = normalizarTexto(req.query.q).slice(0, LIMITES.busqueda);
  const estadoSolicitado = normalizarTexto(req.query.estado);
  const estado = ESTADOS.has(estadoSolicitado) ? estadoSolicitado : 'activos';
  const condiciones = [];
  const parametros = [];

  if (q) {
    const patron = `%${escaparLike(q)}%`;
    condiciones.push(`(
      nombre LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR apellidos LIKE ? ESCAPE '\\' COLLATE NOCASE
      OR (nombre || ' ' || COALESCE(apellidos, '')) LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`);
    parametros.push(patron, patron, patron);
  }

  if (estado !== 'todos') {
    condiciones.push('activo = ?');
    parametros.push(estado === 'activos' ? 1 : 0);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const miembros = db.prepare(`
    SELECT id, nombre, apellidos, telefono, correo, fecha_ingreso, activo
    FROM miembros
    ${where}
    ORDER BY nombre COLLATE NOCASE, apellidos COLLATE NOCASE, id
  `).all(...parametros);

  return res.render('miembros/lista', {
    miembros,
    q,
    estado,
    puedeEditar: puedeEditar(req),
  });
}

function mostrarNuevo(req, res) {
  return res.render('miembros/formulario', {
    miembro: null,
    errores: [],
    puedeEditar: puedeEditar(req),
  });
}

function mostrarEditar(req, res) {
  const id = obtenerId(req.params.id);
  if (!id) return responderNoEncontrado(res);

  const miembro = buscarPorId(id);
  if (!miembro) return responderNoEncontrado(res);

  return res.render('miembros/formulario', {
    miembro,
    errores: [],
    puedeEditar: puedeEditar(req),
  });
}

function crear(req, res) {
  const { miembro, errores } = validarDatos(req.body);
  if (errores.length) {
    return res.status(422).render('miembros/formulario', {
      miembro,
      errores,
      puedeEditar: puedeEditar(req),
    });
  }

  db.prepare(`
    INSERT INTO miembros (nombre, apellidos, telefono, correo, fecha_ingreso)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    miembro.nombre,
    miembro.apellidos || null,
    miembro.telefono || null,
    miembro.correo || null,
    miembro.fecha_ingreso,
  );

  return res.redirect('/miembros');
}

function actualizar(req, res) {
  const id = obtenerId(req.params.id);
  if (!id) return responderNoEncontrado(res);

  const existente = buscarPorId(id);
  if (!existente) return responderNoEncontrado(res);

  const { miembro, errores } = validarDatos(req.body);
  miembro.id = id;

  if (errores.length) {
    return res.status(422).render('miembros/formulario', {
      miembro,
      errores,
      puedeEditar: puedeEditar(req),
    });
  }

  db.prepare(`
    UPDATE miembros
    SET nombre = ?, apellidos = ?, telefono = ?, correo = ?, fecha_ingreso = ?,
        actualizado_en = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    miembro.nombre,
    miembro.apellidos || null,
    miembro.telefono || null,
    miembro.correo || null,
    miembro.fecha_ingreso,
    id,
  );

  return res.redirect('/miembros');
}

function desactivar(req, res) {
  const id = obtenerId(req.params.id);
  if (!id) return responderNoEncontrado(res);

  const miembro = buscarPorId(id);
  if (!miembro) return responderNoEncontrado(res);

  if (miembro.activo === 1) {
    db.prepare(`
      UPDATE miembros
      SET activo = 0,
          fecha_baja = date('now', 'localtime'),
          actualizado_en = datetime('now', 'localtime')
      WHERE id = ? AND activo = 1
    `).run(id);
  }

  return res.redirect('/miembros');
}

module.exports = {
  listar,
  mostrarNuevo,
  mostrarEditar,
  crear,
  actualizar,
  desactivar,
};
