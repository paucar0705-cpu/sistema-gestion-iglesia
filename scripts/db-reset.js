// Borra la base de datos y la vuelve a crear con schema.sql + seed.sql
// Uso:  npm run db:reset           (estructura + datos de prueba)
//       npm run db:reset -- --vacia (solo estructura)

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.resolve(process.env.DB_PATH || './data/iglesia.db');
const SCHEMA = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
const SEED = path.join(__dirname, '..', 'src', 'db', 'seed.sql');
const soloEstructura = process.argv.includes('--vacia');

for (const sufijo of ['', '-wal', '-shm']) {
  if (fs.existsSync(DB_PATH + sufijo)) fs.unlinkSync(DB_PATH + sufijo);
}
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

try {
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  console.log('✔ Estructura creada (schema.sql)');

  if (!soloEstructura) {
    db.exec(fs.readFileSync(SEED, 'utf8'));
    console.log('✔ Datos de prueba cargados (seed.sql)');
  }

  const tablas = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  console.log('\nTabla                     Registros');
  for (const { name } of tablas) {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get();
    console.log(`  ${name.padEnd(24)}${n}`);
  }
  console.log(`\nBase de datos lista en: ${DB_PATH}`);
} catch (err) {
  console.error('✘ Error al crear la base de datos:\n', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
