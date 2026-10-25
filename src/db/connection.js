// Conexión única a SQLite. Todos los módulos importan este archivo:
//   const db = require('../db/connection');
//   const miembros = db.prepare('SELECT * FROM miembros WHERE activo = ?').all(1);
//   const uno      = db.prepare('SELECT * FROM miembros WHERE id = ?').get(id);
//   const info     = db.prepare('INSERT INTO ... VALUES (?, ?)').run(a, b); // info.lastInsertRowid
// Usa el SQLite integrado en Node (node:sqlite), no requiere compilar nada.
// Responsable: Persona 3 (Base de datos)

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.resolve(process.env.DB_PATH || './data/iglesia.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`\n✘ No existe la base de datos en ${DB_PATH}\n  Ejecuta primero:  npm run db:reset\n`);
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');   // SQLite las trae apagadas por defecto
db.exec('PRAGMA journal_mode = WAL;');  // mejor rendimiento con lecturas simultáneas

// Ejecuta varias operaciones como una sola: si una falla, no se guarda ninguna.
// Útil al guardar la asistencia de todos los miembros de un evento.
//   db.transaccion(() => { for (...) stmt.run(...) });
db.transaccion = (fn) => {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

module.exports = db;
