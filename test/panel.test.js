// Pruebas de RF-08. Ejecutar con:  node --test "test/*.test.js"
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, decodificarHtml } = require('./helpers/app-prueba');

const VISIBILIDAD = {
  admin: { grafica: true, ingresos: true },
  pastor: { grafica: true, ingresos: false },
  secretario: { grafica: true, ingresos: false },
  tesorero: { grafica: false, ingresos: true },
  coordinador: { grafica: false, ingresos: false },
};

function datosDeGrafica(html) {
  const atributo = html.match(/data-asistencias="([^"]*)"/);
  return atributo ? JSON.parse(decodificarHtml(atributo[1])) : null;
}

function indicador(html, etiqueta) {
  const m = html.match(new RegExp(`<span>${etiqueta}</span>\\s*<strong>([^<]*)</strong>`));
  return m && m[1].trim();
}

describe('RF-08 con datos de seed.sql', () => {
  let app;
  const cookies = {};

  before(async () => {
    app = await iniciarApp();
    for (const rol of Object.keys(VISIBILIDAD)) cookies[rol] = await app.sesion(rol);
  });
  after(() => app.cerrar());

  it('sin sesión, /panel redirige a /login', async () => {
    const respuesta = await app.pedir('/panel');
    assert.equal(respuesta.status, 302);
    assert.equal(respuesta.headers.get('location'), '/login');
  });

  for (const [rol, { grafica, ingresos }] of Object.entries(VISIBILIDAD)) {
    it(`${rol}: gráfica ${grafica ? 'visible' : 'oculta'}, ingresos ${ingresos ? 'visibles' : 'ocultos'}`, async () => {
      const respuesta = await app.pedir('/panel', cookies[rol]);
      assert.equal(respuesta.status, 200);
      const html = await respuesta.text();
      assert.equal(html.includes('id="graficaAsistencias"'), grafica);
      assert.equal(html.includes('data-asistencias'), grafica, 'los datos no deben enviarse a un rol sin acceso');
      assert.equal(html.includes('chart.umd'), grafica);
      assert.equal(html.includes('Ingresos del mes'), ingresos);
      for (const etiqueta of ['Miembros activos', 'Próximos eventos', 'Asistencias registradas', 'Ministerios']) {
        assert.ok(html.includes(etiqueta), etiqueta);
      }
      assert.match(html, /<h2>(?:<svg[^>]*>[\s\S]*?<\/svg>)?Avisos<\/h2>/);
    });
  }

  it('los indicadores coinciden con SQLite', async () => {
    const html = await (await app.pedir('/panel', cookies.admin)).text();
    const [esperado] = app.consultarBase('SELECT * FROM v_indicadores_panel');
    assert.equal(Number(indicador(html, 'Miembros activos')), esperado.miembros_activos);
    assert.equal(Number(indicador(html, 'Próximos eventos')), esperado.proximos_eventos);
    assert.equal(Number(indicador(html, 'Asistencias registradas')), esperado.asistencias_registradas);
    assert.equal(Number(indicador(html, 'Ministerios')), esperado.ministerios_activos);
  });

  it('la gráfica usa presentes y ausentes contados directamente de la tabla asistencias', async () => {
    const datos = datosDeGrafica(await (await app.pedir('/panel', cookies.admin)).text());
    const esperado = app.consultarBase(`
      SELECT e.id AS evento_id, e.titulo, e.fecha,
             SUM(a.presente = 1) AS presentes, SUM(a.presente = 0) AS ausentes
      FROM eventos e JOIN asistencias a ON a.evento_id = e.id
      WHERE e.estado <> 'cancelado' GROUP BY e.id ORDER BY e.fecha, e.id
    `).map((f) => ({ ...f }));
    assert.deepEqual(datos, esperado);
  });

  it('la tabla alternativa contiene los títulos completos y las mismas cifras', async () => {
    const html = await (await app.pedir('/panel', cookies.admin)).text();
    for (const e of datosDeGrafica(html)) {
      assert.ok(html.includes(`<td>${e.titulo}</td><td>${e.fecha}</td><td>${e.presentes}</td><td>${e.ausentes}</td>`), e.fecha);
    }
    assert.match(html, /id="graficaError"[^>]*hidden/);
  });

  it('el script de Chart.js tiene versión fija y verificación de integridad', async () => {
    const html = await (await app.pedir('/panel', cookies.admin)).text();
    assert.match(html, /chart\.js@\d+\.\d+\.\d+\/dist\/chart\.umd\.js"\s+integrity="sha384-/);
    assert.equal((await app.pedir('/js/panel-graficas.js')).status, 200);
  });

  it('no se registraron errores del servidor', () => {
    assert.deepEqual(app.registroErrores, []);
  });
});

describe('RF-08 con casos especiales', () => {
  it('toma como máximo los 8 eventos más recientes, en orden cronológico', async () => {
    const eventos = Array.from({ length: 10 }, (_, i) => {
      const id = 800 + i;
      const dia = String(i + 1).padStart(2, '0');
      return `INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
                VALUES (${id}, 'Evento ${dia}', 'culto', '2030-01-${dia}', 'realizado', 1);
              INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por) VALUES
                (${id}, 1, 1, 1), (${id}, 2, 0, 1);`;
    }).join('\n');
    const app = await iniciarApp({ sql: eventos });
    try {
      const datos = datosDeGrafica(await (await app.pedir('/panel', await app.sesion('admin'))).text());
      assert.equal(datos.length, 8);
      assert.deepEqual(datos.map((e) => e.evento_id), [802, 803, 804, 805, 806, 807, 808, 809]);
      assert.ok(datos.every((e) => e.presentes === 1 && e.ausentes === 1));
    } finally {
      await app.cerrar();
    }
  });

  it('excluye eventos cancelados y eventos sin registros', async () => {
    const app = await iniciarApp({
      sql: `INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
              VALUES (850, 'Cancelado', 'culto', '2031-01-01', 'cancelado', 1),
                     (851, 'Sin registros', 'culto', '2031-01-02', 'realizado', 1);
            INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por) VALUES (850, 1, 1, 1);`,
    });
    try {
      const datos = datosDeGrafica(await (await app.pedir('/panel', await app.sesion('admin'))).text());
      assert.ok(!datos.some((e) => e.evento_id === 850 || e.evento_id === 851));
    } finally {
      await app.cerrar();
    }
  });

  it('un título con HTML se escapa en el atributo y en la tabla', async () => {
    const titulo = '</script><img src=x onerror=alert(1)>"\'&';
    const app = await iniciarApp({
      sql: `INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
              VALUES (860, '${titulo.replace(/'/g, "''")}', 'culto', '2032-01-01', 'realizado', 1);
            INSERT INTO asistencias (evento_id, miembro_id, presente, registrado_por) VALUES (860, 1, 1, 1);`,
    });
    try {
      const html = await (await app.pedir('/panel', await app.sesion('admin'))).text();
      assert.ok(!html.includes('<img src=x'));
      assert.equal(datosDeGrafica(html).at(-1).titulo, titulo);
    } finally {
      await app.cerrar();
    }
  });

  it('sin asistencias muestra el mensaje y conserva los indicadores', async () => {
    const app = await iniciarApp({ sql: 'DELETE FROM asistencias;' });
    try {
      const respuesta = await app.pedir('/panel', await app.sesion('admin'));
      assert.equal(respuesta.status, 200);
      const html = await respuesta.text();
      assert.match(html, /Aún no hay asistencias registradas/);
      assert.ok(!html.includes('id="graficaAsistencias"'));
      assert.ok(!html.includes('chart.umd'));
      assert.equal(indicador(html, 'Asistencias registradas'), '0');
      assert.ok(html.includes('Ingresos del mes'));
    } finally {
      await app.cerrar();
    }
  });

  it('si falla la consulta muestra un aviso y el panel responde 200', async () => {
    const app = await iniciarApp({ sql: 'DROP VIEW v_asistencia_por_evento;' });
    try {
      const respuesta = await app.pedir('/panel', await app.sesion('admin'));
      assert.equal(respuesta.status, 200);
      const html = await respuesta.text();
      assert.match(html, /No se pudieron cargar los datos de asistencia/);
      assert.doesNotMatch(html, /no such table/);
      assert.ok(html.includes('Miembros activos'));
      assert.match(app.registroErrores.join(''), /Error al consultar asistencias del panel/);
    } finally {
      await app.cerrar();
    }
  });

  it('un rol sin acceso no ejecuta la consulta: no ve aviso aunque la vista falle', async () => {
    const app = await iniciarApp({ sql: 'DROP VIEW v_asistencia_por_evento;' });
    try {
      const html = await (await app.pedir('/panel', await app.sesion('tesorero'))).text();
      assert.doesNotMatch(html, /No se pudieron cargar los datos de asistencia/);
      assert.deepEqual(app.registroErrores, []);
    } finally {
      await app.cerrar();
    }
  });
});
