// Pruebas de RF-09. Ejecutar con:  node --test "test/*.test.js"
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { iniciarApp, filasDeTabla } = require('./helpers/app-prueba');

const REPORTES = ['miembros', 'asistencia', 'ministerios', 'ingresos'];
const ACCESO = {
  admin: { miembros: 200, asistencia: 200, ministerios: 200, ingresos: 200 },
  pastor: { miembros: 200, asistencia: 200, ministerios: 200, ingresos: 403 },
  secretario: { miembros: 200, asistencia: 200, ministerios: 200, ingresos: 403 },
  tesorero: { miembros: 200, asistencia: 403, ministerios: 403, ingresos: 200 },
  coordinador: { miembros: 403, asistencia: 403, ministerios: 403, ingresos: 403 },
};
const ENCABEZADOS = {
  miembros: ['Nombre', 'Teléfono', 'Correo', 'Fecha de ingreso', 'Estado'],
  asistencia: ['Evento', 'Tipo', 'Fecha', 'Registrados', 'Presentes', 'Ausentes', 'Asistencia (%)'],
  ministerios: ['Ministerio', 'Coordinador', 'Integrantes activos', 'Actividades', 'Asistencia (%)'],
  ingresos: ['Mes', 'Concepto', 'Método', 'Aportaciones', 'Anónimas', 'Total (MXN)'],
};

async function leerExcel(respuesta) {
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('content-type'), /spreadsheetml\.sheet/);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await respuesta.arrayBuffer()));
  const hoja = libro.worksheets[0];
  const filas = [];
  hoja.eachRow({ includeEmpty: false }, (fila) => filas.push(fila.values.slice(1)));
  return { hoja, encabezados: filas[0], datos: filas.slice(1) };
}

// Normaliza una celda de pantalla o de Excel para poder compararlas.
function normalizar(valor) {
  if (valor === undefined || valor === null || valor === '' || valor === '—') return '';
  const texto = String(valor).replace(/^\$/, '').replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(texto) ? Number(texto) : String(valor);
}

describe('RF-09 con datos de seed.sql', () => {
  let app;
  const cookies = {};

  before(async () => {
    app = await iniciarApp();
    for (const rol of Object.keys(ACCESO)) cookies[rol] = await app.sesion(rol);
  });
  after(() => app.cerrar());

  describe('Permisos por acceso directo a la URL', () => {
    for (const [rol, reportes] of Object.entries(ACCESO)) {
      for (const [reporte, estado] of Object.entries(reportes)) {
        it(`${rol}: /reportes/${reporte} y su Excel responden ${estado}`, async () => {
          assert.equal((await app.pedir(`/reportes/${reporte}`, cookies[rol])).status, estado);
          assert.equal((await app.pedir(`/reportes/${reporte}/excel`, cookies[rol])).status, estado);
        });
      }
    }

    it('coordinador: /reportes responde 403', async () => {
      assert.equal((await app.pedir('/reportes', cookies.coordinador)).status, 403);
    });

    for (const ruta of ['/reportes', ...REPORTES.flatMap((r) => [`/reportes/${r}`, `/reportes/${r}/excel`])]) {
      it(`sin sesión: ${ruta} redirige a /login`, async () => {
        const respuesta = await app.pedir(ruta);
        assert.equal(respuesta.status, 302);
        assert.equal(respuesta.headers.get('location'), '/login');
      });
    }

    it('una respuesta 403 no incluye datos financieros', async () => {
      const html = await (await app.pedir('/reportes/ingresos', cookies.pastor)).text();
      assert.doesNotMatch(html, /diezmo|ofrenda/i);
    });

    it('el índice solo ofrece los reportes que el rol puede abrir', async () => {
      for (const [rol, reportes] of Object.entries(ACCESO)) {
        if (rol === 'coordinador') continue;
        const html = await (await app.pedir('/reportes', cookies[rol])).text();
        for (const [reporte, estado] of Object.entries(reportes)) {
          assert.equal(html.includes(`href="/reportes/${reporte}"`), estado === 200, `${rol} / ${reporte}`);
        }
      }
    });

    it('un reporte inexistente responde 404, también con nombres especiales', async () => {
      for (const nombre of ['foo', 'constructor', '__proto__']) {
        assert.equal((await app.pedir(`/reportes/${nombre}`, cookies.admin)).status, 404, nombre);
        assert.equal((await app.pedir(`/reportes/${nombre}/excel`, cookies.admin)).status, 404, nombre);
      }
    });
  });

  describe('Consultas contra SQLite', () => {
    it('miembros: incluye activos e inactivos', async () => {
      const [{ total, inactivos }] = app.consultarBase(
        'SELECT COUNT(*) AS total, SUM(activo = 0) AS inactivos FROM miembros',
      );
      const filas = filasDeTabla(await (await app.pedir('/reportes/miembros', cookies.admin)).text());
      assert.equal(filas.length, total);
      assert.equal(filas.filter((f) => f[4] === 'Inactivo').length, inactivos);
    });

    it('asistencia: los totales coinciden con la tabla asistencias y omite cancelados', async () => {
      const esperado = app.consultarBase(`
        SELECT e.fecha, COUNT(a.id) AS registrados, COALESCE(SUM(a.presente), 0) AS presentes
        FROM eventos e LEFT JOIN asistencias a ON a.evento_id = e.id
        WHERE e.estado <> 'cancelado' GROUP BY e.id ORDER BY e.fecha DESC, e.titulo
      `);
      const filas = filasDeTabla(await (await app.pedir('/reportes/asistencia', cookies.admin)).text());
      assert.equal(filas.length, esperado.length);
      filas.forEach((fila, i) => {
        assert.equal(fila[2], esperado[i].fecha);
        assert.equal(Number(fila[3]), esperado[i].registrados);
        assert.equal(Number(fila[4]), esperado[i].presentes);
        assert.equal(Number(fila[5]), esperado[i].registrados - esperado[i].presentes);
      });
      assert.ok(!filas.some((f) => f[0] === 'Campaña de limpieza'));
    });

    it('ministerios: un coordinador nulo se muestra con guion', async () => {
      const filas = filasDeTabla(await (await app.pedir('/reportes/ministerios', cookies.admin)).text());
      assert.equal(filas.find((f) => f[0] === 'Niños')[1], '—');
    });

    it('ingresos: el total coincide al centavo con las donaciones', async () => {
      const [{ centavos, aportaciones, anonimas }] = app.consultarBase(`
        SELECT SUM(monto_centavos) AS centavos, COUNT(*) AS aportaciones,
               SUM(miembro_id IS NULL) AS anonimas FROM donaciones
      `);
      const { datos } = await leerExcel(await app.pedir('/reportes/ingresos/excel', cookies.tesorero));
      assert.equal(datos.reduce((s, f) => s + Math.round(f[5] * 100), 0), centavos);
      assert.equal(datos.reduce((s, f) => s + f[3], 0), aportaciones);
      assert.equal(datos.reduce((s, f) => s + f[4], 0), anonimas);
    });
  });

  describe('Filtros', () => {
    it('asistencia: filtra por rango de fechas con límites incluidos', async () => {
      const filas = filasDeTabla(await (await app.pedir(
        '/reportes/asistencia?desde=2026-10-04&hasta=2026-10-11',
        cookies.admin,
      )).text());
      assert.deepEqual(filas.map((f) => f[2]).sort(), ['2026-10-04', '2026-10-11']);
    });

    it('asistencia: filtra por tipo de evento', async () => {
      const filas = filasDeTabla(await (await app.pedir('/reportes/asistencia?tipo=reunion', cookies.admin)).text());
      assert.ok(filas.length > 0);
      assert.ok(filas.every((f) => f[1] === 'reunion'));
    });

    it('ingresos: el rango se aplica por día y no por mes completo', async () => {
      const { datos } = await leerExcel(await app.pedir(
        '/reportes/ingresos/excel?desde=2026-10-11&hasta=2026-10-11',
        cookies.admin,
      ));
      const [{ centavos }] = app.consultarBase(
        "SELECT SUM(monto_centavos) AS centavos FROM donaciones WHERE fecha = '2026-10-11'",
      );
      assert.equal(datos.reduce((s, f) => s + Math.round(f[5] * 100), 0), centavos);
    });

    for (const consulta of [
      'desde=hola',
      'desde=2026-02-30',
      'hasta=2026-13-01',
      'desde=2026-10-11&hasta=2026-10-04',
      'tipo=inventado',
      "tipo=culto'%20OR%201=1--",
      'desde=2026-01-01&desde=2026-12-31',
      'tipo=culto&tipo=reunion',
    ]) {
      it(`un filtro inválido responde 422 en pantalla y Excel: ${consulta}`, async () => {
        assert.equal((await app.pedir(`/reportes/asistencia?${consulta}`, cookies.admin)).status, 422);
        assert.equal((await app.pedir(`/reportes/asistencia/excel?${consulta}`, cookies.admin)).status, 422);
      });
    }

    it('los filtros se validan después de los permisos', async () => {
      assert.equal((await app.pedir('/reportes/ingresos?desde=hola', cookies.pastor)).status, 403);
    });

    it('un rango sin datos muestra mensaje y un Excel solo con encabezados', async () => {
      for (const reporte of ['asistencia', 'ingresos']) {
        const consulta = 'desde=1990-01-01&hasta=1990-01-31';
        const html = await (await app.pedir(`/reportes/${reporte}?${consulta}`, cookies.admin)).text();
        assert.match(html, /No hay registros para mostrar/);
        assert.match(html, new RegExp(`/reportes/${reporte}/excel\\?desde=1990-01-01&amp;hasta=1990-01-31|/reportes/${reporte}/excel\\?desde=1990-01-01&hasta=1990-01-31`));
        const { encabezados, datos } = await leerExcel(await app.pedir(`/reportes/${reporte}/excel?${consulta}`, cookies.admin));
        assert.deepEqual(encabezados, ENCABEZADOS[reporte]);
        assert.equal(datos.length, 0);
      }
    });
  });

  describe('Excel', () => {
    for (const reporte of REPORTES) {
      it(`${reporte}: estructura y mismos datos que en pantalla`, async () => {
        const html = await (await app.pedir(`/reportes/${reporte}`, cookies.admin)).text();
        const respuesta = await app.pedir(`/reportes/${reporte}/excel`, cookies.admin);
        assert.equal(respuesta.headers.get('content-disposition'), `attachment; filename="reporte-${reporte}.xlsx"`);
        assert.equal(respuesta.headers.get('cache-control'), 'no-store');
        const { encabezados, datos } = await leerExcel(respuesta);
        assert.deepEqual(encabezados, ENCABEZADOS[reporte]);
        const pantalla = filasDeTabla(html).map((f) => f.map(normalizar));
        const excel = datos.map((f) => ENCABEZADOS[reporte].map((_, i) => normalizar(f[i])));
        assert.ok(excel.length > 0);
        assert.deepEqual(excel, pantalla);
      });

      it(`${reporte}: el autofiltro abarca también los datos`, async () => {
        const { hoja, datos } = await leerExcel(await app.pedir(`/reportes/${reporte}/excel`, cookies.admin));
        const ultima = String.fromCharCode(64 + ENCABEZADOS[reporte].length);
        assert.equal(hoja.autoFilter, `A1:${ultima}${datos.length + 1}`);
      });
    }

    it('ingresos: la columna Total es numérica y tiene formato de moneda', async () => {
      const { hoja } = await leerExcel(await app.pedir('/reportes/ingresos/excel', cookies.admin));
      const celda = hoja.getRow(2).getCell(6);
      assert.equal(typeof celda.value, 'number');
      assert.equal(celda.numFmt, '"$"#,##0.00');
    });

    it('asistencia: el exportado respeta los filtros de la pantalla', async () => {
      const consulta = 'desde=2026-10-01&hasta=2026-10-20&tipo=culto';
      const pantalla = filasDeTabla(await (await app.pedir(`/reportes/asistencia?${consulta}`, cookies.admin)).text());
      const { datos } = await leerExcel(await app.pedir(`/reportes/asistencia/excel?${consulta}`, cookies.admin));
      assert.equal(datos.length, pantalla.length);
      assert.deepEqual(datos.map((f) => f[2]), pantalla.map((f) => f[2]));
    });
  });

  it('no se registraron errores del servidor en los recorridos anteriores', () => {
    assert.deepEqual(app.registroErrores, []);
  });
});

describe('RF-09 con casos especiales', () => {
  it('nulos, porcentajes, centavos y caracteres especiales', async () => {
    const titulo = `<b>Ñandú & "cía"</b> =1+1`;
    const app = await iniciarApp({
      sql: `
        INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
          VALUES (900, '${titulo}', 'actividad', '2030-01-01', 'programado', 1);
        INSERT INTO miembros (id, nombre, fecha_ingreso) VALUES (900, 'José =SUM(A1)', '2030-01-01');
        DELETE FROM donaciones;
        INSERT INTO donaciones (fecha, monto_centavos, concepto, metodo, registrado_por) VALUES
          ('2030-01-01', 10, 'otro', 'otro', 1), ('2030-01-02', 20, 'otro', 'otro', 1);
      `,
    });
    try {
      const cookie = await app.sesion('admin');

      const html = await (await app.pedir('/reportes/asistencia?desde=2030-01-01', cookie)).text();
      assert.ok(!html.includes('<b>Ñandú'), 'el título debe escaparse en HTML');
      const [fila] = filasDeTabla(html);
      assert.equal(fila[0], titulo);
      assert.equal(fila[6], '—', 'porcentaje nulo en pantalla');

      const asistencia = await leerExcel(await app.pedir('/reportes/asistencia/excel?desde=2030-01-01', cookie));
      assert.equal(asistencia.datos[0][0], titulo);
      assert.equal(asistencia.datos[0][6], undefined, 'porcentaje nulo en Excel');

      const miembros = await leerExcel(await app.pedir('/reportes/miembros/excel', cookie));
      const celda = miembros.hoja.getColumn(1).values.find((v) => String(v).startsWith('José ='));
      assert.equal(celda, 'José =SUM(A1)');

      // 0.10 + 0.20 debe dar exactamente 0.30, sin error de punto flotante.
      const ingresos = await leerExcel(await app.pedir('/reportes/ingresos/excel', cookie));
      assert.equal(ingresos.datos[0][5], 0.3);
    } finally {
      await app.cerrar();
    }
  });

  it('una celda de Excel que empieza con = se guarda como texto, no como fórmula', async () => {
    const app = await iniciarApp({
      sql: `INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
            VALUES (901, '=HYPERLINK("http://x.test","clic")', 'culto', '2031-01-01', 'programado', 1);`,
    });
    try {
      const { hoja } = await leerExcel(await app.pedir('/reportes/asistencia/excel?desde=2031-01-01', await app.sesion('admin')));
      const celda = hoja.getRow(2).getCell(1);
      assert.equal(typeof celda.value, 'string');
      assert.equal(celda.formula, undefined);
    } finally {
      await app.cerrar();
    }
  });

  it('un carácter de control en un título no corrompe el archivo', async () => {
    const app = await iniciarApp({
      sql: `INSERT INTO eventos (id, titulo, tipo, fecha, estado, creado_por)
            VALUES (902, 'Antes' || char(1) || 'Después', 'culto', '2032-01-01', 'programado', 1);`,
    });
    try {
      const { datos } = await leerExcel(await app.pedir('/reportes/asistencia/excel?desde=2032-01-01', await app.sesion('admin')));
      assert.equal(datos.length, 1);
      assert.match(String(datos[0][0]), /^Antes.*Después$/s);
    } finally {
      await app.cerrar();
    }
  });

  it('sin asistencias: la base vacía se muestra sin errores', async () => {
    const app = await iniciarApp({
      sql: 'DELETE FROM asistencias; DELETE FROM donaciones;',
    });
    try {
      const cookie = await app.sesion('admin');
      const ingresos = await (await app.pedir('/reportes/ingresos', cookie)).text();
      assert.match(ingresos, /No hay registros para mostrar/);
      const asistencia = filasDeTabla(await (await app.pedir('/reportes/asistencia', cookie)).text());
      assert.ok(asistencia.every((f) => f[3] === '0' && f[6] === '—'));
      assert.deepEqual(app.registroErrores, []);
    } finally {
      await app.cerrar();
    }
  });

  it('si falla la consulta responde 500 sin exponer detalles, en pantalla y en Excel', async () => {
    const app = await iniciarApp({ sql: 'DROP VIEW v_asistencia_por_evento;' });
    try {
      const cookie = await app.sesion('admin');
      for (const ruta of ['/reportes/asistencia', '/reportes/asistencia/excel']) {
        const respuesta = await app.pedir(ruta, cookie);
        assert.equal(respuesta.status, 500, ruta);
        const texto = await respuesta.text();
        assert.match(texto, /Ocurrió un error inesperado/);
        assert.doesNotMatch(texto, /v_asistencia_por_evento|no such table/);
      }
    } finally {
      await app.cerrar();
    }
  });
});
