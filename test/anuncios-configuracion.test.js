// Pruebas de RF-07 (Anuncios) y RF-10 (Configuración) sin las vistas definitivas.
//
// Se monta en este proceso una app Express con las RUTAS REALES (src/routes/index.js:
// requireAuth, requireSeccion, requireRoles, controladores y modelos) contra una base
// TEMPORAL creada con schema.sql + seed.sql. Nunca se abre data/iglesia.db.
//
// Las vistas de test/vistas-prueba/ van antes que src/views y solo devuelven en JSON
// las variables que recibe cada plantilla. Así se comprueba el contrato exacto que
// usarán las vistas de Frontend (docs/INTEGRACION_RF07_RF10.md).

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { describe, it, before, after } = require('node:test');

const RAIZ = path.resolve(__dirname, '..');
const carpetaTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-rf07-rf10-'));
const dbTemporal = path.join(carpetaTemporal, 'prueba.db');
assert.notEqual(dbTemporal, path.resolve(RAIZ, 'data', 'iglesia.db'));

const preparacion = new DatabaseSync(dbTemporal);
preparacion.exec(fs.readFileSync(path.join(RAIZ, 'src', 'db', 'schema.sql'), 'utf8'));
preparacion.exec(fs.readFileSync(path.join(RAIZ, 'src', 'db', 'seed.sql'), 'utf8'));
preparacion.close();
process.env.DB_PATH = dbTemporal;

const express = require('express');
const db = require('../src/db/connection');
const Anuncios = require('../src/models/anuncios.model');
const Configuracion = require('../src/models/configuracion.model');

const USUARIOS = {
  admin: { id: 1, nombre: 'Admin General', rol: 'Administrador' },
  pastor: { id: 2, nombre: 'Pastor Juan Pérez', rol: 'Pastor' },
  secretario: { id: 3, nombre: 'María López', rol: 'Secretario' },
  tesorero: { id: 4, nombre: 'Carlos Ramírez', rol: 'Tesorero' },
  coordinador: { id: 5, nombre: 'Ana Martínez', rol: 'Coordinador' },
};
const ROLES_ANUNCIOS = ['admin', 'pastor', 'secretario'];
const ROLES_SIN_ANUNCIOS = ['tesorero', 'coordinador'];
const ROLES_SIN_CONFIGURACION = ['pastor', 'secretario', 'tesorero', 'coordinador'];

let servidor;
let base;
const erroresServidor = [];

function crearApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', [path.join(__dirname, 'vistas-prueba'), path.join(RAIZ, 'src', 'views')]);
  app.use(express.urlencoded({ extended: true }));
  // Sustituye a express-session: el rol llega en un encabezado solo en estas pruebas.
  app.use((req, res, next) => {
    const rol = req.get('x-rol-prueba');
    req.session = rol ? { usuario: USUARIOS[rol] } : {};
    next();
  });
  app.use(require('../src/routes'));
  // Mismos manejadores finales que src/app.js.
  app.use((req, res) => {
    res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'La página no existe.' });
  });
  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    erroresServidor.push(err);
    res.status(500).render('error', { titulo: 'Error del servidor', mensaje: 'Ocurrió un error inesperado.' });
  });
  return app;
}

before(async () => {
  servidor = crearApp().listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((r) => servidor.close(r));
  db.close();
  fs.rmSync(carpetaTemporal, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function pedir(metodo, ruta, rol, campos) {
  const opciones = { method: metodo, redirect: 'manual', headers: {} };
  if (rol) opciones.headers['x-rol-prueba'] = rol;
  if (campos) {
    opciones.headers['content-type'] = 'application/x-www-form-urlencoded';
    const cuerpo = new URLSearchParams();
    for (const [k, v] of Object.entries(campos)) [].concat(v).forEach((x) => cuerpo.append(k, x));
    opciones.body = cuerpo;
  }
  const respuesta = await fetch(base + ruta, opciones);
  const textoRespuesta = await respuesta.text();
  let vista = null;
  let datos = null;
  try {
    ({ vista, datos } = JSON.parse(textoRespuesta));
  } catch {
    // Redirección u otra respuesta sin vista de prueba.
  }
  return { status: respuesta.status, location: respuesta.headers.get('location'), vista, datos, texto: textoRespuesta };
}
const get = (ruta, rol) => pedir('GET', ruta, rol);
const post = (ruta, rol, campos = {}) => pedir('POST', ruta, rol, campos);

function fechaRelativa(dias) {
  return db.prepare("SELECT date('now', 'localtime', ?) AS f").get(`${dias} days`).f;
}
// node:sqlite devuelve objetos sin prototipo; la vista los recibe ya como JSON.
const plano = (valor) => JSON.parse(JSON.stringify(valor));
const contarAnuncios = () => db.prepare('SELECT COUNT(*) AS n FROM anuncios').get().n;

function anuncioValido(extra = {}) {
  return { titulo: 'Ayuno congregacional', contenido: 'Este viernes a las 19:00 en el templo.', ...extra };
}

// ===========================================================================
describe('RF-07 Anuncios: acceso por rol', () => {
  const RUTAS_GET = ['/anuncios', '/anuncios/nuevo', '/anuncios/1/editar'];

  for (const ruta of RUTAS_GET) {
    it(`sin sesión, GET ${ruta} redirige a /login`, async () => {
      const r = await get(ruta);
      assert.equal(r.status, 302);
      assert.equal(r.location, '/login');
    });
  }

  for (const [ruta, campos] of [['/anuncios', anuncioValido()], ['/anuncios/1', anuncioValido()], ['/anuncios/1/eliminar', {}]]) {
    it(`sin sesión, POST ${ruta} redirige a /login y no cambia la base`, async () => {
      const antes = contarAnuncios();
      const titulo = Anuncios.obtener(1).titulo;
      const r = await post(ruta, null, campos);
      assert.equal(r.status, 302);
      assert.equal(r.location, '/login');
      assert.equal(contarAnuncios(), antes);
      assert.equal(Anuncios.obtener(1).titulo, titulo);
    });
  }

  for (const rol of ROLES_ANUNCIOS) {
    it(`${rol}: puede consultar, abrir los formularios y gestionar`, async () => {
      for (const ruta of RUTAS_GET) {
        const r = await get(ruta, rol);
        assert.equal(r.status, 200, ruta);
      }
      const lista = await get('/anuncios', rol);
      assert.equal(lista.datos.puedeEditar, true);
    });
  }

  for (const rol of ROLES_SIN_ANUNCIOS) {
    it(`${rol}: recibe 403 en todas las rutas y no cambia la base`, async () => {
      const antes = contarAnuncios();
      const peticiones = [
        ...RUTAS_GET.map((ruta) => get(ruta, rol)),
        post('/anuncios', rol, anuncioValido()),
        post('/anuncios/1', rol, anuncioValido({ titulo: 'Cambiado' })),
        post('/anuncios/1/eliminar', rol),
      ];
      for (const r of await Promise.all(peticiones)) {
        assert.equal(r.status, 403);
        assert.equal(r.vista, 'error');
        assert.equal(r.datos.titulo, 'Acceso denegado');
      }
      assert.equal(contarAnuncios(), antes);
      assert.equal(Anuncios.obtener(1).titulo, 'Cambio de horario');
    });
  }
});

// ===========================================================================
describe('RF-07 Anuncios: consulta', () => {
  it('la lista entrega exactamente anuncios, importantes, puedeEditar y mensaje', async () => {
    const r = await get('/anuncios', 'secretario');
    assert.equal(r.vista, 'anuncios/index');
    assert.deepEqual(Object.keys(r.datos).sort(), ['anuncios', 'importantes', 'mensaje', 'puedeEditar']);
    assert.equal(r.datos.mensaje, null);
  });

  it('anuncios coincide con Anuncios.listar() e importantes con Anuncios.importantes(5)', async () => {
    const r = await get('/anuncios', 'admin');
    assert.deepEqual(r.datos.anuncios, plano(Anuncios.listar()));
    assert.deepEqual(r.datos.importantes, plano(Anuncios.importantes(5)));
    assert.ok(r.datos.importantes.length >= 1);
    assert.ok(r.datos.importantes.every((a) => a.importante === 1 && a.programado === 0));
    const columnas = ['actualizado_en', 'autor', 'autor_id', 'contenido', 'creado_en', 'fecha_publicacion',
      'id', 'importante', 'programado', 'titulo'];
    assert.deepEqual(Object.keys(r.datos.anuncios[0]).sort(), columnas);
  });

  it('solo muestra avisos conocidos de ?aviso=', async () => {
    assert.equal((await get('/anuncios?aviso=eliminado', 'admin')).datos.mensaje, 'El anuncio se eliminó.');
    assert.equal((await get('/anuncios?aviso=<script>', 'admin')).datos.mensaje, null);
    for (const clave of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.equal((await get(`/anuncios?aviso=${clave}`, 'admin')).datos.mensaje, null, clave);
      assert.equal((await get(`/configuracion?aviso=${clave}`, 'admin')).datos.mensaje, null, clave);
    }
    assert.equal((await get('/anuncios?aviso=creado&aviso=eliminado', 'admin')).datos.mensaje, null);
  });

  it('el formulario nuevo entrega anuncio null, errores vacío, modo nuevo y puedeEditar', async () => {
    const r = await get('/anuncios/nuevo', 'pastor');
    assert.equal(r.vista, 'anuncios/formulario');
    assert.deepEqual(r.datos, { anuncio: null, errores: [], modo: 'nuevo', puedeEditar: true });
  });

  it('el formulario de edición entrega el anuncio guardado y modo editar', async () => {
    const r = await get('/anuncios/1/editar', 'admin');
    assert.equal(r.status, 200);
    assert.equal(r.datos.modo, 'editar');
    assert.deepEqual(r.datos.anuncio, plano(Anuncios.obtener(1)));
    assert.deepEqual(r.datos.errores, []);
  });

  for (const id of ['9999', '0', '-1', 'abc', '1.5', '1e3', '00x']) {
    it(`editar un anuncio inexistente o con id inválido (${id}) responde 404`, async () => {
      const r = await get(`/anuncios/${id}/editar`, 'admin');
      assert.equal(r.status, 404);
      assert.equal(r.vista, 'error');
      assert.equal(r.datos.titulo, 'Anuncio no encontrado');
    });
  }
});

// ===========================================================================
describe('RF-07 Anuncios: altas', () => {
  it('crea un anuncio publicado hoy con el autor de la sesión', async () => {
    const antes = contarAnuncios();
    const r = await post('/anuncios', 'secretario', anuncioValido({ titulo: '  Reunión de oración  ' }));
    assert.equal(r.status, 302);
    assert.equal(r.location, '/anuncios?aviso=creado');
    assert.equal(contarAnuncios(), antes + 1);
    const nuevo = Anuncios.listar().find((a) => a.titulo === 'Reunión de oración');
    assert.ok(nuevo, 'el título se guarda sin espacios sobrantes');
    assert.equal(nuevo.autor_id, USUARIOS.secretario.id);
    assert.equal(nuevo.fecha_publicacion, fechaRelativa(0));
    assert.equal(nuevo.importante, 0);
    assert.equal(nuevo.programado, 0);
  });

  it('marca como importante con la casilla y aparece en importantes y en el panel', async () => {
    const r = await post('/anuncios', 'admin', anuncioValido({ titulo: 'Aviso urgente', importante: 'on' }));
    assert.equal(r.status, 302);
    const guardado = Anuncios.listar().find((a) => a.titulo === 'Aviso urgente');
    assert.equal(guardado.importante, 1);
    const lista = await get('/anuncios', 'admin');
    assert.ok(lista.datos.importantes.some((a) => a.id === guardado.id));
    assert.ok(Anuncios.publicados(5).some((a) => a.id === guardado.id));
  });

  it('permite una fecha futura: queda programado, fuera de importantes y del panel', async () => {
    const futura = fechaRelativa(10);
    const r = await post('/anuncios', 'pastor', anuncioValido({ titulo: 'Retiro de diciembre', fecha_publicacion: futura, importante: 'on' }));
    assert.equal(r.status, 302);
    assert.equal(r.location, '/anuncios?aviso=programado');
    const guardado = Anuncios.listar().find((a) => a.titulo === 'Retiro de diciembre');
    assert.equal(guardado.fecha_publicacion, futura);
    assert.equal(guardado.programado, 1);
    const lista = await get('/anuncios?aviso=programado', 'pastor');
    assert.ok(lista.datos.anuncios.some((a) => a.id === guardado.id), 'la administración sí lo lista');
    assert.ok(!lista.datos.importantes.some((a) => a.id === guardado.id));
    assert.ok(!Anuncios.publicados(100).some((a) => a.id === guardado.id));
    assert.match(lista.datos.mensaje, /programado/);
  });

  it('un título con HTML se guarda tal cual (las vistas deben escaparlo con <%= %>)', async () => {
    const titulo = '<img src=x onerror=alert(1)>';
    await post('/anuncios', 'admin', anuncioValido({ titulo }));
    assert.ok(Anuncios.listar().some((a) => a.titulo === titulo));
  });

  const INVALIDOS = [
    ['título vacío', { titulo: '   ' }, 'El título del anuncio es obligatorio.'],
    ['contenido vacío', { contenido: '' }, 'El contenido del anuncio es obligatorio.'],
    ['fecha con formato incorrecto', { fecha_publicacion: '04/11/2026' }, 'La fecha de publicación debe tener el formato YYYY-MM-DD.'],
    ['fecha inexistente', { fecha_publicacion: '2026-02-30' }, 'La fecha de publicación debe tener el formato YYYY-MM-DD.'],
    ['título demasiado largo', { titulo: 'a'.repeat(151) }, 'El título no puede exceder 150 caracteres.'],
    ['contenido demasiado largo', { contenido: 'a'.repeat(5001) }, 'El contenido no puede exceder 5000 caracteres.'],
    ['título repetido en el formulario (arreglo)', { titulo: ['Uno', 'Dos'] }, 'El título del anuncio es obligatorio.'],
  ];
  for (const [caso, cambios, mensaje] of INVALIDOS) {
    it(`rechaza ${caso} con 422, conserva lo escrito y no guarda nada`, async () => {
      const antes = contarAnuncios();
      const r = await post('/anuncios', 'admin', anuncioValido({ fecha_publicacion: '', ...cambios }));
      assert.equal(r.status, 422);
      assert.equal(r.vista, 'anuncios/formulario');
      assert.equal(r.datos.modo, 'nuevo');
      assert.deepEqual(r.datos.errores, [mensaje]);
      assert.deepEqual(Object.keys(r.datos.anuncio).sort(), ['contenido', 'fecha_publicacion', 'importante', 'titulo']);
      assert.equal(contarAnuncios(), antes);
    });
  }

  it('los mensajes de error no exponen detalles técnicos', async () => {
    const r = await post('/anuncios', 'admin', { titulo: '', contenido: '' });
    assert.doesNotMatch(r.texto, /SQLITE|ErrorDatos|stack|at \w+ \(|TITULO_REQUERIDO/);
  });
});

// ===========================================================================
describe('RF-07 Anuncios: ediciones', () => {
  it('actualiza título, contenido, fecha e importante y conserva el autor original', async () => {
    const original = Anuncios.obtener(2);
    const r = await post('/anuncios/2', 'admin', {
      titulo: 'Convivio de jóvenes (nueva fecha)', contenido: 'Se cambia al sábado 14.', fecha_publicacion: '2026-10-22', importante: 'on',
    });
    assert.equal(r.status, 302);
    assert.equal(r.location, '/anuncios?aviso=actualizado');
    const editado = Anuncios.obtener(2);
    assert.equal(editado.titulo, 'Convivio de jóvenes (nueva fecha)');
    assert.equal(editado.contenido, 'Se cambia al sábado 14.');
    assert.equal(editado.fecha_publicacion, '2026-10-22');
    assert.equal(editado.importante, 1);
    assert.equal(editado.autor_id, original.autor_id, 'el autor no cambia aunque edite otro usuario');
    assert.ok(editado.actualizado_en);
  });

  it('sin la casilla importante, la edición la desmarca', async () => {
    await post('/anuncios/2', 'secretario', { titulo: 'Convivio', contenido: 'Texto' });
    assert.equal(Anuncios.obtener(2).importante, 0);
  });

  it('con fecha vacía, la edición la cambia a hoy (regla del modelo)', async () => {
    await post('/anuncios/2', 'secretario', { titulo: 'Convivio', contenido: 'Texto', fecha_publicacion: '' });
    assert.equal(Anuncios.obtener(2).fecha_publicacion, fechaRelativa(0));
  });

  it('datos inválidos responden 422 con modo editar, el id y lo escrito, sin modificar el anuncio', async () => {
    const antes = Anuncios.obtener(3);
    const r = await post('/anuncios/3', 'pastor', { titulo: 'Nuevo título', contenido: '', fecha_publicacion: '2026-11-10' });
    assert.equal(r.status, 422);
    assert.equal(r.vista, 'anuncios/formulario');
    assert.equal(r.datos.modo, 'editar');
    assert.deepEqual(r.datos.errores, ['El contenido del anuncio es obligatorio.']);
    assert.deepEqual(r.datos.anuncio, { id: 3, titulo: 'Nuevo título', contenido: '', fecha_publicacion: '2026-11-10', importante: 0 });
    assert.deepEqual(Anuncios.obtener(3), antes);
  });

  for (const id of ['9999', 'abc', '0']) {
    it(`editar el anuncio inexistente ${id} responde 404 aunque los datos sean inválidos`, async () => {
      const r = await post(`/anuncios/${id}`, 'admin', { titulo: '' });
      assert.equal(r.status, 404);
      assert.equal(r.datos.titulo, 'Anuncio no encontrado');
    });
  }
});

// ===========================================================================
describe('RF-07 Anuncios: eliminación', () => {
  it('elimina el anuncio y redirige con aviso', async () => {
    const id = Anuncios.crear({ ...anuncioValido({ titulo: 'Para borrar' }), autorId: 1 });
    const antes = contarAnuncios();
    const r = await post(`/anuncios/${id}/eliminar`, 'pastor');
    assert.equal(r.status, 302);
    assert.equal(r.location, '/anuncios?aviso=eliminado');
    assert.equal(Anuncios.obtener(id), undefined);
    assert.equal(contarAnuncios(), antes - 1);
  });

  it('eliminar dos veces el mismo anuncio responde 404 la segunda vez', async () => {
    const id = Anuncios.crear({ ...anuncioValido({ titulo: 'Doble' }), autorId: 1 });
    assert.equal((await post(`/anuncios/${id}/eliminar`, 'admin')).status, 302);
    assert.equal((await post(`/anuncios/${id}/eliminar`, 'admin')).status, 404);
  });

  for (const id of ['9999', 'abc', '-3']) {
    it(`eliminar el anuncio inexistente ${id} responde 404 y no borra nada`, async () => {
      const antes = contarAnuncios();
      const r = await post(`/anuncios/${id}/eliminar`, 'admin');
      assert.equal(r.status, 404);
      assert.equal(contarAnuncios(), antes);
    });
  }

  it('GET /anuncios/:id/eliminar no borra (solo se elimina por POST)', async () => {
    const antes = contarAnuncios();
    const r = await get('/anuncios/1/eliminar', 'admin');
    assert.equal(r.status, 404);
    assert.equal(contarAnuncios(), antes);
  });
});

// ===========================================================================
describe('RF-10 Configuración: acceso', () => {
  it('sin sesión, GET y POST redirigen a /login y no cambian la base', async () => {
    const antes = Configuracion.obtener();
    for (const r of [await get('/configuracion'), await post('/configuracion', null, { nombre: 'Intruso' })]) {
      assert.equal(r.status, 302);
      assert.equal(r.location, '/login');
    }
    assert.deepEqual(Configuracion.obtener(), antes);
  });

  for (const rol of ROLES_SIN_CONFIGURACION) {
    it(`${rol}: recibe 403 en GET y POST y no cambia la base`, async () => {
      const antes = Configuracion.obtener();
      for (const r of [await get('/configuracion', rol), await post('/configuracion', rol, { nombre: 'Otro nombre' })]) {
        assert.equal(r.status, 403);
        assert.equal(r.vista, 'error');
        assert.equal(r.datos.titulo, 'Acceso denegado');
      }
      assert.deepEqual(Configuracion.obtener(), antes);
    });
  }

  it('admin: la consulta entrega configuracion, errores, mensaje y logosDisponibles', async () => {
    const r = await get('/configuracion', 'admin');
    assert.equal(r.status, 200);
    assert.equal(r.vista, 'configuracion/index');
    assert.deepEqual(Object.keys(r.datos).sort(), ['configuracion', 'errores', 'logosDisponibles', 'mensaje']);
    assert.deepEqual(r.datos.configuracion, plano(Configuracion.obtener()));
    assert.equal(r.datos.configuracion.nombre, 'Iglesia Comunidad de Fe');
    assert.deepEqual(r.datos.errores, []);
    assert.equal(r.datos.mensaje, null);
    assert.ok(r.datos.logosDisponibles.includes('/img/aurelia-logo.png'));
    assert.ok(r.datos.logosDisponibles.every((l) => /^\/img\/[\w-]+\.(png|jpe?g|webp|gif)$/i.test(l)));
  });
});

// ===========================================================================
describe('RF-10 Configuración: actualización', () => {
  const VALIDOS = {
    nombre: 'Iglesia Comunidad de Fe Centro',
    direccion: 'Calle 60 #500, Centro',
    telefono: '+52 (999) 123-4567',
    correo: 'contacto@comunidad.test',
    horarios: 'Domingo 10:30 culto general\nMiércoles 19:00 estudio bíblico',
  };

  it('actualiza nombre, dirección, teléfono, correo y horarios', async () => {
    const r = await post('/configuracion', 'admin', VALIDOS);
    assert.equal(r.status, 302);
    assert.equal(r.location, '/configuracion?aviso=guardado');
    const guardada = Configuracion.obtener();
    for (const [campo, valor] of Object.entries(VALIDOS)) assert.equal(guardada[campo], valor, campo);
    assert.ok(guardada.actualizado_en);
    const despues = await get('/configuracion?aviso=guardado', 'admin');
    assert.equal(despues.datos.mensaje, 'La configuración de la iglesia se guardó correctamente.');
  });

  it('sin logo_ruta conserva el logotipo guardado', async () => {
    Configuracion.actualizarLogo('/img/aurelia-logo.png');
    await post('/configuracion', 'admin', { ...VALIDOS, nombre: 'Sin tocar el logo' });
    assert.equal(Configuracion.obtener().logo_ruta, '/img/aurelia-logo.png');
    await post('/configuracion', 'admin', { ...VALIDOS, logo_ruta: '' });
    assert.equal(Configuracion.obtener().logo_ruta, '/img/aurelia-logo.png', 'vacío también conserva');
  });

  it('cambia el logotipo a otra imagen existente de /img/', async () => {
    const r = await post('/configuracion', 'admin', { ...VALIDOS, logo_ruta: '/img/banner-oracion.png' });
    assert.equal(r.status, 302);
    assert.equal(Configuracion.obtener().logo_ruta, '/img/banner-oracion.png');
  });

  it('quitar_logo elimina la referencia y tiene prioridad sobre logo_ruta', async () => {
    await post('/configuracion', 'admin', { ...VALIDOS, logo_ruta: '/img/aurelia-logo.png', quitar_logo: 'on' });
    assert.equal(Configuracion.obtener().logo_ruta, null);
  });

  it('los campos opcionales vacíos se guardan como null', async () => {
    await post('/configuracion', 'admin', { nombre: 'Solo nombre', direccion: '', telefono: ' ', correo: '', horarios: '' });
    const c = Configuracion.obtener();
    assert.equal(c.nombre, 'Solo nombre');
    assert.deepEqual([c.direccion, c.telefono, c.correo, c.horarios], [null, null, null, null]);
  });

  const LOGOS_RECHAZADOS = [
    '/img/no-existe.png', '/img/../../src/db/schema.sql', '/img/..%2Fsecreto.png', 'https://otro.sitio/logo.png',
    'javascript:alert(1)', '/img/sub/logo.png', '/css/estilos.css', '/img/aurelia-logo.png?x=1', '/img/.oculto.png',
  ];
  for (const logo of LOGOS_RECHAZADOS) {
    it(`rechaza el logotipo ${logo} con 422 y no cambia nada`, async () => {
      Configuracion.actualizar({ ...VALIDOS, logoRuta: '/img/aurelia-logo.png' });
      const antes = Configuracion.obtener();
      const r = await post('/configuracion', 'admin', { ...VALIDOS, nombre: 'No debe guardarse', logo_ruta: logo });
      assert.equal(r.status, 422);
      assert.deepEqual(r.datos.errores, ['El logotipo debe ser una imagen PNG, JPG, WEBP o GIF que ya exista en /img/.']);
      assert.deepEqual(Configuracion.obtener(), antes);
    });
  }

  const INVALIDOS = [
    ['nombre vacío', { nombre: '   ' }, ['El nombre de la iglesia es obligatorio.']],
    ['nombre repetido (arreglo)', { nombre: ['A', 'B'] }, ['El nombre de la iglesia es obligatorio.']],
    ['nombre largo', { nombre: 'n'.repeat(151) }, ['El nombre no puede exceder 150 caracteres.']],
    ['dirección larga', { direccion: 'd'.repeat(301) }, ['La dirección no puede exceder 300 caracteres.']],
    ['teléfono con letras', { telefono: '999-CASA' }, ['El teléfono solo puede contener números, espacios y los signos + ( ) - . #']],
    ['teléfono largo', { telefono: '9'.repeat(31) }, ['El teléfono no puede exceder 30 caracteres.']],
    ['correo inválido', { correo: 'contacto@' }, ['Ingresa un correo electrónico válido.']],
    ['horarios largos', { horarios: 'h'.repeat(1001) }, ['Los horarios no pueden exceder 1000 caracteres.']],
    ['varios errores a la vez', { nombre: '', correo: 'x' }, ['El nombre de la iglesia es obligatorio.', 'Ingresa un correo electrónico válido.']],
  ];
  for (const [caso, cambios, errores] of INVALIDOS) {
    it(`rechaza ${caso} con 422, conserva lo escrito y no guarda`, async () => {
      Configuracion.actualizar({ ...VALIDOS, logoRuta: '/img/aurelia-logo.png' });
      const antes = Configuracion.obtener();
      const r = await post('/configuracion', 'admin', { ...VALIDOS, ...cambios });
      assert.equal(r.status, 422);
      assert.equal(r.vista, 'configuracion/index');
      assert.deepEqual(r.datos.errores, errores);
      assert.equal(r.datos.mensaje, null);
      assert.equal(r.datos.configuracion.logo_ruta, '/img/aurelia-logo.png', 'se muestra el logo guardado');
      if (typeof cambios.direccion === 'string') assert.equal(r.datos.configuracion.direccion, cambios.direccion);
      assert.ok(Array.isArray(r.datos.logosDisponibles));
      assert.deepEqual(Configuracion.obtener(), antes);
    });
  }

  it('el nombre nuevo se usa en todas las páginas (res.locals.iglesia lo lee de la base)', async () => {
    await post('/configuracion', 'admin', { ...VALIDOS, nombre: 'Iglesia Renovada' });
    const fila = db.prepare('SELECT nombre FROM configuracion_iglesia WHERE id = 1').get();
    assert.equal(fila.nombre, 'Iglesia Renovada');
  });
});

// ===========================================================================
describe('Errores inesperados', () => {
  it('ninguna de las pruebas anteriores llegó al manejador de errores 500', () => {
    assert.deepEqual(erroresServidor.map((e) => e.message), []);
  });

  it('un fallo de la base responde 500 genérico, sin detalles técnicos', async () => {
    const original = Anuncios.listar;
    Anuncios.listar = () => { throw new Error('SQLITE_CORRUPT: database disk image is malformed'); };
    try {
      const r = await get('/anuncios', 'admin');
      assert.equal(r.status, 500);
      assert.deepEqual(r.datos, { titulo: 'Error del servidor', mensaje: 'Ocurrió un error inesperado.' });
      assert.doesNotMatch(r.texto, /SQLITE|malformed/);
    } finally {
      Anuncios.listar = original;
      erroresServidor.length = 0;
    }
  });

  it('un error que no es ErrorDatos al guardar no se muestra como error de validación', async () => {
    const original = Configuracion.actualizar;
    Configuracion.actualizar = () => { throw new Error('disco lleno'); };
    try {
      const r = await post('/configuracion', 'admin', { nombre: 'X' });
      assert.equal(r.status, 500);
      assert.doesNotMatch(r.texto, /disco lleno/);
    } finally {
      Configuracion.actualizar = original;
      erroresServidor.length = 0;
    }
  });
});
