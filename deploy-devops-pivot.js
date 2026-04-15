// Deploy Jarvis DevOps Pivot V1 workflow
// Conecta ao Azure DevOps Analytics OData para pivot de Outcomes por Mês
//
// PRÉ-REQUISITO: criar no n8n a credential "Azure DevOps FitBank" do tipo
// HTTP Basic Auth com:
//   Username: <seu email Azure DevOps ou deixe em branco>
//   Password: <Personal Access Token com escopo Analytics (Read)>
//
// Acesse: https://felipethomazini.app.n8n.cloud/credentials
// Clique em "+ Credential" → procure "HTTP Basic Auth" → salve como "Azure DevOps FitBank"

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg';
const BASE    = 'https://felipethomazini.app.n8n.cloud/api/v1';
const HEADERS = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' };

const CRED_NAME = 'Azure DevOps FitBank';

// ---------- CODE NODE: CALCULAR PIVOT ----------
const CODE_PIVOT = `
const rows = $input.first().json.value || [];
if (!rows.length) {
  return [{ json: { outcomes: [], months: [], totalQty: 0, totalHrs: 0, generatedAt: new Date().toISOString() } }];
}

// Agrupa por outcome e mês (YYYY-MM)
const map = {};
for (const r of rows) {
  const outcome = r.Custom_Outcome || 'Outros';
  const d = new Date(r.ResolvedDate);
  const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  if (!map[outcome]) map[outcome] = {};
  if (!map[outcome][key]) map[outcome][key] = { qty: 0, hrs: 0 };
  map[outcome][key].qty += (r.Qty   || 0);
  map[outcome][key].hrs += Math.round(r.TotalHrs || 0);
}

// Meses presentes ordenados
const allKeys = [...new Set(rows.map(r => {
  const d = new Date(r.ResolvedDate);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}))].sort();

// Monta pivot
const outcomeNames = Object.keys(map).sort();
const pivot = outcomeNames.map(name => {
  const months   = allKeys.map(k => ({ key: k, ...(map[name][k] || { qty: 0, hrs: 0 }) }));
  const totalQty = months.reduce((s, m) => s + m.qty, 0);
  const totalHrs = months.reduce((s, m) => s + m.hrs, 0);
  return { name, months, totalQty, totalHrs, rep: 0 };
});

const totalQty = pivot.reduce((s, p) => s + p.totalQty, 0);
const totalHrs = pivot.reduce((s, p) => s + p.totalHrs, 0);
pivot.forEach(p => {
  p.rep = totalHrs > 0 ? Math.round(p.totalHrs / totalHrs * 100) : 0;
});

return [{ json: { outcomes: pivot, months: allKeys, totalQty, totalHrs, generatedAt: new Date().toISOString() } }];
`.trim();

async function deploy() {
  // 1. Verificar credential
  console.log('🔍 Buscando credential "' + CRED_NAME + '"...');
  const credsRes  = await fetch(`${BASE}/credentials`, { headers: HEADERS });
  const credsData = await credsRes.json();
  const cred = (credsData.data || []).find(c => c.name === CRED_NAME);

  if (!cred) {
    console.log(`\n❌ Credential "${CRED_NAME}" não encontrada no n8n.\n`);
    console.log('📋 COMO CRIAR:');
    console.log('   1. Acesse https://felipethomazini.app.n8n.cloud/credentials');
    console.log('   2. Clique em "+ Add credential"');
    console.log('   3. Busque "HTTP Basic Auth" e selecione');
    console.log('   4. Preencha:');
    console.log('      Nome: Azure DevOps FitBank');
    console.log('      User: <seu email ou deixe vazio>');
    console.log('      Password: <Personal Access Token do Azure DevOps>');
    console.log('      (PAT: dev.azure.com → User Settings → Personal Access Tokens → Analytics: Read)');
    console.log('   5. Salve e execute este script novamente.\n');
    process.exit(1);
  }

  console.log(`✅ Credential encontrada: "${cred.name}" (ID: ${cred.id})`);

  // 2. Montar workflow
  const year = new Date().getFullYear();
  const applyFilter = [
    `filter(WorkItemType eq 'Incident'`,
    ` and ResolvedDate ne null`,
    ` and ResolvedDate ge ${year}-01-01T00:00:00Z`,
    ` and ResolvedDate le ${year}-12-31T23:59:59Z)`,
    `/groupby((Custom_Outcome,ResolvedDate),aggregate(CompletedWork with sum as TotalHrs,$count as Qty))`,
  ].join('');

  const workflow = {
    name: 'Jarvis — DevOps Pivot (V1)',
    nodes: [
      {
        id: 'wh-dvp',
        name: 'Webhook DevOps Pivot',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        webhookId: 'dashboard-devops-pivot',
        position: [200, 300],
        parameters: {
          path: 'dashboard-devops-pivot',
          httpMethod: 'GET',
          responseMode: 'responseNode',
          options: {},
        },
      },
      {
        name: 'Buscar Analytics Azure DevOps',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [460, 300],
        credentials: { httpBasicAuth: { id: cred.id, name: cred.name } },
        parameters: {
          method: 'GET',
          url: 'https://analytics.dev.azure.com/fitbank/N2%20%2F%20Sustenta%C3%A7%C3%A3o/_odata/v4.0-preview/WorkItems',
          authentication: 'genericCredentialType',
          genericAuthType: 'httpBasicAuth',
          sendQuery: true,
          queryParameters: {
            parameters: [
              { name: '$apply', value: applyFilter },
            ],
          },
          options: {},
        },
      },
      {
        name: 'Calcular Pivot',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [720, 300],
        parameters: { jsCode: CODE_PIVOT },
      },
      {
        name: 'Retornar Pivot',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [980, 300],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ $json }}',
          options: {
            responseHeaders: {
              entries: [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Cache-Control', value: 'public, max-age=900' },
              ],
            },
          },
        },
      },
    ],
    connections: {
      'Webhook DevOps Pivot':        { main: [[{ node: 'Buscar Analytics Azure DevOps', type: 'main', index: 0 }]] },
      'Buscar Analytics Azure DevOps': { main: [[{ node: 'Calcular Pivot',              type: 'main', index: 0 }]] },
      'Calcular Pivot':              { main: [[{ node: 'Retornar Pivot',                type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };

  // 3. Criar workflow
  console.log('\n⬆️  Criando workflow...');
  const res  = await fetch(`${BASE}/workflows`, { method: 'POST', headers: HEADERS, body: JSON.stringify(workflow) });
  const data = await res.json();
  if (!data.id) { console.log('❌', JSON.stringify(data).substring(0, 400)); process.exit(1); }
  console.log(`✅ Criado: ${data.name} — ID: ${data.id}`);

  // 4. Ativar
  const act  = await fetch(`${BASE}/workflows/${data.id}/activate`, { method: 'POST', headers: HEADERS });
  const actD = await act.json();
  console.log(actD.active ? '✅ Ativado' : `⚠️  ${JSON.stringify(actD).substring(0, 200)}`);

  console.log(`\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-devops-pivot`);
  console.log(`Workflow ID: ${data.id}`);
  console.log(`\nℹ️  Se a primeira chamada retornar erro 401/403, verifique:`);
  console.log(`   - O PAT tem escopo "Analytics (Read)" no Azure DevOps`);
  console.log(`   - O projeto "N2 / Sustentação" existe em dev.azure.com/fitbank`);
  console.log(`   - A extensão Analytics está habilitada no projeto\n`);
}

deploy().catch(e => { console.error(e.message); process.exit(1); });
