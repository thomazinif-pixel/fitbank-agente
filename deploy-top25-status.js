// Deploy: Jarvis — Dashboard Top25 Status
// Webhook GET /dashboard-top25-status
// Retorna top 25 clientes com breakdown Open/Pending/Hold/Solved/Closed (mês corrente)
// Replica a lógica do BLOCO 3 do Jarvis — Crisis Detection Agent

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg';
const BASE    = 'https://felipethomazini.app.n8n.cloud/api/v1';
const HEADERS = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' };

const ZENDESK_CRED_ID   = 'bX1MNqjOSwyjcH1o';
const ZENDESK_CRED_NAME = 'Zendesk FitBank';
const SHEETS_CRED_ID    = 'zXv4Pq489R87WbM9';
const SHEETS_CRED_NAME  = 'Google Sheets account';
const SHEET_DOC_ID      = '133lC04N4Lhp1hZeCpGlkhJllkn_oSoCaDZRY_1vV7KY';
const ZENDESK_BASE      = 'https://opsfitbank.zendesk.com/api/v2/search.json';

// ---------- CODE: Montar Query de Organizações ----------
const CODE_MONTAR_QUERY = `
const top25  = $('Ler Top25 IDs').all().map(i => i.json);
const orgsRaw = $('Ler Orgs Zendesk').all().map(i => i.json);

const normCnpj = v => {
  const d = String(v || '').replace(/\\D/g, '');
  if (d.length === 14) return d;
  if (d.length === 13) return d.slice(0,8) + '0' + d.slice(8);
  return d.padStart(14, '0');
};

const cnpjToOrgId = {};
orgsRaw.forEach(item => {
  (item.results || item.organizations || []).forEach(org => {
    const cnpj = normCnpj((org.organization_fields?.cnpj || ''));
    if (cnpj && cnpj !== '00000000000000') cnpjToOrgId[cnpj] = org.id;
  });
});

const orgIds = top25
  .map(c => cnpjToOrgId[normCnpj(c.cnpj || c.id_zendesk)])
  .filter(Boolean);

const orgsQuery = orgIds.length
  ? orgIds.map(id => \`organization_id:\${id}\`).join(' ')
  : 'organization_id:0'; // fallback seguro se nenhum CNPJ mapeado

return [{ json: { orgsQuery, matched: orgIds.length } }];
`.trim();

// ---------- CODE: Agregar stats por cliente ----------
const CODE_AGREGAR = `
// Mapear org_id → nome
const orgsRaw = $('Ler Orgs Zendesk').all().map(i => i.json);
const orgIdToName = {};
orgsRaw.forEach(item => {
  (item.results || item.organizations || []).forEach(org => {
    orgIdToName[org.id] = org.name;
  });
});

// Coletar tickets de cada nó de status
const getRes = name => {
  try { return $node[name].json?.results || []; } catch(e) { return []; }
};

const t25Open    = getRes('Top25 Open');
const t25Pending = getRes('Top25 Pending');
const t25Hold    = getRes('Top25 Hold');
const t25Solved  = [
  ...getRes('Top25 Solved'),
  ...getRes('Top25 Solved P2'),
  ...getRes('Top25 Solved P3'),
];
const t25Closed  = [
  ...getRes('Top25 Closed'),
  ...getRes('Top25 Closed P2'),
  ...getRes('Top25 Closed P3'),
];

// Agregar por cliente
const table = {};
const countByOrg = (tickets, statusKey) => {
  tickets.forEach(t => {
    const orgId = t.organization_id;
    if (!orgId) return;
    const nome = orgIdToName[orgId] || \`Org \${orgId}\`;
    if (!table[orgId]) table[orgId] = { nome, open: 0, pending: 0, hold: 0, solved: 0, closed: 0 };
    table[orgId][statusKey]++;
  });
};

countByOrg(t25Open,    'open');
countByOrg(t25Pending, 'pending');
countByOrg(t25Hold,    'hold');
countByOrg(t25Solved,  'solved');
countByOrg(t25Closed,  'closed');

// Ordenar por ativos (open + pending + hold) desc
const clientes = Object.values(table)
  .sort((a, b) => (b.open + b.pending + b.hold) - (a.open + a.pending + a.hold));

return [{ json: { clientes, generatedAt: new Date().toISOString() } }];
`.trim();

// ---------- Helper: nó HTTP Zendesk search ----------
function zendeskNode(name, queryValue, position, page) {
  const qparams = [
    { name: 'query',    value: queryValue },
    { name: 'per_page', value: '100' },
  ];
  if (page && page > 1) qparams.push({ name: 'page', value: String(page) });
  return {
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    credentials: { httpBasicAuth: { id: ZENDESK_CRED_ID, name: ZENDESK_CRED_NAME } },
    parameters: {
      url: ZENDESK_BASE,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendQuery: true,
      queryParameters: { parameters: qparams },
      options: {},
    },
  };
}

async function deploy() {
  console.log('🔍 Verificando workflows existentes...');
  const listRes  = await fetch(`${BASE}/workflows?limit=100`, { headers: HEADERS });
  const listData = await listRes.json();

  const existing = (listData.data || []).find(w => w.name === 'Jarvis — Dashboard Top25 Status');
  if (existing) {
    console.log(`🗑️  Removendo "${existing.name}" (ID: ${existing.id})...`);
    await fetch(`${BASE}/workflows/${existing.id}/deactivate`, { method: 'POST', headers: HEADERS });
    await fetch(`${BASE}/workflows/${existing.id}`, { method: 'DELETE', headers: HEADERS });
  }

  // Query de mês corrente (mesmo critério do Crisis Detection Agent)
  // new Date(year, month, 0) = último dia do mês anterior = início do mês corrente
  const MONTH_START = `={{ 'type:ticket status:solved created>' + new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0,10) + ' ' + $('Montar Query').first().json.orgsQuery }}`;
  const MONTH_CLOSED = `={{ 'type:ticket status:closed created>' + new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().slice(0,10) + ' ' + $('Montar Query').first().json.orgsQuery }}`;

  const workflow = {
    name: 'Jarvis — Dashboard Top25 Status',
    nodes: [
      // 1. Webhook
      {
        id: 'wh-t25',
        name: 'Webhook Top25 Status',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 300],
        parameters: {
          path: 'dashboard-top25-status',
          httpMethod: 'GET',
          responseMode: 'responseNode',
          options: {},
        },
      },
      // 2. Google Sheets: Ler Top25 IDs
      {
        name: 'Ler Top25 IDs',
        type: 'n8n-nodes-base.googleSheets',
        typeVersion: 4.5,
        position: [240, 300],
        credentials: { googleSheetsOAuth2Api: { id: SHEETS_CRED_ID, name: SHEETS_CRED_NAME } },
        parameters: {
          operation: 'read',
          documentId: { __rl: true, mode: 'id', value: SHEET_DOC_ID },
          sheetName:  { __rl: true, mode: 'name', value: 'Clientes_Top25' },
          dataLocationOnSheet: { values: { rangeDefinition: 'detectAutomatically' } },
        },
      },
      // 3. HTTP: Ler Orgs Zendesk
      {
        name: 'Ler Orgs Zendesk',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [480, 300],
        credentials: { httpBasicAuth: { id: ZENDESK_CRED_ID, name: ZENDESK_CRED_NAME } },
        parameters: {
          url: 'https://opsfitbank.zendesk.com/api/v2/search.json',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpBasicAuth',
          sendQuery: true,
          queryParameters: {
            parameters: [
              {
                name: 'query',
                value: `={{
(function() {
  var fmt = function(raw) {
    var d = String(raw || '').replace(/\\D/g, '');
    if (d.length === 13) d = d.slice(0,8) + '0' + d.slice(8);
    if (d.length !== 14) return raw;
    return d.slice(0,2) + '.' + d.slice(2,5) + '.' + d.slice(5,8) + '/' + d.slice(8,12) + '-' + d.slice(12);
  };
  return 'type:organization ' + $('Ler Top25 IDs').all()
    .filter(function(i){ return i.json.cnpj; })
    .map(function(i){ return 'cnpj:"' + fmt(i.json.cnpj) + '"'; })
    .join(' ');
})()
}}`,
              },
              { name: 'per_page', value: '100' },
            ],
          },
          options: {},
        },
      },
      // 4. Code: Montar Query
      {
        name: 'Montar Query',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [720, 300],
        parameters: { jsCode: CODE_MONTAR_QUERY },
      },
      // 5–7. Open / Pending / Hold (sem filtro de data — tickets ativos)
      zendeskNode('Top25 Open',    `=type:ticket status:open {{ $('Montar Query').first().json.orgsQuery }}`,    [960,  300]),
      zendeskNode('Top25 Pending', `=type:ticket status:pending {{ $('Montar Query').first().json.orgsQuery }}`, [1200, 300]),
      zendeskNode('Top25 Hold',    `=type:ticket status:hold {{ $('Montar Query').first().json.orgsQuery }}`,    [1440, 300]),
      // 8–10. Solved (mês corrente, 3 páginas)
      zendeskNode('Top25 Solved',    MONTH_START,  [1680, 300]),
      zendeskNode('Top25 Solved P2', MONTH_START,  [1920, 300], 2),
      zendeskNode('Top25 Solved P3', MONTH_START,  [2160, 300], 3),
      // 11–13. Closed (mês corrente, 3 páginas)
      zendeskNode('Top25 Closed',    MONTH_CLOSED, [2400, 300]),
      zendeskNode('Top25 Closed P2', MONTH_CLOSED, [2640, 300], 2),
      zendeskNode('Top25 Closed P3', MONTH_CLOSED, [2880, 300], 3),
      // 14. Code: Agregar
      {
        name: 'Agregar Stats',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [3120, 300],
        parameters: { jsCode: CODE_AGREGAR },
      },
      // 15. Responder
      {
        name: 'Responder Top25',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [3360, 300],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ $json }}',
          options: {
            responseHeaders: {
              entries: [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Cache-Control', value: 'public, max-age=7200' },
              ],
            },
          },
        },
      },
    ],
    connections: {
      'Webhook Top25 Status': { main: [[{ node: 'Ler Top25 IDs',    type: 'main', index: 0 }]] },
      'Ler Top25 IDs':        { main: [[{ node: 'Ler Orgs Zendesk', type: 'main', index: 0 }]] },
      'Ler Orgs Zendesk':     { main: [[{ node: 'Montar Query',     type: 'main', index: 0 }]] },
      'Montar Query':         { main: [[{ node: 'Top25 Open',       type: 'main', index: 0 }]] },
      'Top25 Open':           { main: [[{ node: 'Top25 Pending',    type: 'main', index: 0 }]] },
      'Top25 Pending':        { main: [[{ node: 'Top25 Hold',       type: 'main', index: 0 }]] },
      'Top25 Hold':           { main: [[{ node: 'Top25 Solved',     type: 'main', index: 0 }]] },
      'Top25 Solved':         { main: [[{ node: 'Top25 Solved P2',  type: 'main', index: 0 }]] },
      'Top25 Solved P2':      { main: [[{ node: 'Top25 Solved P3',  type: 'main', index: 0 }]] },
      'Top25 Solved P3':      { main: [[{ node: 'Top25 Closed',     type: 'main', index: 0 }]] },
      'Top25 Closed':         { main: [[{ node: 'Top25 Closed P2',  type: 'main', index: 0 }]] },
      'Top25 Closed P2':      { main: [[{ node: 'Top25 Closed P3',  type: 'main', index: 0 }]] },
      'Top25 Closed P3':      { main: [[{ node: 'Agregar Stats',    type: 'main', index: 0 }]] },
      'Agregar Stats':        { main: [[{ node: 'Responder Top25',  type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };

  console.log('\n⬆️  Criando workflow...');
  const res  = await fetch(`${BASE}/workflows`, { method: 'POST', headers: HEADERS, body: JSON.stringify(workflow) });
  const data = await res.json();
  if (!data.id) { console.log('❌', JSON.stringify(data).substring(0, 500)); process.exit(1); }
  console.log(`✅ Criado: ${data.name} — ID: ${data.id}`);

  const act  = await fetch(`${BASE}/workflows/${data.id}/activate`, { method: 'POST', headers: HEADERS });
  const actD = await act.json();
  console.log(actD.active ? '✅ Ativado' : `⚠️  ${JSON.stringify(actD).substring(0, 200)}`);

  console.log(`\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-top25-status`);
}

deploy().catch(e => { console.error(e.message); process.exit(1); });
