// RF-08  Panel principal
// Rutas: Persona 2 · Vista y gráficas: Persona 1 / Persona 4 · Consultas: Persona 3
// Ya lee las vistas de la BD como ejemplo de cómo consultar.

const router = require('express').Router();
const db = require('../db/connection');
const { requireSeccion } = require('../middlewares/auth');
const { ROLES_FINANCIEROS } = require('../config/permisos');

router.get('/', requireSeccion('panel'), (req, res) => {
  const indicadores = db.prepare('SELECT * FROM v_indicadores_panel').get();

  const proximosEventos = db.prepare(`
    SELECT titulo, tipo, fecha, hora, lugar FROM eventos
    WHERE estado = 'programado' AND fecha >= date('now', 'localtime')
    ORDER BY fecha, hora LIMIT 5
  `).all();

  const anuncios = db.prepare(`
    SELECT titulo, contenido, fecha_publicacion, importante FROM anuncios
    ORDER BY importante DESC, fecha_publicacion DESC LIMIT 5
  `).all();

  // Resumen de ingresos SOLO para roles financieros
  let ingresosMes = null;
  if (ROLES_FINANCIEROS.includes(req.session.usuario.rol)) {
    ingresosMes = db.prepare(`
      SELECT COALESCE(SUM(monto_centavos), 0) / 100.0 AS total
      FROM donaciones WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')
    `).get().total;
  }

  res.render('panel', { indicadores, proximosEventos, anuncios, ingresosMes });
});

module.exports = router;
