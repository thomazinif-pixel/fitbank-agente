#!/usr/bin/env node
require('dotenv').config();

const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ZENDESK_DOMAIN = `https://${process.env.ZENDESK_SUBDOMAIN}.zendesk.com`;
const ZENDESK_AUTH  = 'Basic ' + Buffer.from(`${process.env.ZENDESK_EMAIL}/token:${process.env.ZENDESK_API_TOKEN}`).toString('base64');

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function zdFetch(path, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(`${ZENDESK_DOMAIN}${path}`, { headers: { Authorization: ZENDESK_AUTH } });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '30') * 1000;
      console.log(`  Rate limit, aguardando ${wait/1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`Zendesk ${res.status}: ${path}`);
    return res.json();
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   MarIA — Gerador de Top 10 Diário   ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Busca os 500 tickets mais recentes (últimas ~3-7 páginas)
  const subjects = [];
  let url = `/api/v2/tickets.json?page[size]=100&sort_by=created_at&sort_order=desc`;
  let pagina = 0;

  console.log(`  📅 Buscando tickets mais recentes...\n`);

  while (url && subjects.length < 500) {
    const data = await zdFetch(url);
    const tickets = data.tickets || [];
    pagina++;

    for (const t of tickets) {
      const subject = (t.subject || '').replace(/\s+/g, ' ').trim();
      if (subject.length > 5) subjects.push(subject.slice(0, 120));
    }

    console.log(`  📄 Página ${pagina}: +${tickets.length} tickets (total: ${subjects.length})`);

    const next = data.links?.next || null;
    url = next ? next.replace(ZENDESK_DOMAIN, '') : null;
    if (!data.meta?.has_more) url = null;
    if (url) await sleep(200);
  }

  console.log(`\n  ✅ Total de assuntos coletados: ${subjects.length}`);

  if (subjects.length === 0) {
    console.error('  ❌ Nenhum ticket encontrado. Verifique as credenciais Zendesk.');
    process.exit(1);
  }

  // Analisa com GPT-4o-mini
  console.log('\n  🤖 Analisando com GPT-4o-mini...');

  const prompt = `Você é um analista de suporte de um banco digital chamado FitBank.

Analise os seguintes ${subjects.length} assuntos de tickets de suporte dos últimos 7 dias e identifique os 10 temas mais frequentes e críticos.

ASSUNTOS DOS TICKETS:
${subjects.slice(0, 400).join('\n')}

Retorne APENAS um JSON com a chave "top10" contendo exatamente 10 objetos no formato:
{"top10": [{"tema": "Nome curto do tema (máx 5 palavras)", "descricao": "Breve descrição do problema (máx 15 palavras)", "icone": "emoji relacionado"}]}

Ordene do tema mais frequente para o menos frequente. Use ícones relevantes para banking/finanças.`;

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3
    })
  });

  if (!oaiRes.ok) {
    const err = await oaiRes.text();
    throw new Error(`OpenAI ${oaiRes.status}: ${err}`);
  }

  const oaiData = await oaiRes.json();
  const content = oaiData.choices[0].message.content;
  const parsed = JSON.parse(content);

  let top10 = parsed.top10 || parsed.items || Object.values(parsed)[0];
  if (!Array.isArray(top10)) throw new Error('Resposta GPT inválida: ' + content);
  top10 = top10.slice(0, 10);

  console.log('\n  🏆 Top 10 identificados:');
  top10.forEach((t, i) => console.log(`  ${i+1}. ${t.icone || '📌'} ${t.tema} — ${t.descricao}`));

  // Salva no Upstash Redis
  const resultado = {
    top10,
    gerado_em: new Date().toISOString(),
    total_tickets_analisados: subjects.length,
    periodo: `500 tickets mais recentes`
  };

  console.log('\n  💾 Salvando no Redis...');

  const redisRes = await fetch(`${UPSTASH_URL}/set/maria:top10`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${UPSTASH_TOKEN}`
    },
    body: JSON.stringify([JSON.stringify(resultado), 'EX', '90000']) // TTL 25h
  });

  const redisData = await redisRes.json();

  if (redisData.result === 'OK') {
    console.log('  ✅ Top 10 salvo no Redis com TTL de 25h');
  } else {
    console.error('  ❌ Erro Redis:', redisData);
  }

  console.log('\n  🎉 Concluído!\n');
}

main().catch(err => { console.error('\n❌ Erro:', err.message); process.exit(1); });
