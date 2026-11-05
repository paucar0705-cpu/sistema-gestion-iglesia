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
const rutaTemporal = path.join(os.tmpdir(), `iglesia-rf06-${randomUUID()}.sqlite`);
const dbPathAnterior = process.env.DB_PATH;
let db;
let limpio = false;

assert.notEqual(path.resolve(rutaTemporal), baseLocal);
assert.equal(path.dirname(path.resolve(rutaTemporal)), path.resolve(os.tmpdir()));

function limpiar() {
  if (limpio) return;
  limpio = true;

  try {
    if (db) db.close();
  } catch {
    // La conexión puede estar cerrada si la limpieza ya comenzó.
  }

  for (const archivo of [rutaTemporal, `${rutaTemporal}-wal`, `${rutaTemporal}-shm`]) {
    try {
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
    } catch {
      // Solo se intentan borrar los tres archivos temporales con nombre conocido.
    }
  }

  if (dbPathAnterior === undefined) delete process.env.DB_PATH;
  else process.env.DB_PATH = dbPathAnterior;
}

after(limpiar);
process.once('exit', limpiar);

const inicial = new DatabaseSync(rutaTemporal);
inicial.exec(fs.readFileSync(path.join(raiz, 'src', 'db', 'schema.sql'), 'utf8'));
inicial.exec(fs.readFileSync(path.join(raiz, 'src', 'db', 'seed.sql'), 'utf8'));
inicial.close();

process.env.DB_PATH = rutaTemporal;

db = require('../src/db/connection');
const controller = require('../src/controllers/donaciones.controller');
const router = require('../src/routes/donaciones.routes');
const { ROLES } = require('../src/config/permisos');

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

function formularioValido(cambios = {}) {
  const hoy = db.prepare("SELECT date('now', 'localtime') AS hoy").get().hoy;
  return {
    fecha: hoy,
    monto: '125.50',
    concepto: 'ofrenda',
    metodo: 'efectivo',
    descripcion: '',
    miembro_id: '',
    ...cambios,
  };
}

test('expone solo las cinco rutas financieras y conserva los dos middlewares', () => {
  const rutas = router.stack
    .filter((capa) => capa.route)
    .map((capa) => ({
      metodo: Object.keys(capa.route.methods)[0].toUpperCase(),
      ruta: capa.route.path,
    }));

  assert.deepEqual(rutas, [
    { metodo: 'GET', ruta: '/' },
    { metodo: 'GET', ruta: '/nuevo' },
    { metodo: 'POST', ruta: '/' },
    { metodo: 'GET', ruta: '/resumen' },
    { metodo: 'GET', ruta: '/:id' },
  ]);
  assert.equal(rutas.some((ruta) => /editar|eliminar|borrar/.test(ruta.ruta)), false);

  const middlewares = router.stack.filter((capa) => !capa.route);
  assert.equal(middlewares.length, 2);

  for (const middleware of middlewares) {
    for (const [rol, usuarioId] of [[ROLES.ADMIN, 1], [ROLES.TESORERO, 4]]) {
      let continuo = false;
      middleware.handle(solicitud(rol, { usuarioId }), respuesta(), () => { continuo = true; });
      assert.equal(continuo, true, `${rol} debe superar la protección financiera`);
    }
    for (const [rol, usuarioId] of [
      [ROLES.PASTOR, 2],
      [ROLES.SECRETARIO, 3],
      [ROLES.COORDINADOR, 5],
    ]) {
      const res = respuesta();
      middleware.handle(
        solicitud(rol, { usuarioId }),
        res,
        () => assert.fail(`${rol} no debe superar la protección financiera`),
      );
      assert.equal(res.statusCode, 403);
    }
  }
});

test('limita consultas a Administrador y Tesorero y valida la identidad de sesión', () => {
  const query = { desde: '2026-11-01', hasta: '2026-11-02' };
  const admin = ejecutar('listar', ROLES.ADMIN, { usuarioId: 1, query });
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.vista, 'donaciones/index');
  assert.deepEqual(claves(admin.datos), [
    'conceptos',
    'donaciones',
    'errores',
    'filtros',
    'metodos',
    'totales',
  ]);

  const tesorero = ejecutar('listar', ROLES.TESORERO, { usuarioId: 4, query });
  assert.equal(tesorero.statusCode, 200);
  assert.equal(tesorero.datos.donaciones.length, 5);

  for (const [rol, usuarioId] of [
    [ROLES.PASTOR, 2],
    [ROLES.SECRETARIO, 3],
    [ROLES.COORDINADOR, 5],
  ]) {
    assert.equal(ejecutar('listar', rol, { usuarioId, query }).statusCode, 403);
  }

  assert.equal(
    ejecutar('listar', ROLES.TESORERO, { usuarioId: 2, query }).statusCode,
    403,
    'El rol de sesión debe coincidir con el rol activo del usuario',
  );
});

test('lista por periodo y aplica concepto, método y aportaciones anónimas', () => {
  const periodo = { desde: '2026-11-01', hasta: '2026-11-02' };
  const general = ejecutar('listar', ROLES.ADMIN, { usuarioId: 1, query: periodo });
  assert.equal(general.datos.donaciones.length, 5);
  assert.deepEqual({ ...general.datos.totales }, {
    aportaciones: 5,
    total_centavos: 377500,
    total: 3775,
    anonimas: 2,
  });

  const diezmos = ejecutar('listar', ROLES.ADMIN, {
    usuarioId: 1,
    query: { ...periodo, concepto: 'diezmo' },
  });
  assert.equal(diezmos.datos.donaciones.length, 3);
  assert.equal(diezmos.datos.totales.total_centavos, 265000);
  assert.equal(diezmos.datos.donaciones.every((fila) => fila.concepto === 'diezmo'), true);

  const efectivo = ejecutar('listar', ROLES.ADMIN, {
    usuarioId: 1,
    query: { ...periodo, metodo: 'efectivo' },
  });
  assert.equal(efectivo.datos.donaciones.length, 3);
  assert.equal(efectivo.datos.totales.total_centavos, 157500);

  const anonimas = ejecutar('listar', ROLES.TESORERO, {
    usuarioId: 4,
    query: { ...periodo, soloAnonimas: '1' },
  });
  assert.equal(anonimas.datos.donaciones.length, 2);
  assert.equal(anonimas.datos.totales.total_centavos, 112500);
  assert.equal(anonimas.datos.donaciones.every((fila) => fila.miembro_id === null), true);
});

test('rechaza filtros inválidos con HTTP 422', () => {
  const casos = [
    { desde: '2026-02-30', hasta: '2026-11-02' },
    { desde: '2026-11-03', hasta: '2026-11-02' },
    { desde: '2026-11-01', hasta: '2026-11-02', concepto: 'inyeccion' },
    { desde: '2026-11-01', hasta: '2026-11-02', metodo: 'cheque' },
    { desde: '2026-11-01', hasta: '2026-11-02', soloAnonimas: 'tal-vez' },
    { desde: ['2026-11-01', '2026-11-02'], hasta: '2026-11-02' },
  ];

  for (const query of casos) {
    const res = ejecutar('listar', ROLES.ADMIN, { usuarioId: 1, query });
    assert.equal(res.statusCode, 422);
    assert.equal(res.vista, 'donaciones/index');
    assert.equal(res.datos.donaciones.length, 0);
    assert.equal(res.datos.errores.length > 0, true);
  }
});

test('consulta detalle y prepara el formulario con donantes activos', () => {
  const nuevo = ejecutar('mostrarNuevo', ROLES.TESORERO, { usuarioId: 4 });
  assert.equal(nuevo.vista, 'donaciones/formulario');
  assert.deepEqual(claves(nuevo.datos), [
    'conceptos',
    'donacion',
    'donantes',
    'errores',
    'metodos',
  ]);
  assert.equal(nuevo.datos.donacion, null);
  assert.equal(nuevo.datos.donantes.length > 0, true);
  for (const donante of nuevo.datos.donantes) {
    assert.equal(db.prepare('SELECT activo FROM miembros WHERE id = ?').get(donante.id).activo, 1);
  }

  const id = db.prepare('SELECT id FROM donaciones ORDER BY id LIMIT 1').get().id;
  const detalle = ejecutar('detalle', ROLES.ADMIN, {
    usuarioId: 1,
    params: { id: String(id) },
  });
  assert.equal(detalle.vista, 'donaciones/detalle');
  assert.deepEqual(claves(detalle.datos), ['conceptos', 'donacion', 'metodos']);
  assert.equal(detalle.datos.donacion.id, id);
  assert.equal(ejecutar('detalle', ROLES.ADMIN, { usuarioId: 1, params: { id: 'x' } }).statusCode, 404);
  assert.equal(ejecutar('detalle', ROLES.ADMIN, { usuarioId: 1, params: { id: '999' } }).statusCode, 404);
  assert.equal(ejecutar('detalle', ROLES.PASTOR, { usuarioId: 2, params: { id: String(id) } }).statusCode, 403);
});

test('genera resumen mensual, desglose por concepto e ingresos del mes', () => {
  const res = ejecutar('resumen', ROLES.TESORERO, {
    usuarioId: 4,
    query: { desde: '2026-08-01', hasta: '2026-11-05' },
  });
  assert.equal(res.vista, 'donaciones/resumen');
  assert.deepEqual(claves(res.datos), [
    'conceptos',
    'errores',
    'filtros',
    'ingresosMes',
    'resumen',
  ]);
  assert.equal(res.datos.resumen.length, 4);
  const noviembre = res.datos.resumen.find((fila) => fila.mes === '2026-11');
  assert.deepEqual({ ...noviembre }, {
    mes: '2026-11',
    aportaciones: 5,
    total: 3775,
    diezmos: 2650,
    ofrendas: 875,
    especiales: 0,
    otros: 250,
    anonimas: 2,
  });
  assert.deepEqual({ ...res.datos.ingresosMes }, { total: 3775, aportaciones: 5 });

  const invalido = ejecutar('resumen', ROLES.ADMIN, {
    usuarioId: 1,
    query: { desde: '2026-12-01', hasta: '2026-11-01' },
  });
  assert.equal(invalido.statusCode, 422);
  assert.equal(invalido.vista, 'donaciones/resumen');
});

test('registra en pesos, almacena centavos y toma el usuario de la sesión', () => {
  const res = ejecutar('crear', ROLES.ADMIN, {
    usuarioId: 1,
    body: formularioValido({
      monto: '1,234.56',
      concepto: 'donacion_especial',
      metodo: 'transferencia',
      descripcion: 'Apoyo especial',
      miembro_id: '1',
      registradoPor: '999',
      registrado_por: '999',
    }),
  });
  assert.equal(res.statusCode, 302);
  const id = Number(res.redireccion.split('/').pop());
  const fila = db.prepare('SELECT * FROM donaciones WHERE id = ?').get(id);
  assert.equal(fila.monto_centavos, 123456);
  assert.equal(fila.miembro_id, 1);
  assert.equal(fila.registrado_por, 1);

  const anonima = ejecutar('crear', ROLES.TESORERO, {
    usuarioId: 4,
    body: formularioValido({ monto: '0.10', miembro_id: '' }),
  });
  const idAnonima = Number(anonima.redireccion.split('/').pop());
  const filaAnonima = db.prepare('SELECT * FROM donaciones WHERE id = ?').get(idAnonima);
  assert.equal(filaAnonima.monto_centavos, 10);
  assert.equal(filaAnonima.miembro_id, null);
  assert.equal(filaAnonima.registrado_por, 4);
});

test('rechaza montos, fechas, catálogos y donantes inválidos sin escribir', () => {
  const manana = db.prepare("SELECT date('now', 'localtime', '+1 day') AS fecha").get().fecha;
  const casos = [
    { monto: '' },
    { monto: '0' },
    { monto: '-1' },
    { monto: '1.001' },
    { monto: '1000000.01' },
    { monto: 'abc' },
    { fecha: '2026-02-30' },
    { fecha: manana },
    { concepto: 'regalo' },
    { metodo: 'cheque' },
    { miembro_id: '999' },
    { miembro_id: '13' },
    { miembro_id: 'abc' },
    { descripcion: 'x'.repeat(2001) },
  ];
  const totalAntes = db.prepare('SELECT COUNT(*) AS total FROM donaciones').get().total;

  for (const cambios of casos) {
    const res = ejecutar('crear', ROLES.ADMIN, {
      usuarioId: 1,
      body: formularioValido(cambios),
    });
    assert.equal(res.statusCode, 422, JSON.stringify(cambios));
    assert.equal(res.vista, 'donaciones/formulario');
    assert.equal(res.datos.errores.length > 0, true);
  }

  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM donaciones').get().total, totalAntes);
});

test('impide escrituras de Pastor, Secretario y Coordinador', () => {
  const totalAntes = db.prepare('SELECT COUNT(*) AS total FROM donaciones').get().total;
  for (const [rol, usuarioId] of [
    [ROLES.PASTOR, 2],
    [ROLES.SECRETARIO, 3],
    [ROLES.COORDINADOR, 5],
  ]) {
    const res = ejecutar('crear', rol, { usuarioId, body: formularioValido() });
    assert.equal(res.statusCode, 403);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM donaciones').get().total, totalAntes);
});
