// Confirmación antes de dar de baja a un integrante. Responsable: Persona 1 (Frontend)

document.querySelectorAll('.form-baja-integrante').forEach((form) => {
  form.addEventListener('submit', (evento) => {
    const nombre = form.dataset.nombre;
    const confirmado = confirm(`¿Dar de baja a ${nombre} de este ministerio?`);
    if (!confirmado) evento.preventDefault();
  });
});
