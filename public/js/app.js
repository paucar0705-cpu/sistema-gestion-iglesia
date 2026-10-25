// JavaScript del lado del cliente (confirmaciones, filtros, gráficas).
// Responsable: Persona 1 (Frontend)

document.addEventListener('DOMContentLoaded', () => {
  const formLogin = document.querySelector('.login form');
  if (!formLogin) return;

  const campoCorreo = formLogin.querySelector('#correo');
  const campoPassword = formLogin.querySelector('#password');
  const errorCliente = document.querySelector('#errorCliente');
  const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function marcarError(campo, invalido) {
    if (invalido) {
      campo.setAttribute('aria-invalid', 'true');
    } else {
      campo.removeAttribute('aria-invalid');
    }
  }

  function mostrarError(mensaje) {
    errorCliente.textContent = mensaje;
    errorCliente.hidden = false;
  }

  function ocultarError() {
    errorCliente.hidden = true;
    errorCliente.textContent = '';
  }

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
