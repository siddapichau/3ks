/**
 * FinControl Pro
 * Backend Google Apps Script para gestão financeira multiusuário com Google Sheets.
 *
 * IMPORTANTE:
 * 1. O Apps Script expõe oficialmente apenas doGet() e doPost().
 * 2. Para manter semântica REST, PUT e DELETE são simulados via POST com o campo _method.
 * 3. O frontend já faz isso automaticamente em js/api.js.
 */

var APP = {
  SHEETS: {
    USUARIOS: "USUARIOS",
    LANCAMENTOS: "LANCAMENTOS",
    CONFIGURACOES: "CONFIGURACOES"
  },
  HEADERS: {
    USUARIOS: ["ID", "EMAIL", "NOME", "DATA_CADASTRO"],
    LANCAMENTOS: ["ID", "USER_ID", "DATA", "TIPO", "CATEGORIA", "DESCRICAO", "VALOR", "DATA_CRIACAO"],
    CONFIGURACOES: ["USER_ID", "TEMA", "MOEDA"]
  },
  CATEGORIAS: [
    "Alimentação",
    "Transporte",
    "Moradia",
    "Saúde",
    "Educação",
    "Lazer",
    "Investimentos",
    "Salário",
    "Outros"
  ],
  TIPOS: ["receita", "despesa"],
  DEFAULT_SETTINGS: {
    tema: "auto",
    moeda: "BRL"
  }
};

/**
 * Entrada GET da API.
 */
function doGet(e) {
  return handleRequest_(e, "GET");
}

/**
 * Entrada POST da API.
 * Se o body incluir _method, essa informação é usada para simular PUT e DELETE.
 */
function doPost(e) {
  var payload = parseJsonBody_(e);
  var method = String(payload._method || "POST").toUpperCase();
  return handleRequest_(e, method, payload);
}

/**
 * Coordenador principal das rotas.
 */
function handleRequest_(e, method, parsedBody) {
  try {
    setupSheets_();

    var route = getRoute_(e);
    var body = parsedBody || parseJsonBody_(e);
    var params = e && e.parameter ? e.parameter : {};

    logInfo_("REQUEST", {
      method: method,
      route: route,
      params: params
    });

    if (route === "/login" && method === "POST") {
      return successResponse_("Login realizado com sucesso.", handleLogin_(body));
    }

    if (route === "/dashboard" && method === "GET") {
      var dashboardUser = authenticateRequest_(params.token);
      return successResponse_("Dashboard carregado com sucesso.", getDashboardData_(dashboardUser, params));
    }

    if (route === "/lancamentos" && method === "GET") {
      var listUser = authenticateRequest_(params.token);
      return successResponse_("Lançamentos carregados com sucesso.", {
        lancamentos: listLancamentos_(listUser.userId, params)
      });
    }

    if (route === "/lancamentos" && method === "POST") {
      var createUser = authenticateRequest_(body.token);
      return successResponse_("Lançamento criado com sucesso.", {
        lancamento: createLancamento_(createUser.userId, body)
      });
    }

    if (route === "/lancamentos" && method === "PUT") {
      var updateUser = authenticateRequest_(body.token);
      return successResponse_("Lançamento atualizado com sucesso.", {
        lancamento: updateLancamento_(updateUser.userId, body)
      });
    }

    if (route === "/lancamentos" && method === "DELETE") {
      var deleteUser = authenticateRequest_(body.token);
      deleteLancamento_(deleteUser.userId, body.id);
      return successResponse_("Lançamento excluído com sucesso.", {});
    }

    if (route === "/configuracoes" && method === "POST") {
      var settingsUser = authenticateRequest_(body.token);
      return successResponse_("Configurações salvas com sucesso.", {
        settings: saveUserSettings_(settingsUser.userId, body)
      });
    }

    return errorResponse_("Rota não encontrada: " + route);
  } catch (error) {
    logError_("REQUEST_ERROR", error);
    return errorResponse_(error.message || "Erro interno no servidor.");
  }
}

/**
 * Resolve a rota a partir do pathInfo ou de um parâmetro manual.
 */
function getRoute_(e) {
  var pathInfo = e && e.pathInfo ? e.pathInfo : "";
  var explicitRoute = e && e.parameter && e.parameter.route ? e.parameter.route : "";
  var route = String(pathInfo || explicitRoute || "/dashboard");
  route = route.charAt(0) === "/" ? route : "/" + route;
  return route.replace(/\/+$/, "") || "/dashboard";
}

/**
 * Faz o login, valida o token do Google e cria uma sessão assinada pelo backend.
 */
function handleLogin_(body) {
  var googleCredential = sanitizeText_(body.googleCredential, 4096);
  if (!googleCredential) {
    throw new Error("A credencial do Google não foi enviada.");
  }

  var googlePayload = validateGoogleCredential_(googleCredential);
  var user = upsertUser_(googlePayload);
  var settings = getOrCreateUserSettings_(user.ID);
  var token = issueSessionToken_(user);

  return {
    token: token,
    user: {
      id: user.ID,
      email: user.EMAIL,
      nome: user.NOME
    },
    settings: settings
  };
}

/**
 * Busca dados consolidados do dashboard.
 */
function getDashboardData_(user, filters) {
  var allEntries = listLancamentos_(user.userId, {});
  var filteredEntries = listLancamentos_(user.userId, filters);
  var totals = summarizeEntries_(filteredEntries);
  var currentMonthBalance = summarizeCurrentMonth_(allEntries);
  var settings = getOrCreateUserSettings_(user.userId);

  return {
    dashboard: {
      saldoAtual: totals.totalReceitas - totals.totalDespesas,
      totalReceitas: totals.totalReceitas,
      totalDespesas: totals.totalDespesas,
      economiaMes: currentMonthBalance,
      quantidadeLancamentos: filteredEntries.length,
      referencia: "Período selecionado"
    },
    settings: settings
  };
}

/**
 * Consolida receitas e despesas.
 */
function summarizeEntries_(entries) {
  return entries.reduce(
    function (accumulator, entry) {
      if (entry.tipo === "receita") {
        accumulator.totalReceitas += Number(entry.valor || 0);
      } else {
        accumulator.totalDespesas += Number(entry.valor || 0);
      }
      return accumulator;
    },
    { totalReceitas: 0, totalDespesas: 0 }
  );
}

/**
 * Calcula a economia do mês corrente.
 */
function summarizeCurrentMonth_(entries) {
  var now = new Date();
  var month = now.getMonth();
  var year = now.getFullYear();

  return entries.reduce(function (sum, entry) {
    var entryDate = new Date(entry.data + "T12:00:00");
    if (entryDate.getMonth() !== month || entryDate.getFullYear() !== year) {
      return sum;
    }

    return sum + (entry.tipo === "receita" ? Number(entry.valor || 0) : Number(entry.valor || 0) * -1);
  }, 0);
}

/**
 * Lista os lançamentos do usuário com filtros opcionais.
 */
function listLancamentos_(userId, filters) {
  var sheet = getSheet_(APP.SHEETS.LANCAMENTOS);
  var rows = getSheetRecords_(sheet);
  var search = sanitizeText_(filters.search || "", 120).toLowerCase();

  return rows
    .filter(function (row) {
      if (row.USER_ID !== userId) {
        return false;
      }

      var rowDate = new Date(String(row.DATA) + "T12:00:00");
      var matchesSearch =
        !search ||
        String(row.DESCRICAO).toLowerCase().indexOf(search) > -1 ||
        String(row.CATEGORIA).toLowerCase().indexOf(search) > -1 ||
        String(row.VALOR).toLowerCase().indexOf(search) > -1;

      var matchesTipo = !filters.tipo || String(row.TIPO) === String(filters.tipo);
      var matchesCategoria = !filters.categoria || String(row.CATEGORIA) === String(filters.categoria);
      var matchesDataInicial = !filters.dataInicial || String(row.DATA) >= String(filters.dataInicial);
      var matchesDataFinal = !filters.dataFinal || String(row.DATA) <= String(filters.dataFinal);
      var matchesMes = !filters.mes || String(rowDate.getMonth() + 1) === String(filters.mes);
      var matchesAno = !filters.ano || String(rowDate.getFullYear()) === String(filters.ano);

      return matchesSearch && matchesTipo && matchesCategoria && matchesDataInicial && matchesDataFinal && matchesMes && matchesAno;
    })
    .map(function (row) {
      return {
        id: row.ID,
        userId: row.USER_ID,
        data: row.DATA,
        tipo: row.TIPO,
        categoria: row.CATEGORIA,
        descricao: row.DESCRICAO,
        valor: Number(row.VALOR || 0),
        dataCriacao: row.DATA_CRIACAO
      };
    })
    .sort(function (a, b) {
      if (a.data === b.data) {
        return String(b.dataCriacao).localeCompare(String(a.dataCriacao));
      }
      return String(b.data).localeCompare(String(a.data));
    });
}

/**
 * Cria um novo lançamento protegido por usuário.
 */
function createLancamento_(userId, body) {
  var payload = validateLancamentoPayload_(body);
  var sheet = getSheet_(APP.SHEETS.LANCAMENTOS);
  var id = Utilities.getUuid();
  var now = new Date().toISOString();

  sheet.appendRow([
    id,
    userId,
    payload.data,
    payload.tipo,
    payload.categoria,
    payload.descricao,
    payload.valor,
    now
  ]);

  return {
    id: id,
    userId: userId,
    data: payload.data,
    tipo: payload.tipo,
    categoria: payload.categoria,
    descricao: payload.descricao,
    valor: payload.valor,
    dataCriacao: now
  };
}

/**
 * Atualiza um lançamento existente, respeitando o dono do registro.
 */
function updateLancamento_(userId, body) {
  var payload = validateLancamentoPayload_(body, true);
  if (!payload.id) {
    throw new Error("O ID do lançamento é obrigatório para atualização.");
  }

  var sheet = getSheet_(APP.SHEETS.LANCAMENTOS);
  var records = getSheetRecords_(sheet);
  var rowIndex = -1;

  for (var index = 0; index < records.length; index += 1) {
    if (records[index].ID === payload.id && records[index].USER_ID === userId) {
      rowIndex = index + 2;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error("Lançamento não encontrado para este usuário.");
  }

  sheet.getRange(rowIndex, 3, 1, 5).setValues([
    [payload.data, payload.tipo, payload.categoria, payload.descricao, payload.valor]
  ]);

  return {
    id: payload.id,
    userId: userId,
    data: payload.data,
    tipo: payload.tipo,
    categoria: payload.categoria,
    descricao: payload.descricao,
    valor: payload.valor
  };
}

/**
 * Exclui um lançamento do usuário autenticado.
 */
function deleteLancamento_(userId, id) {
  var sanitizedId = sanitizeText_(id, 80);
  if (!sanitizedId) {
    throw new Error("O ID do lançamento é obrigatório.");
  }

  var sheet = getSheet_(APP.SHEETS.LANCAMENTOS);
  var records = getSheetRecords_(sheet);

  for (var index = 0; index < records.length; index += 1) {
    if (records[index].ID === sanitizedId && records[index].USER_ID === userId) {
      sheet.deleteRow(index + 2);
      return true;
    }
  }

  throw new Error("Lançamento não encontrado para exclusão.");
}

/**
 * Persiste configurações do usuário.
 */
function saveUserSettings_(userId, body) {
  var tema = sanitizeText_(body.tema || APP.DEFAULT_SETTINGS.tema, 20).toLowerCase();
  var moeda = sanitizeText_(body.moeda || APP.DEFAULT_SETTINGS.moeda, 10).toUpperCase();

  if (["auto", "light", "dark"].indexOf(tema) === -1) {
    throw new Error("Tema inválido.");
  }

  if (["BRL", "USD", "EUR"].indexOf(moeda) === -1) {
    throw new Error("Moeda inválida.");
  }

  var sheet = getSheet_(APP.SHEETS.CONFIGURACOES);
  var records = getSheetRecords_(sheet);

  for (var index = 0; index < records.length; index += 1) {
    if (records[index].USER_ID === userId) {
      sheet.getRange(index + 2, 2, 1, 2).setValues([[tema, moeda]]);
      return { tema: tema, moeda: moeda };
    }
  }

  sheet.appendRow([userId, tema, moeda]);
  return { tema: tema, moeda: moeda };
}

/**
 * Valida e higieniza o payload do lançamento.
 */
function validateLancamentoPayload_(body, requiresId) {
  var id = sanitizeText_(body.id || "", 80);
  var data = sanitizeText_(body.data || "", 10);
  var tipo = sanitizeText_(body.tipo || "", 20).toLowerCase();
  var categoria = sanitizeText_(body.categoria || "", 60);
  var descricao = sanitizeText_(body.descricao || "", 120);
  var valor = Number(body.valor);

  if (requiresId && !id) {
    throw new Error("O ID do lançamento é obrigatório.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new Error("A data deve estar no formato AAAA-MM-DD.");
  }

  if (APP.TIPOS.indexOf(tipo) === -1) {
    throw new Error("Tipo de lançamento inválido.");
  }

  if (APP.CATEGORIAS.indexOf(categoria) === -1) {
    throw new Error("Categoria inválida.");
  }

  if (!descricao) {
    throw new Error("A descrição é obrigatória.");
  }

  if (!isFinite(valor) || valor <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }

  return {
    id: id,
    data: data,
    tipo: tipo,
    categoria: categoria,
    descricao: descricao,
    valor: roundCurrency_(valor)
  };
}

/**
 * Remove caracteres potencialmente perigosos e limita tamanho.
 */
function sanitizeText_(value, maxLength) {
  return String(value || "")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxLength || 255);
}

/**
 * Arredonda moeda com duas casas.
 */
function roundCurrency_(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Garante que o token da sessão seja válido e devolve o contexto do usuário.
 */
function authenticateRequest_(token) {
  var sanitizedToken = sanitizeText_(token, 4096);
  if (!sanitizedToken) {
    throw new Error("Usuário não autenticado.");
  }

  return verifySessionToken_(sanitizedToken);
}

/**
 * Emite um token assinado para as próximas chamadas do frontend.
 */
function issueSessionToken_(user) {
  var payload = {
    userId: user.ID,
    email: user.EMAIL,
    nome: user.NOME,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7
  };

  var encodedPayload = Utilities.base64EncodeWebSafe(JSON.stringify(payload));
  var secret = getSessionSecret_();
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(encodedPayload, secret)
  );

  return encodedPayload + "." + signature;
}

/**
 * Valida a assinatura e a expiração do token.
 */
function verifySessionToken_(token) {
  var parts = String(token).split(".");
  if (parts.length !== 2) {
    throw new Error("Token de sessão inválido.");
  }

  var encodedPayload = parts[0];
  var receivedSignature = parts[1];
  var expectedSignature = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(encodedPayload, getSessionSecret_())
  );

  if (receivedSignature !== expectedSignature) {
    throw new Error("Assinatura da sessão inválida.");
  }

  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(encodedPayload)).getDataAsString());

  if (!payload.exp || Number(payload.exp) < Date.now()) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  return payload;
}

/**
 * Recupera ou cria a configuração padrão do usuário.
 */
function getOrCreateUserSettings_(userId) {
  var sheet = getSheet_(APP.SHEETS.CONFIGURACOES);
  var records = getSheetRecords_(sheet);

  for (var index = 0; index < records.length; index += 1) {
    if (records[index].USER_ID === userId) {
      return {
        tema: records[index].TEMA || APP.DEFAULT_SETTINGS.tema,
        moeda: records[index].MOEDA || APP.DEFAULT_SETTINGS.moeda
      };
    }
  }

  sheet.appendRow([userId, APP.DEFAULT_SETTINGS.tema, APP.DEFAULT_SETTINGS.moeda]);
  return {
    tema: APP.DEFAULT_SETTINGS.tema,
    moeda: APP.DEFAULT_SETTINGS.moeda
  };
}

/**
 * Valida o ID token do Google e devolve os dados principais do usuário.
 */
function validateGoogleCredential_(credential) {
  var response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential),
    {
      muteHttpExceptions: true
    }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error("Não foi possível validar o login com Google.");
  }

  var payload = JSON.parse(response.getContentText());
  var allowedClientIds = getAllowedClientIds_();

  if (allowedClientIds.length && allowedClientIds.indexOf(payload.aud) === -1) {
    throw new Error("Este Client ID não está autorizado.");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("O login do Google não retornou dados suficientes.");
  }

  return {
    id: payload.sub,
    email: payload.email,
    nome: payload.name || payload.email.split("@")[0]
  };
}

/**
 * Cria ou atualiza o usuário na aba USUARIOS.
 */
function upsertUser_(googlePayload) {
  var sheet = getSheet_(APP.SHEETS.USUARIOS);
  var records = getSheetRecords_(sheet);

  for (var index = 0; index < records.length; index += 1) {
    if (records[index].ID === googlePayload.id || records[index].EMAIL === googlePayload.email) {
      sheet.getRange(index + 2, 1, 1, 3).setValues([[googlePayload.id, googlePayload.email, googlePayload.nome]]);
      return {
        ID: googlePayload.id,
        EMAIL: googlePayload.email,
        NOME: googlePayload.nome
      };
    }
  }

  sheet.appendRow([googlePayload.id, googlePayload.email, googlePayload.nome, new Date().toISOString()]);
  return {
    ID: googlePayload.id,
    EMAIL: googlePayload.email,
    NOME: googlePayload.nome
  };
}

/**
 * Cria as abas exigidas pelo projeto automaticamente.
 */
function setupSheets_() {
  ensureSheet_(APP.SHEETS.USUARIOS, APP.HEADERS.USUARIOS);
  ensureSheet_(APP.SHEETS.LANCAMENTOS, APP.HEADERS.LANCAMENTOS);
  ensureSheet_(APP.SHEETS.CONFIGURACOES, APP.HEADERS.CONFIGURACOES);
}

/**
 * Cria a aba se ela não existir e garante os cabeçalhos.
 */
function ensureSheet_(sheetName, headers) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needsHeader = headers.some(function (header, index) {
    return currentHeaders[index] !== header;
  });

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }
}

/**
 * Recupera a planilha principal.
 * Preferência:
 * 1. Propriedade SPREADSHEET_ID
 * 2. Planilha vinculada ao script
 */
function getSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = properties.getProperty("SPREADSHEET_ID");

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * Atalho para obter uma aba específica.
 */
function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("A aba " + sheetName + " não foi encontrada.");
  }
  return sheet;
}

/**
 * Converte as linhas de uma aba em objetos indexados por cabeçalho.
 */
function getSheetRecords_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return [];
  }

  var headers = data[0];
  return data.slice(1).map(function (row) {
    return headers.reduce(function (record, header, index) {
      record[header] = row[index];
      return record;
    }, {});
  });
}

/**
 * Faz o parse seguro do body JSON.
 */
function parseJsonBody_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
  } catch (error) {
    throw new Error("O corpo da requisição não contém JSON válido.");
  }

  return {};
}

/**
 * Lê a lista de Client IDs permitidos nas propriedades do script.
 * Exemplo:
 * ALLOWED_GOOGLE_CLIENT_IDS=abc.apps.googleusercontent.com,xyz.apps.googleusercontent.com
 */
function getAllowedClientIds_() {
  var properties = PropertiesService.getScriptProperties();
  var rawValue = properties.getProperty("ALLOWED_GOOGLE_CLIENT_IDS") || "";

  return rawValue
    .split(",")
    .map(function (item) {
      return sanitizeText_(item, 200);
    })
    .filter(String);
}

/**
 * Usa SESSION_SECRET quando existir; caso contrário, deriva um segredo local.
 */
function getSessionSecret_() {
  var properties = PropertiesService.getScriptProperties();
  return properties.getProperty("SESSION_SECRET") || ScriptApp.getScriptId();
}

/**
 * Retorna resposta JSON padronizada.
 */
function successResponse_(message, data) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: true,
      message: message,
      data: data || {}
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Retorna resposta de erro padronizada.
 */
function errorResponse_(message) {
  return ContentService.createTextOutput(
    JSON.stringify({
      success: false,
      message: message
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Log simples de eventos informativos.
 */
function logInfo_(eventName, payload) {
  Logger.log(JSON.stringify({ level: "INFO", event: eventName, payload: payload }));
}

/**
 * Log simples para rastreio de erros.
 */
function logError_(eventName, error) {
  Logger.log(
    JSON.stringify({
      level: "ERROR",
      event: eventName,
      message: error && error.message ? error.message : "Erro sem mensagem",
      stack: error && error.stack ? error.stack : ""
    })
  );
}

/**
 * Utilitário opcional para inicialização manual.
 * Execute uma vez no editor Apps Script se quiser forçar a criação das abas.
 */
function setupProjeto() {
  setupSheets_();
}
