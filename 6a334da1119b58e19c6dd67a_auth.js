/* global window, document */

/**
 * Módulo de autenticação temporário: sem login/cadastro.
 * A aplicação roda em “modo local” e grava dados no dispositivo (localStorage).
 */
(function initAuthModule(global) {
  "use strict";

  const GUEST_SESSION = {
    token: "local",
    user: {
      nome: "Modo local",
      email: ""
    },
    settings: null
  };

  function updateUserInterface() {
    const nameElement = document.getElementById("user-name");
    const emailElement = document.getElementById("user-email");
    const avatarElement = document.getElementById("user-avatar");
    const overlay = document.getElementById("login-overlay");
    const logoutButton = document.getElementById("logout-button");
    const newEntryButton = document.getElementById("new-entry-button");

    if (nameElement) nameElement.textContent = GUEST_SESSION.user.nome;
    if (emailElement) emailElement.textContent = "Sem login (temporário)";
    if (avatarElement) avatarElement.textContent = "FC";
    if (overlay) overlay.classList.add("is-hidden");
    if (logoutButton) logoutButton.classList.add("is-hidden");
    if (newEntryButton) newEntryButton.disabled = false;
  }

  global.AuthModule = {
    init() {
      updateUserInterface();
    },
    getSession() {
      return GUEST_SESSION;
    },
    logout() {
      // Não há login; mantido apenas por compatibilidade.
    }
  };
})(window);
