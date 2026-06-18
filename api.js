/* eslint-disable no-console */
/* global window, fetch */

/**
 * Camada central de comunicação com o backend Google Apps Script.
 * Todas as chamadas da aplicação passam por este módulo.
 */
(function initApiModule(global) {
  "use strict";

  /**
   * Configurações globais da aplicação.
   * Substitua os valores abaixo antes de publicar o projeto.
   */
  const APP_CONFIG = {
    appName: "FinControl Pro",
    apiBaseUrl: "",
    googleClientId: "183884459409-mvfkdvh37siaquiun8piuraeb1qrojec.apps.googleusercontent.com",
    defaultCurrency: "BRL",
    cacheKeys: {
      auth: "fincontrol_auth",
      dashboard: "fincontrol_dashboard_cache",
      lancamentos: "fincontrol_lancamentos_cache",
      settings: "fincontrol_settings",
      lastSync: "fincontrol_last_sync"
    }
  };

  /**
   * Remove barras finais para evitar rotas duplicadas.
   */
  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "");
  }

  /**
   * Constrói a URL final da rota, preservando filtros em query string.
   */
  function buildUrl(route, queryParams) {
    const baseUrl = normalizeBaseUrl(APP_CONFIG.apiBaseUrl);
    const url = new URL(`${baseUrl}/${route.replace(/^\/+/, "")}`);

    Object.entries(queryParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  /**
   * Lê o token de sessão salvo localmente.
   */
  function getSavedSession() {
    const rawSession = localStorage.getItem(APP_CONFIG.cacheKeys.auth);
    return rawSession ? JSON.parse(rawSession) : null;
  }

  /**
   * Persiste o último momento de sincronização para a interface.
   */
  function saveLastSync() {
    localStorage.setItem(APP_CONFIG.cacheKeys.lastSync, new Date().toISOString());
  }

  /**
   * Formata respostas com validação consistente.
   */
  async function parseResponse(response) {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok || payload.success === false) {
      throw new Error(payload.message || "Não foi possível concluir a operação.");
    }

    return payload;
  }

  /**
   * Envia requisições simples compatíveis com Apps Script.
   * O backend usa POST com _method quando é necessário simular PUT/DELETE.
   */
  async function request(method, route, data, queryParams) {
    if (!APP_CONFIG.apiBaseUrl || APP_CONFIG.apiBaseUrl.includes("COLE_AQUI")) {
      throw new Error("Configure a URL do Google Apps Script em js/api.js.");
    }

    const url = buildUrl(route, queryParams);
    const session = getSavedSession();

    if (method === "GET") {
      const getParams = Object.assign({}, queryParams, session ? { token: session.token } : {});
      return parseResponse(await fetch(buildUrl(route, getParams), { method: "GET" }));
    }

    const payload = Object.assign({}, data || {}, session ? { token: session.token } : {});

    return parseResponse(
      await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          _method: method,
          ...payload
        })
      })
    );
  }

  /**
   * API pública consumida pelos demais módulos.
   */
  const FinanceAPI = {
    config: APP_CONFIG,

    /**
     * Realiza autenticação da sessão após o login do Google.
     */
    async login(googleCredential) {
      const response = await request("POST", "/login", {
        googleCredential
      });

      saveLastSync();
      return response;
    },

    /**
     * Busca o resumo do dashboard do usuário.
     */
    async getDashboard(filters) {
      const response = await request("GET", "/dashboard", null, filters || {});
      saveLastSync();
      return response;
    },

    /**
     * Lista lançamentos com os filtros selecionados.
     */
    async getLancamentos(filters) {
      const response = await request("GET", "/lancamentos", null, filters || {});
      saveLastSync();
      return response;
    },

    /**
     * Cria um novo lançamento financeiro.
     */
    async createLancamento(payload) {
      const response = await request("POST", "/lancamentos", payload);
      saveLastSync();
      return response;
    },

    /**
     * Atualiza um lançamento existente.
     */
    async updateLancamento(payload) {
      const response = await request("PUT", "/lancamentos", payload);
      saveLastSync();
      return response;
    },

    /**
     * Exclui um lançamento existente.
     */
    async deleteLancamento(id) {
      const response = await request("DELETE", "/lancamentos", { id });
      saveLastSync();
      return response;
    },

    /**
     * Salva preferências do usuário no backend.
     */
    async saveSettings(payload) {
      const response = await request("POST", "/configuracoes", payload);
      saveLastSync();
      return response;
    },

    /**
     * Lê a última data de sincronização salva localmente.
     */
    getLastSync() {
      return localStorage.getItem(APP_CONFIG.cacheKeys.lastSync);
    }
  };

  global.APP_CONFIG = APP_CONFIG;
  global.FinanceAPI = FinanceAPI;
})(window);
