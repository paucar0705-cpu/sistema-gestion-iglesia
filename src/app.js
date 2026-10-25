// Punto de entrada del servidor
require('dotenv').config({ quiet: true });
const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./db/connection');
const { SECCIONES } = require('./config/permisos');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'cambiar-este-secreto',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 }, // 4 horas
}));

// Variables disponibles en TODAS las vistas
app.use((req, res, next) => {
  const usuario = req.session.usuario || null;
  res.locals.usuario = usuario;
  res.locals.rutaActual = req.path;
  res.locals.SECCIONES = SECCIONES;
  res.locals.menu = usuario
    ? Object.entries(SECCIONES).filter(([, s]) => s.roles.includes(usuario.rol))
    : [];
  res.locals.iglesia = db.prepare('SELECT nombre, logo_ruta FROM configuracion_iglesia WHERE id = 1').get()
    || { nombre: 'Sistema de Gestión de Iglesias' };
  next();
});

app.use(require('./routes'));

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'No encontrado', mensaje: 'La página no existe.' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).render('error', { titulo: 'Error del servidor', mensaje: 'Ocurrió un error inesperado.' });
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
