// Coherencia entre el Dashboard (RF-08) y los Reportes (RF-09).
// Solo se ejecuta cuando las dos ramas ya están combinadas; en otro caso se omite.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { iniciarApp, filasDeTabla, decodificarHtml } = require('./helpers/app-prueba');

const RAIZ = path.resolve(__dirname, '..');
const combinadas = fs.existsSync(path.join(RAIZ, 'src/views/reportes/detalle.ejs'))
  && fs.existsSync(path.join(RAIZ, 'public/js/panel-graficas.js'));

describe('Integración RF-08 + RF-09', { skip: combinadas ? false : 'Requiere RF-08 y RF-09 combinados' }, () => {
  let app;
  const cookies = {};

  const datosGrafica = async (cookie) => {
    const html = await (await app.pedir('/panel', cookie)).text();
    return JSON.parse(decodificarHtml(html.match(/data-asistencias="([^"]*)"/)[1]));
  };

  before(async () => {
    app = await iniciarApp();
    for (const rol of ['admin', 'pastor', 'secretario', 'tesorero', 'coordinador']) {
      cookies[rol] = await app.sesion(rol);
    }
  });
  after(() => app.cerrar());

  it('cada evento de la gráfica coincide con su fila del reporte en pantalla', async () => {
    const grafica = await datosGrafica(cookies.admin);
    const reporte = filasDeTabla(await (await app.pedir('/reportes/asistencia', cookies.admin)).text());
    assert.ok(grafica.length > 0);
    for (const e of grafica) {
      const fila = reporte.find((f) => f[0] === e.titulo && f[2] === e.fecha);
      assert.ok(fila, `${e.titulo} ${e.fecha}`);
      assert.equal(Number(fila[4]), e.presentes);
      assert.equal(Number(fila[5]), e.ausentes);
    }
  });

  it('cada evento de la gráfica coincide con su fila del Excel', async () => {
    const grafica = await datosGrafica(cookies.admin);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(Buffer.from(await (await app.pedir('/reportes/asistencia/excel', cookies.admin)).arrayBuffer()));
    const filas = [];
    libro.worksheets[0].eachRow((f) => filas.push(f.values.slice(1)));
    for (const e of grafica) {
      const fila = filas.find((f) => f[0] === e.titulo && f[2] === e.fecha);
      assert.ok(fila, `${e.titulo} ${e.fecha}`);
      assert.deepEqual([fila[4], fila[5]], [e.presentes, e.ausentes]);
    }
  });

  it('un rol ve asistencia en el panel si y solo si puede abrir el reporte de asistencia', async () => {
    for (const [rol, cookie] of Object.entries(cookies)) {
      const panel = await (await app.pedir('/panel', cookie)).text();
      const estado = (await app.pedir('/reportes/asistencia', cookie)).status;
      assert.equal(panel.includes('id="graficaAsistencias"'), estado === 200, rol);
    }
  });

  it('un rol ve ingresos en el panel si y solo si puede abrir el reporte de ingresos', async () => {
    for (const [rol, cookie] of Object.entries(cookies)) {
      const panel = await (await app.pedir('/panel', cookie)).text();
      const estado = (await app.pedir('/reportes/ingresos', cookie)).status;
      assert.equal(panel.includes('Ingresos del mes'), estado === 200, rol);
    }
  });

  it('el recorrido completo no registra errores del servidor', async () => {
    for (const ruta of ['/panel', '/reportes', '/reportes/miembros', '/reportes/asistencia', '/reportes/ministerios', '/reportes/ingresos']) {
      assert.equal((await app.pedir(ruta, cookies.admin)).status, 200, ruta);
    }
    assert.deepEqual(app.registroErrores, []);
  });
});
