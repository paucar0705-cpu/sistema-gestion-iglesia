// JavaScript del lado del cliente (confirmaciones, filtros, gráficas).
// Responsable: Persona 1 (Frontend)

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.querySelector('.login form');
  if (!formLogin) return;

  const campoCorreo = formLogin.querySelector('#correo');
  const campoPassword = formLogin.querySelector('#password');
  const mensajeError = document.querySelector('#mensajeError');
  const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function marcarError(campo, invalido) {
    if (invalido) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
  }

  function mostrarError(mensaje) {
    mensajeError.textContent = mensaje;
    mensajeError.hidden = false;
  }

  function ocultarError() {
    mensajeError.hidden = true;
    mensajeError.textContent = '';
  }

  [campoCorreo, campoPassword].forEach((campo) => {
    campo.addEventListener('input', () => {
      marcarError(campo, false);
      ocultarError();
    });
  });

  formLogin.addEventListener('submit', (evento) => {
    const correo = campoCorreo.value.trim();
    const password = campoPassword.value.trim();

    const correoInvalido = correo === '' || !regexCorreo.test(correo);
    const passwordInvalida = password === '';

    marcarError(campoCorreo, correoInvalido);
    marcarError(campoPassword, passwordInvalida);

    if (correoInvalido || passwordInvalida) {
      evento.preventDefault();
      if (correoInvalido && passwordInvalida) {
        mostrarError('Ingresa tu correo y tu contraseña.');
      } else if (correoInvalido) {
        mostrarError('Ingresa un correo electrónico válido.');
      } else {
        mostrarError('Ingresa tu contraseña.');
      }
      return;
    }

    ocultarError();
  });
});

document.querySelectorAll('.form-desactivar').forEach((form) => {
  form.addEventListener('submit', (evento) => {
    const nombre = form.dataset.nombre;
    const confirmado = confirm(`¿Desactivar a ${nombre}? Dejará de aparecer entre los miembros activos.`);
    if (!confirmado) evento.preventDefault();
  });
});