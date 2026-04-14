// Deploy Jarvis OMS (Operational Management System) V4 workflow
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg';
const BASE = 'https://felipethomazini.app.n8n.cloud/api/v1';
const HEADERS = { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' };

// ---------- CODE NODE: CALCULAR OMS ----------
const CODE_OMS = `
const CLUSTERS = [
  { name: 'PIX & Transferências', keywords: ['pix', 'ted ', ' ted', 'transferência', 'transação pix', 'bacen', 'qr code', 'chave pix', 'transf'], system: 'SPB/Payments' },
  { name: 'API & Integração', keywords: [' api', 'api ', 'endpoint', 'timeout', 'integraç', 'request', 'requisição', 'falha na', 'erro na'], system: 'Core & Services' },
  { name: 'Webhook & Notificações', keywords: ['webhook', 'callback', 'notificaç', 'notification'], system: 'Core & Services' },
  { name: 'Abertura & Cadastro', keywords: ['abertura', 'cadastro', 'onboarding', 'kyc', 'documentação', 'abrir conta'], system: 'Accounts' },
  { name: 'Fraude & Bloqueio', keywords: ['fraude', 'fraud', 'bloqueio', 'bloqueado', 'suspeito', 'antifraude'], system: 'Segurança' },
  { name: 'Cobrança & Boleto', keywords: ['cobrança', 'boleto', 'billet', 'inadimpl', 'cobranças'], system: 'Collection' },
  { name: 'Encerramento & Portabilidade', keywords: ['encerramento', 'encerrar', 'cancelamento', 'cancelar', 'portabilidade'], system: 'Accounts' },
  { name: 'Conciliação & Extrato', keywords: ['conciliação', 'saldo', 'extrato', 'statement', 'balance', 'reconcil'], system: 'Transactions' },
  { name: 'Cartão & Emissão', keywords: ['cartão', 'card', 'emissão', 'plástico', 'visa', 'mastercard'], system: 'Payments' },
  { name: 'Liquidação & Settlement', keywords: ['settlement', 'liquidação', 'liquidar', 'clearing', 'compensação'], system: 'SPB' },
];

const OWNER_MAP = {
  'PIX & Transferências':          { owner: 'Squad Payments',       area: 'Tecnologia' },
  'API & Integração':              { owner: 'Squad Core Services',   area: 'Tecnologia' },
  'Webhook & Notificações':        { owner: 'Squad Core Services',   area: 'Tecnologia' },
  'Abertura & Cadastro':           { owner: 'Squad Onboarding',      area: 'Operações' },
  'Fraude & Bloqueio':             { owner: 'Squad Antifraude',      area: 'Segurança' },
  'Cobrança & Boleto':             { owner: 'Squad Collection',      area: 'Operações' },
  'Encerramento & Portabilidade':  { owner: 'Squad Contas',          area: 'Operações' },
  'Conciliação & Extrato':         { owner: 'Squad Transactions',    area: 'Tecnologia' },
  'Cartão & Emissão':              { owner: 'Squad Cards',           area: 'Produto' },
  'Liquidação & Settlement':       { owner: 'Squad SPB',             area: 'Tecnologia' },
  'Outros':                        { owner: 'Ops Gerais',            area: 'Operações' },
};

const results = $input.first().json.results || [];
if (!results.length) {
  return [{ json: { problems: [], totalTickets: 0, criticalCount: 0, summary: 'Nenhum ticket no período.', generatedAt: new Date().toISOString() } }];
}

const now = Date.now();
const ms7d  = 7  * 86400000;
const ms14d = 14 * 86400000;

// Split: current period (7d) and previous period (7-14d) for trend
const currentTickets  = results.filter(t => new Date(t.created_at).getTime() >= now - ms7d);
const previousTickets = results.filter(t => {
  const ts = new Date(t.created_at).getTime();
  return ts >= now - ms14d && ts < now - ms7d;
});

function clusterTickets(ticketList) {
  const clustered = CLUSTERS.map(c => ({ ...c, tickets: [], count: 0 }));
  for (const t of ticketList) {
    const subject = (t.subject || '').toLowerCase();
    let matched = false;
    for (const c of clustered) {
      if (c.keywords.some(kw => subject.includes(kw))) { c.tickets.push(t); c.count++; matched = true; break; }
    }
    if (!matched) {
      let outros = clustered.find(c => c.name === 'Outros');
      if (!outros) { outros = { name: 'Outros', keywords: [], system: 'Core & Services', tickets: [], count: 0 }; clustered.push(outros); }
      outros.tickets.push(t); outros.count++;
    }
  }
  return clustered.filter(c => c.count > 0);
}

const current  = clusterTickets(currentTickets);
const previous = clusterTickets(previousTickets);
const totalCurrent = currentTickets.length || 1;

const problems = current.sort((a, b) => b.count - a.count).map(c => {
  const orgIds      = [...new Set(c.tickets.map(t => t.organization_id).filter(Boolean))];
  const clients     = orgIds.length;
  const urgentCount = c.tickets.filter(t => t.priority === 'urgent').length;

  const freqScore   = Math.min(100, Math.round(c.count / totalCurrent * 100));
  const impactScore = Math.min(100, Math.round(clients * 6 + urgentCount * 8));
  const priorityScore = Math.min(100, Math.round(freqScore * 0.4 + impactScore * 0.6));

  const highFreq   = freqScore   >= 20;
  const highImpact = impactScore >= 15;
  const quadrant = highFreq && highImpact ? 'CRÍTICO' :
                   !highFreq && highImpact ? 'URGENTE' :
                   highFreq && !highImpact ? 'ATENÇÃO' : 'MONITORAR';

  const prevCluster = previous.find(p => p.name === c.name);
  const prevCount   = prevCluster ? prevCluster.count : 0;
  const trend = c.count > prevCount * 1.2 ? '↑' : c.count < prevCount * 0.8 ? '↓' : '→';

  const ownerInfo = OWNER_MAP[c.name] || { owner: 'Ops Gerais', area: 'Operações' };

  return {
    name: c.name, tickets: c.count, previousTickets: prevCount, clients,
    system: c.system, freqScore, impactScore, priorityScore,
    quadrant, trend, owner: ownerInfo.owner, area: ownerInfo.area,
    sampleSubjects: c.tickets.slice(0, 5).map(t => t.subject || '').filter(Boolean),
  };
});

const summary = problems.slice(0, 8).map(p =>
  '- ' + p.name + ': ' + p.tickets + ' tickets, ' + p.clients + ' clientes, ' + p.quadrant + ', trend ' + p.trend + ', dono: ' + p.owner
).join('\\n');

return [{ json: {
  problems, totalTickets: currentTickets.length,
  totalProblems: problems.length,
  criticalCount: problems.filter(p => p.quadrant === 'CRÍTICO').length,
  urgentCount: problems.filter(p => p.quadrant === 'URGENTE').length,
  summary, generatedAt: new Date().toISOString()
} }];
`.trim();

// ---------- CODE NODE: PARSE OMS ----------
const CODE_PARSE = `
try {
  const raw = $input.first().json.choices?.[0]?.message?.content || '{}';
  const gpt  = JSON.parse(raw);
  const calc = $('Calcular OMS').first().json;
  const problems = calc.problems || [];

  const enriched = problems.map(p => {
    const g = (gpt.problems || []).find(x => x.name === p.name) || {};
    return {
      ...p,
      rootCause:    g.rootCause    || 'Análise pendente',
      actionPlan:   g.actionPlan   || 'Definir plano de ação',
      actionStatus: g.actionStatus || 'Não iniciado',
      confidence:   g.confidence   || 'MEDIUM',
    };
  });

  return [{ json: {
    problems: enriched,
    totalTickets:  calc.totalTickets,
    totalProblems: calc.totalProblems,
    criticalCount: calc.criticalCount,
    urgentCount:   calc.urgentCount,
    recommendations:    gpt.recommendations    || [],
    executiveSummary:   gpt.executiveSummary   || '',
    generatedAt: calc.generatedAt,
  } }];
} catch(e) {
  return [{ json: {
    problems: [], totalTickets: 0, totalProblems: 0, criticalCount: 0, urgentCount: 0,
    recommendations: [], executiveSummary: 'Erro: ' + e.message, generatedAt: new Date().toISOString()
  } }];
}
`.trim();

const GPT_SYSTEM = `Você é um COO sênior de fintech. Analise os problemas operacionais do FitBank e retorne SOMENTE JSON:
{
  "problems": [
    {
      "name": "nome exato do problema",
      "rootCause": "causa raiz técnica provável (1-2 frases diretas)",
      "system": "sistema/componente afetado",
      "actionPlan": "ação corretiva principal e objetiva (1 frase imperativa)",
      "actionStatus": "Não iniciado",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ],
  "recommendations": ["ação 1 (impacto crítico)", "ação 2", "ação 3"],
  "executiveSummary": "3-4 frases diretas para o COO: estado operacional atual, 2 problemas mais críticos, e foco imediato recomendado."
}`;

const workflow = {
  name: 'Jarvis — OMS Operational Management System (V4)',
  nodes: [
    {
      id: 'wh-oms', name: 'Webhook OMS',
      type: 'n8n-nodes-base.webhook', typeVersion: 2,
      webhookId: 'dashboard-operations',
      position: [200, 300],
      parameters: { path: 'dashboard-operations', httpMethod: 'GET', responseMode: 'responseNode', options: {} }
    },
    {
      name: 'Buscar Tickets 14d',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [440, 300],
      credentials: { httpBasicAuth: { id: 'bX1MNqjOSwyjcH1o', name: 'Zendesk FitBank' } },
      parameters: {
        method: 'GET',
        url: 'https://opsfitbank.zendesk.com/api/v2/search.json',
        authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth',
        sendQuery: true,
        queryParameters: { parameters: [
          { name: 'query', value: `={{ (() => { const q=$('Webhook OMS').item.json.query||{}; const from=q.dateFrom||new Date(Date.now()-14*86400000).toISOString().slice(0,10); const to=q.dateTo; let r='type:ticket created>'+from; if(to) r+=' created<'+to; return r; })() }}` },
          { name: 'per_page', value: '100' },
          { name: 'sort_by', value: 'created_at' },
          { name: 'sort_order', value: 'desc' }
        ] },
        options: {}
      }
    },
    {
      name: 'Calcular OMS',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [680, 300],
      parameters: { jsCode: CODE_OMS }
    },
    {
      name: 'GPT OMS Analysis',
      type: 'n8n-nodes-base.httpRequest', typeVersion: 4,
      position: [920, 300],
      credentials: { openAiApi: { id: 'meS0KJyWAnKhaAZN', name: 'OpenAi account' } },
      parameters: {
        method: 'POST', url: 'https://api.openai.com/v1/chat/completions',
        authentication: 'predefinedCredentialType', nodeCredentialType: 'openAiApi',
        sendBody: true, specifyBody: 'json',
        jsonBody: `={{ JSON.stringify({ model: 'gpt-4o', response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 1400, messages: [{ role: 'system', content: ${JSON.stringify(GPT_SYSTEM)} }, { role: 'user', content: 'Analise os problemas operacionais FitBank (' + $('Calcular OMS').first().json.totalTickets + ' tickets, últimos 7 dias):\\n\\n' + $('Calcular OMS').first().json.summary }] }) }}`,
        options: {}
      }
    },
    {
      name: 'Parsear OMS',
      type: 'n8n-nodes-base.code', typeVersion: 2,
      position: [1160, 300],
      parameters: { jsCode: CODE_PARSE }
    },
    {
      name: 'Retornar OMS',
      type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1,
      position: [1400, 300],
      parameters: {
        respondWith: 'json', responseBody: '={{ $json }}',
        options: { responseHeaders: { entries: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'public, max-age=180' }
        ] } }
      }
    }
  ],
  connections: {
    'Webhook OMS':       { main: [[{ node: 'Buscar Tickets 14d',  type: 'main', index: 0 }]] },
    'Buscar Tickets 14d': { main: [[{ node: 'Calcular OMS',        type: 'main', index: 0 }]] },
    'Calcular OMS':      { main: [[{ node: 'GPT OMS Analysis',     type: 'main', index: 0 }]] },
    'GPT OMS Analysis':  { main: [[{ node: 'Parsear OMS',          type: 'main', index: 0 }]] },
    'Parsear OMS':       { main: [[{ node: 'Retornar OMS',         type: 'main', index: 0 }]] },
  },
  settings: { executionOrder: 'v1' }
};

async function deploy() {
  console.log('⬆️  Criando workflow OMS...');
  const res  = await fetch(`${BASE}/workflows`, { method: 'POST', headers: HEADERS, body: JSON.stringify(workflow) });
  const data = await res.json();
  if (!data.id) { console.log('❌', JSON.stringify(data).substring(0, 400)); process.exit(1); }
  console.log(`✅ Criado: ${data.name} — ID: ${data.id}`);

  const act = await fetch(`${BASE}/workflows/${data.id}/activate`, { method: 'POST', headers: HEADERS });
  const ad  = await act.json();
  console.log(ad.active ? '✅ Ativado' : `⚠️  ${JSON.stringify(ad).substring(0,200)}`);
  console.log(`\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-operations`);
  console.log(`Workflow ID: ${data.id}`);
}

deploy().catch(e => { console.error(e.message); process.exit(1); });
