# LeadPilot AI — MVP de Prospecção Comercial

Aplicação web com **Google Places API (New)**, painel de leads, CRM manual, **Evolution API** e IA da **Groq Cloud** para análise de oportunidades e respostas automáticas opcionais. Código-fonte para uso local; nenhuma API real é chamada sem configuração.

## Comece em 3 passos

1. Tenha **Node.js 20+**. No terminal, nesta pasta, execute `npm install`.
2. Copie `.env.example` para `.env`. Preencha `GOOGLE_PLACES_API_KEY` para buscas reais; sem a chave, são exibidas **empresas fictícias de demonstração**. Para WhatsApp, preencha `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `EVOLUTION_WEBHOOK_SECRET`. Para IA, configure `GROQ_API_KEY` e opcionalmente `GROQ_MODEL`.
3. Execute `npm run dev` e abra **http://127.0.0.1:3000** no navegador.

O servidor escuta **somente 127.0.0.1 por padrão**. **O MVP não possui login**; não exponha seus endpoints de IA ou CRM à internet. Para receber webhooks externamente, disponibilize apenas a rota necessária via um túnel HTTPS seguro, ou implante atrás de proxy com autenticação, firewall e HTTPS. Não exponha o painel publicamente sem autenticação.

## Importação do Maps Lead Extractor (JSON) — SEM seleção automática

1. Na extensão [Maps Lead Extractor](https://github.com/GustavoN-S/extrator-de-leads), exporte o arquivo JSON de estabelecimentos.
2. Na aba **Descobrir leads** do LeadPilot, selecione o arquivo em **Importar leads por arquivo JSON** e clique **Importar para a lista**.
3. Os estabelecimentos válidos são gravados na **lista de prospecção importada** (`data/imported-leads.json`), NÃO no CRM. O painel exibe nome, endereço, telefone, status do site e score do extrator. Todos entram **desmarcados**.
4. O importador detecta duplicatas dentro do JSON, na lista importada e no CRM. Para evitar falsos positivos, exige identificadores fortes: ID do Google, URL da ficha, nome e endereço, ou nome e telefone. Duplicatas exatas são ignoradas e contabilizadas.
5. Marque manualmente as caixas dos estabelecimentos que você deseja no CRM. Clique **Adicionar selecionados ao CRM** e confirme a ação. Somente esses são cadastrados no CRM. A seleção volta a zero ao atualizar/carregar o painel.
6. A operação **não envia WhatsApp nem gera site no Lovable automaticamente**. O score do extrator é mostrado separadamente do score interno de CRM (que parte de critérios manuais).

Atenção: manter os dados coletados pelo Google Maps pode estar sujeito aos termos do Google Maps/Places. Verifique as condições aplicáveis antes de usar ou persistir esses dados em produção. O importador não valida a legalidade de um conjunto exportado pelo navegador. Registros vindos da API Places do LeadPilot continuam sendo consultados ao vivo, sem serem copiados em massa pelo fluxo API.

**Endpoints para importação**

| Método | Endpoint | Uso |
|---|---|---|
| `POST` | `/api/import/leads` | Recebe `{ "data": <JSON exportado> }`; adiciona somente à lista importada e elimina duplicatas |
| `GET` | `/api/import/leads` | Lista os registros importados e identifica quais já estão no CRM |
| `POST` | `/api/import/leads/to-crm` | Recebe `{ "ids": ["candidateId", ...] }`; adiciona somente IDs explicitamente selecionados |

Limite: até 1.500 registros por JSON, 1,9 MB por arquivo, e até 200 seleções por operação. O projeto é um MVP local sem autenticação; não disponibilize endpoints a usuários externos sem segurança de servidor.

## Funcionalidades

- **Busca** por segmento e cidade via `POST /v1/places:searchText`, exibindo até 20 resultados por pesquisa. Dados como nome, endereço, avaliações e URL não são persistidos no CRM; cada ficha pode ser recarregada pelo Place ID.
- **Sem site registrado**: marca quando o campo `websiteUri` não vem preenchido. Não prova que a empresa não possui site.
- **CRM** armazena `placeId` (permitido pelo Google) e apenas informações que você mesmo registrou: telefone obtido legitimamente, consentimento, notas, avaliação de fit, situação da conversa.
- **Score comercial** de 0 a 100 baseado em informação verificada **manualmente**: ausência de site (40 pontos), fit (até 25), orçamento (até 20), interesse (até 15). **Não é probabilidade estatística de conversão**.
- **Evolution API v2** para enviar mensagens **após inbound recente** e consentimento. Nunca faz envio em massa ou inicial para números extraídos do Google.
- **Webhook** `MESSAGES_UPSERT` para atualizar histórico, detectar pedidos de descadastramento e responder automaticamente quando configurado.
- **Groq Cloud** via `POST https://api.groq.com/openai/v1/chat/completions`. Modelo padrão `openai/gpt-oss-120b`. Teste pelo painel, sem enviar WhatsApp. Com Groq configurada, a IA redige respostas automáticas autorizadas; sem chave, usa regras simples.
- **Análise Groq por lead** no Pipeline: resume a oportunidade, explica os sinais e sugere próximo passo a partir dos campos/observações registrados manualmente. O score permanece heurístico, não é porcentagem de chance de fechar.
- A chave Groq fica **exclusivamente no backend** e nunca é retornada ao navegador. Um teste de conexão do painel não dispara mensagens.

## Configurando Groq Cloud

1. Acesse https://console.groq.com/keys. **Revogue qualquer chave publicada em chats** e crie uma nova.
2. No `.env` local, informe:

```env
GROQ_API_KEY=SUA_NOVA_CHAVE_PRIVADA
GROQ_MODEL=openai/gpt-oss-120b
```

3. Inicie com `npm run dev`. Na aba **Descobrir leads**, clique em **Testar IA (sem WhatsApp)**. O botão somente acessa a Groq para confirmar a conexão; não faz envio de mensagens.
4. Na aba **Pipeline comercial**, selecione um lead, preencha campos e anotações próprias e clique em **Analisar oportunidade** para um insight da Groq. A análise não transmite fichas obtidas do Google Places ao modelo. Evite incluir dados pessoais nas anotações.
5. Para respostas WhatsApp, configure também a Evolution API e o consentimento do contato; os requisitos de janela de atendimento permanecem.

Para testar a integração sem gastar tokens da Groq, execute `npm test`, que executa testes de Groq e de importação/deduplicação. Um teste de ponta a ponta exige suas próprias credenciais e rede.

Referências oficiais: https://console.groq.com/docs/models, https://console.groq.com/docs/text-chat e https://console.groq.com/docs/deprecations.

## Google Places: ativação e custo

Na Google Cloud Console, habilite **Places API (New)** e configure faturamento e restrições para sua API key. A busca solicita campos `id`, `displayName`, `formattedAddress`, `websiteUri`, `googleMapsUri`, `rating`, `userRatingCount`. Solicitar `websiteUri`, `rating` e `userRatingCount` impacta a categoria de faturamento; monitore cotas e custos. São resultados da API, não uma extração ilimitada: Text Search tem limitações de paginação e cobertura. Verifique termos e permissões de uso antes de comercializar o produto.

Referências: https://developers.google.com/maps/documentation/places/web-service/text-search e https://developers.google.com/maps/documentation/places/web-service/policies

## Evolution API: integração

Configure os campos no `.env`, usando a **versão da Evolution API que exponha** `POST /message/sendText/{instance}` com `apikey` e corpo `{ "number": "55...", "text": "..." }`.

Configure o evento `MESSAGES_UPSERT` na instância para:

`https://SEU-DOMINIO-HTTPS/api/webhooks/evolution/SEU_SEGREDO`

Substitua `SEU_SEGREDO` pelo valor em `EVOLUTION_WEBHOOK_SECRET`. A URL precisa ser alcançável pela Evolution API. O servidor não confia em mensagens enviadas pelo próprio número, grupos ou IDs LID não mapeáveis para telefone. O formato dos webhooks pode variar por versão/provedor; teste com a sua instalação.

A Evolution API aceita dois conectores de WhatsApp: Baileys (baseado em WhatsApp Web, não oficial) e Cloud API da Meta (oficial). Prefira o **oficial** para operação comercial em produção. Considere que mensagens iniciadas pela empresa ou enviadas fora da janela de 24h na Cloud API exigem templates aprovados — **este MVP não implementa o fluxo de templates**. A rota de envio livre está bloqueada fora da janela.

Referência: https://github.com/evolution-foundation/evolution-api

## Consentimento e privacidade

- Não use o telefone retornado pelo Google Places para fazer disparos automáticos.
- O CRM só envia mensagens a números cadastrados **manualmente**, com consentimento registrado e recebimento de mensagem recente.
- Pedidos como “parar” e “não me contate” cancelam automaticamente o envio e marcam `não contatar`.
- Consulte a LGPD e as políticas vigentes do WhatsApp Business. Uma mensagem recebida não autoriza campanhas futuras sem consentimento apropriado.
- Políticas oficiais do Google Maps **restringem indexar, copiar ou armazenar conteúdo do Places**. O projeto persiste `placeId`, não copia as fichas de negócio para a base de leads.
- Reforços necessários para produção: autenticação, autorização, banco relacional, registro de consentimento auditável, backups, criptografia, fila de tarefas, limites de taxa e verificação do emissor de webhooks além do segredo de URL, testes automatizados e observabilidade.

## Endpoints

| Método | Caminho | Finalidade |
|--|--|--|
| `POST` | `/api/search` | Buscar segmento e cidade (JSON: `city`, `segment`) |
| `GET` | `/api/places/:placeId` | Atualizar a ficha via Google (ou demo) |
| `GET` | `/api/leads` | Listar CRM próprio |
| `POST` | `/api/leads` | Salvar identificador do lugar |
| `PUT` | `/api/leads/:id` | Qualificação/consentimento |
| `POST` | `/api/leads/:id/message` | Enviar mensagem com permissão e dentro da janela |
| `POST` | `/api/webhooks/evolution/:secret` | Receber mensagens da Evolution API |
| `POST` | `/api/ai/test` | Testar Groq (não envia WhatsApp) |
| `POST` | `/api/leads/:id/insight` | Análise comercial de campos próprios do CRM com Groq |
| `GET` | `/api/config` | Status das integrações sem expor segredos |

## Testando sem credenciais

Inicie o aplicativo com `.env` vazio (com o segredo do webhook configurado). Pesquise qualquer cidade e segmento: o app exibe seis **empresas fictícias**. Salve algumas no CRM, edite as notas, informe uma verificação manual de site e observe o score. WhatsApp e Groq somente ficarão ativos após configurar suas credenciais. **Nenhuma mensagem de teste será enviada automaticamente.**

## Próximas melhorias

Adicionar login e controle de acesso (necessário antes de publicar), banco PostgreSQL, templates oficiais da Meta para iniciar conversas após consentimento, histórico de tentativas de contato, dashboard de funil por etapa, notificações de handoff humano, calibração de score usando taxas reais de conversão (dados próprios), e conexão com seu sistema de propostas.


## Telefones no Google Places (New)

A consulta atual solicita `places.nationalPhoneNumber` e `places.internationalPhoneNumber` em Text Search (New), e os mesmos campos sem o prefixo `places.` em Place Details (New). O painel exibe os telefones retornados nos resultados e na ficha do lead (consulta ao vivo, com link para ligação telefônica), sem persisti-los no CRM. Alguns locais não possuem telefone informado. Solicitar telefone e website pode acionar cobrança da categoria Enterprise na Google Places API; monitore custos e limites. O número do Google não comprova que seja WhatsApp nem consentimento para contato comercial. O registro do telefone no CRM e o envio por Evolution API continuam sujeitos às validações de consentimento do projeto.

## Novidades da versão 0.2

**Telefone sem digitação manual**

- Ao adicionar um lead importado ao CRM, o telefone do JSON é preenchido automaticamente, já normalizado para o formato do WhatsApp (55 + DDD + número). O campo de consentimento continua desmarcado.
- O painel indica se o número é celular (WhatsApp provável) ou fixo (WhatsApp improvável).
- Para leads criados pela busca do Google, o botão **Usar telefone do Google** consulta a Places API ao vivo e preenche o campo. Nada é gravado até você clicar em **Salvar qualificação**. Verifique as políticas do Google antes de manter telefones dessa origem no CRM.
- Telefones antigos sem o código 55 são corrigidos na primeira inicialização. Antes disso, o webhook não reconhecia as respostas desses contatos.

**Abordagem e funcionalidades**

- O painel do lead mostra dores comuns, funcionalidades para propor e um modelo de primeira mensagem para o segmento. Isso funciona sem chave Groq.
- Preencha o campo **Segmento** (ex.: sorveteria, barbearia). Ele define as sugestões.
- A análise com Groq devolve: resumo, prioridade com justificativa, objetivo do primeiro contato, mensagem sugerida, perguntas de diagnóstico, objeções prováveis com resposta, funcionalidades sugeridas e cuidados.
- A IA recebe apenas segmento, anotações e campos que você preencheu. Nome, endereço e fichas do Google não são enviados. A mensagem sugerida usa marcadores e é descartada se contiver preço ou link.

**Novo endpoint**

| Método | Caminho | Finalidade |
|--|--|--|
| `GET` | `/api/leads/:id/playbook` | Dores, funcionalidades e modelo de mensagem do segmento, sem IA |

**Testes**: `npm test` executa 22 testes, incluindo normalização de telefone, playbook, validação da resposta da IA e deduplicação.
