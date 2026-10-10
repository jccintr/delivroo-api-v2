# Delivroo API v2

API do Delivroo (cardápio digital + pedidos) em **Node.js + Express 5 + MySQL 8**, JavaScript puro (ESM).
Mesmo padrão da API Delivroo Express: `routes/` → `validators/` (express-validator) → `controllers/`, JWT, bcryptjs, testes com vitest + supertest.
Acesso ao banco com **Knex + mysql2**. O modelo de dados é o `db/schema.sql` (a migration inicial roda esse arquivo).

## Rodando

```bash
npm install
cp .env.example .env          # ajuste usuário/senha/banco e o JWT_SECRET_STORE
# crie os bancos (MySQL 8.0.16+, por causa dos CHECK):
#   CREATE DATABASE delivroo2      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
#   CREATE DATABASE delivroo2_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
npm run migrate               # cria as 21 tabelas
npm run seed:demo             # (opcional) pizzaria de exemplo: loja@exemplo.com / 123456
npm run dev
npm test                      # usa o banco *_test; recusa rodar em qualquer outro
```

## Endpoints

Dinheiro é sempre **inteiro em centavos** (`priceCents`, `feeCents`, `totalCents`). Erros: `{ "error": "..." }`; validação: `400` com `details`.

**Público**
| | |
| --- | --- |
| `GET /api/locations/states` | estados (UF + nome), vindos do **IBGE** |
| `GET /api/locations/states/:uf/cities` | municípios do estado (`ibgeId` + nome), vindos do **IBGE** |
| `GET /api/cities` | (legado) cidades já usadas por alguma loja |
| `GET /api/public/stores/:slug/menu` | loja, horários, bairros, pagamentos e cardápio completo; o preço de cada opção já vem resolvido **por variação** (`prices: { variantId: centavos }`) |
| `POST /api/public/stores/:slug/orders` | cria o pedido (o servidor calcula tudo) |
| `GET /api/public/orders/:publicId` | acompanhamento do pedido (sem telefone) |

> **Cidades:** não há lista pré-cadastrada. A API consulta a API de Localidades do IBGE (gratuita) e guarda o resultado em memória por 24h (se o IBGE cair, serve a cópia antiga). No cadastro a loja envia `ibgeCityId`; a linha em `cities` é criada (ou, se for uma cidade antiga, adotada pelo nome/UF) na primeira loja daquele município. Variáveis opcionais: `IBGE_API_URL`, `IBGE_CACHE_TTL_MS`, `IBGE_TIMEOUT_MS`.

**Loja** (`Authorization: Bearer <token>`; o que não é da loja logada responde `404`)
| | |
| --- | --- |
| `POST /api/stores/register`, `POST /api/stores/login` | conta (login devolve `{ token, store }`; o cadastro aceita `template`, ver "Templates de cardápio") |
| `GET /api/stores/templates` | cardápios iniciais do cadastro: `empty` + `pizzaria`, `hamburgueria`, `acai` (público) |
| `GET/PATCH /api/stores/me`, `PATCH /api/stores/me/status` `{isOpen}` | perfil; abrir/fechar a loja (abrir inicia o turno) |
| `GET/PUT /api/stores/me/business-hours` | horários (vários intervalos por dia; PUT substitui tudo) |
| `/api/stores/delivery-zones`, `/api/stores/payment-methods`, `/api/stores/categories` | CRUD (`GET`, `POST`, `PATCH /:id`, `DELETE /:id`) |
| `/api/stores/products` | produto **com variações** numa chamada; `POST/PATCH/DELETE /:id/variants/:variantId`; `PUT /:id/option-groups {groupIds}` |
| `/api/stores/option-groups` | grupo **com opções** numa chamada; `POST /:id/options`; `PATCH/DELETE /api/stores/options/:id` (`prices` define o preço por variação) |
| `GET /api/stores/orders?scope=shift\|all\|range&status=&page=&limit=` | pedidos (padrão: do turno atual) |
| `GET /api/stores/orders/:id` | pedido com itens, opções e histórico |
| `POST /api/stores/orders/:id/status` `{status, reason?}` | muda o status; devolve `{ order, message }` (`message` = texto do WhatsApp daquele status) |

Corpo do pedido:
```json
{ "fulfillment": "DELIVERY", "name": "Maria", "phone": "(35) 99999-1111",
  "deliveryZoneId": 1, "address": "Rua A, 10", "paymentMethodId": 2, "cashChangeForCents": 10000, "notes": "",
  "items": [ { "productId": 1, "variantId": 1, "quantity": 2, "notes": "sem cebola",
      "options": [ {"groupId":1,"optionId":1}, {"groupId":1,"optionId":3}, {"groupId":2,"optionId":4} ] } ] }
```

Status: `RECEIVED → PREPARING → (READY → PICKED_UP) | (OUT_FOR_DELIVERY → DELIVERED | RETURNED)`; `REJECTED` só a partir de `RECEIVED`; `CANCELED` até antes do fim. `REJECTED` e `CANCELED` exigem `reason`.

## Decisões que valem saber

- **O preço nunca vem do cliente.** `services/pricing.js` recalcula tudo (variação + opções, `HIGHEST` cobra só o maior sabor) e valida mínimo/máximo dos grupos; o banco ainda confere a conta com `CHECK`.
- **Pedido = fotografia.** Nomes e preços são copiados para o pedido; editar ou apagar produto depois não muda o histórico.
- **Datas em UTC**: cada conexão faz `SET time_zone = '+00:00'`. Sem isso, `CURRENT_TIMESTAMP` sai no fuso do servidor MySQL e o filtro "pedidos do turno" erra (os testes pegaram isso num servidor em UTC−3).
- **Número do pedido** por loja, sem repetir mesmo com pedidos simultâneos: a primeira escrita da transação trava a linha da loja (`order_seq`). Há retentativa automática em caso de deadlock.
- **Isolamento entre lojas** nos dois níveis: toda consulta filtra `store_id`, e o banco tem FKs compostas `(id, store_id)`.

## Estrutura

```
index.js · app.js · knexfile.js
db/             knex.js, schema.sql (modelo), seed-demo.js (loja de exemplo), migrations/
routes/         store, public, city, admin
controllers/    store, config (bairros/pagamentos), category, product, optionGroup, order, public, city,
                admin (login/senha do admin), admin.stores (lojas, bloqueio, auditoria)
validators/     store, catalog, order, admin
middlewares/    auth.store, auth.admin, validate, error
services/       pricing (cálculo de preço), order.service (pedido em transação), menu.service,
                catalog.service, orderStatus (fluxo de status), template.service (cardápio inicial),
                storeAccess (o que a loja pode fazer), adminAuth, adminAccounts, audit
templates/      cardápios prontos do cadastro (pizzaria, hamburgueria, açaí) + helpers
utils/          crud (CRUD genérico por loja), dto, errors, slug, loginThrottle
tests/          vitest + supertest contra MySQL real
scripts/        seed-demo.js, create-admin.js
```

## Fica para a próxima fase

Upload de imagens (Cloudinary, hoje `imageUrl`/`logoUrl` recebem uma URL) · e-mail de verificação e recuperação de senha (a tabela `auth_codes` já existe) · push da Expo (`store_devices`) — o tempo real do painel e do cliente já é por SSE (seção abaixo) · cobrança automática por gateway (planos, assinaturas e faturas com Pix manual já existem — seção **Assinaturas**) · relatórios (resumo do dia, pedidos por dia, histórico mensal) · `docs/openapi.yaml` + Swagger · limite de requisições nas rotas públicas · ~~script de migração dos dados do Laravel~~ (descartado: lojas do Delivroo antigo começam do zero).

## Backoffice (admin geral)

Rotas em `/api/admin/*`, usadas pelo app `delivroo-v2-backoffice`. É **independente** do painel da loja: segredo JWT próprio (`JWT_SECRET_ADMIN`), token de 12 h (`ADMIN_JWT_EXPIRES_IN`) e nenhuma rota mexe no cardápio.

| Rota | O que faz |
|---|---|
| `POST /api/admin/login` | login (5 falhas seguidas no mesmo email travam por 15 min: 429 + `Retry-After`) |
| `GET /api/admin/me` · `PATCH /api/admin/me/password` | admin logado · troca de senha |
| `GET /api/admin/stores?search=&status=&cityId=&page=&limit=` | lista lojas, com `ordersCount` e `lastOrderAt` |
| `GET /api/admin/stores/:id` | detalhe (cadastro, situação, `productsCount`) |
| `PATCH /api/admin/stores/:id/active` `{ active, reason? }` | bloqueia / libera a loja |
| `GET /api/admin/audit-log?storeId=` | quem fez o quê, e quando |
| planos, assinatura e faturas | veja a seção **Assinaturas** |

**Criar o primeiro admin** (não existe endpoint público para isso, de propósito):

```bash
npm run admin:create -- --name "Seu Nome" --email voce@exemplo.com   # pede a senha (mín. 10 caracteres)
npm run admin:create -- --email voce@exemplo.com --reset             # esqueci a senha (também reativa)
```

Configure `JWT_SECRET_ADMIN` no `.env` (diferente do `JWT_SECRET_STORE`; o servidor avisa se faltar ou se for igual).

**Bloqueio de loja** (`stores.active`): é o bloqueio *manual* do admin. A loja é fechada, não consegue entrar (login 403 com `code: "STORE_BLOCKED"`), o token dela deixa de valer (401 com o mesmo `code`) e o cardápio público some. O motivo (`deactivationReason`) é nota interna. Toda decisão sobre "o que a loja pode fazer" passa por `services/storeAccess.js` — é lá que também entra o estado da assinatura (seção abaixo), sem os chamadores saberem de cobrança.

Limitações conhecidas: o limite de tentativas de login é em memória (reiniciar zera; com várias instâncias cada uma conta a sua); trocar a senha não invalida tokens já emitidos (por isso expiram em 12 h).

## Assinaturas (planos, teste, faturas Pix)

**Regras**

- Toda loja nova entra em **teste de 14 dias**, sem escolher plano (o cadastro não mudou). As lojas que já existiam na hora da migration também ganham 14 dias a partir dela.
- O plano é escolhido depois, na tela *Assinatura* do painel (`PUT /api/stores/subscription/plan`). Isso gera a **fatura** na hora, vencendo no fim do período coberto.
- Se não pagar: **7 dias de carência** (tudo funciona, painel mostra aviso) → **suspensa**: cardápio público e pedidos novos respondem `403 MENU_UNAVAILABLE`, o painel só libera Assinatura, pedidos em andamento e exportação (o resto responde `402 SUBSCRIPTION_SUSPENDED`) → depois de mais 30 dias, `CANCELED` (mesmo acesso da suspensa; só volta pagando).
- O estado é **calculado das datas na hora da leitura** (`getStoreAccess`), então nada depende de cron. As datas de cobrança são dias (fuso de Brasília): `trial_ends_on`, `paid_until` (último dia coberto), `courtesy_until`.
- Pagar em dia estende a partir do vencimento; pagar **atrasado** conta o mês a partir de **hoje** (quem estava suspenso não perde o que acabou de pagar). Pagar adiantado durante o teste não encurta o teste.
- A fatura do próximo ciclo é gerada quando faltam 7 dias ou menos (ao consultar a assinatura). Nunca há duas faturas abertas para a mesma assinatura (índice único). Trocar de plano cancela a aberta e emite outra; mudar o preço de um plano só afeta as próximas faturas.
- `stores.active` continua sendo o bloqueio **manual** do admin e vale sobre a cobrança.

**Pagamento manual (Pix)**: a chave do Delivroo vem do ambiente (`BILLING_PIX_KEY`, `BILLING_PIX_KEY_TYPE`, `BILLING_PIX_BENEFICIARY`, `BILLING_PIX_INSTRUCTIONS`) e é mostrada na tela Assinatura. A loja paga e clica **Já paguei** (só sinaliza); o admin confere o Pix e marca a fatura como paga no backoffice (`POST /api/admin/stores/:id/invoices/:invoiceId/pay`). Para trocar por um gateway depois, basta quem receber o webhook chamar `markInvoicePaid()` (`services/billing.js`); as tabelas `invoices` (`provider`, `provider_ref`) e `billing_events` já estão prontas.

**Nenhum plano é criado sozinho**: crie o primeiro em *Planos* no backoffice (ou `POST /api/admin/plans`). Enquanto não existir, as lojas ficam em teste e a tela Assinatura avisa que ainda não há plano.

| Quem | Rota |
|---|---|
| Loja | `GET /api/stores/subscription` · `PUT /api/stores/subscription/plan` · `POST /api/stores/subscription/invoices/:id/report-payment` · `GET /api/stores/me/export` |
| Admin | `GET/POST /api/admin/plans` · `PATCH/DELETE /api/admin/plans/:id` (excluir só plano nunca usado; senão desative) |
| Admin | `GET /api/admin/stores/:id/subscription` · `PUT …/subscription/plan` · `POST …/subscription/extend-trial` · `PUT …/subscription/courtesy` |
| Admin | `POST /api/admin/stores/:id/invoices/:invoiceId/pay` · `…/void` · `GET /api/admin/invoices?status=open\|overdue\|reported\|paid` |

`GET /api/stores/me`, login e cadastro devolvem `access` (estado, `panel`, `billing.status`, `daysLeft`, `dueSoon`...) para o painel decidir avisos e telas.

## Documentação interativa (Swagger)

Com a API rodando, abra **http://localhost:3000/docs**: lista todos os endpoints, com exemplos, e permite testá-los (*Try it out*).
A especificação OpenAPI crua fica em `/openapi.json` (serve para importar no Postman/Insomnia) e o código-fonte em `docs/openapi.js`.

1. `npm run seed:demo` (cria a loja de exemplo) e `npm run dev`.
2. Em `POST /api/stores/login` use `loja@exemplo.com` / `123456` e copie o `token`.
3. Clique em **Authorize** e cole o token. Pronto: as rotas com cadeado funcionam.

Ao criar/alterar uma rota em `routes/*.routes.js`, documente-a em `docs/openapi.js` — o teste `tests/docs.test.js` falha se faltar alguma.

## Zerar o banco (migrate:fresh)

```bash
npm run migrate:fresh                 # apaga TODAS as tabelas e recria o schema (pede para digitar o nome do banco)
npm run migrate:fresh:seed            # idem + loja de exemplo (loja@exemplo.com / 123456)
npm run migrate:fresh -- --yes        # sem confirmação
npm run migrate:fresh -- --drop-only  # só apaga, deixa o banco vazio
```
Com `NODE_ENV=production` o script recusa rodar, a menos que use `--force`. Para o banco de testes: `NODE_ENV=test npm run migrate:fresh -- --yes`.

## Upload de imagens (Cloudinary)

Mesmo padrão da api-delivroo-express-node: `multer` em memória (JPEG/PNG/WebP, máx. 2 MB) → `cloudinary.uploader.upload_stream` → URL salva no banco.
Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` no `.env` (sem isso o upload responde 503).

| Endpoint (multipart, requer login) | Campo | Grava em |
|---|---|---|
| `PATCH /api/stores/me/logo` (+ `DELETE`) | `logo` | `stores.logo_url` |
| `PATCH /api/stores/products/:id/image` (+ `DELETE`) | `image` | `products.image_url` |
| `PATCH /api/stores/options/:id/image` (+ `DELETE`) | `image` | `options.image_url` |

- Cada imagem tem `public_id` previsível (`delivroo/products/product_12`): enviar de novo **substitui** a anterior e apagar não exige guardar nada extra.
- Apagar produto, opção ou grupo apaga também as imagens no Cloudinary (falha ao apagar nunca derruba a requisição).
- Os testes usam um Cloudinary falso (`tests/mocks/cloudinary.js`): nada de rede.
- Exemplo com curl: `curl -X PATCH localhost:3000/api/stores/products/1/image -H "Authorization: Bearer $TOKEN" -F "image=@foto.jpg"`
- No Swagger (`/docs`) o upload aparece com botão de escolher arquivo.

## Loja de exemplo (seed)

`npm run seed:demo` (ou `npm run migrate:fresh:seed` para recriar o banco do zero) cria a **Pizzaria Exemplo**, completa, para desenvolver o front do cliente:
slug `pizzaria-exemplo`, login `loja@exemplo.com` / `123456`, loja aberta, 9 bairros com taxa, 4 formas de pagamento, horários e mensagens de WhatsApp.

| Categoria | Produtos | O que demonstra |
|---|---|---|
| Pizzas (4) | Tradicional, Especial, Doce, Calzone | Broto/Grande, até 2 sabores (cobra o mais caro), borda, adicionais, preço por tamanho |
| Hambúrgueres (8) | X-Burger … Veggie | ponto da carne obrigatório, adicionais repetíveis (2× bacon) |
| Combos (4) | X-Bacon, Duplo Cheddar, Frango Crispy, Pizza + Refri 2 L | escolhas obrigatórias dentro do combo, acréscimo por sabor |
| Porções (8) | Batata, Frango a Passarinho, … | Meia/Inteira, molhos extras opcionais |
| Bebidas (7) | Refrigerante, Suco, Água, Cervejas … | sabor obrigatório, preço vindo da marca |
| Sobremesas (6) | Brownie, Petit Gâteau, Taça de Sorvete … | calda opcional, até 3 bolas (repete sabor) |

Os dados ficam em `db/seed-demo.js` (preços em centavos). As imagens vêm vazias: envie pelas rotas de upload (`PATCH .../image`).

## Templates de cardápio (cadastro)

Toda loja nova nasce com as formas de pagamento padrão (Pix, dinheiro, cartão de débito e de crédito) e **fechada**. No cadastro, `POST /api/stores/register` aceita ainda `template`:

| `template` | O que cria |
|---|---|
| ausente ou `empty` | loja vazia |
| `pizzaria` | Pizzas (Broto/Grande, até 2 sabores, borda, adicionais), Porções, Bebidas, Sobremesas |
| `hamburgueria` | Hambúrgueres (ponto da carne, adicionais), Combos, Porções, Bebidas |
| `acai` | Açaí no copo (300/500/700 ml, complementos, coberturas, adicionais), Tigelas, Combo, Bebidas |

Loja, pagamentos e template são gravados numa única transação. `GET /api/stores/templates` lista as opções (com o resumo de cada uma) para montar a tela de cadastro; a resposta do cadastro devolve `template` (o aplicado, ou `null`).

Os **preços dos templates são exemplos** (o painel avisa o dono para revisá-los) e as imagens vêm vazias. Para criar um novo template: copie um arquivo de `templates/`, ajuste os dados (formato descrito em `templates/helpers.js`) e registre-o em `templates/index.js`. `tests/templates.test.js` valida a consistência de todos (grupos usados, limites, preço por tamanho cobrindo todas as variações) e cria uma loja de cada um pela API.


## Tempo real (SSE)

Loja é avisada de pedido novo e o cliente de cada mudança de status, por **Server-Sent Events** (HTTP comum, o navegador reconecta sozinho).

| Quem | Endpoint | Eventos |
|---|---|---|
| Loja | `POST /api/stores/events-token` → `GET /api/stores/events?token=…` | `order.created`, `order.updated` (`{ order }` completo) |
| Cliente | `GET /api/public/orders/:publicId/events` | `order.updated` (mesmo payload de `GET /api/public/orders/:publicId`; já manda o estado atual ao conectar) |

- Todo fluxo começa com `event: ready` (use-o para recarregar o que passou durante uma queda) e recebe `: ping` a cada 25 s.
- O `EventSource` não envia `Authorization`; por isso a loja troca o JWT por um **token de 2 minutos** (segredo derivado, não vale como login). Quando vence, a conexão cai com 401 e o front pede outro e reconecta (já implementado nos dois fronts).
- Hub em memória (`services/events.js`): funciona com **uma instância** da API. Com várias, troque o hub por Redis pub/sub mantendo a interface (`subscribe`/`publish`).
- Limite de conexões por canal: `SSE_MAX_PER_CHANNEL` (padrão 20). Heartbeat: `SSE_HEARTBEAT_MS` (padrão 25000).
- Falha ao publicar nunca derruba o pedido (erro só vai para o log).
- O Swagger UI não exibe fluxos SSE; teste com `curl -N "http://localhost:3000/api/public/orders/<publicId>/events"`.

### Deploy atrás de proxy (nginx etc.)

O proxy não pode acumular a resposta nem derrubar conexões ociosas. A API já manda `X-Accel-Buffering: no`; mesmo assim, para as rotas de eventos:

```nginx
location ~ ^/api/(stores/events|public/orders/[^/]+/events)$ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
}
```

Cloudflare/CDN: mantenha o proxy ativo para essas rotas sem cache. **Vercel (funções serverless) não serve para SSE longo**: hospede a API em um servidor/container (Render, Railway, Fly, VPS).
