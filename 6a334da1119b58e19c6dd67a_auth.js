/* global window, document, localStorage */

/**
 * Módulo de autenticação simples (e-mail e senha).
 * O backend valida o usuário, gera um token de sessão e devolve preferências.
 */
(function initAuthModule(global) {
  "use strict";

  const STORAGE_KEY = global.APP_CONFIG.cacheKeys.auth;

  /**
   * Lê os dados de autenticação salvos em cache.
   */
  function getSession() {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    return rawValue ? JSON.parse(rawValue) : null;
  }

  /**
   * Persiste a sessão no navegador para reaproveitamento offline.
   */
  function saveSession(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  /**
   * Remove a sessão local e limpa possíveis estados residuais.
   */
  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  /**
   * Atualiza os dados do usuário na interface.
   */
  function updateUserInterface(session) {
    const nameElement = document.getElementById("user-name");
    const emailElement = document.getElementById("user-email");
    const avatarElement = document.getElementById("user-avatar");
    const overlay = document.getElementById("login-overlay");
    const logoutButton = document.getElementById("logout-button");
    const newEntryButton = document.getElementById("new-entry-button");

    if (!session || !session.user) {
      nameElement.textContent = "Visitante";
      emailElement.textContent = "Faça login para continuar";
      avatarElement.textContent = "FC";
      overlay.classList.remove("is-hidden");
      logoutButton.classList.add("is-hidden");
      newEntryButton.disabled = true;
      return;
    }

    nameElement.textContent = session.user.nome || "Usuário";
    emailElement.textContent = session.user.email || "";
    avatarElement.textContent = (session.user.nome || session.user.email || "FC")
      .slice(0, 2)
      .toUpperCase();
    overlay.classList.add("is-hidden");
    logoutButton.classList.remove("is-hidden");
    newEntryButton.disabled = false;
  }

  /**
   * Faz login chamando o backend.
   */
  async function handleLogin(email, senha) {
    try {
      const loginResponse = await global.FinanceAPI.login(email, senha);

      const session = {
        token: loginResponse.data.token,
        user: loginResponse.data.user,
        settings: loginResponse.data.settings
      };

      saveSession(session);
      updateUserInterface(session);
      global.FinanceApp.applySettings(session.settings);
      await global.FinanceApp.refreshAllData();
      global.FinanceApp.showToast("Login realizado com sucesso.");
    } catch (error) {
      console.error(error);
      global.FinanceApp.showToast(error.message || "Falha ao autenticar.");
    }
  }

  /**
   * Cria um usuário novo (cadastro) chamando o backend.
   */
  async function handleRegister(nome, email, senha) {
    try {
      const registerResponse = await global.FinanceAPI.register(nome, email, senha);

      const session = {
        token: registerResponse.data.token,
        user: registerResponse.data.user,
        settings: registerResponse.data.settings
      };

      saveSession(session);
      updateUserInterface(session);
      global.FinanceApp.applySettings(session.settings);
      await global.FinanceApp.refreshAllData();
      global.FinanceApp.showToast("Conta criada e login realizado.");
    } catch (error) {
      console.error(error);
      global.FinanceApp.showToast(error.message || "Falha ao criar conta.");
    }
  }

  function setActiveAuthTab(tab) {
    const loginTab = document.getElementById("auth-tab-login");
    const registerTab = document.getElementById("auth-tab-register");
    const loginPanel = document.getElementById("auth-panel-login");
    const registerPanel = document.getElementById("auth-panel-register");

    const isLogin = tab === "login";
    loginTab.classList.toggle("is-active", isLogin);
    registerTab.classList.toggle("is-active", !isLogin);
    loginPanel.classList.toggle("is-hidden", !isLogin);
    registerPanel.classList.toggle("is-hidden", isLogin);
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function bindAuthForms() {
    document.getElementById("auth-tab-login").addEventListener("click", () => setActiveAuthTab("login"));
    document.getElementById("auth-tab-register").addEventListener("click", () => setActiveAuthTab("register"));

    document.getElementById("login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = normalizeEmail(document.getElementById("login-email").value);
      const senha = document.getElementById("login-password").value;

      if (!isValidEmail(email)) {
        global.FinanceApp.showToast("Informe um e-mail válido.");
        return;
      }
      if (!senha || senha.length < 6) {
        global.FinanceApp.showToast("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      await handleLogin(email, senha);
    });

    document.getElementById("register-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const nome = String(document.getElementById("register-name").value || "").trim();
      const email = normalizeEmail(document.getElementById("register-email").value);
      const senha = document.getElementById("register-password").value;
      const senhaConfirm = document.getElementById("register-password-confirm").value;

      if (!nome || nome.length < 2) {
        global.FinanceApp.showToast("Informe seu nome.");
        return;
      }
      if (!isValidEmail(email)) {
        global.FinanceApp.showToast("Informe um e-mail válido.");
        return;
      }
      if (!senha || senha.length < 6) {
        global.FinanceApp.showToast("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
      if (senha !== senhaConfirm) {
        global.FinanceApp.showToast("As senhas não conferem.");
        return;
      }

      await handleRegister(nome, email, senha);
    });

    document.getElementById("auth-demo-fill").addEventListener("click", () => {
      document.getElementById("register-name").value = "Usuário Teste";
      document.getElementById("register-email").value = "usuario@exemplo.com";
      document.getElementById("register-password").value = "123456";
      document.getElementById("register-password-confirm").value = "123456";
      setActiveAuthTab("register");
    });
  }

  /**
   * Remove a sessão atual da interface e do navegador.
   */
  function logout() {
    clearSession();
    updateUserInterface(null);
    global.FinanceApp.resetData();
    global.FinanceApp.showToast("Sessão encerrada.");
  }

  const AuthModule = {
    init() {
      bindAuthForms();
      setActiveAuthTab("login");
      updateUserInterface(getSession());
    },
    getSession,
    saveSession,
    clearSession,
    logout,
    updateUserInterface
  };

  global.AuthModule = AuthModule;
})(window);
