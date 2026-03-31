#!/usr/bin/env node
// ============================================================
// MarIA V5 — Ingestão Azure DevOps → Pinecone (devops-tickets)
// Uso: node ingest-devops.js
// ============================================================
require('dotenv').config();

const AZDO_PAT      = process.env.AZDO_PAT;
const AZDO_ORG      = process.env.AZDO_ORG      || 'fitbank';
const AZDO_PROJECT  = process.env.AZDO_PROJECT   || 'Fit';
const AZDO_QUERY_ID = process.env.AZDO_QUERY_ID;
const OPENAI_KEY    = process.env.OPENAI_API_KEY;
const PINECONE_HOST = process.env.PINECONE_INDEX_HOST;
const PINECONE_KEY  = process.env.PINECONE_API_KEY;
const NAMESPACE     = 'devops-tickets';
const EMBED_BATCH   = 20;   // itens por lote de embedding
const AZDO_BATCH    = 200;  // max suportado pela batch API do AZDO

const AZDO_AUTH = 'Basic ' + Buffer.from(`:${AZDO_PAT}`).toString('base64');
const AZDO_BASE = `https://dev.azure.com/${AZDO_ORG}/${AZDO_PROJECT}/_apis`;

// ─── mapa BU ID → nome do cliente ────────────────────────────
const BU_MAP = {
  "1269":"2M TECHNOLOGY LTDA","1567":"4ON MEIOS DE PAGAMENTO LTDA","1642":"4ON MEIOS DE PAGAMENTO LTDA 2",
  "15":"Acerto Fácil Cobranças","1694":"ADAPTIVE TECNOLOGIA DA INFORMACAO","1645":"ADMINISTRADORA CARTAO DE CREDITO TODOS S.A.",
  "26":"AGROPAGO SOLUCOES FINANCEIRAS LTDA","1127":"ALGORITMUS CONSULTORIA EM TECNOLOGIA DA INFORMACAO LTDA",
  "1283":"AMBAR BANK","235":"BANCO BS2 S.A.","517":"BANCO GENIAL S.A.","377":"BANCO J. P. MORGAN S.A.",
  "1052":"BANCO SOFISA S.A","1043":"BEE4","1509":"Bigpag Brasil","414":"Bonuspago","1600":"BRLA DIGITAL LTDA",
  "75":"Bu - Financeiro Eduzz","27":"BuImplementação","403":"BUSON TECNOLOGIA LTDA","67":"C6 BANK",
  "1689":"CALI INSTITUICAO DE PAGAMENTO LTDA","315":"CARGILL AGRICOLA S A","1215":"CASH BERTI",
  "1670":"CLICKPAY INSTITUICAO DE PAGAMENTO LTDA","1571":"CODE TECH ENTERPRISE LTDA","1231":"COMPANHIA PROVINCIA DE SECURITIZACAO",
  "256":"CONDOCONTA DIGITAL S/A","62":"CENTRAL SICREDI SUL/SUDESTE","17":"Dentalis","885":"Digital Banking - Staging",
  "1001790":"DOCK INSTITUICAO DE PAGAMENTO S.A.","1673":"DROOM DIGITAL","1350":"EASYC HOLDING SA",
  "953":"ECTARE PAY","37":"EDUZZ TECNOLOGIA LTDA","1419":"EMERCHANTPAY DO BRASIL","1720":"EMITEAI SOLUCOES",
  "341":"EPAR LTDA","329":"ESCRITORIO ADMINISTRATIVO CLINICAS INTELIGENTES LTDA","1493":"FAPAY MEIOS DE PAGAMENTO S/A",
  "1072":"FIAGRIL LTDA","1159":"Financeiro","494":"Fitbank - Homologação","1019":"Fitbank Instituição de Pagamentos Eletrônicos S.A.",
  "1333":"FITBANK PAGAMENTOS ELETRONICOS LTDA - OSB","1":"FITBANK TESOURARIA","390":"FITCE PAGAMENTOS ELETRONICOS LTDA",
  "385":"FLIX DO BRASIL SERVIÇOS S/A","1631":"FRENTE CORRETORA DE CAMBIO SA","1001784":"FUNDO DE INVESTIMENTO",
  "1212":"GAZINCRED S.A.","1586":"GLOBAL PAGAMENTOS LIMITADA","1001":"iaxei Pay","1175":"ILM Tecnologia e Serviços",
  "1240":"INCBANK LTDA","1472":"INNOVENTURES IDEIAS","1682":"D.A.D PAY LTDA","280":"IPREMI TECNOLOGIA",
  "1382":"JLD PARTICIPACOES LTDA","1719":"J. P. MORGAN S.A","1399":"KINETIC SERVICOS DIGITAIS LTDA",
  "1759":"KIRVANO PAGAMENTOS LTDA","1001787":"KRIA INVESTIMENTOS LTDA","1619":"LINKED STORE BRASIL",
  "187":"LINKPAY SOLUCOES DE PAGAMENTOS LTDA","1544":"LP DO BRASIL INSTITUICAO DE PAGAMENTOS LTDA",
  "1679":"MaiaPaga","1627":"MARVIN PAGAMENTOS LTDA","92":"MONEY CLOUD TECNOLOGIA LTDA","1503":"MT SERVICOS DE TECNOLOGIA LTDA",
  "4":"NC SOLUCOES E SERVICOS DE INFORMATICA LTDA","1277":"NEOFIN TECNOLOGIA LTDA","182":"NFESISTEMAS",
  "80":"NU PAGAMENTOS S.A.","1484":"NUVEMSIS PARTICIPACOES S.A.","1439":"OMIEXPERIENCE LTDA",
  "1499":"ORKESTRA TECNOLOGIA EM PAGAMENTO LTDA","1342":"OWLDIGITAL PAGAMENTOS LTDA","1487":"OWLDIGITAL PAGAMENTOS LTDA 2",
  "1754":"P4X SOLUCOES","1521":"PAY2M SOLUCOES FINANCEIRAS LTDA","1552":"PAY CAPITAL PAGAMENTOS SA",
  "1587":"PAY CAPITAL PAGAMENTOS SA 2","1667":"PAYGATE LTDA","1653":"PayImobi - Financeiro",
  "1630":"PAYIMOBI SOLUCOES DE PAGAMENTOS IMOBILIARIOS LTDA","1255":"PAYPLEX","987":"Pay Retailers BR",
  "1527":"PLEBANK.COM.BR","1396":"PROPAY PAGAMENTOS LTDA","1263":"PROSPERITA SOLUTION FINANCE LTDA",
  "1259":"QA OPS","1301":"R B SOLUÇÕES DE PAGAMENTOS LTDA","1709":"RED EFECTIVA BRASIL PAGAMENTOS LTDA",
  "1583":"R M A TECNOLOGIA LTDA","84":"RODOBANK SA","939":"Security Team","431":"SELLERS LTDA",
  "259":"SEVEN TECHNOLOGY BANK","40":"SOCIALCONDO DESENVOLVIMENTO DE SOFTWARE LTDA",
  "1564":"SUPERSIM ANALISE DE DADOS E CORRESPONDENTE BANCARIO LTDA","349":"SWILE DO BRASIL S.A.",
  "1133":"TBK PAGAMENTOS LTDA","1734":"TECH PROVIDERS LLC","268":"Testes de Integração (Fitbank)",
  "474":"TIME PAY ADMINISTRAÇÃO DE CARTÕES LTDA","1449":"TIVITA TECNOLOGIA E SERVICOS LTDA",
  "374":"TIVIT TERCEIRIZACAO DE PROCESSOS SERVICOS E TECNOLOGIA S.A","1703":"TRANS KOTHE TRANSPORTES RODOVIARIOS S/A",
  "1165":"TRIO TECNOLOGIA LTDA","1573":"TRUSTE DIGITAL LTDA","331":"UNICRED DO BRASIL",
  "1330":"UP VENDAS GESTAO DE PAGAMENTOS S/A","1280":"URBE.ME","544":"USECASH",
  "1407":"VALORA GESTAO DE INVESTIMENTOS LTDA.","383":"VISTO CONSULTORIA IMOBILIARIA LTDA",
  "755":"WEBE ASC SISTEMAS DE INFORMACAO EIRELI","1107":"WGX TECNOLOGIA LTDA","1753":"WII ASCEND TECHNOLOGIES LTDA",
  "1777":"ZAPPYPAG DIGITAL LTDA","990":"ZLIN PAY LTDA"
};

// ─── helpers ──────────────────────────────────────────────────
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function stripHtml(html = '') {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

async function azdoFetch(url, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { headers: { Authorization: AZDO_AUTH } });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '30') * 1000;
      process.stdout.write(`\n  ⏳ Rate limit AZDO — aguardando ${wait/1000}s...`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`AZDO ${res.status}: ${url}`);
    return res.json();
  }
  throw new Error('AZDO: máximo de retries atingido');
}

async function azdoBatch(ids) {
  const fields = [
    'System.Id','System.Title','System.State','System.AreaPath',
    'Custom.BusinessUnitID','Custom.Cliente','Custom.Cause','Custom.Outcome',
    'System.Description','Microsoft.VSTS.CMMI.Analysis','Custom.CauseDescription'
  ];
  const res = await fetch(`${AZDO_BASE}/wit/workitemsbatch?api-version=7.1`, {
    method: 'POST',
    headers: {
      Authorization: AZDO_AUTH,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ids, fields })
  });
  if (!res.ok) throw new Error(`AZDO batch ${res.status}: ${await res.text()}`);
  return res.json();
}

async function embed(text) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 1024 })
    });
    if (res.status === 429) { await sleep(12000); continue; }
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const d = await res.json();
    return d.data[0].embedding;
  }
  throw new Error('OpenAI: máximo de retries');
}

async function upsertBatch(vectors) {
  const res = await fetch(`${PINECONE_HOST}/vectors/upsert`, {
    method: 'POST',
    headers: { 'Api-Key': PINECONE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors, namespace: NAMESPACE })
  });
  if (!res.ok) throw new Error(`Pinecone ${res.status}: ${await res.text()}`);
}

function buildTextoEmbedding(f) {
  const buId   = String(f['Custom.BusinessUnitID'] || '');
  const cliente = f['Custom.Cliente'] || BU_MAP[buId] || '';
  const desc    = stripHtml(f['System.Description']);
  const analysis = stripHtml(f['Microsoft.VSTS.CMMI.Analysis']);
  const causeDesc = stripHtml(f['Custom.CauseDescription']);
  const cause   = f['Custom.Cause'] || '';
  const outcome = f['Custom.Outcome'] || '';
  const area    = f['System.AreaPath'] || '';
  const title   = f['System.Title'] || '';

  return [
    `Título: ${title}`,
    desc       ? `Problema: ${truncate(desc, 600)}`       : '',
    causeDesc  ? `Causa Raiz: ${truncate(causeDesc, 600)}` : '',
    analysis   ? `Análise: ${truncate(analysis, 600)}`    : '',
    cause      ? `Causa: ${cause}`                         : '',
    outcome    ? `Outcome: ${outcome}`                     : '',
    cliente    ? `Cliente: ${cliente}`                     : '',
    area       ? `Área: ${area}`                           : '',
  ].filter(Boolean).join('\n');
}

function buildMetadata(f) {
  const buId    = String(f['Custom.BusinessUnitID'] || '');
  const cliente = f['Custom.Cliente'] || BU_MAP[buId] || '';
  const desc    = stripHtml(f['System.Description']);
  const analysis = stripHtml(f['Microsoft.VSTS.CMMI.Analysis']);
  const causeDesc = stripHtml(f['Custom.CauseDescription']);

  return {
    workitem_id:  String(f['System.Id'] || ''),
    titulo:       truncate(f['System.Title'] || '', 200),
    problema:     truncate(desc, 400),
    causa_raiz:   truncate(causeDesc, 400),
    analise:      truncate(analysis, 400),
    causa:        truncate(f['Custom.Cause'] || '', 100),
    outcome:      f['Custom.Outcome'] || '',
    bu_id:        buId,
    cliente:      truncate(cliente, 100),
    area_path:    f['System.AreaPath'] || '',
    state:        f['System.State'] || '',
    fonte:        'devops'
  };
}

// ─── main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  MarIA V5 — Ingestão Azure DevOps → Pinecone     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // 1. Busca todos os IDs da query
  process.stdout.write('  🔍 Buscando IDs da query DevOps...');
  const queryResult = await azdoFetch(
    `${AZDO_BASE}/wit/wiql/${AZDO_QUERY_ID}?api-version=7.1`
  );
  const allIds = (queryResult.workItems || []).map(w => w.id);
  console.log(` ${allIds.length} work items encontrados.`);

  let processados = 0, ignorados = 0, erros = 0;
  const vectors = [];

  // 2. Batch fetch AZDO (200 por vez)
  for (let i = 0; i < allIds.length; i += AZDO_BATCH) {
    const batchIds = allIds.slice(i, i + AZDO_BATCH);
    let batchData;
    try {
      batchData = await azdoBatch(batchIds);
    } catch (e) {
      erros += batchIds.length;
      process.stdout.write(`\n  ❌ Batch AZDO falhou: ${e.message}`);
      continue;
    }

    const items = batchData.value || [];

    // 3. Embed em sub-lotes de EMBED_BATCH
    for (let j = 0; j < items.length; j += EMBED_BATCH) {
      const lote = items.slice(j, j + EMBED_BATCH);
      const loteVectors = [];

      for (const item of lote) {
        const f = item.fields || {};
        const texto = buildTextoEmbedding(f);

        // Ignora itens sem conteúdo útil
        if (texto.replace(/Título:|Problema:|Área:/g, '').trim().length < 30) {
          ignorados++;
          continue;
        }

        try {
          const vector = await embed(texto);
          loteVectors.push({
            id: `devops-${item.id}`,
            values: vector,
            metadata: buildMetadata(f)
          });
        } catch (e) {
          erros++;
        }

        await sleep(50); // evita rate limit OpenAI
      }

      // 4. Upsert no Pinecone
      if (loteVectors.length > 0) {
        try {
          await upsertBatch(loteVectors);
          processados += loteVectors.length;
        } catch (e) {
          erros += loteVectors.length;
          process.stdout.write(`\n  ❌ Upsert Pinecone falhou: ${e.message}`);
        }
      }

      const total = i + j + lote.length;
      process.stdout.write(
        `\r  📄 ${total}/${allIds.length} processados — ✅ ${processados} upsertados — ⚠️ ${ignorados} ignorados — ❌ ${erros} erros`
      );
    }

    // Pausa entre batches AZDO
    if (i + AZDO_BATCH < allIds.length) await sleep(500);
  }

  console.log(`\n\n╔══════════════════════════════════════════════════╗`);
  console.log(`║              INGESTÃO DEVOPS CONCLUÍDA           ║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
  console.log(`  ✅ Upsertados:  ${processados}`);
  console.log(`  ⚠️  Ignorados:   ${ignorados}`);
  console.log(`  ❌ Erros:       ${erros}`);
  console.log(`  📦 Namespace:   ${NAMESPACE}`);
  console.log(`  🗂  Index:       fitbank-zendesk\n`);
}

main().catch(e => { console.error('\n❌ Erro fatal:', e.message); process.exit(1); });
