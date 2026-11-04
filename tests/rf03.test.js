const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { test, after } = require('node:test');

const dbPathExistia = Object.hasOwn(process.env, 'DB_PATH');
const dbPathAnterior = process.env.DB_PATH;
const raizTemporal = path.resolve(os.tmpdir());
const dbTemporal = path.join(
  raizTemporal,
  `rf03-asistencias-${process.pid}-${randomUUID()}.sqlite`,
);
const dbLocal = path.resolve('data/iglesia.db');

assert.equal(path.dirname(dbTemporal), raizTemporal);
assert.notEqual(path.resolve(dbTemporal), dbLocal);
process.env.DB_PATH = dbTemporal;

let db;
let limpiezaRealizada = false;

function limpiar() {
  if (limpiezaRealizada) return;
  limpiezaRealizada = true;

  if (db) {
    try {
      db.close();
    } catch {
      // La conexión puede estar cerrada si una prueba terminó antes de tiempo.
    }
  }

  if (dbPathExistia) process.env.DB_PATH = dbPathAnterior;
  else delete process.env.DB_PATH;

  for (const sufijo of ['', '-wal', '-shm']) {
    const archivo = `${dbTemporal}${sufijo}`;
    if (path.dirname(path.resolve(archivo)) !== raizTemporal) {
      throw new Error('Se rechazó la limpieza de una ruta fuera del directorio temporal.');
    }
    if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
  }
}

after(limpiar);
process.once('exit', limpiar);

const preparacion = new DatabaseSync(dbTemporal);
try {
  preparacion.exec('PRAGMA foreign_keys = ON;');
  preparacion.exec(fs.readFileSync('src/db/schema.sql', 'utf8'));
  preparacion.exec(fs.readFileSync('src/db/seed.sql', 'utf8'));
} finally {
  preparacion.close();
}

db = require('../src/db/connection');
const controller = require('../src/controllers/asistencias.controller');
const router = require('../src/routes/asistencias.routes');

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
      this.redireccion = destino;
      return this;
    },
  };
}

function reqRol(id, rol, adicionales = {}) {
  return {
    session: { usuario: { id, rol } },
    query: {},
    params: {},
    body: {},
    ...adicionales,
  };
}

function capaRuta(metodo, ruta) {
  return router.stack.find(
    (item) => item.route
      && item.route.path === ruta
      && item.route.methods[metodo],
  );
}

test('RF-03: rutas, permisos, registro, historial y resúmenes', async (t) => {
  await t.test('conecta las cuatro rutas y conserva ambos middlewares', () => {
    const rutas = [
      ['get', '/', controller.listar],
      ['get', '/historial', controller.historial],
      ['get', '/evento/:id', controller.mostrarEvento],
      ['post', '/evento/:id', controller.guardar],
    ];

    for (const [metodo, ruta, controlador] of rutas) {
      const capa = capaRuta(metodo, ruta);
      assert.ok(capa, `Ruta ausente: ${metodo.toUpperCase()} ${ruta}`);
      assert.equal(capa.route.stack.at(-1).handle, controlador);
    }

    const post = capaRuta('post', '/evento/:id');
    assert.equal(post.route.stack.length, 2);
    assert.ok(router.stack.some((capa) => !capa.route));
  });

  await t.test('autoriza Administrador, Pastor y Secretario', () => {
    for (const [id, rol] of [
      [1, 'Administrador'],
      [2, 'Pastor'],
      [3, 'Secretario'],
    ]) {
      const res = respuesta();
      controller.listar(
        reqRol(id, rol, {
          query: { desde: '2026-10-01', hasta: '2026-11-03', tipo: '' },
        }),
        res,
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.vista, 'asistencias/eventos');
      assert.ok(res.datos.eventos.length > 0);
      assert.equal(res.datos.puedeRegistrar, true);
    }
  });

  await t.test('rechaza Tesorero y Coordinador con HTTP 403', () => {
    for (const [id, rol] of [
      [4, 'Tesorero'],
      [5, 'Coordinador'],
    ]) {
      for (const metodo of ['listar', 'mostrarEvento', 'guardar', 'historial']) {
        const res = respuesta();
        controller[metodo](
          reqRol(id, rol, {
            params: { id: '10' },
            query: { desde: '2026-10-01', hasta: '2026-11-03' },
          }),
          res,
        );
        assert.equal(res.statusCode, 403, `${rol} no debe ejecutar ${metodo}`);
      }
    }
  });

  await t.test('valida fechas y tipos de los filtros', () => {
    const res = respuesta();
    controller.listar(
      reqRol(1, 'Administrador', {
        query: {
          desde: '2026-02-30',
          hasta: '2026-01-01',
          tipo: 'arbitrario',
        },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(res.vista, 'asistencias/eventos');
    assert.ok(res.datos.errores.length >= 2);
  });

  await t.test('obtiene convocados de eventos generales y ministeriales', () => {
    let res = respuesta();
    controller.mostrarEvento(
      reqRol(3, 'Secretario', { params: { id: '10' } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.vista, 'asistencias/registro');
    assert.equal(res.datos.evento.id, 10);
    assert.equal(res.datos.miembros.length, 12);
    assert.equal(res.datos.puedeRegistrar, true);
    assert.ok(res.datos.miembros.every((miembro) => miembro.presente === null));

    res = respuesta();
    controller.mostrarEvento(
      reqRol(2, 'Pastor', { params: { id: '11' } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.datos.evento.ministerio_id, 2);
    assert.deepEqual(
      new Set(res.datos.miembros.map((miembro) => miembro.id)),
      new Set([6, 9, 10, 11]),
    );
    assert.equal(res.datos.puedeRegistrar, false);
  });

  await t.test('responde 404 para identificadores inválidos o inexistentes', () => {
    for (const id of ['abc', '0', '99999']) {
      const res = respuesta();
      controller.mostrarEvento(
        reqRol(1, 'Administrador', { params: { id } }),
        res,
      );
      assert.equal(res.statusCode, 404);
    }
  });

  await t.test('rechaza eventos cancelados', () => {
    let res = respuesta();
    controller.mostrarEvento(
      reqRol(1, 'Administrador', { params: { id: '12' } }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(res.vista, 'error');

    res = respuesta();
    controller.guardar(
      reqRol(1, 'Administrador', {
        params: { id: '12' },
        body: { presentes: ['5'] },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS total FROM asistencias WHERE evento_id = ?',
      ).get(12).total,
      0,
    );
  });

  await t.test('registra una fila por convocado con presentes y ausentes', () => {
    const res = respuesta();
    controller.guardar(
      reqRol(3, 'Secretario', {
        params: { id: '10' },
        body: { presentes: ['1', '3', '5'] },
      }),
      res,
    );
    assert.equal(res.redireccion, '/asistencias/evento/10?guardado=1');

    const conteo = db.prepare(
      'SELECT COUNT(*) AS total, SUM(presente) AS presentes '
      + 'FROM asistencias WHERE evento_id = ?',
    ).get(10);
    assert.equal(conteo.total, 12);
    assert.equal(conteo.presentes, 3);
    assert.equal(conteo.total - conteo.presentes, 9);
    assert.equal(
      db.prepare('SELECT estado FROM eventos WHERE id = ?').get(10).estado,
      'realizado',
    );
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS total FROM asistencias '
        + 'WHERE evento_id = ? AND registrado_por = ?',
      ).get(10, 3).total,
      12,
    );
  });

  await t.test('actualiza mediante UPSERT sin duplicar filas', () => {
    const res = respuesta();
    controller.guardar(
      reqRol(2, 'Pastor', {
        params: { id: '10' },
        body: { presentes: '2' },
      }),
      res,
    );
    assert.equal(res.redireccion, '/asistencias/evento/10?guardado=1');

    const conteo = db.prepare(
      'SELECT COUNT(*) AS total, SUM(presente) AS presentes '
      + 'FROM asistencias WHERE evento_id = ?',
    ).get(10);
    assert.equal(conteo.total, 12);
    assert.equal(conteo.presentes, 1);
    assert.equal(conteo.total - conteo.presentes, 11);
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS total FROM asistencias '
        + 'WHERE evento_id = ? AND registrado_por = ?',
      ).get(10, 2).total,
      12,
    );
  });

  await t.test('rechaza identificadores inválidos o ajenos a la convocatoria', () => {
    const presentesAntes = db.prepare(
      'SELECT SUM(presente) AS presentes FROM asistencias WHERE evento_id = ?',
    ).get(10).presentes;

    let res = respuesta();
    controller.guardar(
      reqRol(1, 'Administrador', {
        params: { id: '10' },
        body: { presentes: ['2', '9999'] },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.match(res.datos.errores.join(' '), /convocatoria/);
    assert.equal(
      db.prepare(
        'SELECT SUM(presente) AS presentes FROM asistencias WHERE evento_id = ?',
      ).get(10).presentes,
      presentesAntes,
    );

    res = respuesta();
    controller.guardar(
      reqRol(1, 'Administrador', {
        params: { id: '10' },
        body: { presentes: ['2', 'no-es-id'] },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.match(res.datos.errores.join(' '), /identificador inválido/);
  });

  await t.test('rechaza eventos futuros y conserva su estado', () => {
    const res = respuesta();
    controller.guardar(
      reqRol(1, 'Administrador', {
        params: { id: '11' },
        body: { presentes: ['6'] },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS total FROM asistencias WHERE evento_id = ?',
      ).get(11).total,
      0,
    );
    assert.equal(
      db.prepare('SELECT estado FROM eventos WHERE id = ?').get(11).estado,
      'programado',
    );
  });

  await t.test('rechaza una sesión con identificador de usuario inválido', () => {
    const res = respuesta();
    controller.guardar(
      {
        session: { usuario: { id: 'invalido', rol: 'Administrador' } },
        params: { id: '10' },
        body: { presentes: ['2'] },
      },
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.match(res.datos.errores.join(' '), /sesión/);
  });

  await t.test('consulta historial y resumen semanal', () => {
    const res = respuesta();
    controller.historial(
      reqRol(2, 'Pastor', {
        query: {
          desde: '2026-10-01',
          hasta: '2026-11-03',
          tipo: '',
          agrupacion: 'semana',
        },
      }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.vista, 'asistencias/historial');
    assert.ok(res.datos.eventos.some((evento) => evento.id === 10));
    assert.ok(res.datos.resumen.length > 0);
    assert.ok(
      res.datos.resumen.every(
        (fila) => /^\d{4}-\d{2}-\d{2}$/.test(fila.periodo),
      ),
    );
  });

  await t.test('aplica filtro por tipo y resumen mensual', () => {
    const res = respuesta();
    controller.historial(
      reqRol(1, 'Administrador', {
        query: {
          desde: '2026-10-01',
          hasta: '2026-11-03',
          tipo: 'culto',
          agrupacion: 'mes',
        },
      }),
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.ok(res.datos.eventos.every((evento) => evento.tipo === 'culto'));
    assert.ok(
      res.datos.resumen.every(
        (fila) => /^\d{4}-\d{2}$/.test(fila.periodo),
      ),
    );
  });

  await t.test('rechaza tipo y agrupación desconocidos', () => {
    const res = respuesta();
    controller.historial(
      reqRol(3, 'Secretario', {
        query: {
          desde: '2026-10-01',
          hasta: '2026-11-03',
          tipo: 'invalido',
          agrupacion: 'dia',
        },
      }),
      res,
    );
    assert.equal(res.statusCode, 422);
    assert.equal(res.vista, 'asistencias/historial');
    assert.ok(res.datos.errores.length >= 2);
  });
});
