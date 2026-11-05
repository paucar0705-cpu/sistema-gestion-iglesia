'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { after, test } = require('node:test');

const raiz = path.resolve(__dirname, '..');
const baseLocal = path.resolve(raiz, 'data', 'iglesia.db');
const rutaTemporal = path.join(os.tmpdir(), `iglesia-rf05-${randomUUID()}.sqlite`);
const dbPathAnterior = process.env.DB_PATH;

assert.notEqual(path.resolve(rutaTemporal), baseLocal);
assert.equal(path.dirname(path.resolve(rutaTemporal)), path.resolve(os.tmpdir()));

const inicial = new DatabaseSync(rutaTemporal);
inicial.exec(fs.readFileSync(path.join(raiz, 'src', 'db', 'schema.sql'), 'utf8'));
inicial.exec(fs.readFileSync(path.join(raiz, 'src', 'db', 'seed.sql'), 'utf8'));
inicial.close();

process.env.DB_PATH = rutaTemporal;

const db = require('../src/db/connection');
const controller = require('../src/controllers/ministerios.controller');
const router = require('../src/routes/ministerios.routes');
const { ROLES } = require('../src/config/permisos');

let limpio = false;
function limpiar() {
  if (limpio) return;
  limpio = true;

  try {
    db.close();
  } catch {
    // La conexión puede estar cerrada si la limpieza se invoca por segunda vez.
  }

  for (const archivo of [rutaTemporal, `${rutaTemporal}-wal`, `${rutaTemporal}-shm`]) {
    try {
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
    } catch {
      // No ocultar el resultado de las pruebas por un archivo auxiliar ya eliminado.
    }
  }

  if (dbPathAnterior === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = dbPathAnterior;
}

after(limpiar);
process.once('exit', limpiar);

function solicitud(rol, opciones = {}) {
  return {
    session: { usuario: { id: opciones.usuarioId || 1, rol } },
    params: opciones.params || {},
    query: opciones.query || {},
    body: opciones.body || {},
  };
}

function respuesta() {
  return {
    statusCode: 200,
    vista: null,
    datos: null,
    redireccion: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    render(vista, datos) {
      this.vista = vista;
      this.datos = datos;
      return this;
    },
    redirect(destino) {
      this.statusCode = 302;
      this.redireccion = destino;
      return this;
    },
  };
}

function ejecutar(metodo, rol, opciones = {}) {
  const req = solicitud(rol, opciones);
  const res = respuesta();
  let errorSiguiente;
  controller[metodo](req, res, (error) => {
    errorSiguiente = error;
  });
  if (errorSiguiente) throw errorSiguiente;
  return res;
}

function claves(objeto) {
  return Object.keys(objeto).sort();
}

let ministerioCreadoId;

test('expone exactamente las rutas previstas y protege todas las mutaciones', () => {
  const rutas = router.stack
    .filter((capa) => capa.route)
    .map((capa) => ({
      metodo: Object.keys(capa.route.methods)[0].toUpperCase(),
      ruta: capa.route.path,
      manejadores: capa.route.stack.length,
    }));

  assert.deepEqual(rutas, [
    { metodo: 'GET', ruta: '/', manejadores: 1 },
    { metodo: 'GET', ruta: '/nuevo', manejadores: 2 },
    { metodo: 'POST', ruta: '/', manejadores: 2 },
    { metodo: 'GET', ruta: '/:id/editar', manejadores: 2 },
    { metodo: 'POST', ruta: '/:id/desactivar', manejadores: 2 },
    { metodo: 'POST', ruta: '/:id/reactivar', manejadores: 2 },
    { metodo: 'POST', ruta: '/:id/integrantes', manejadores: 2 },
    { metodo: 'POST', ruta: '/:id/integrantes/:mid/baja', manejadores: 2 },
    { metodo: 'POST', ruta: '/:id', manejadores: 2 },
    { metodo: 'GET', ruta: '/:id', manejadores: 1 },
  ]);

  const capaSeccion = router.stack.find((capa) => !capa.route);
  for (const rol of [ROLES.ADMIN, ROLES.PASTOR, ROLES.COORDINADOR]) {
    let continuo = false;
    capaSeccion.handle(solicitud(rol), respuesta(), () => { continuo = true; });
    assert.equal(continuo, true, `${rol} debe entrar a la sección`);
  }
  for (const rol of [ROLES.SECRETARIO, ROLES.TESORERO]) {
    const res = respuesta();
    capaSeccion.handle(solicitud(rol), res, () => assert.fail('No debe continuar'));
    assert.equal(res.statusCode, 403);
  }

  const capaCrear = router.stack.find(
    (capa) => capa.route && capa.route.path === '/' && capa.route.methods.post,
  );
  let administradorContinuo = false;
  capaCrear.route.stack[0].handle(
    solicitud(ROLES.ADMIN),
    respuesta(),
    () => { administradorContinuo = true; },
  );
  assert.equal(administradorContinuo, true);

  const resPastor = respuesta();
  capaCrear.route.stack[0].handle(
    solicitud(ROLES.PASTOR),
    resPastor,
    () => assert.fail('Pastor no debe modificar'),
  );
  assert.equal(resPastor.statusCode, 403);
});

test('aplica acceso de consulta a los cinco roles y aísla al Coordinador', () => {
  const admin = ejecutar('listar', ROLES.ADMIN);
  assert.equal(admin.vista, 'ministerios/lista');
  assert.deepEqual(claves(admin.datos), ['errores', 'estado', 'ministerios', 'puedeEditar']);
  assert.equal(admin.datos.ministerios.length, 5);
  assert.equal(admin.datos.puedeEditar, true);

  const pastor = ejecutar('listar', ROLES.PASTOR, { usuarioId: 2 });
  assert.equal(pastor.statusCode, 200);
  assert.equal(pastor.datos.ministerios.length, 5);
  assert.equal(pastor.datos.puedeEditar, false);

  const coordinador = ejecutar('listar', ROLES.COORDINADOR, { usuarioId: 5 });
  assert.deepEqual(coordinador.datos.ministerios.map((item) => item.id), [2, 1]);
  assert.equal(coordinador.datos.puedeEditar, false);
  assert.equal(
    ejecutar('listar', ROLES.COORDINADOR, { usuarioId: 2 }).statusCode,
    403,
    'El rol guardado en sesión debe coincidir con el rol activo de la base',
  );

  for (const rol of [ROLES.SECRETARIO, ROLES.TESORERO]) {
    assert.equal(ejecutar('listar', rol).statusCode, 403);
  }

  assert.equal(
    ejecutar('listar', ROLES.PASTOR, { query: { estado: 'todos' } }).statusCode,
    403,
  );
  assert.equal(
    ejecutar('listar', ROLES.ADMIN, { query: { estado: 'desconocido' } }).statusCode,
    422,
  );
});

test('consulta detalle, integrantes, historial y actividades con el contrato esperado', () => {
  const detalle = ejecutar('detalle', ROLES.ADMIN, { params: { id: '2' } });
  assert.equal(detalle.vista, 'ministerios/detalle');
  assert.deepEqual(claves(detalle.datos), [
    'actividades',
    'errores',
    'incluirHistorial',
    'integrantes',
    'miembrosDisponibles',
    'ministerio',
    'puedeEditar',
    'puedeReactivar',
  ]);
  assert.deepEqual(detalle.datos.integrantes.map((item) => item.miembro_id), [9, 11, 6, 10]);
  assert.deepEqual(detalle.datos.actividades.map((item) => item.id), [11, 4]);
  assert.equal(detalle.datos.puedeEditar, true);

  const historial = ejecutar('detalle', ROLES.PASTOR, {
    usuarioId: 2,
    params: { id: '2' },
    query: { historial: '1' },
  });
  assert.equal(historial.datos.incluirHistorial, true);
  assert.equal(historial.datos.integrantes.some((item) => item.miembro_id === 13), true);
  assert.deepEqual(historial.datos.miembrosDisponibles, []);

  assert.equal(
    ejecutar('detalle', ROLES.COORDINADOR, {
      usuarioId: 5,
      params: { id: '1' },
    }).statusCode,
    200,
  );
  assert.equal(
    ejecutar('detalle', ROLES.COORDINADOR, {
      usuarioId: 5,
      params: { id: '3' },
    }).statusCode,
    403,
  );
  assert.equal(ejecutar('detalle', ROLES.SECRETARIO, { params: { id: '1' } }).statusCode, 403);
  assert.equal(ejecutar('detalle', ROLES.ADMIN, { params: { id: 'x' } }).statusCode, 404);
  assert.equal(ejecutar('detalle', ROLES.ADMIN, { params: { id: '999' } }).statusCode, 404);
  assert.equal(
    ejecutar('detalle', ROLES.ADMIN, {
      params: { id: '1' },
      query: { historial: 'si' },
    }).statusCode,
    422,
  );
});

test('prepara el formulario y valida la creación de ministerios', () => {
  const nuevo = ejecutar('mostrarNuevo', ROLES.ADMIN);
  assert.equal(nuevo.vista, 'ministerios/formulario');
  assert.deepEqual(claves(nuevo.datos), [
    'coordinadores',
    'errores',
    'ministerio',
    'modo',
    'puedeEditar',
  ]);
  assert.equal(nuevo.datos.modo, 'nuevo');
  assert.equal(nuevo.datos.coordinadores.length, 5);

  const invalidos = ejecutar('crear', ROLES.ADMIN, {
    body: {
      nombre: '   ',
      descripcion: 'x'.repeat(2001),
      coordinador_id: 'abc',
    },
  });
  assert.equal(invalidos.statusCode, 422);
  assert.equal(invalidos.datos.errores.length, 3);

  const duplicado = ejecutar('crear', ROLES.ADMIN, {
    body: { nombre: '  MÚSICA  ', descripcion: '', coordinador_id: '' },
  });
  assert.equal(duplicado.statusCode, 422);
  assert.match(duplicado.datos.errores.join(' '), /existe/i);

  const coordinadorInvalido = ejecutar('crear', ROLES.ADMIN, {
    body: { nombre: 'Hospitalidad temporal', coordinador_id: '999' },
  });
  assert.equal(coordinadorInvalido.statusCode, 422);
  assert.match(coordinadorInvalido.datos.errores.join(' '), /coordinador/i);

  const totalAntes = db.prepare('SELECT COUNT(*) AS total FROM ministerios').get().total;
  assert.equal(
    ejecutar('crear', ROLES.PASTOR, {
      body: { nombre: 'No autorizado', coordinador_id: '' },
    }).statusCode,
    403,
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM ministerios').get().total, totalAntes);

  const creado = ejecutar('crear', ROLES.ADMIN, {
    body: {
      nombre: '  Hospitalidad  ',
      descripcion: 'Recepción y acompañamiento',
      coordinador_id: '5',
    },
  });
  assert.equal(creado.statusCode, 302);
  ministerioCreadoId = Number(creado.redireccion.split('/').pop());
  const fila = db.prepare('SELECT * FROM ministerios WHERE id = ?').get(ministerioCreadoId);
  assert.equal(fila.nombre, 'Hospitalidad');
  assert.equal(fila.coordinador_id, 5);
});

test('edita ministerios y rechaza cambios inválidos o no autorizados', () => {
  const formulario = ejecutar('mostrarEditar', ROLES.ADMIN, {
    params: { id: String(ministerioCreadoId) },
  });
  assert.equal(formulario.datos.modo, 'editar');
  assert.equal(formulario.datos.ministerio.nombre, 'Hospitalidad');

  const editado = ejecutar('actualizar', ROLES.ADMIN, {
    params: { id: String(ministerioCreadoId) },
    body: {
      nombre: 'Hospitalidad y Visita',
      descripcion: 'Recepción, acompañamiento y visitas',
      coordinador_id: '2',
    },
  });
  assert.equal(editado.redireccion, `/ministerios/${ministerioCreadoId}`);
  const fila = db.prepare('SELECT * FROM ministerios WHERE id = ?').get(ministerioCreadoId);
  assert.equal(fila.nombre, 'Hospitalidad y Visita');
  assert.equal(fila.coordinador_id, 2);

  assert.equal(
    ejecutar('actualizar', ROLES.COORDINADOR, {
      usuarioId: 2,
      params: { id: String(ministerioCreadoId) },
      body: { nombre: 'Intento', coordinador_id: '' },
    }).statusCode,
    403,
  );
  assert.equal(
    ejecutar('actualizar', ROLES.ADMIN, {
      params: { id: '999' },
      body: { nombre: 'Inexistente', coordinador_id: '' },
    }).statusCode,
    404,
  );
});

test('desactiva y reactiva lógicamente sin permitir operaciones inconsistentes', () => {
  assert.equal(
    ejecutar('desactivar', ROLES.PASTOR, {
      params: { id: String(ministerioCreadoId) },
    }).statusCode,
    403,
  );

  const baja = ejecutar('desactivar', ROLES.ADMIN, {
    params: { id: String(ministerioCreadoId) },
  });
  assert.equal(baja.redireccion, '/ministerios?estado=inactivos');
  assert.equal(
    db.prepare('SELECT activo FROM ministerios WHERE id = ?').get(ministerioCreadoId).activo,
    0,
  );

  assert.equal(
    ejecutar('mostrarEditar', ROLES.ADMIN, {
      params: { id: String(ministerioCreadoId) },
    }).statusCode,
    422,
  );
  assert.equal(
    ejecutar('agregarIntegrante', ROLES.ADMIN, {
      params: { id: String(ministerioCreadoId) },
      body: { miembro_id: '1' },
    }).statusCode,
    422,
  );
  assert.equal(
    ejecutar('detalle', ROLES.PASTOR, {
      params: { id: String(ministerioCreadoId) },
    }).statusCode,
    403,
  );

  const inactivos = ejecutar('listar', ROLES.ADMIN, { query: { estado: 'inactivos' } });
  assert.equal(inactivos.datos.ministerios.some((item) => item.id === ministerioCreadoId), true);

  const alta = ejecutar('reactivar', ROLES.ADMIN, {
    params: { id: String(ministerioCreadoId) },
  });
  assert.equal(alta.redireccion, `/ministerios/${ministerioCreadoId}`);
  assert.equal(
    db.prepare('SELECT activo FROM ministerios WHERE id = ?').get(ministerioCreadoId).activo,
    1,
  );
  assert.equal(
    ejecutar('reactivar', ROLES.ADMIN, {
      params: { id: String(ministerioCreadoId) },
    }).statusCode,
    422,
  );
});

test('agrega y retira integrantes con baja lógica, historial y control de duplicados', () => {
  assert.equal(
    ejecutar('agregarIntegrante', ROLES.PASTOR, {
      params: { id: '3' },
      body: { miembro_id: '1' },
    }).statusCode,
    403,
  );
  assert.equal(
    ejecutar('agregarIntegrante', ROLES.ADMIN, {
      params: { id: '3' },
      body: { miembro_id: 'abc' },
    }).statusCode,
    422,
  );
  assert.equal(
    ejecutar('agregarIntegrante', ROLES.ADMIN, {
      params: { id: '3' },
      body: { miembro_id: '13' },
    }).statusCode,
    422,
  );

  const agregado = ejecutar('agregarIntegrante', ROLES.ADMIN, {
    params: { id: '3' },
    body: { miembro_id: '1' },
  });
  assert.equal(agregado.redireccion, '/ministerios/3');
  assert.equal(
    db.prepare(`
      SELECT COUNT(*) AS total
      FROM ministerio_miembros
      WHERE ministerio_id = ? AND miembro_id = ? AND activo = 1
    `).get(3, 1).total,
    1,
  );

  assert.equal(
    ejecutar('agregarIntegrante', ROLES.ADMIN, {
      params: { id: '3' },
      body: { miembro_id: '1' },
    }).statusCode,
    422,
  );

  const retirado = ejecutar('quitarIntegrante', ROLES.ADMIN, {
    params: { id: '3', mid: '1' },
  });
  assert.equal(retirado.redireccion, '/ministerios/3?historial=1');
  const baja = db.prepare(`
    SELECT activo, fecha_salida
    FROM ministerio_miembros
    WHERE ministerio_id = ? AND miembro_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(3, 1);
  assert.equal(baja.activo, 0);
  assert.match(baja.fecha_salida, /^\d{4}-\d{2}-\d{2}$/);

  const historial = ejecutar('detalle', ROLES.ADMIN, {
    params: { id: '3' },
    query: { historial: '1' },
  });
  assert.equal(
    historial.datos.integrantes.some(
      (item) => item.miembro_id === 1 && item.activo === 0 && item.fecha_salida,
    ),
    true,
  );
  assert.equal(
    ejecutar('quitarIntegrante', ROLES.ADMIN, {
      params: { id: '3', mid: '1' },
    }).statusCode,
    422,
  );
});
