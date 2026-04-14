#!/usr/bin/env python3
"""Patch OMS workflow dm2Y6tOellMtLGgi — V4.1 Unknown Problem Discovery Engine"""
import urllib.request
import json

N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3M2Q0MDlhNC02ZjdkLTQ2MmQtOTMxNi02NDFiZjVlMmJmMTUiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiYjlkNjdiMjQtNzZhMC00N2Q1LWJiMTYtYWI0ZThmZDEwYTkzIiwiaWF0IjoxNzc0NTUxMzI2fQ.SCWz4Yi3DU1T2S6ASHxQZFJ4Wz1NJPx23IkZxsaCvNg'
WF_ID   = 'dm2Y6tOellMtLGgi'
BASE    = 'https://felipethomazini.app.n8n.cloud/api/v1'
HEADERS = {'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json'}

# ──────────────────────────────────────────────
# Updated CODE_OMS — adds Unknown Engine block
# ──────────────────────────────────────────────
CODE_OMS = r"""
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
  return [{ json: { problems: [], totalTickets: 0, criticalCount: 0, summary: 'Nenhum ticket no período.', generatedAt: new Date().toISOString(),
    unknownClusters: [], unknownRate: 0, reclassificationRate: 0, unknownAlert: false, newProblemsDetected: 0 } }];
}

const now = Date.now();
const ms7d  = 7  * 86400000;
const ms14d = 14 * 86400000;

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
).join('\n');

// ---- UNKNOWN ENGINE V4.1 ----
const outrosCluster = current.find(c => c.name === 'Outros');
const outrosTickets = outrosCluster ? outrosCluster.tickets || [] : [];
const outrosCount   = outrosTickets.length;

const STOPWORDS = new Set([
  'de','da','do','em','no','na','os','as','um','uma','para','por','com','que',
  'não','foi','ser','está','isso','este','esta','são','mas','mais','como',
  'também','sobre','seu','sua','seus','suas','pelo','pela','pelos','pelas',
  'numa','num','nos','nas','tela','erro','falha','problema','sistema','conta'
]);

const wordFreqMap = {};
for (const t of outrosTickets) {
  const words = (t.subject || '').toLowerCase()
    .replace(/[^a-záéíóúãõâêîôûàèì\s]/g, ' ')
    .split(/\s+/);
  for (const w of words) {
    if (w.length >= 4 && !STOPWORDS.has(w)) {
      wordFreqMap[w] = (wordFreqMap[w] || 0) + 1;
    }
  }
}

const topKeywords = Object.entries(wordFreqMap)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(e => e[0]);

const unknownGroupsMap = {};
for (let i = 0; i < outrosTickets.length; i++) {
  const subj = (outrosTickets[i].subject || '').toLowerCase();
  for (const kw of topKeywords) {
    if (subj.includes(kw)) {
      if (!unknownGroupsMap[kw]) unknownGroupsMap[kw] = { keyword: kw, tickets: [], count: 0 };
      unknownGroupsMap[kw].tickets.push(outrosTickets[i]);
      unknownGroupsMap[kw].count++;
      break;
    }
  }
}

const unknownClusters = Object.values(unknownGroupsMap)
  .filter(g => g.count >= 2)
  .sort((a, b) => b.count - a.count)
  .slice(0, 8)
  .map(g => ({
    keyword: g.keyword,
    count: g.count,
    sampleSubjects: g.tickets.slice(0, 3).map(t => t.subject || '').filter(Boolean),
  }));

const reclassifiedCount    = unknownClusters.reduce((s, g) => s + g.count, 0);
const unknownRate          = totalCurrent > 0 ? Math.round(outrosCount / totalCurrent * 100) : 0;
const reclassificationRate = outrosCount   > 0 ? Math.round(reclassifiedCount / outrosCount * 100) : 0;
const unknownAlert         = unknownRate > 20;

const unknownSummary = unknownClusters.length
  ? '\n\nCLUSTERS DESCONHECIDOS (tickets sem categoria):\n' +
    unknownClusters.map(g =>
      '- keyword:"' + g.keyword + '" → ' + g.count + ' tickets, ex: "' + (g.sampleSubjects[0] || '') + '"'
    ).join('\n')
  : '';

return [{ json: {
  problems, totalTickets: currentTickets.length,
  totalProblems: problems.length,
  criticalCount: problems.filter(p => p.quadrant === 'CRÍTICO').length,
  urgentCount: problems.filter(p => p.quadrant === 'URGENTE').length,
  summary: summary + unknownSummary,
  generatedAt: new Date().toISOString(),
  unknownClusters, unknownRate, reclassificationRate, unknownAlert,
  newProblemsDetected: unknownClusters.length,
} }];
""".strip()

# ──────────────────────────────────────────────
# Updated GPT_SYSTEM — includes unknownClusters in response schema
# ──────────────────────────────────────────────
GPT_SYSTEM = (
    'Você é um COO sênior de fintech. Analise os problemas operacionais do FitBank e retorne SOMENTE JSON:\n'
    '{\n'
    '  "problems": [\n'
    '    {\n'
    '      "name": "nome exato do problema",\n'
    '      "rootCause": "causa raiz técnica provável (1-2 frases diretas)",\n'
    '      "system": "sistema/componente afetado",\n'
    '      "actionPlan": "ação corretiva principal e objetiva (1 frase imperativa)",\n'
    '      "actionStatus": "Não iniciado",\n'
    '      "confidence": "HIGH|MEDIUM|LOW"\n'
    '    }\n'
    '  ],\n'
    '  "unknownClusters": [\n'
    '    {\n'
    '      "keyword": "palavra-chave exata recebida",\n'
    '      "newGroupName": "Nome Descritivo do Novo Grupo",\n'
    '      "rootCause": "causa raiz provável (1 frase)",\n'
    '      "system": "sistema/componente afetado",\n'
    '      "confidence": "HIGH|MEDIUM|LOW",\n'
    '      "shouldPromote": true\n'
    '    }\n'
    '  ],\n'
    '  "recommendations": ["ação 1 (impacto crítico)", "ação 2", "ação 3"],\n'
    '  "unknownInsight": "2-3 frases sobre padrões emergentes nos tickets desconhecidos e risco de crescimento.",\n'
    '  "executiveSummary": "3-4 frases diretas para o COO: estado operacional atual, 2 problemas mais críticos, e foco imediato recomendado."\n'
    '}'
)

# ──────────────────────────────────────────────
# Updated CODE_PARSE — passes through unknown fields
# ──────────────────────────────────────────────
CODE_PARSE = r"""
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

  const unknownClusters = (calc.unknownClusters || []).map(g => {
    const gptG = (gpt.unknownClusters || []).find(x => x.keyword === g.keyword) || {};
    return {
      ...g,
      newGroupName: gptG.newGroupName || g.keyword,
      rootCause:    gptG.rootCause    || '',
      system:       gptG.system       || '',
      confidence:   gptG.confidence   || 'LOW',
      shouldPromote: gptG.shouldPromote || false,
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
    unknownClusters,
    unknownRate:          calc.unknownRate          || 0,
    reclassificationRate: calc.reclassificationRate || 0,
    unknownAlert:         calc.unknownAlert          || false,
    newProblemsDetected:  calc.newProblemsDetected   || 0,
    unknownInsight:       gpt.unknownInsight         || '',
  } }];
} catch(e) {
  return [{ json: {
    problems: [], totalTickets: 0, totalProblems: 0, criticalCount: 0, urgentCount: 0,
    recommendations: [], executiveSummary: 'Erro: ' + e.message, generatedAt: new Date().toISOString(),
    unknownClusters: [], unknownRate: 0, reclassificationRate: 0, unknownAlert: false,
    newProblemsDetected: 0, unknownInsight: '',
  } }];
}
""".strip()


def request(method, url, data=None):
    req = urllib.request.Request(url, headers=HEADERS, method=method)
    body = json.dumps(data).encode('utf-8') if data else None
    with urllib.request.urlopen(req, data=body) as resp:
        return json.loads(resp.read().decode('utf-8'))


def main():
    print(f'\n🔍 Buscando workflow {WF_ID}...')
    wf = request('GET', f'{BASE}/workflows/{WF_ID}')
    print(f'✅ Workflow: {wf["name"]}')

    patched = 0
    for node in wf.get('nodes', []):
        name   = node.get('name', '')
        params = node.get('parameters', {})

        if name == 'Calcular OMS':
            params['jsCode'] = CODE_OMS
            patched += 1
            print(f'  ✏️  Atualizado: {name}')

        elif name == 'GPT OMS Analysis':
            # Rebuild the jsonBody expression with new GPT_SYSTEM and extra unknown summary
            params['jsonBody'] = (
                "={{ JSON.stringify({ model: 'gpt-4o', response_format: { type: 'json_object' }, temperature: 0.3, max_tokens: 1800, "
                "messages: [{ role: 'system', content: " + json.dumps(GPT_SYSTEM) + " }, "
                "{ role: 'user', content: 'Analise os problemas operacionais FitBank (' + $('Calcular OMS').first().json.totalTickets + ' tickets, últimos 7 dias):\\n\\n' + $('Calcular OMS').first().json.summary }] }) }}"
            )
            patched += 1
            print(f'  ✏️  Atualizado: {name}')

        elif name == 'Parsear OMS':
            params['jsCode'] = CODE_PARSE
            patched += 1
            print(f'  ✏️  Atualizado: {name}')

    if patched == 0:
        print('⚠️  Nenhum nó encontrado — verifique os nomes dos nós.')
        return

    payload = {
        'name':        wf['name'],
        'nodes':       wf['nodes'],
        'connections': wf['connections'],
        'settings':    wf.get('settings', {}),
    }

    print(f'\n⬆️  Enviando atualização ({patched} nó(s))...')
    result = request('PUT', f'{BASE}/workflows/{WF_ID}', payload)
    if result.get('id'):
        print(f'✅ Workflow atualizado: {result["name"]}')
    else:
        print(f'❌ Falha: {str(result)[:300]}')
        return

    # Reactivate if already active
    if wf.get('active'):
        request('POST', f'{BASE}/workflows/{WF_ID}/deactivate')
        request('POST', f'{BASE}/workflows/{WF_ID}/activate')
        print('✅ Reativado')

    print(f'\n🔗 Endpoint: https://felipethomazini.app.n8n.cloud/webhook/dashboard-operations')
    print(f'Workflow ID: {WF_ID}\n')


if __name__ == '__main__':
    main()
