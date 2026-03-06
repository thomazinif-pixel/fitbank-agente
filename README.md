# Super Agente FitBank — Guia de Setup

## O que é

Copiloto de atendimento para analistas do FitBank. Responde dúvidas sobre tickets de clientes usando histórico do Zendesk e GPT-4o. Meta: FCR ≥ 70%.

---

## Arquivos

| Arquivo | O que é |
|---------|---------|
| `fitbank-ingestao.json` | Workflow n8n: importa tickets do Zendesk para o Pinecone |
| `fitbank-agente.json` | Workflow n8n: recebe pergunta → busca histórico → responde |
| `index.html` | Interface web para o atendente |
| `system-prompt.txt` | Prompt institucional do agente (referência) |

---

## Passo a Passo de Setup

### 1. Contas necessárias

- [n8n Cloud](https://n8n.io) (ou instalar localmente com Docker)
- [OpenAI](https://platform.openai.com) — API Key com acesso ao GPT-4o
- [Pinecone](https://pinecone.io) — conta gratuita funciona
- Zendesk — API Token (Settings → API)

---

### 2. Criar índice no Pinecone

1. Acesse [app.pinecone.io](https://app.pinecone.io)
2. Create Index:
   - **Name:** `fitbank-zendesk`
   - **Dimensions:** `1536`
   - **Metric:** `cosine`
3. Após criar, vá em **Connect** e copie o **Index Host URL**

---

### 3. Configurar variáveis no n8n

No n8n, vá em **Settings → Environment Variables** e adicione:

```
OPENAI_API_KEY      = sk-...
PINECONE_API_KEY    = sua-chave-pinecone
PINECONE_INDEX_HOST = https://xxx.svc.pinecone.io
ZENDESK_SUBDOMAIN   = nome-da-sua-conta (ex: fitbank)
```

---

### 4. Importar os workflows no n8n

1. Abra o n8n
2. Clique em **+ New Workflow → Import from file**
3. Importe `fitbank-ingestao.json`
4. Importe `fitbank-agente.json`

---

### 5. Configurar credencial do Zendesk

No workflow de ingestão, edite o node **"Buscar Tickets Zendesk"**:

- **Auth Type:** HTTP Basic Auth
- **User:** `seu_email@empresa.com/token`
- **Password:** `seu_api_token_zendesk`

> Atenção: o user deve ser `email/token` literalmente com /token no final.

---

### 6. Popular o Pinecone (primeira vez)

1. Abra o workflow **FitBank - Ingestão Zendesk → Pinecone**
2. Clique em **Execute Workflow** (execução manual)
3. Aguarde processar todos os tickets
4. Verifique no Pinecone se os vetores foram inseridos

---

### 7. Ativar o workflow do agente

1. Abra o workflow **FitBank - Super Agente de Atendimento**
2. Clique em **Activate** (toggle no canto superior direito)
3. Copie a URL do webhook: `https://seu-n8n.com/webhook/fitbank-agente`

---

### 8. Configurar o frontend

Abra `index.html` e edite a linha:

```javascript
const WEBHOOK_URL = 'https://SEU-N8N.com/webhook/fitbank-agente';
```

Substitua pela URL real do seu webhook.

Para usar localmente, basta abrir o arquivo no navegador.
Para hospedar, qualquer serviço de hosting estático funciona (GitHub Pages, Netlify, etc).

---

## Como testar

**Via frontend:** Abra `index.html` no navegador e use os botões de exemplo.

**Via terminal (curl):**
```bash
curl -X POST https://seu-n8n.com/webhook/fitbank-agente \
  -H "Content-Type: application/json" \
  -d '{"question": "PIX debitado mas destinatário não recebeu"}'
```

**Resposta esperada:**
```json
{
  "sucesso": true,
  "resposta": "📌 Entendimento do problema\n...\n🏷 Categoria...\n✅ Como resolver...",
  "metadados": {
    "tickets_utilizados": 5,
    "modelo": "gpt-4o",
    "tokens_usados": 850
  }
}
```

---

## Atualização do Pinecone

O workflow de ingestão roda automaticamente todo dia.
Para forçar uma atualização manual, execute o workflow de ingestão manualmente no n8n.

---

## Solução de problemas

| Problema | Causa | Solução |
|---------|-------|---------|
| Erro 401 na OpenAI | API Key inválida | Verifique `OPENAI_API_KEY` nas variáveis |
| Erro 401 no Pinecone | API Key inválida | Verifique `PINECONE_API_KEY` |
| Pinecone retorna 0 resultados | Índice vazio | Execute o workflow de ingestão primeiro |
| Zendesk retorna 401 | Auth incorreto | User deve ser `email/token`, não só o email |
| Frontend não consegue chamar webhook | CORS | O webhook já está configurado com CORS `*` |
