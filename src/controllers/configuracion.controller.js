// RF-10  Configuración de la iglesia (solo Administrador)
// Controlador: Persona 4 · Vistas: Persona 1 · Consultas: Persona 3 (configuracion.model.js)
//
// El modelo guarda el único registro (id = 1), exige el nombre y conserva el
// logotipo si no se manda logoRuta. Aquí se validan formatos y longitudes.
//
// Logotipo: la SUBIDA del archivo todavía no está definida con el equipo, así que
// no se reciben archivos. Solo se acepta la ruta de una imagen que ya exista en
// public/img/ (lista en `logosDisponibles`), o quitar el logotipo.
// Contrato con las vistas: docs/INTEGRACION_RF07_RF10.md

const fs = require('node:fs');
const path = require('node:path');
const Configuracion = require('../models/configuracion.model');
const { ErrorDatos } = require('../models/errores');

const CARPETA_IMG = path.join(__dirname, '..', '..', 'public', 'img');
const REGEX_LOGO = /^\/img\/([A-Za-z0-9][A-Za-z0-9_-]{0,80}\.(?:png|jpe?g|webp|gif))$/i;
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^[0-9+()#.\s-]+$/;

const LIMITES = {
  nombre: 150,
  direccion: 300,
  telefono: 30,
  correo: 254,
  horarios: 1000,
};

const AVISOS = {
  guardado: 'La configuración de la iglesia se guardó correctamente.',
};

function texto(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function casillaMarcada(valor) {
  return ['on', '1', 'true'].includes(texto(valor).toLowerCase());
}

// Imágenes que hoy existen en public/img/ y cumplen el formato permitido.
function logosDisponibles() {
  let archivos;
  try {
    archivos = fs.readdirSync(CARPETA_IMG, { withFileTypes: true });
  } catch {
    return [];
  }
  return archivos
    .filter((a) => a.isFile() && REGEX_LOGO.test(`/img/${a.name}`))
    .map((a) => `/img/${a.name}`)
    .sort();
}

function logoExiste(ruta) {
  const coincidencia = REGEX_LOGO.exec(ruta);
  if (!coincidencia) return false;
  const archivo = path.join(CARPETA_IMG, coincidencia[1]);
  // El patrón ya impide "/" y "..", pero se comprueba que el archivo quede dentro de la carpeta.
  if (path.dirname(archivo) !== CARPETA_IMG) return false;
  try {
    return fs.statSync(archivo).isFile();
  } catch {
    return false;
  }
}

function leerFormulario(body = {}) {
  return {
    nombre: texto(body.nombre),
    direccion: texto(body.direccion),
    telefono: texto(body.telefono),
    correo: texto(body.correo),
    horarios: texto(body.horarios),
    logo_ruta: texto(body.logo_ruta),
    quitar_logo: casillaMarcada(body.quitar_logo),
  };
}

function validar(datos) {
  const errores = [];
  if (!datos.nombre) errores.push('El nombre de la iglesia es obligatorio.');
  for (const [campo, sujeto] of [
    ['nombre', 'El nombre no puede'], ['direccion', 'La dirección no puede'],
    ['telefono', 'El teléfono no puede'], ['correo', 'El correo no puede'],
    ['horarios', 'Los horarios no pueden'],
  ]) {
    if (datos[campo].length > LIMITES[campo]) {
      errores.push(`${sujeto} exceder ${LIMITES[campo]} caracteres.`);
    }
  }
  if (datos.telefono && datos.telefono.length <= LIMITES.telefono && !REGEX_TELEFONO.test(datos.telefono)) {
    errores.push('El teléfono solo puede contener números, espacios y los signos + ( ) - . #');
  }
  if (datos.correo && datos.correo.length <= LIMITES.correo && !REGEX_CORREO.test(datos.correo)) {
    errores.push('Ingresa un correo electrónico válido.');
  }
  if (!datos.quitar_logo && datos.logo_ruta && !logoExiste(datos.logo_ruta)) {
    errores.push('El logotipo debe ser una imagen PNG, JPG, WEBP o GIF que ya exista en /img/.');
  }
  return errores;
}

// logoRuta: undefined conserva el actual (regla del modelo), null lo quita.
function logoParaModelo(datos) {
  if (datos.quitar_logo) return null;
  return datos.logo_ruta || undefined;
}

function renderFormulario(res, { configuracion, errores, mensaje = null, status = 200 }) {
  return res.status(status).render('configuracion/index', {
    configuracion,
    errores,
    mensaje,
    logosDisponibles: logosDisponibles(),
  });
}

function mostrar(req, res) {
  return renderFormulario(res, {
    configuracion: Configuracion.obtener(),
    errores: [],
    mensaje: typeof req.query.aviso === 'string' && Object.hasOwn(AVISOS, req.query.aviso)
      ? AVISOS[req.query.aviso]
      : null,
  });
}

function actualizar(req, res) {
  const datos = leerFormulario(req.body);
  const actual = Configuracion.obtener();
  // Al volver a mostrar el formulario se conservan los datos escritos y el logo guardado.
  const enFormulario = {
    ...actual,
    nombre: datos.nombre,
    direccion: datos.direccion,
    telefono: datos.telefono,
    correo: datos.correo,
    horarios: datos.horarios,
  };

  const errores = validar(datos);
  if (errores.length) {
    return renderFormulario(res, { configuracion: enFormulario, errores, status: 422 });
  }

  try {
    Configuracion.actualizar({
      nombre: datos.nombre,
      direccion: datos.direccion,
      telefono: datos.telefono,
      correo: datos.correo,
      horarios: datos.horarios,
      logoRuta: logoParaModelo(datos),
    });
  } catch (err) {
    if (!(err instanceof ErrorDatos)) throw err;
    return renderFormulario(res, { configuracion: enFormulario, errores: [err.message], status: 422 });
  }

  return res.redirect('/configuracion?aviso=guardado');
}

module.exports = {
  LIMITES,
  logosDisponibles,
  mostrar,
  actualizar,
};
