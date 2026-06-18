/* eslint-disable no-console */
/* global window, fetch, localStorage */

/**
 * Camada central de dados (modo local).
 *
 * IMPORTANTE (sobre “banco de dados no GitHub”):
 * - O arquivo `data/db.json` fica no repositório e é SOMENTE leitura no navegador.
 * - Alterações feitas pelo usuário são salvas no `localStorage` do dispositivo (modo offline-friendly).
 * - Para salvar alterações “de volta no GitHub”, seria necessário backend e autenticação (não recomendado no frontend).
 */
(function initApiModule(global) {
  "use strict";

  const APP_CONFIG = {
    appName: "FinControl Pro",
    /**
     * Modo atual:
     * - "local": usa `data/db.json` como seed + localStorage para persistência no dispositivo
     * - "apps_script": (opcional no futuro) usar Google Apps Script
     */
    storageMode: "local",
    seedUrl: "data/db.json",
    localDbKey: "fincontrol_local_db_v1",
    defaultCurrency: "BRL",
    cacheKeys: {
      auth: "fincontrol_auth",
      dashboard: "fincontrol_dashboard_cache",
      lancamentos: "fincontrol_lancamentos_cache",
      settings: "fincontrol_settings",
      lastSync: "fincontrol_last_sync"
    }
  };

  let initPromise = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function saveLastSync() {
    localStorage.setItem(APP_CONFIG.cacheKeys.lastSync, nowIso());
  }

  function safeJsonParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  async function loadSeed() {
    const response = await fetch(APP_CONFIG.seedUrl, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Não foi possível carregar o banco local (data/db.json).");
    }
    return response.json();
  }

  function readDbFromStorage() {
    return safeJsonParse(localStorage.getItem(APP_CONFIG.localDbKey), null);
  }

  function writeDbToStorage(db) {
    localStorage.setItem(APP_CONFIG.localDbKey, JSON.stringify(db));
    // Mantém compatibilidade com cache/offline já existente no app.
    localStorage.setItem(APP_CONFIG.cacheKeys.settings, JSON.stringify(db.settings || {}));
    localStorage.setItem(APP_CONFIG.cacheKeys.lancamentos, JSON.stringify(db.lancamentos || []));
    saveLastSync();
  }

  async function ensureDb() {
    const existing = readDbFromStorage();
    if (existing && Array.isArray(existing.lancamentos)) {
      return existing;
    }

    const seed = await loadSeed();
    const db = {
      version: seed.version || 1,
      settings: seed.settings || { tema: "auto", moeda: APP_CONFIG.defaultCurrency },
      lancamentos: Array.isArray(seed.lancamentos) ? seed.lancamentos : []
    };
    writeDbToStorage(db);
    return db;
  }

  function summarizeEntries(entries) {
    const totalReceitas = entries
      .filter((entry) => entry.tipo === "receita")
      .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

    const totalDespesas = entries
      .filter((entry) => entry.tipo === "despesa")
      .reduce((sum, entry) => sum + Number(entry.valor || 0), 0);

    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const economiaMes = entries.reduce((sum, entry) => {
      const entryDate = new Date(entry.data + "T12:00:00");
      const isCurrentMonth = entryDate.getMonth() === month && entryDate.getFullYear() === year;
      if (!isCurrentMonth) {
        return sum;
      }
      return sum + (entry.tipo === "receita" ? Number(entry.valor || 0) : Number(entry.valor || 0) * -1);
    }, 0);

    return {
      saldoAtual: totalReceitas - totalDespesas,
      totalReceitas,
      totalDespesas,
      economiaMes,
      quantidadeLancamentos: entries.length,
      referencia: "Modo local"
    };
  }

  function createId() {
    if (global.crypto?.randomUUID) {
      return global.crypto.randomUUID();
    }
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  const FinanceAPI = {
    config: APP_CONFIG,

    init() {
      if (!initPromise) {
        initPromise = ensureDb().catch((error) => {
          console.error(error);
          // Mesmo que falhe o seed, tenta iniciar vazio para o app abrir.
          const db = {
            version: 1,
            settings: { tema: "auto", moeda: APP_CONFIG.defaultCurrency },
            lancamentos: []
          };
          writeDbToStorage(db);
          return db;
        });
      }
      return initPromise;
    },

    async getDashboard() {
      const db = await ensureDb();
      return {
        data: {
          dashboard: summarizeEntries(db.lancamentos),
          settings: db.settings
        }
      };
    },

    async getLancamentos() {
      const db = await ensureDb();
      return {
        data: {
          lancamentos: db.lancamentos
        }
      };
    },

    async createLancamento(payload) {
      const db = await ensureDb();
      const item = {
        id: createId(),
        data: String(payload.data || "").slice(0, 10),
        tipo: payload.tipo,
        categoria: payload.categoria,
        descricao: String(payload.descricao || "").trim(),
        valor: Number(payload.valor || 0),
        dataCriacao: nowIso()
      };
      db.lancamentos.push(item);
      writeDbToStorage(db);
      return { data: { lancamento: item } };
    },

    async updateLancamento(payload) {
      const db = await ensureDb();
      const id = String(payload.id || "");
      const index = db.lancamentos.findIndex((item) => String(item.id) === id);
      if (index === -1) {
        throw new Error("Lançamento não encontrado.");
      }
      db.lancamentos[index] = Object.assign({}, db.lancamentos[index], {
        data: String(payload.data || "").slice(0, 10),
        tipo: payload.tipo,
        categoria: payload.categoria,
        descricao: String(payload.descricao || "").trim(),
        valor: Number(payload.valor || 0)
      });
      writeDbToStorage(db);
      return { data: { lancamento: db.lancamentos[index] } };
    },

    async deleteLancamento(id) {
      const db = await ensureDb();
      const normalizedId = String(id || "");
      db.lancamentos = db.lancamentos.filter((item) => String(item.id) !== normalizedId);
      writeDbToStorage(db);
      return { data: {} };
    },

    async saveSettings(payload) {
      const db = await ensureDb();
      db.settings = Object.assign({}, db.settings, payload || {});
      writeDbToStorage(db);
      return { data: { settings: db.settings } };
    },

    getLastSync() {
      return localStorage.getItem(APP_CONFIG.cacheKeys.lastSync);
    }
  };

  global.APP_CONFIG = APP_CONFIG;
  global.FinanceAPI = FinanceAPI;
})(window);
