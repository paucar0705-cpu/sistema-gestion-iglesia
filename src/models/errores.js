// Errores de datos que lanzan los modelos.
// Responsable: Persona 3 (Base de datos)
//
// Cuando una regla de la base de datos no se cumple (nombre repetido, monto inválido,
// el miembro ya está en el ministerio, etc.), el modelo lanza un ErrorDatos con:
//   - codigo:  texto fijo para decidir qué hacer en el controlador
//   - message: mensaje en español que se le puede mostrar al usuario
//
// Uso en un controlador:
//   const { ErrorDatos } = require('../models/errores');
//   try {
//     Ministerios.agregarIntegrante(ministerioId, miembroId);
//   } catch (err) {
//     if (err instanceof ErrorDatos) return res.status(422).render(..., { errores: [err.message] });
//     throw err; // cualquier otro error es un fallo real del servidor
//   }

class ErrorDatos extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'ErrorDatos';
    this.codigo = codigo;
  }
}

// ¿El error viene de una restricción UNIQUE de SQLite sobre esta columna?
function esDuplicado(err, tablaColumna) {
  return Boolean(err && err.errcode === 2067 && String(err.message).includes(tablaColumna));
}

module.exports = { ErrorDatos, esDuplicado };
