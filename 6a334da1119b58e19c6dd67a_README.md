# FinControl Pro

Sistema financeiro web completo, moderno, responsivo e em português brasileiro, pronto para publicação no GitHub Pages com backend em Google Apps Script e persistência em Google Sheets.

## Estrutura do projeto

```text
/
├── index.html
├── manifest.json
├── service-worker.js
├── README.md
├── css/
│   └── style.css
├── js/
│   ├── api.js
│   ├── auth.js
│   ├── dashboard.js
│   ├── financeiro.js
│   ├── charts.js
│   ├── pwa.js
│   └── app.js
├── icons/
│   ├── icon-192.svg
│   └── icon-512.svg
└── apps-script/
    ├── Code.gs
    └── appsscript.json
```

## Funcionalidades entregues

- Login normal (e-mail e senha) com página de cadastro
- Controle financeiro multiusuário com isolamento por `USER_ID`
- Dashboard com saldo, receitas, despesas, economia do mês e quantidade de lançamentos
- Cadastro, edição, exclusão e pesquisa de receitas e despesas
- Categorias pré-definidas
- Filtros por busca, tipo, categoria, data inicial, data final, mês e ano
- Relatórios com gráfico de pizza, barras, evolução e comparação
- Exportação para CSV e Excel (`.xls` compatível)
- Tema claro, escuro e automático
- PWA instalável
- Offline para consulta com cache local + service worker
- Pronto para hospedagem estática no GitHub Pages

## Como a arquitetura funciona

### Frontend

- O frontend roda de forma totalmente estática.
- O login é feito com e-mail e senha.
- Após autenticar/cadastrar, o Apps Script gera um token de sessão assinado.
- As demais requisições usam esse token de sessão.

### Backend

- O Google Apps Script cria automaticamente as abas `USUARIOS`, `LANCAMENTOS` e `CONFIGURACOES`.
- Cada operação de leitura e escrita é filtrada por `USER_ID`.
- O backend valida dados, sanitiza texto, registra logs e impede manipulação entre usuários.

### Observação importante sobre REST no Apps Script

O Google Apps Script Web App expõe oficialmente apenas `doGet()` e `doPost()`.  
Por isso:

- `GET /dashboard` e `GET /lancamentos` funcionam como `GET`
- `POST /register`, `POST /login`, `POST /lancamentos` e `POST /configuracoes` funcionam como `POST`
- `PUT /lancamentos` e `DELETE /lancamentos` são simulados via `POST` com `_method`

Isso já está resolvido no frontend, então o sistema funciona sem mudar o código.

## Configuração da planilha Google Sheets

Você pode usar o projeto de duas formas:

1. Apps Script vinculado diretamente à planilha
2. Apps Script standalone com propriedade `SPREADSHEET_ID`

### Opção 1: script vinculado à planilha

1. Crie uma nova planilha Google.
2. Abra `Extensões` > `Apps Script`.
3. Apague o conteúdo padrão.
4. Cole o conteúdo de `apps-script/Code.gs`.
5. No menu do editor, abra o arquivo de manifesto e substitua por `apps-script/appsscript.json`.
6. Salve.
7. Execute a função `setupProjeto` uma vez para criar automaticamente as abas.

### Opção 2: script standalone

1. Crie uma planilha Google vazia.
2. Copie o ID da planilha.
3. Crie um novo projeto em [Google Apps Script](https://script.google.com/).
4. Cole `apps-script/Code.gs`.
5. Substitua o manifesto por `apps-script/appsscript.json`.
6. Em `Project Settings` > `Script Properties`, adicione:
   - `SPREADSHEET_ID` = ID da planilha
7. Execute `setupProjeto`.

## Estrutura das abas criadas automaticamente

### `USUARIOS`

- `ID`
- `EMAIL`
- `NOME`
- `DATA_CADASTRO`
- `SENHA_HASH`
- `SALT`

### `LANCAMENTOS`

- `ID`
- `USER_ID`
- `DATA`
- `TIPO`
- `CATEGORIA`
- `DESCRICAO`
- `VALOR`
- `DATA_CRIACAO`

### `CONFIGURACOES`

- `USER_ID`
- `TEMA`
- `MOEDA`

## Login e cadastro (e-mail e senha)

Nesta versão inicial, o sistema usa autenticação própria:

- Cadastro com nome, e-mail e senha (mínimo 6 caracteres)
- Login com e-mail e senha
- Senha não é armazenada em texto: é guardada como `SENHA_HASH` + `SALT`

Observação: o Apps Script não oferece bcrypt/scrypt nativamente. Para cenários de alta criticidade, considere um provedor de autenticação dedicado.

## Configuração do backend Apps Script

### Script Properties recomendadas

Abra `Project Settings` > `Script Properties` e adicione:

- `SESSION_SECRET` = uma chave longa e aleatória
- `SPREADSHEET_ID` = apenas se o script for standalone

Exemplo:

```text
SESSION_SECRET=troque-isto-por-uma-chave-longa-e-segura
```

## Publicação do Google Apps Script

1. No editor Apps Script, clique em `Deploy` > `New deployment`.
2. Selecione `Web app`.
3. Em `Execute as`, escolha `Me`.
4. Em `Who has access`, escolha `Anyone`.
5. Clique em `Deploy`.
6. Copie a URL do web app.

### Onde colocar a URL do web app

Abra `js/api.js` e substitua:

```js
apiBaseUrl: "COLE_AQUI_A_URL_DO_WEB_APP_GOOGLE_APPS_SCRIPT"
```

Use a URL final do tipo:

```text
https://script.google.com/macros/s/SEU_DEPLOYMENT_ID/exec
```

## Publicação do frontend no GitHub Pages

1. Crie um repositório no GitHub.
2. Envie todos os arquivos deste projeto para a branch principal.
3. No GitHub, abra `Settings` > `Pages`.
4. Em `Build and deployment`, escolha `Deploy from a branch`.
5. Selecione a branch e a pasta raiz.
6. Aguarde a URL pública do GitHub Pages.
7. Abra a URL publicada e teste cadastro, login e sincronização com o Apps Script.

## Passo a passo de implantação completo

1. Criar a planilha Google
2. Criar ou vincular o Apps Script
3. Colar `Code.gs` e `appsscript.json`
4. Configurar `SPREADSHEET_ID` se necessário
5. Executar `setupProjeto`
6. Publicar o Web App Apps Script
7. Colar a URL do Web App em `js/api.js`
8. Publicar o frontend no GitHub Pages
9. Testar cadastro, login, criação de lançamentos e dashboard

## Passo a passo para transformar em aplicativo instalável

### Android

1. Abra o site no Chrome
2. Faça login
3. Toque em `Instalar aplicativo` quando o botão aparecer
4. Confirme a instalação
5. O app ficará disponível como aplicativo na tela inicial

### iPhone

1. Abra o site no Safari
2. Toque no botão `Compartilhar`
3. Escolha `Adicionar à Tela de Início`
4. Confirme o nome
5. O app será instalado como web app

## Compatibilidade

- Chrome
- Edge
- Firefox
- Safari para uso do PWA no iPhone

## Como testar o sistema

1. Faça login com uma conta Google autorizada
2. Crie receitas e despesas
3. Aplique filtros por tipo, data, mês, ano e categoria
4. Verifique o dashboard
5. Abra a aba de relatórios
6. Exporte CSV e Excel
7. Recarregue a aplicação offline para validar a consulta em cache

## Segurança implementada

- Validação de token do Google no backend
- Geração de token de sessão assinado
- Validação de tipo, categoria, data e valor
- Sanitização de texto
- Separação rígida por `USER_ID`
- Bloqueio de edição e exclusão entre usuários
- Logs com `Logger.log`

## Observações finais

- O projeto está pronto estruturalmente e funcionalmente.
- Os únicos valores que precisam ser definidos por você são as credenciais reais do Google e a URL do Web App, porque esses dados dependem da sua conta e do seu ambiente.
- A exportação Excel usa `.xls` compatível para evitar bibliotecas pesadas.
- O modo offline é voltado para consulta dos últimos dados sincronizados.
