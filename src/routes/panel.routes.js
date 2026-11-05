// RF-08  Panel principal
// Rutas: Persona 2 · Vista y gráficas: Persona 1 / Persona 4 · Consultas: Persona 3
// Ya lee las vistas de la BD como ejemplo de cómo consultar.

const router = require('express').Router();
const db = require('../db/connection');
const Anuncios = require('../models/anuncios.model');
const { requireSeccion } = require('../middlewares/auth');
const { ROLES_FINANCIEROS, puedeVer } = require('../config/permisos');

router.get('/', requireSeccion('panel'), (req, res) => {
  const indicadores = db.prepare('SELECT * FROM v_indicadores_panel').get();

  const proximosEventos = db.prepare(`
    SELECT titulo, tipo, fecha, hora, lugar FROM eventos
    WHERE estado = 'programado' AND fecha >= date('now', 'localtime')
    ORDER BY fecha, hora LIMIT 5
  `).all();

  // RF-07: solo anuncios ya publicados; los programados con fecha futura esperan su día.
  const anuncios = Anuncios.publicados(5);

  // Resumen de ingresos SOLO para roles financieros
  let ingresosMes = null;
  if (ROLES_FINANCIEROS.includes(req.session.usuario.rol)) {
    ingresosMes = db.prepare(`
      SELECT COALESCE(SUM(monto_centavos), 0) / 100.0 AS total
      FROM donaciones WHERE strftime('%Y-%m', fecha) = strftime('%Y-%m', 'now', 'localtime')
    `).get().total;
  }

  // RF-08: Consultar las asistencias de los últimos 8 eventos.
  // Solo para los roles con acceso a Asistencias (docs/diagrama-er.md).
  // Si la consulta falla, el panel se muestra igual con un aviso en la gráfica.
  const puedeVerAsistencias = puedeVer(req.session.usuario.rol, 'asistencias');
  let asistenciasPorEvento = [];
  let errorAsistencias = false;
  if (puedeVerAsistencias) {
    try {
      asistenciasPorEvento = db.prepare(`
        SELECT evento_id, titulo, fecha, presentes, ausentes
        FROM v_asistencia_por_evento
        WHERE total_registrados > 0
        ORDER BY fecha DESC, evento_id DESC
        LIMIT 8
      `).all().reverse();
    } catch (err) {
      console.error('Error al consultar asistencias del panel:', err);
      errorAsistencias = true;
    }
  }

  // Enviar los datos al Dashboard.
  res.render('panel', {
    indicadores,
    proximosEventos,
    anuncios,
    ingresosMes,
    puedeVerAsistencias,
    asistenciasPorEvento,
    errorAsistencias
  });

}); // Cierra router.get()

module.exports = router;
