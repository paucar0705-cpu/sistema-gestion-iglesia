// Utilidades para pruebas de caja negra con node:test.
// Levantan la aplicación real (src/app.js) contra una base de datos TEMPORAL,
// creada con schema.sql + seed.sql. Nunca abren data/iglesia.db.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..', '..');
const CONTRASENA = 'Iglesia2026!';
const CORREOS = {
  admin: 'admin@iglesia.test',
  pastor: 'pastor@iglesia.test',
  secretario: 'secretario@iglesia.test',
  tesorero: 'tesorero@iglesia.test',
  coordinador: 'coordinador@iglesia.test',
};

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.on('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

// sql: instrucciones opcionales para preparar el caso de prueba.
function crearBase(sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'sgi-pruebas-'));
  const ruta = path.join(carpeta, 'prueba.db');
  const db = new DatabaseSync(ruta);
  db.exec(fs.readFileSync(path.join(RAIZ, 'src', 'db', 'schema.sql'), 'utf8'));
  db.exec(fs.readFileSync(path.join(RAIZ, 'src', 'db', 'seed.sql'), 'utf8'));
  if (sql) db.exec(sql);
  db.close();
  return { carpeta, ruta };
}

async function iniciarApp({ sql } = {}) {
  const { carpeta, ruta } = crearBase(sql);
  const puerto = await puertoLibre();
  const url = `http://127.0.0.1:${puerto}`;
  const registroErrores = [];

  const proceso = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', 'src/app.js'],
    {
      cwd: RAIZ,
      env: { ...process.env, DB_PATH: ruta, PORT: String(puerto), SESSION_SECRET: 'secreto-de-pruebas' },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  proceso.stderr.on('data', (d) => registroErrores.push(String(d)));

  let listo = false;
  const limite = Date.now() + 30000;
  while (Date.now() < limite && !listo && proceso.exitCode === null) {
    try {
      await fetch(`${url}/login`);
      listo = true;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!listo) {
    proceso.kill();
    throw new Error(`La aplicación no inició: ${registroErrores.join('')}`);
  }

  async function sesion(rol) {
    const respuesta = await fetch(`${url}/login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ correo: CORREOS[rol], password: CONTRASENA }),
    });
    if (respuesta.status !== 302) throw new Error(`No se pudo iniciar sesión como ${rol}: ${respuesta.status}`);
    return respuesta.headers.get('set-cookie').split(';')[0];
  }

  // cookie = null hace la petición sin sesión.
  function pedir(ruta2, cookie = null) {
    return fetch(url + ruta2, { redirect: 'manual', headers: cookie ? { cookie } : {} });
  }

  async function cerrar() {
    if (proceso.exitCode === null) {
      await new Promise((resolve) => {
        proceso.once('exit', resolve);
        proceso.kill();
      });
    }
    fs.rmSync(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }

  // Abre la base temporal para comparar los resultados contra SQLite.
  function consultarBase(consulta, ...parametros) {
    const db = new DatabaseSync(ruta, { readOnly: true });
    try {
      return db.prepare(consulta).all(...parametros);
    } finally {
      db.close();
    }
  }

  return { url, sesion, pedir, cerrar, consultarBase, registroErrores };
}

function decodificarHtml(texto) {
  return texto
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#34;/g, '"').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// Devuelve las celdas de la primera <table> del HTML, sin encabezados.
function filasDeTabla(html) {
  const cuerpo = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!cuerpo) return [];
  return [...cuerpo[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((fila) => [...fila[1].matchAll(/<td>([\s\S]*?)<\/td>/g)]
    .map((celda) => decodificarHtml(celda[1].trim())));
}

module.exports = { iniciarApp, filasDeTabla, decodificarHtml, CORREOS };
