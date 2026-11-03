// RF-10  Configuración de la iglesia — consultas a la base de datos
// Responsable: Persona 3 (Base de datos)
//
// Reglas del módulo:
//  * Siempre hay UN solo registro (id = 1). El CHECK (id = 1) de schema.sql impide crear otro.
//  * El nombre es obligatorio (se muestra en el menú, el título y el login).
//  * El logotipo se guarda como ARCHIVO en public/img/ (eso lo hace backend);
//    aquí solo se guarda su ruta, por ejemplo '/img/logo.png'.
//
// Si algo no cumple las reglas se lanza ErrorDatos (ver errores.js).

const db = require('../db/connection');
const { ErrorDatos } = require('./errores');

const NOMBRE_POR_DEFECTO = 'Sistema de Gestión de Iglesias';

function textoOpcional(valor) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  return texto || null;
}

// Devuelve siempre un objeto (aunque la tabla estuviera vacía) con:
// nombre, logo_ruta, direccion, telefono, correo, horarios, actualizado_en
function obtener() {
  const fila = db.prepare(`
    SELECT nombre, logo_ruta, direccion, telefono, correo, horarios, actualizado_en
    FROM configuracion_iglesia WHERE id = 1
  `).get();
  return fila || {
    nombre: NOMBRE_POR_DEFECTO, logo_ruta: null, direccion: null,
    telefono: null, correo: null, horarios: null, actualizado_en: null,
  };
}

// Guarda los datos generales. Si logoRuta NO se manda (undefined), se conserva el logo
// actual; así el formulario puede guardarse sin volver a subir la imagen.
// Para quitar el logo, mandar logoRuta: null.
function actualizar({ nombre, logoRuta, direccion, telefono, correo, horarios }) {
  const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (!nombreLimpio) throw new ErrorDatos('NOMBRE_REQUERIDO', 'El nombre de la iglesia es obligatorio.');

  const logo = logoRuta === undefined ? obtener().logo_ruta : textoOpcional(logoRuta);

  db.prepare(`
    INSERT INTO configuracion_iglesia (id, nombre, logo_ruta, direccion, telefono, correo, horarios, actualizado_en)
    VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT (id) DO UPDATE SET
      nombre = excluded.nombre,
      logo_ruta = excluded.logo_ruta,
      direccion = excluded.direccion,
      telefono = excluded.telefono,
      correo = excluded.correo,
      horarios = excluded.horarios,
      actualizado_en = excluded.actualizado_en
  `).run(
    nombreLimpio,
    logo,
    textoOpcional(direccion),
    textoOpcional(telefono),
    textoOpcional(correo),
    textoOpcional(horarios),
  );
  return obtener();
}

// Solo cambia el logotipo (por ejemplo, desde un formulario aparte de subida de archivo).
function actualizarLogo(logoRuta) {
  const actual = obtener();
  return actualizar({ ...actual, logoRuta: textoOpcional(logoRuta) });
}

module.exports = {
  obtener,
  actualizar,
  actualizarLogo,
};
