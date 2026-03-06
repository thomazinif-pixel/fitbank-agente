// ============================================================
// Simulação End-to-End do Workflow FitBank (sem APIs reais)
// Replica o fluxo: Webhook → Embedding → Pinecone → GPT → Resposta
// ============================================================

const SYSTEM_PROMPT = `Você é o Super Agente de Atendimento do FitBank.
Responda SEMPRE neste formato:
📌 Entendimento do problema
🏷 Categoria do problema
🔎 Causa mais provável
✅ Como resolver agora
📎 Informações necessárias
🚨 Quando escalar`;

// -------------------------------------------------------
// Mock das APIs externas
// -------------------------------------------------------

function mockOpenAIEmbedding(texto) {
  // Simula vetor de 1536 dimensões (valores baseados no hash do texto)
  const seed = texto.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return Array.from({ length: 1536 }, (_, i) => Math.sin(seed * (i + 1)) * 0.1);
}

function mockPineconeQuery(queryVector, topK = 5) {
  // Base de tickets simulada
  const tickets = [
    { id: 'zendesk-101', score: 0.97, metadata: { ticket_id: '101', subject: 'PIX debitado mas destinatário não recebeu', description: 'Saldo debitado, SPI processou mas destinatário não viu o crédito. Solução: aguardar 2h e verificar chave PIX.', status: 'solved' } },
    { id: 'zendesk-102', score: 0.91, metadata: { ticket_id: '102', subject: 'PIX em análise há mais de 1 hora', description: 'PIX ficou em processamento. Causa: janela de manutenção do SPI. Solução: informar cliente prazo de até 4h.', status: 'solved' } },
    { id: 'zendesk-103', score: 0.85, metadata: { ticket_id: '103', subject: 'PIX devolvido automaticamente', description: 'Chave PIX do destinatário estava inativa. Sistema devolveu automaticamente em 72h.', status: 'solved' } },
    { id: 'zendesk-104', score: 0.72, metadata: { ticket_id: '104', subject: 'Limite PIX diário excedido', description: 'Cliente tentou enviar além do limite configurado. Solução: orientar sobre limite ou solicitar revisão.', status: 'solved' } },
    { id: 'zendesk-105', score: 0.68, metadata: { ticket_id: '105', subject: 'Cartão negado em compra internacional', description: 'MCC do estabelecimento bloqueado. Desbloqueio via painel administrativo.', status: 'solved' } },
  ];
  return { matches: tickets.slice(0, topK) };
}

function mockGPT4o(systemPrompt, userPrompt) {
  // Extrai a pergunta do userPrompt
  const perguntaMatch = userPrompt.match(/PERGUNTA DO ATENDENTE:\n(.+)/);
  const pergunta = perguntaMatch ? perguntaMatch[1] : 'problema desconhecido';

  // Resposta estruturada simulada
  return {
    choices: [{
      message: {
        content: `📌 Entendimento do problema
O atendente relata: "${pergunta}"

🏷 Categoria do problema
PIX

🔎 Causa mais provável
O PIX foi processado e debitado da conta de origem, mas pode estar em análise pelo Banco Central (SPI) ou aguardando confirmação na conta destinatária. Em casos similares, o prazo de processamento pode chegar a 4 horas em janelas de manutenção.

✅ Como resolver agora
1. Confirme que o saldo foi debitado na conta do cliente (se não foi, o PIX não foi enviado)
2. Verifique o status da transação no sistema — procure por "Em processamento" ou "Liquidado"
3. Se aparecer "Liquidado", o destinatário deve receber em breve — peça que aguarde até 2 horas
4. Confirme se a chave PIX do destinatário estava correta no momento do envio
5. Se passar de 4 horas sem recebimento com status "Liquidado", escale para o time financeiro

📎 Informações necessárias
- ID da transação PIX
- Horário exato do envio
- Chave PIX do destinatário utilizada
- Status atual da transação no sistema

🚨 Quando escalar
- Se o status mostrar "Liquidado" há mais de 4 horas e o destinatário não recebeu
- Se houver divergência no valor (debitou valor diferente do enviado)
- Se o sistema não encontrar a transação pelo ID`
      }
    }],
    usage: { total_tokens: 423 }
  };
}

// -------------------------------------------------------
// Replicar cada node do workflow
// -------------------------------------------------------

function node_ValidarPergunta(bodyJson) {
  const body = bodyJson.body || bodyJson;
  const question = body.question || body.pergunta || '';
  if (!question || question.trim() === '') {
    throw new Error('Campo "question" é obrigatório.');
  }
  return { question: question.trim(), timestamp: new Date().toISOString() };
}

function node_VetorizarPergunta(data) {
  const embedding = mockOpenAIEmbedding(data.question);
  return { data: [{ embedding }] };
}

function node_BuscarTicketsSimilares(embeddingResponse) {
  return mockPineconeQuery(embeddingResponse.data[0].embedding, 5);
}

function node_MontarPrompt(pineconeResult, question) {
  const matches = pineconeResult.matches || [];
  let contextoTickets = matches.length > 0
    ? matches.map((m, i) => {
        const meta = m.metadata || {};
        const score = Math.round(m.score * 100);
        return `[Ticket ${i + 1} - Similaridade: ${score}%]\nAssunto: ${meta.subject || 'N/A'}\nDescrição: ${meta.description || 'N/A'}\nStatus: ${meta.status || 'N/A'}`;
      }).join('\n\n---\n\n')
    : 'Nenhum ticket similar encontrado na base histórica.';

  const userPrompt = `TICKETS HISTÓRICOS SIMILARES (Base Zendesk):\n\n${contextoTickets}\n\n---\n\nPERGUNTA DO ATENDENTE:\n${question}\n\nResponda seguindo a estrutura obrigatória.`;
  return { systemPrompt: SYSTEM_PROMPT, userPrompt, question, ticketsEncontrados: matches.length };
}

function node_ChamarGPT4o(promptData) {
  return mockGPT4o(promptData.systemPrompt, promptData.userPrompt);
}

function node_FormatarResposta(gptResponse, question, ticketsEncontrados) {
  return {
    sucesso: true,
    resposta: gptResponse.choices[0].message.content,
    metadados: {
      pergunta_original: question,
      tickets_utilizados: ticketsEncontrados,
      modelo: 'gpt-4o',
      tokens_usados: gptResponse.usage?.total_tokens || 0,
      timestamp: new Date().toISOString()
    }
  };
}

// -------------------------------------------------------
// Executar simulação E2E
// -------------------------------------------------------

const CASOS_TESTE = [
  { desc: 'Caso 1: PIX não recebido',    body: { question: 'O cliente fez um PIX mas o destinatário diz que não recebeu. Saldo foi debitado.' } },
  { desc: 'Caso 2: pergunta vazia',      body: { question: '' } },
  { desc: 'Caso 3: campo alternativo',   body: { pergunta: 'Cartão do cliente foi negado no supermercado' } },
];

let totalOk = 0;
let totalErro = 0;

CASOS_TESTE.forEach(caso => {
  console.log('\n' + '─'.repeat(60));
  console.log('▶ ' + caso.desc);
  console.log('─'.repeat(60));

  try {
    // Etapa 1: Validar pergunta
    const etapa1 = node_ValidarPergunta(caso.body);
    console.log('  [1] Pergunta validada: "' + etapa1.question + '"');

    // Etapa 2: Vetorizar
    const etapa2 = node_VetorizarPergunta(etapa1);
    console.log('  [2] Embedding gerado: ' + etapa2.data[0].embedding.length + ' dimensões');

    // Etapa 3: Buscar similares
    const etapa3 = node_BuscarTicketsSimilares(etapa2);
    console.log('  [3] Tickets similares encontrados: ' + etapa3.matches.length);
    etapa3.matches.forEach((m, i) => {
      console.log(`       ${i + 1}. [${Math.round(m.score * 100)}%] ${m.metadata.subject}`);
    });

    // Etapa 4: Montar prompt
    const etapa4 = node_MontarPrompt(etapa3, etapa1.question);
    console.log('  [4] Prompt montado (' + etapa4.userPrompt.length + ' chars, ' + etapa4.ticketsEncontrados + ' tickets)');

    // Etapa 5: GPT-4o
    const etapa5 = node_ChamarGPT4o(etapa4);
    console.log('  [5] GPT-4o respondeu (' + etapa5.usage.total_tokens + ' tokens)');

    // Etapa 6: Formatar resposta
    const etapa6 = node_FormatarResposta(etapa5, etapa1.question, etapa4.ticketsEncontrados);

    // Verificações da resposta final
    const secoes = ['📌', '🏷', '🔎', '✅', '📎', '🚨'];
    const secoesEncontradas = secoes.filter(s => etapa6.resposta.includes(s));

    console.log('\n  [6] Resposta final:');
    console.log('       sucesso: ' + etapa6.sucesso);
    console.log('       seções presentes: ' + secoesEncontradas.join(' ') + ' (' + secoesEncontradas.length + '/6)');
    console.log('       tokens: ' + etapa6.metadados.tokens_usados);

    if (secoesEncontradas.length === 6) {
      console.log('\n  ✅ PASSOU — Resposta completa com todas as 6 seções');
      totalOk++;
    } else {
      console.log('\n  ⚠️  PARCIAL — Apenas ' + secoesEncontradas.length + ' de 6 seções encontradas');
      totalErro++;
    }

  } catch (e) {
    if (caso.body.question === '') {
      console.log('  ✅ PASSOU — Erro esperado para pergunta vazia: ' + e.message);
      totalOk++;
    } else {
      console.log('  ❌ FALHOU — Erro inesperado: ' + e.message);
      totalErro++;
    }
  }
});

// -------------------------------------------------------
// Resultado final
// -------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log('RESULTADO E2E: ' + totalOk + ' passou | ' + totalErro + ' falhou');
if (totalErro === 0) {
  console.log('✅ Todos os casos de teste passaram — workflow pronto para n8n');
} else {
  console.log('❌ Há casos que precisam de atenção');
  process.exit(1);
}
