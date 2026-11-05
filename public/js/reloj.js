// Fase 3b: hora del widget del encabezado, actualizada con la hora local
// del navegador. El HTML ya trae una hora de respaldo renderizada por el
// servidor para cuando este script no carga.
// Responsable: Persona 1 (Frontend)

(() => {
  const elemento = document.getElementById('aureliaHora');
  if (!elemento) return;

  let intervalo = null;

  function actualizar() {
    const texto = new Date().toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    elemento.textContent = texto;
    elemento.setAttribute('datetime', texto);
  }

  function iniciar() {
    if (intervalo) return;
    actualizar();
    intervalo = setInterval(actualizar, 30000);
  }

  function detener() {
    if (!intervalo) return;
    clearInterval(intervalo);
    intervalo = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) detener();
    else iniciar();
  });

  iniciar();
})();
