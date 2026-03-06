// ============================================================
// Teste dos Code nodes do workflow FitBank (simulação local)
// ============================================================

let passou = 0;
let falhou = 0;

function ok(desc) {
  console.log('  ✅ ' + desc);
  passou++;
}

function erro(desc, msg) {
  console.log('  ❌ ' + desc + ': ' + msg);
  falhou++;
}

// ============================================================
// NODE 1: Validar Pergunta (workflow agente)
// ============================================================
console.log('\n=== [Node 1] Validar Pergunta ===');

function rodarValidarPergunta(inputJson) {
  const body = inputJson.body || inputJson;
  const question = body.question || body.pergunta || '';
  if (!question || question.trim() === '') {
    throw new Error('Campo "question" é obrigatório no body da requisição.');
  }
  return { question: question.trim(), timestamp: new Date().toISOString() };
}

const casosValidar = [
  { desc: 'body.question válido',    input: { body: { question: 'PIX debitado mas não recebido' } }, devePassar: true },
  { desc: 'body.pergunta válido',    input: { body: { pergunta: 'Cartão negado' } },                  devePassar: true },
  { desc: 'question direto no json', input: { question: 'Boleto não baixado' },                       devePassar: true },
  { desc: 'pergunta vazia',          input: { body: { question: '' } },                               devePassar: false },
  { desc: 'sem nenhum campo',        input: { body: {} },                                             devePassar: false },
];

casosValidar.forEach(c => {
  try {
    const result = rodarValidarPergunta(c.input);
    if (c.devePassar) ok(c.desc + ' → "' + result.question + '"');
    else erro(c.desc, 'deveria ter falhado mas não falhou');
  } catch (e) {
    if (!c.devePassar) ok(c.desc + ' → rejeitado corretamente: ' + e.message);
    else erro(c.desc, e.message);
  }
});

// ============================================================
// NODE 2: Formatar Ticket (workflow ingestão)
// ============================================================
console.log('\n=== [Node 2] Formatar Ticket ===');

function rodarFormatarTicket(ticketJson) {
  const ticket = ticketJson;
  const subject = ticket.subject || '';
  const description = ticket.description || ticket.raw_subject || '';
  const texto = `Assunto: ${subject}\nDescrição: ${description}\nStatus: ${ticket.status}\nPrioridade: ${ticket.priority || 'normal'}`;
  return {
    ticket_id: String(ticket.id),
    subject: subject,
    description: description,
    status: ticket.status,
    priority: ticket.priority || 'normal',
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    texto_para_embedding: texto
  };
}

const ticketMock = {
  id: 12345,
  subject: 'PIX debitado mas destinatário não recebeu',
  description: 'Cliente realizou PIX às 14h, saldo foi debitado mas destinatário informa não ter recebido.',
  status: 'solved',
  priority: 'high',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T14:30:00Z'
};

try {
  const result = rodarFormatarTicket(ticketMock);
  if (result.ticket_id === '12345') ok('ticket_id convertido para string: ' + result.ticket_id);
  else erro('ticket_id', 'esperado "12345", recebeu: ' + result.ticket_id);

  if (result.texto_para_embedding.includes('PIX debitado')) ok('texto_para_embedding formatado corretamente');
  else erro('texto_para_embedding', 'conteúdo incorreto: ' + result.texto_para_embedding);

  if (result.priority === 'high') ok('priority preservada: ' + result.priority);
  else erro('priority', 'esperado "high", recebeu: ' + result.priority);

  // Ticket sem priority
  const semPriority = rodarFormatarTicket({ id: 1, subject: 'Teste', description: 'desc', status: 'open' });
  if (semPriority.priority === 'normal') ok('priority padrão "normal" quando ausente');
  else erro('priority padrão', 'esperado "normal", recebeu: ' + semPriority.priority);
} catch (e) {
  erro('Formatar Ticket', e.message);
}

// ============================================================
// NODE 3: Preparar Payload Pinecone (workflow ingestão)
// ============================================================
console.log('\n=== [Node 3] Preparar Payload Pinecone ===');

function rodarPrepararPayloadPinecone(embeddingResponse, ticketFormatado) {
  const embedding = embeddingResponse.data[0].embedding;
  const ticket = ticketFormatado;
  return {
    vectors: [
      {
        id: `zendesk-${ticket.ticket_id}`,
        values: embedding,
        metadata: {
          ticket_id: ticket.ticket_id,
          subject: ticket.subject,
          description: ticket.description.substring(0, 500),
          status: ticket.status,
          priority: ticket.priority,
          source: 'zendesk',
          updated_at: ticket.updated_at
        }
      }
    ],
    namespace: 'fitbank-tickets'
  };
}

const embeddingMock = { data: [{ embedding: new Array(1536).fill(0.1) }] };
const ticketFormatadoMock = rodarFormatarTicket(ticketMock);

try {
  const payload = rodarPrepararPayloadPinecone(embeddingMock, ticketFormatadoMock);
  if (payload.vectors[0].id === 'zendesk-12345') ok('vector ID correto: ' + payload.vectors[0].id);
  else erro('vector ID', 'esperado "zendesk-12345", recebeu: ' + payload.vectors[0].id);

  if (payload.vectors[0].values.length === 1536) ok('embedding com 1536 dimensões');
  else erro('embedding dimensões', 'esperado 1536, recebeu: ' + payload.vectors[0].values.length);

  if (payload.namespace === 'fitbank-tickets') ok('namespace correto: ' + payload.namespace);
  else erro('namespace', 'esperado "fitbank-tickets"');

  if (payload.vectors[0].metadata.source === 'zendesk') ok('metadata.source = "zendesk"');
  else erro('metadata.source', 'valor incorreto');

  // Testa truncamento da description (> 500 chars)
  const ticketLongo = { ...ticketFormatadoMock, description: 'A'.repeat(600) };
  const payloadLongo = rodarPrepararPayloadPinecone(embeddingMock, ticketLongo);
  if (payloadLongo.vectors[0].metadata.description.length === 500) ok('description truncada em 500 chars');
  else erro('truncamento description', 'tamanho: ' + payloadLongo.vectors[0].metadata.description.length);
} catch (e) {
  erro('Preparar Payload Pinecone', e.message);
}

// ============================================================
// NODE 4: Montar Prompt (workflow agente) — versão simplificada
// ============================================================
console.log('\n=== [Node 4] Montar Prompt ===');

function rodarMontarPrompt(matchesPinecone, question) {
  const matches = matchesPinecone || [];

  let contextoTickets = '';
  if (matches.length > 0) {
    contextoTickets = matches.map((m, i) => {
      const meta = m.metadata || {};
      const score = Math.round(m.score * 100);
      return `[Ticket ${i + 1} - Similaridade: ${score}%]\nAssunto: ${meta.subject || 'N/A'}\nDescrição: ${meta.description || 'N/A'}\nStatus: ${meta.status || 'N/A'}`;
    }).join('\n\n---\n\n');
  } else {
    contextoTickets = 'Nenhum ticket similar encontrado na base histórica.';
  }

  const systemPrompt = `[SYSTEM PROMPT FITBANK - truncado para teste]`;
  const userPrompt = `TICKETS HISTÓRICOS SIMILARES (Base Zendesk):\n\n${contextoTickets}\n\n---\n\nPERGUNTA DO ATENDENTE:\n${question}\n\nResponda seguindo a estrutura obrigatória.`;

  return { systemPrompt, userPrompt, question, ticketsEncontrados: matches.length };
}

const matchesMock = [
  { score: 0.97, metadata: { ticket_id: '100', subject: 'PIX não chegou', description: 'Saldo debitado, destinatário não recebeu', status: 'solved' } },
  { score: 0.89, metadata: { ticket_id: '101', subject: 'PIX em processamento', description: 'PIX ficou pendente por 2h', status: 'solved' } },
];

try {
  const result = rodarMontarPrompt(matchesMock, 'O cliente fez PIX mas não recebeu');
  if (result.ticketsEncontrados === 2) ok('ticketsEncontrados = 2');
  else erro('ticketsEncontrados', 'esperado 2, recebeu: ' + result.ticketsEncontrados);

  if (result.userPrompt.includes('Similaridade: 97%')) ok('similaridade formatada corretamente (97%)');
  else erro('similaridade', 'não encontrada no prompt');

  if (result.userPrompt.includes('PIX não chegou')) ok('subject do ticket incluído no prompt');
  else erro('subject no prompt', 'não encontrado');

  // Testa sem matches
  const semMatches = rodarMontarPrompt([], 'Pergunta teste');
  if (semMatches.userPrompt.includes('Nenhum ticket similar')) ok('mensagem correta quando sem tickets');
  else erro('sem tickets', 'mensagem esperada não encontrada');
} catch (e) {
  erro('Montar Prompt', e.message);
}

// ============================================================
// NODE 5: Formatar Resposta (workflow agente)
// ============================================================
console.log('\n=== [Node 5] Formatar Resposta ===');

function rodarFormatarResposta(gptResponse, question, ticketsEncontrados) {
  const resposta = gptResponse.choices[0].message.content;
  return {
    sucesso: true,
    resposta: resposta,
    metadados: {
      pergunta_original: question,
      tickets_utilizados: ticketsEncontrados,
      modelo: 'gpt-4o',
      tokens_usados: gptResponse.usage?.total_tokens || 0,
      timestamp: new Date().toISOString()
    }
  };
}

const gptMock = {
  choices: [{ message: { content: '📌 Entendimento do problema\nPIX debitado não recebido.\n🏷 Categoria\nPIX\n✅ Como resolver\n1. Verificar SPI\n2. Confirmar chave' } }],
  usage: { total_tokens: 750 }
};

try {
  const result = rodarFormatarResposta(gptMock, 'PIX não chegou', 2);
  if (result.sucesso === true) ok('sucesso = true');
  else erro('sucesso', 'esperado true');

  if (result.resposta.includes('📌')) ok('resposta contém seções com emojis');
  else erro('resposta', 'emojis não encontrados');

  if (result.metadados.tokens_usados === 750) ok('tokens_usados = 750');
  else erro('tokens_usados', 'esperado 750');

  if (result.metadados.tickets_utilizados === 2) ok('tickets_utilizados = 2');
  else erro('tickets_utilizados', 'esperado 2');

  // Sem usage (campo opcional)
  const semUsage = rodarFormatarResposta({ choices: gptMock.choices }, 'teste', 0);
  if (semUsage.metadados.tokens_usados === 0) ok('tokens_usados = 0 quando usage ausente');
  else erro('tokens sem usage', 'esperado 0');
} catch (e) {
  erro('Formatar Resposta', e.message);
}

// ============================================================
// RESULTADO FINAL
// ============================================================
console.log('\n' + '='.repeat(50));
console.log(`RESULTADO: ${passou} passou | ${falhou} falhou`);
if (falhou === 0) {
  console.log('✅ Todos os Code nodes funcionam corretamente');
} else {
  console.log('❌ Há problemas a corrigir');
  process.exit(1);
}
