// Deploy Jarvis Root Cause V3 workflow to n8n Cloud
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg';
const BASE = 'https://felipethomazini.app.n8n.cloud/api/v1';
const HEADERS = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' };

// ---------- CODE NODE: CALCULAR CLUSTERS ----------
const CODE_CLUSTERS = `
const CLUSTERS = [
  { name: 'PIX & Transferências', keywords: ['pix', 'ted ', ' ted', 'transferência', 'transação pix', 'bacen', 'qr code', 'chave pix', 'transf'], system: 'SPB/Payments', devopsTotal: 45, devopsZendesk: 23 },
  { name: 'API & Integração', keywords: [' api', 'api ', 'endpoint', 'timeout', 'integraç', 'request', 'requisição', 'falha na', 'erro na'], system: 'Core & Services', devopsTotal: 198, devopsZendesk: 136 },
  { name: 'Webhook & Notificações', keywords: ['webhook', 'callback', 'notificaç', 'notification'], system: 'Core & Services', devopsTotal: 198, devopsZendesk: 136 },
  { name: 'Abertura & Cadastro', keywords: ['abertura', 'cadastro', 'onboarding', 'kyc', 'documentação', 'abrir conta'], system: 'Accounts', devopsTotal: 49, devopsZendesk: 44 },
  { name: 'Fraude & Bloqueio', keywords: ['fraude', 'fraud', 'bloqueio', 'bloqueado', 'suspeito', 'antifraude'], system: 'Core & Services', devopsTotal: 198, devopsZendesk: 136 },
  { name: 'Cobrança & Boleto', keywords: ['cobrança', 'boleto', 'billet', 'inadimpl', 'cobranças'], system: 'Collection', devopsTotal: 129, devopsZendesk: 75 },
  { name: 'Encerramento & Portabilidade', keywords: ['encerramento', 'encerrar', 'cancelamento', 'cancelar', 'portabilidade'], system: 'Accounts', devopsTotal: 49, devopsZendesk: 44 },
  { name: 'Conciliação & Extrato', keywords: ['conciliação', 'saldo', 'extrato', 'statement', 'balance', 'reconcil'], system: 'Transactions', devopsTotal: 28, devopsZendesk: 0 },
  { name: 'Cartão & Emissão', keywords: ['cartão', 'card', 'emissão', 'plástico', 'visa', 'mastercard'], system: 'Payments', devopsTotal: 137, devopsZendesk: 48 },
  { name: 'Liquidação & Settlement', keywords: ['settlement', 'liquidação', 'liquidar', 'clearing', 'compensação'], system: 'Transactions', devopsTotal: 28, devopsZendesk: 0 },
];

const tickets = $input.first().json.results || [];
if (!tickets.length) {
  return [{ json: { clusters: [], totalTickets: 0, summary: 'Nenhum ticket no período.', generatedAt: new Date().toISOString() } }];
}

const clustered = CLUSTERS.map(c => ({ ...c, tickets: [], count: 0 }));

for (const t of tickets) {
  const subject = (t.subject || '').toLowerCase();
  let matched = false;
  for (const c of clustered) {
    if (c.keywords.some(kw => subject.includes(kw))) {
      c.tickets.push(t);
      c.count++;
      matched = true;
      break;
    }
  }
  if (!matched) {
    let outros = clustered.find(c => c.name === 'Outros');
    if (!outros) {
      outros = { name: 'Outros', keywords: [], system: 'Core & Services', devopsTotal: 198, devopsZendesk: 136, tickets: [], count: 0 };
      clustered.push(outros);
    }
    outros.tickets.push(t);
    outros.count++;
  }
}

const activeClusters = clustered.filter(c => c.count > 0).sort((a, b) => b.count - a.count);

for (const c of activeClusters) {
  const orgIds = [...new Set(c.tickets.map(t => t.organization_id).filter(Boolean))];
  c.clients = orgIds.length;
  c.recurrenceScore = Math.min(100, Math.round(c.count * 2 + c.clients * 3));
  const correlationRatio = c.devopsTotal > 0 ? c.devopsZendesk / c.devopsTotal : 0;
  c.correlationScore = correlationRatio > 0.65 ? 'HIGH' : correlationRatio > 0.35 ? 'MEDIUM' : 'LOW';
  c.priorityScore = Math.min(100, Math.round(
    (c.count / tickets.length * 40) +
    (Math.min(c.clients, 10) * 3) +
    (c.recurrenceScore * 0.2) +
    (c.correlationScore === 'HIGH' ? 20 : c.correlationScore === 'MEDIUM' ? 10 : 0)
  ));
  c.trend = c.count > 20 ? '↑' : c.count > 8 ? '→' : '↓';
  c.sampleSubjects = c.tickets.slice(0, 8).map(t => t.subject || '').filter(Boolean);
  delete c.tickets;
}

const summary = activeClusters.slice(0, 8).map(c =>
  '- ' + c.name + ': ' + c.count + ' tickets, ' + c.clients + ' clientes, sistema: ' + c.system +
  (c.sampleSubjects.length ? ', exemplos: "' + c.sampleSubjects.slice(0, 2).join('"; "') + '"' : '')
).join('\\n');

return [{ json: { clusters: activeClusters, totalTickets: tickets.length, summary, generatedAt: new Date().toISOString() } }];
`.trim();

// ---------- CODE NODE: PARSEAR ROOT CAUSE ----------
const CODE_PARSE = `
try {
  const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
  const gptData = JSON.parse(raw);
  const clusters = $('Calcular Clusters').first().json.clusters || [];
  const totalTickets = $('Calcular Clusters').first().json.totalTickets || 0;

  const enriched = clusters.map(c => {
    const gpt = (gptData.clusters || []).find(g => g.name === c.name) || {};
    return {
      name: c.name,
      priorityScore: c.priorityScore,
      tickets: c.count,
      clients: c.clients,
      system: gpt.affectedSystem || c.system,
      trend: c.trend,
      recurrenceScore: c.recurrenceScore,
      correlationScore: c.correlationScore,
      devopsBugs: c.devopsTotal > 0 ? Math.round(c.devopsTotal * (c.count / (totalTickets || 1))) : 0,
      rootCause: gpt.rootCause || 'Análise pendente',
      confidence: gpt.confidence || 'MEDIUM',
      riskLevel: gpt.riskLevel || 'MÉDIO',
      sampleSubjects: c.sampleSubjects || [],
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);

  return [{
    json: {
      clusters: enriched,
      recommendations: gptData.recommendations || [],
      aiSummary: gptData.aiSummary || '',
      totalTickets,
      generatedAt: $('Calcular Clusters').first().json.generatedAt
    }
  }];
} catch(e) {
  return [{
    json: {
      clusters: [],
      recommendations: [],
      aiSummary: 'Erro ao processar análise: ' + e.message,
      totalTickets: 0,
      generatedAt: new Date().toISOString()
    }
  }];
}
`.trim();

// ---------- GPT SYSTEM PROMPT ----------
const GPT_SYSTEM = `Você é um engenheiro sênior de sistemas e arquiteto de soluções de core banking. Analise clusters de tickets de suporte FitBank e retorne SOMENTE JSON no formato:
{
  "clusters": [
    {
      "name": "nome exato do cluster",
      "rootCause": "causa raiz provável (1-2 frases técnicas diretas)",
      "affectedSystem": "sistema/componente técnico afetado",
      "confidence": "HIGH|MEDIUM|LOW",
      "riskLevel": "CRÍTICO|ALTO|MÉDIO|BAIXO"
    }
  ],
  "recommendations": ["ação 1", "ação 2", "ação 3", "ação 4", "ação 5"],
  "aiSummary": "Resumo executivo em até 5 linhas: cenário operacional atual, padrão de causa raiz dominante, risco sistêmico e recomendação principal para o COO."
}`;

// ---------- WORKFLOW DEFINITION ----------
const workflow = {
  name: 'Jarvis — Dashboard Root Cause (V3)',
  nodes: [
    {
      name: 'Webhook Root Cause',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [240, 300],
      parameters: {
        path: 'dashboard-root-cause',
        httpMethod: 'GET',
        responseMode: 'responseNode',
        options: { allowedOrigins: '*' }
      }
    },
    {
      name: 'Buscar Tickets Zendesk',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [480, 300],
      credentials: { httpBasicAuth: { id: 'bX1MNqjOSwyjcH1o', name: 'Zendesk FitBank' } },
      parameters: {
        method: 'GET',
        url: 'https://opsfitbank.zendesk.com/api/v2/search.json',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpBasicAuth',
        sendQuery: true,
        queryParameters: {
          parameters: [
            {
              name: 'query',
              value: `={{ (() => { const q = $('Webhook Root Cause').item.json.query || {}; const from = q.dateFrom || new Date(Date.now() - 30*86400000).toISOString().slice(0,10); const to = q.dateTo; let query = 'type:ticket created>' + from; if (to) query += ' created<' + to; return query; })() }}`
            },
            { name: 'per_page', value: '100' },
            { name: 'sort_by', value: 'created_at' },
            { name: 'sort_order', value: 'desc' }
          ]
        },
        options: {}
      }
    },
    {
      name: 'Calcular Clusters',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [720, 300],
      parameters: { jsCode: CODE_CLUSTERS }
    },
    {
      name: 'GPT Root Cause',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [960, 300],
      credentials: { openAiApi: { id: 'meS0KJyWAnKhaAZN', name: 'OpenAi account' } },
      parameters: {
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'openAiApi',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 1200, messages: [{ role: 'system', content: ${JSON.stringify(GPT_SYSTEM)} }, { role: 'user', content: 'Analise estes clusters de tickets FitBank (' + $('Calcular Clusters').first().json.totalTickets + ' tickets total):\\n\\n' + $('Calcular Clusters').first().json.summary }] }) }}`,
        options: {}
      }
    },
    {
      name: 'Parsear Root Cause',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1200, 300],
      parameters: { jsCode: CODE_PARSE }
    },
    {
      name: 'Retornar Root Cause',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1,
      position: [1440, 300],
      parameters: {
        respondWith: 'json',
        responseBody: '={{ $json }}',
        options: {
          responseHeaders: {
            entries: [
              { name: 'Access-Control-Allow-Origin', value: '*' },
              { name: 'Cache-Control', value: 'public, max-age=300' }
            ]
          }
        }
      }
    }
  ],
  connections: {
    'Webhook Root Cause':   { main: [[{ node: 'Buscar Tickets Zendesk', type: 'main', index: 0 }]] },
    'Buscar Tickets Zendesk': { main: [[{ node: 'Calcular Clusters', type: 'main', index: 0 }]] },
    'Calcular Clusters':    { main: [[{ node: 'GPT Root Cause', type: 'main', index: 0 }]] },
    'GPT Root Cause':       { main: [[{ node: 'Parsear Root Cause', type: 'main', index: 0 }]] },
    'Parsear Root Cause':   { main: [[{ node: 'Retornar Root Cause', type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' }
};

// ---------- DEPLOY ----------
async function deploy() {
  console.log('⬆️  Criando workflow Root Cause no n8n Cloud...');
  const res = await fetch(`${BASE}/workflows`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(workflow)
  });
  const data = await res.json();
  if (!data.id) {
    console.log('❌ Erro ao criar workflow:', JSON.stringify(data).substring(0, 400));
    process.exit(1);
  }
  console.log(`✅ Workflow criado: ${data.name} — ID: ${data.id}`);

  // Ativar
  const actRes = await fetch(`${BASE}/workflows/${data.id}/activate`, { method: 'POST', headers: HEADERS });
  const actData = await actRes.json();
  if (actData.active) {
    console.log(`✅ Workflow ativado`);
  } else {
    console.log('⚠️  Falha ao ativar:', JSON.stringify(actData).substring(0, 200));
  }

  console.log(`\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-root-cause`);
  console.log(`\nWorkflow ID: ${data.id}`);
}

deploy().catch(e => { console.error(e.message); process.exit(1); });
