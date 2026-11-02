// RF-08: gráfica de presentes y ausentes por evento del panel principal.
// Los datos llegan desde panel.routes.js en el atributo data-asistencias del canvas.

(() => {
  const lienzo = document.getElementById('graficaAsistencias');
  if (!lienzo) return;

  const contenedor = document.getElementById('graficaContenedor');
  const COLOR_PRESENTES = '#3b5bab'; // --primario
  const COLOR_AUSENTES = '#c2701f';
  const COLOR_TEXTO = '#6b6f76'; // --suave
  const COLOR_LINEA = '#e2e0da'; // --borde
  const ANCHO_ETIQUETA_COMPLETA = 620;

  function mostrarError(err) {
    console.error('No se pudo crear la gráfica de asistencias:', err);
    contenedor.hidden = true;
    document.getElementById('graficaError').hidden = false;
    document.getElementById('graficaDatos').open = true;
  }

  // Se formatea el texto directamente: new Date('2026-10-04') se recorre un día según la zona horaria.
  function fechaCorta(fecha) {
    const [, mes, dia] = fecha.split('-');
    return `${dia}/${mes}`;
  }

  function acortar(texto, maximo) {
    return texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto;
  }

  function dataset(etiqueta, color, valores) {
    return {
      label: etiqueta,
      data: valores,
      backgroundColor: color,
      hoverBackgroundColor: color,
      borderRadius: { topLeft: 4, topRight: 4 },
      borderSkipped: 'bottom',
      borderColor: 'transparent',
      borderWidth: { left: 1, right: 1 },
      maxBarThickness: 28,
    };
  }

  try {
    if (typeof Chart === 'undefined') throw new Error('Chart.js no está disponible');

    const eventos = JSON.parse(lienzo.dataset.asistencias);
    contenedor.hidden = false;

    new Chart(lienzo, {
      type: 'bar',
      data: {
        labels: eventos.map((e) => fechaCorta(e.fecha)),
        datasets: [
          dataset('Presentes', COLOR_PRESENTES, eventos.map((e) => e.presentes)),
          dataset('Ausentes', COLOR_AUSENTES, eventos.map((e) => e.ausentes)),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: COLOR_TEXTO,
              autoSkip: false,
              maxRotation: 0,
              // Con espacio se muestra el evento y la fecha; en pantallas angostas, solo la fecha.
              callback(valor, indice) {
                const fecha = this.getLabelForValue(valor);
                if (this.chart.width < ANCHO_ETIQUETA_COMPLETA) return fecha;
                return [acortar(eventos[indice].titulo, 16), fecha];
              },
            },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: COLOR_LINEA },
            ticks: { color: COLOR_TEXTO, precision: 0 },
            title: { display: true, text: 'Personas', color: COLOR_TEXTO },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: COLOR_TEXTO, boxWidth: 12, boxHeight: 12, useBorderRadius: true, borderRadius: 2 },
          },
          tooltip: {
            callbacks: {
              title: (elementos) => {
                const e = eventos[elementos[0].dataIndex];
                return `${e.titulo} · ${e.fecha}`;
              },
            },
          },
        },
      },
    });
  } catch (err) {
    mostrarError(err);
  }
})();
