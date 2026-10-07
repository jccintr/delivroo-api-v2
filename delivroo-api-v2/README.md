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
| `GET /api/cities` | cidades ativas |
| `GET /api/public/stores/:slug/menu` | loja, horários, bairros, pagamentos e cardápio completo; o preço de cada opção já vem resolvido **por variação** (`prices: { variantId: centavos }`) |
| `POST /api/public/stores/:slug/orders` | cria o pedido (o servidor calcula tudo) |
| `GET /api/public/orders/:publicId` | acompanhamento do pedido (sem telefone) |

**Loja** (`Authorization: Bearer <token>`; o que não é da loja logada responde `404`)
| | |
| --- | --- |
| `POST /api/stores/register`, `POST /api/stores/login` | conta (login devolve `{ token, store }`) |
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
routes/         store, public, city
controllers/    store, config (bairros/pagamentos), category, product, optionGroup, order, public, city
validators/     store, catalog, order
middlewares/    auth.store, validate, error
services/       pricing (cálculo de preço), order.service (pedido em transação), menu.service,
                catalog.service, orderStatus (fluxo de status)
utils/          crud (CRUD genérico por loja), dto, errors, slug
tests/          vitest + supertest contra MySQL real (79 testes)
scripts/        seed-demo.js
```

## Fica para a próxima fase

Upload de imagens (Cloudinary, hoje `imageUrl`/`logoUrl` recebem uma URL) · e-mail de verificação e recuperação de senha (a tabela `auth_codes` já existe) · push da Expo (`store_devices`) e WebSocket para o painel · painel admin (`admins`) · relatórios (resumo do dia, pedidos por dia, histórico mensal) · `docs/openapi.yaml` + Swagger · limite de requisições nas rotas públicas · script de migração dos dados do Laravel.

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
