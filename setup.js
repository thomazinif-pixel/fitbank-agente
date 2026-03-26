#!/usr/bin/env node
// ============================================================
// Super Agente FitBank — Script de Setup de Infraestrutura
// Uso: node setup.js
// ============================================================

import('dotenv/config').catch(() => {
  try { require('dotenv').config(); } catch {}
});

// Compatibilidade Node.js 18+ (fetch nativo)
const fetchFn = globalThis.fetch || (() => { throw new Error('Node.js 18+ necessário'); });

const VERDE  = '\x1b[32m';
const VERM   = '\x1b[31m';
const AMAR   = '\x1b[33m';
const AZUL   = '\x1b[34m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

function ok(msg)   { console.log(`  ${VERDE}✅${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${VERM}❌${RESET} ${msg}`); }
function warn(msg) { console.log(`  ${AMAR}⚠️ ${RESET} ${msg}`); }
function info(msg) { console.log(`  ${AZUL}ℹ️ ${RESET} ${msg}`); }

async function main() {
  // Carrega .env (se existir)
  try {
    const { config } = await import('dotenv');
    config();
  } catch {
    try {
      require('dotenv').config();
    } catch {}
  }

  console.log(`\n${BOLD}${AZUL}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${AZUL}║   Super Agente FitBank — Setup Check     ║${RESET}`);
  console.log(`${BOLD}${AZUL}╚══════════════════════════════════════════╝${RESET}\n`);

  const resultados = {
    variaveis: false,
    openai: false,
    pinecone_key: false,
    pinecone_index: false,
    redis: false,
    zendesk: false,
  };

  // ============================================================
  // 1. Verificar variáveis de ambiente
  // ============================================================
  console.log(`${BOLD}[1/4] Verificando variáveis de ambiente...${RESET}`);

  const vars = {
    OPENAI_API_KEY:          process.env.OPENAI_API_KEY,
    PINECONE_API_KEY:        process.env.PINECONE_API_KEY,
    PINECONE_INDEX_HOST:     process.env.PINECONE_INDEX_HOST,
    PINECONE_API_BASE:       process.env.PINECONE_API_BASE,
    UPSTASH_REDIS_REST_URL:  process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN:process.env.UPSTASH_REDIS_REST_TOKEN,
    ZENDESK_SUBDOMAIN:       process.env.ZENDESK_SUBDOMAIN,
    ZENDESK_EMAIL:           process.env.ZENDESK_EMAIL,
    ZENDESK_API_TOKEN:       process.env.ZENDESK_API_TOKEN,
  };

  let varsFaltando = [];
  for (const [nome, valor] of Object.entries(vars)) {
    if (!valor || valor.includes('...') || valor.includes('seu_')) {
      varsFaltando.push(nome);
    } else {
      const preview = nome.includes('KEY') || nome.includes('TOKEN')
        ? valor.substring(0, 8) + '...'
        : valor;
      ok(`${nome} = ${preview}`);
    }
  }

  if (varsFaltando.length > 0) {
    varsFaltando.forEach(v => fail(`${v} não configurada`));
    warn(`Copie .env.example para .env e preencha os valores ausentes.`);
  } else {
    resultados.variaveis = true;
  }

  // ============================================================
  // 2. Testar OpenAI
  // ============================================================
  console.log(`\n${BOLD}[2/4] Testando conexão com OpenAI...${RESET}`);

  if (!vars.OPENAI_API_KEY || vars.OPENAI_API_KEY.includes('...')) {
    warn('Pulando — OPENAI_API_KEY não configurada');
  } else {
    try {
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vars.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: 'teste fitbank' }),
      });

      if (res.ok) {
        const data = await res.json();
        const dims = data.data?.[0]?.embedding?.length;
        ok(`OpenAI conectado — embedding gerado com ${dims} dimensões`);
        resultados.openai = true;
      } else {
        const err = await res.json();
        fail(`OpenAI erro ${res.status}: ${err.error?.message || res.statusText}`);
      }
    } catch (e) {
      fail(`OpenAI falhou: ${e.message}`);
    }
  }

  // ============================================================
  // 3. Testar Pinecone + criar índice se não existir
  // ============================================================
  console.log(`\n${BOLD}[3/4] Verificando Pinecone...${RESET}`);

  const pineconeBase = vars.PINECONE_API_BASE || 'https://api.pinecone.io';
  const indexName = process.env.PINECONE_INDEX_NAME || 'fitbank-zendesk';

  if (!vars.PINECONE_API_KEY || vars.PINECONE_API_KEY.includes('...')) {
    warn('Pulando — PINECONE_API_KEY não configurada');
  } else {
    // 3a. Listar índices existentes
    try {
      const res = await fetch(`${pineconeBase}/indexes`, {
        headers: { 'Api-Key': vars.PINECONE_API_KEY },
      });

      if (!res.ok) {
        const err = await res.json();
        fail(`Pinecone erro ${res.status}: ${JSON.stringify(err)}`);
      } else {
        const data = await res.json();
        const indexes = data.indexes || [];
        const existente = indexes.find(idx => idx.name === indexName);

        if (existente) {
          ok(`Índice "${indexName}" já existe`);
          info(`  Host: ${existente.host}`);
          info(`  Dimensões: ${existente.dimension} | Metric: ${existente.metric}`);
          info(`  Status: ${existente.status?.state || 'desconhecido'}`);
          resultados.pinecone_key = true;

          if (existente.dimension !== 1536) {
            fail(`Dimensão incorreta: ${existente.dimension} (esperado 1536)`);
            warn('Você precisa recriar o índice com 1536 dimensões.');
          } else {
            resultados.pinecone_index = true;
          }

          if (existente.host && !vars.PINECONE_INDEX_HOST?.includes(existente.host.split('/')[2])) {
            warn(`PINECONE_INDEX_HOST no .env pode estar desatualizado.`);
            info(`  Use: ${existente.host}`);
          }
        } else {
          // 3b. Criar o índice
          warn(`Índice "${indexName}" não existe. Criando...`);

          const createRes = await fetch(`${pineconeBase}/indexes`, {
            method: 'POST',
            headers: {
              'Api-Key': vars.PINECONE_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: indexName,
              dimension: 1536,
              metric: 'cosine',
              spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
            }),
          });

          if (createRes.ok || createRes.status === 201) {
            const created = await createRes.json();
            ok(`Índice "${indexName}" criado com sucesso!`);
            info(`  Host: ${created.host}`);
            warn(`  Aguarde ~1 min para o índice ficar pronto, depois atualize PINECONE_INDEX_HOST no .env`);
            info(`  PINECONE_INDEX_HOST=${created.host}`);
            resultados.pinecone_key = true;
            resultados.pinecone_index = true;
          } else {
            const err = await createRes.json();
            fail(`Falha ao criar índice: ${JSON.stringify(err)}`);
            resultados.pinecone_key = true; // chave OK, só falhou a criação
          }
        }
      }
    } catch (e) {
      fail(`Pinecone falhou: ${e.message}`);
    }
  }

  // ============================================================
  // 4. Testar Upstash Redis (memória persistente)
  // ============================================================
  console.log(`\n${BOLD}[4/5] Testando conexão com Upstash Redis...${RESET}`);

  const upstashUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!upstashUrl || upstashUrl.includes('XXXXXXXX') || !upstashToken || upstashToken.includes('seu_')) {
    warn('Pulando — credenciais Upstash não configuradas');
    warn('Crie um banco em: https://console.upstash.com → Create Database → copie REST URL e REST Token');
  } else {
    try {
      // Escreve e lê uma chave de teste
      const testKey  = 'maria:setup:test';
      const testVal  = `setup-${Date.now()}`;

      // SET
      const setRes = await fetch(`${upstashUrl}/set/${testKey}/${testVal}/EX/60`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      if (!setRes.ok) throw new Error(`SET falhou: ${setRes.status}`);

      // GET
      const getRes = await fetch(`${upstashUrl}/get/${testKey}`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      if (!getRes.ok) throw new Error(`GET falhou: ${getRes.status}`);

      const data = await getRes.json();
      if (data.result === testVal) {
        ok(`Upstash Redis conectado — SET/GET funcionando`);
        resultados.redis = true;
      } else {
        fail(`Redis: valor lido (${data.result}) diferente do escrito (${testVal})`);
      }
    } catch (e) {
      fail(`Upstash Redis falhou: ${e.message}`);
    }
  }

  // ============================================================
  // 5. Testar Zendesk
  // ============================================================
  console.log(`\n${BOLD}[5/5] Testando conexão com Zendesk...${RESET}`);

  const zdSubdomain = vars.ZENDESK_SUBDOMAIN;
  const zdEmail = vars.ZENDESK_EMAIL;
  const zdToken = vars.ZENDESK_API_TOKEN;

  if (!zdSubdomain || !zdEmail || !zdToken || zdToken.includes('seu_')) {
    warn('Pulando — credenciais Zendesk não configuradas');
    warn('Obtenha o token em: Zendesk Admin → Configurações → API → Tokens de API');
  } else {
    try {
      const credentials = Buffer.from(`${zdEmail}/token:${zdToken}`).toString('base64');
      const res = await fetch(
        `https://${zdSubdomain}.zendesk.com/api/v2/tickets.json?per_page=1&status=solved`,
        { headers: { 'Authorization': `Basic ${credentials}` } }
      );

      if (res.ok) {
        const data = await res.json();
        ok(`Zendesk conectado — ${data.count || 'N/A'} tickets encontrados`);
        resultados.zendesk = true;
      } else {
        const body = await res.text();
        fail(`Zendesk erro ${res.status}: ${body.substring(0, 120)}`);
        if (res.status === 401) {
          warn('Verifique se o token está correto e se a API está habilitada no Zendesk.');
        }
      }
    } catch (e) {
      fail(`Zendesk falhou: ${e.message}`);
    }
  }

  // ============================================================
  // Resumo final
  // ============================================================
  console.log(`\n${BOLD}╔══════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║              RESUMO DO SETUP              ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════╝${RESET}`);

  const checks = [
    ['Variáveis de ambiente', resultados.variaveis],
    ['OpenAI (embeddings + GPT-4o-mini + GPT-4o)', resultados.openai],
    ['Pinecone (chave)', resultados.pinecone_key],
    ['Pinecone (índice 1536 dims)', resultados.pinecone_index],
    ['Upstash Redis (memória por ticket)', resultados.redis],
    ['Zendesk (API)', resultados.zendesk],
  ];

  checks.forEach(([nome, passou]) => {
    if (passou) ok(nome);
    else        fail(nome);
  });

  const total = checks.filter(c => c[1]).length;
  console.log(`\n  ${total}/${checks.length} serviços configurados\n`);

  if (total === checks.length) {
    console.log(`${VERDE}${BOLD}🚀 Infraestrutura pronta! Próximo passo: importar os workflows no n8n Cloud.${RESET}`);
  } else {
    console.log(`${AMAR}${BOLD}⚠️  Complete a configuração acima e execute novamente: node setup.js${RESET}`);
  }

  console.log('');
  console.log(`${BOLD}Próximos passos:${RESET}`);
  console.log(`  1. Acesse https://app.n8n.cloud e crie uma conta`);
  console.log(`  2. Importe fitbank-ingestao.json e fitbank-agente.json`);
  console.log(`  3. Adicione as credenciais no n8n (OpenAI, Pinecone, Zendesk)`);
  console.log(`  4. Ative os workflows e copie a URL do webhook`);
  console.log(`  5. Acesse o frontend e configure a webhook URL\n`);
}

main().catch(err => {
  console.error(`\n${VERM}Erro fatal: ${err.message}${RESET}`);
  process.exit(1);
});
