// Deploy Jarvis DevOps Pivot V2 workflow
// Arquitetura: Webhook → WIQL GET → Code(split IDs) → HTTP Batch POST → Code(pivot) → Respond
// Projeto: dev.azure.com/fitbank / Fit
// Saved query: 571fae87-709e-410f-9201-bc88f7ad5b6e ("Chatbot - Thomazini")
//
// Credencial n8n: "Azure DevOps FitBank" (httpBasicAuth) — ID: hkNEhPxhZy1QjZPr
//   User: (vazio) | Password: PAT do Azure DevOps

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg';
const BASE    = 'https://felipethomazini.app.n8n.cloud/api/v1';
const HEADERS = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' };

const AZURE_CRED_ID   = 'hkNEhPxhZy1QjZPr';
const AZURE_CRED_NAME = 'Azure DevOps FitBank';
const AZDO_ORG        = 'fitbank';
const AZDO_PROJECT    = 'Fit';
const WIQL_QUERY_ID   = '571fae87-709e-410f-9201-bc88f7ad5b6e';

// ---------- CODE NODE: SPLIT IDs em lotes de 200 ----------
const CODE_SPLIT = `
const wiqlData = $input.first().json;
const allIds   = (wiqlData.workItems || []).map(w => w.id).filter(Boolean);

if (!allIds.length) {
  return [{ json: { ids: [], empty: true } }];
}

const chunks = [];
for (let i = 0; i < allIds.length; i += 200) {
  chunks.push({ json: { ids: allIds.slice(i, i + 200) } });
}
return chunks;
`.trim();

// ---------- CODE NODE: AGREGAR PIVOT ----------
const CODE_PIVOT = `
// Cada item de entrada é a resposta de um lote: { value: [{id, fields: {...}}] }
const allItems = $input.all().flatMap(i => {
  if (i.json.empty) return [];
  return (i.json.value || []);
});

if (!allItems.length) {
  return [{ json: { outcomes: [], months: [], totalQty: 0, totalHrs: 0, generatedAt: new Date().toISOString() } }];
}

// Filtra para o ano do query param ?year=XXXX ou ano atual
const yearParam = parseInt($('Webhook DevOps Pivot').item.json.query?.year || new Date().getFullYear());

// Agrupa por outcome e mês (YYYY-MM)
const map = {};
for (const wi of allItems) {
  const f       = wi.fields || {};
  const outcome = (f['Custom.Outcome'] || 'Outros').trim() || 'Outros';
  const dateStr = f['Microsoft.VSTS.Common.StateChangeDate'] || '';
  if (!dateStr) continue;
  const d = new Date(dateStr);
  if (d.getFullYear() !== yearParam) continue;
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (!map[outcome]) map[outcome] = {};
  if (!map[outcome][key]) map[outcome][key] = { qty: 0, hrs: 0 };
  map[outcome][key].qty += 1;
  map[outcome][key].hrs += Math.round(f['Microsoft.VSTS.Scheduling.Effort'] || 0);
}

// Meses únicos ordenados
const allKeys = [...new Set(
  Object.values(map).flatMap(m => Object.keys(m))
)].sort();

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

// rep% por horas; fallback para quantidade se horas não preenchidas
pivot.forEach(p => {
  if (totalHrs > 0) {
    p.rep = Math.round(p.totalHrs / totalHrs * 100);
  } else {
    p.rep = totalQty > 0 ? Math.round(p.totalQty / totalQty * 100) : 0;
  }
});

return [{ json: {
  outcomes: pivot, months: allKeys, totalQty, totalHrs,
  year: yearParam,
  hrsAvailable: totalHrs > 0,
  generatedAt: new Date().toISOString()
} }];
`.trim();

async function deploy() {
  console.log('🔍 Verificando workflows existentes...');
  const listRes  = await fetch(`${BASE}/workflows?limit=100`, { headers: HEADERS });
  const listData = await listRes.json();

  for (const name of ['Jarvis — DevOps Pivot (V1)', 'Jarvis — DevOps Pivot (V2)']) {
    const existing = (listData.data || []).find(w => w.name === name);
    if (existing) {
      console.log(`🗑️  Removendo "${name}" (ID: ${existing.id})...`);
      await fetch(`${BASE}/workflows/${existing.id}/deactivate`, { method: 'POST', headers: HEADERS });
      await fetch(`${BASE}/workflows/${existing.id}`, { method: 'DELETE', headers: HEADERS });
    }
  }

  const workflow = {
    name: 'Jarvis — DevOps Pivot (V2)',
    nodes: [
      {
        id: 'wh-dvp2',
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
        name: 'WIQL: Buscar IDs',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [460, 300],
        credentials: { httpBasicAuth: { id: AZURE_CRED_ID, name: AZURE_CRED_NAME } },
        parameters: {
          method: 'GET',
          url: `https://dev.azure.com/${AZDO_ORG}/${encodeURIComponent(AZDO_PROJECT)}/_apis/wit/wiql/${WIQL_QUERY_ID}?api-version=7.1`,
          authentication: 'genericCredentialType',
          genericAuthType: 'httpBasicAuth',
          options: {},
        },
      },
      {
        name: 'Split IDs em Lotes',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [720, 300],
        parameters: { jsCode: CODE_SPLIT },
      },
      {
        name: 'Batch: Buscar Work Items',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [980, 300],
        credentials: { httpBasicAuth: { id: AZURE_CRED_ID, name: AZURE_CRED_NAME } },
        parameters: {
          method: 'POST',
          url: `https://dev.azure.com/${AZDO_ORG}/_apis/wit/workitemsbatch?api-version=7.1`,
          authentication: 'genericCredentialType',
          genericAuthType: 'httpBasicAuth',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: `={{ JSON.stringify({ ids: $json.ids, fields: ["System.Id","System.State","Custom.Outcome","Microsoft.VSTS.Common.StateChangeDate","Microsoft.VSTS.Scheduling.Effort"] }) }}`,
          options: {},
        },
      },
      {
        name: 'Calcular Pivot',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1240, 300],
        parameters: {
          mode: 'runOnceForAllItems',
          jsCode: CODE_PIVOT,
        },
      },
      {
        name: 'Retornar Pivot',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [1500, 300],
        parameters: {
          respondWith: 'json',
          responseBody: '={{ $json }}',
          options: {
            responseHeaders: {
              entries: [
                { name: 'Access-Control-Allow-Origin', value: '*' },
                { name: 'Cache-Control', value: 'no-store' },
              ],
            },
          },
        },
      },
    ],
    connections: {
      'Webhook DevOps Pivot':     { main: [[{ node: 'WIQL: Buscar IDs',          type: 'main', index: 0 }]] },
      'WIQL: Buscar IDs':         { main: [[{ node: 'Split IDs em Lotes',        type: 'main', index: 0 }]] },
      'Split IDs em Lotes':       { main: [[{ node: 'Batch: Buscar Work Items',  type: 'main', index: 0 }]] },
      'Batch: Buscar Work Items': { main: [[{ node: 'Calcular Pivot',            type: 'main', index: 0 }]] },
      'Calcular Pivot':           { main: [[{ node: 'Retornar Pivot',            type: 'main', index: 0 }]] },
    },
    settings: { executionOrder: 'v1' },
  };

  console.log('\n⬆️  Criando workflow...');
  const res  = await fetch(`${BASE}/workflows`, { method: 'POST', headers: HEADERS, body: JSON.stringify(workflow) });
  const data = await res.json();
  if (!data.id) { console.log('❌', JSON.stringify(data).substring(0, 400)); process.exit(1); }
  console.log(`✅ Criado: ${data.name} — ID: ${data.id}`);

  const act  = await fetch(`${BASE}/workflows/${data.id}/activate`, { method: 'POST', headers: HEADERS });
  const actD = await act.json();
  console.log(actD.active ? '✅ Ativado' : `⚠️  ${JSON.stringify(actD).substring(0, 200)}`);

  console.log(`\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-devops-pivot`);
  console.log(`Workflow ID: ${data.id}`);
  console.log('\nPara ano específico: ...?year=2025');
}

deploy().catch(e => { console.error(e.message); process.exit(1); });
