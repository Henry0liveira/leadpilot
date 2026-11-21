# LeadPilot — sincronização WhatsApp → Supabase

Serviço independente do backend do site. Preserva o bot Python e a Evolution API já funcionando.

## Registros
- `contacts`, `conversations`, `messages`: contatos, conversas e mensagens de texto.
- `conversation_outcomes`: resultado comercial de cada mensagem recebida.
- Sem selecionar automaticamente leads importados para o CRM. `lead_id` do resultado permanece vazio até vínculo posterior.
- Classificação por regras, opcionalmente Groq (`GROQ_OUTCOMES_ENABLED=true`). O Groq nunca envia mensagens pelo serviço.
- Fila em volume Docker para novas tentativas quando Supabase estiver temporariamente indisponível.
- Grupos não são armazenados por padrão.

## Na Oracle Cloud (Ubuntu)
A pasta do bot original é `~/leadpilot-groq-bot-grupos` e já possui `WEBHOOK_SECRET` no `.env`.

```bash
git clone https://github.com/Henry0liveira/leadpilot.git
cd leadpilot/services/conversation-bridge
cp .env.example .env
chmod 600 .env
nano .env
```

Preencha `SUPABASE_SECRET_KEY` no servidor, nunca no frontend, e coloque em `BOT_WEBHOOK_SECRET` o valor existente no `.env` do bot Python. Gere um **novo** `GATEWAY_WEBHOOK_SECRET` com `openssl rand -hex 32` e preencha `LEADPILOT_OWNER_ID` com o UUID do usuário do Supabase Auth.

```bash
sudo docker compose up -d --build
curl -i http://127.0.0.1:8789/health
```

Docker utiliza `network_mode: host` para alcançar o bot original em `127.0.0.1:8788`. O serviço da ponte escuta em `127.0.0.1:8789`, não expõe porta pública.

No Caddyfile do domínio `leadpilot-api.duckdns.org`, adicione **antes** do fallback da Evolution API:

```caddyfile
handle_path /sync/* {
    reverse_proxy 127.0.0.1:8789
}
```

**Preserve** a rota existente `/groq-bot/*` direcionando ao bot Python e o fallback direcionando à Evolution API. Validar e recarregar:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Antes de alterar a Evolution, teste no Ubuntu (não imprime o segredo):

```bash
cd ~/leadpilot/services/conversation-bridge
secret=$(sed -n 's/^GATEWAY_WEBHOOK_SECRET=//p' .env)
curl -s -o /dev/null -w 'HTTP %{http_code}\n' -X POST \
 "https://leadpilot-api.duckdns.org/sync/webhooks/evolution/$secret" \
 -H 'Content-Type: application/json' \
 --data '{"instance":"leadpilot","event":"MESSAGES_UPSERT","data":[]}'
unset secret
```

Esperado: HTTP **202**.

Só então altere o **webhook da instância Evolution `leadpilot`** para:
`https://leadpilot-api.duckdns.org/sync/webhooks/evolution/SEU_GATEWAY_WEBHOOK_SECRET`

Evento `MESSAGES_UPSERT` habilitado, `byEvents=false`. A ponte encaminha o evento ao bot Python e salva o mesmo evento no Supabase. Não use simultaneamente o webhook CRM antigo, pois ele possui lógica independente para responder a mensagens.

**Rollback**: restabeleça a URL anterior `https://leadpilot-api.duckdns.org/groq-bot/SEU_BOT_WEBHOOK_SECRET`.

## Observações de produção
- Não ativa o webhook nem altera a Oracle ao fazer merge. Todos os passos acima exigem ação no servidor.
- Apenas texto e legendas, sem mídias ou áudios; saídas são registradas quando Evolution emite eventos `fromMe=true`.
- Não existe identificação segura de um lead de prospecção a partir de um número informado, portanto `lead_id` não é preenchido automaticamente.
- As estimativas de intenção são sugestões, não confirmação de venda.
- A mensagem pode ser transmitida à Groq para análise caso `GROQ_OUTCOMES_ENABLED=true`; avalie base legal, transparência e retenção conforme LGPD.
- O painel web e o login ainda devem ler as tabelas com políticas RLS; essa ponte funciona independentemente deles.
- `SUPABASE_SECRET_KEY` e chaves Groq somente no backend.
- Para o diagnóstico: `sudo docker compose logs --tail=50 bridge` e Supabase Table Editor.
