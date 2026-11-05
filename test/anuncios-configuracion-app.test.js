// RF-07 y RF-10 con la aplicación real (src/app.js, sesión e inicio de sesión reales)
// contra una base TEMPORAL (test/helpers/app-prueba.js). Nunca abre data/iglesia.db.
//
// Mientras no existan las vistas definitivas (anuncios/*, configuracion/index), aquí solo
// se prueba lo que no depende de ellas: sesión, 403, altas/cambios/eliminación que terminan
// en redirección y su efecto en el panel. El contrato de cada vista se prueba en
// anuncios-configuracion.test.js.

const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const { iniciarApp } = require('./helpers/app-prueba');

const form = (campos) => new URLSearchParams(campos);

describe('RF-07 y RF-10 con la aplicación real', () => {
  let app;
  const cookies = {};

  before(async () => {
    app = await iniciarApp();
    for (const rol of ['admin', 'pastor', 'secretario', 'tesorero', 'coordinador']) {
      cookies[rol] = await app.sesion(rol);
    }
  });
  after(() => app.cerrar());

  const post = (ruta, cookie, campos = {}) => fetch(app.url + ruta, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
    body: form(campos),
  });
  const contar = () => app.consultarBase('SELECT COUNT(*) AS n FROM anuncios')[0].n;

  it('sin sesión, todas las rutas redirigen a /login', async () => {
    for (const ruta of ['/anuncios', '/anuncios/nuevo', '/anuncios/1/editar', '/configuracion']) {
      const r = await app.pedir(ruta);
      assert.equal(r.status, 302, ruta);
      assert.equal(r.headers.get('location'), '/login');
    }
    for (const ruta of ['/anuncios', '/anuncios/1', '/anuncios/1/eliminar', '/configuracion']) {
      const r = await post(ruta, null, { titulo: 'x', contenido: 'x', nombre: 'x' });
      assert.equal(r.status, 302, ruta);
      assert.equal(r.headers.get('location'), '/login');
    }
  });

  it('tesorero y coordinador reciben 403 en anuncios con la vista de error real', async () => {
    for (const rol of ['tesorero', 'coordinador']) {
      for (const ruta of ['/anuncios', '/anuncios/nuevo', '/anuncios/1/editar']) {
        const r = await app.pedir(ruta, cookies[rol]);
        assert.equal(r.status, 403, `${rol} ${ruta}`);
        assert.match(await r.text(), /Acceso denegado/);
      }
      const antes = contar();
      assert.equal((await post('/anuncios', cookies[rol], { titulo: 'x', contenido: 'x' })).status, 403);
      assert.equal((await post('/anuncios/1/eliminar', cookies[rol])).status, 403);
      assert.equal(contar(), antes);
    }
  });

  it('solo el Administrador entra a configuración; los demás reciben 403 y no cambian nada', async () => {
    for (const rol of ['pastor', 'secretario', 'tesorero', 'coordinador']) {
      assert.equal((await app.pedir('/configuracion', cookies[rol])).status, 403, rol);
      const r = await post('/configuracion', cookies[rol], { nombre: 'Intruso' });
      assert.equal(r.status, 403, rol);
    }
    assert.equal(app.consultarBase('SELECT nombre FROM configuracion_iglesia')[0].nombre, 'Iglesia Comunidad de Fe');
  });

  it('un anuncio importante creado por el secretario aparece en el panel', async () => {
    const r = await post('/anuncios', cookies.secretario, {
      titulo: 'Vigilia de oración', contenido: 'Viernes 21:00 en el templo.', importante: 'on',
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/anuncios?aviso=creado');
    const fila = app.consultarBase("SELECT autor_id, importante FROM anuncios WHERE titulo = 'Vigilia de oración'")[0];
    assert.deepEqual({ ...fila }, { autor_id: 3, importante: 1 });
    const panel = await (await app.pedir('/panel', cookies.pastor)).text();
    assert.match(panel, /Vigilia de oración/);
  });

  it('un anuncio con fecha futura queda programado y no aparece en el panel', async () => {
    const futura = app.consultarBase("SELECT date('now', 'localtime', '+7 days') AS f")[0].f;
    const r = await post('/anuncios', cookies.pastor, {
      titulo: 'Anuncio programado de prueba', contenido: 'Se publica después.', fecha_publicacion: futura,
    });
    assert.equal(r.headers.get('location'), '/anuncios?aviso=programado');
    const panel = await (await app.pedir('/panel', cookies.admin)).text();
    assert.doesNotMatch(panel, /Anuncio programado de prueba/);
  });

  it('editar y eliminar un anuncio se refleja en el panel', async () => {
    let r = await post('/anuncios/4', cookies.admin, { titulo: 'Bienvenida editada', contenido: 'Texto nuevo', importante: 'on' });
    assert.equal(r.headers.get('location'), '/anuncios?aviso=actualizado');
    assert.match(await (await app.pedir('/panel', cookies.admin)).text(), /Bienvenida editada/);
    r = await post('/anuncios/4/eliminar', cookies.admin);
    assert.equal(r.headers.get('location'), '/anuncios?aviso=eliminado');
    assert.doesNotMatch(await (await app.pedir('/panel', cookies.admin)).text(), /Bienvenida editada/);
    assert.equal((await post('/anuncios/4/eliminar', cookies.admin)).status, 404);
  });

  it('el nombre guardado en configuración aparece en el menú y el título de las páginas', async () => {
    const r = await post('/configuracion', cookies.admin, {
      nombre: 'Iglesia Monte Sion', direccion: 'Calle 1', telefono: '999 000 1111', correo: 'hola@sion.test', horarios: 'Domingo 9:00',
    });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/configuracion?aviso=guardado');
    const panel = await (await app.pedir('/panel', cookies.coordinador)).text();
    assert.match(panel, /<title>[^<]*Iglesia Monte Sion<\/title>/);
    assert.match(panel, /class="menu__marca">Iglesia Monte Sion</);
  });

  it('el servidor no registró errores', () => {
    assert.equal(app.registroErrores.join('').trim(), '');
  });
});
