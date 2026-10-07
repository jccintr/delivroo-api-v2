-- =====================================================================================
-- Delivroo 2 — modelo de dados (MySQL 8 / InnoDB / utf8mb4)
-- Convenções:
--   * dinheiro SEMPRE em centavos (INT UNSIGNED, sufixo _cents). Nada de DECIMAL/float.
--   * ids INT UNSIGNED (evita BigInt no JSON do Node). Pedido tem também public_id (não adivinhável).
--   * datas em UTC (DATETIME(3)); o fuso (America/Sao_Paulo) é aplicado na API/front.
--   * multi-loja: toda tabela de catálogo/pedido tem store_id; FKs compostas (id, store_id)
--     impedem, no próprio banco, ligar dados de lojas diferentes.
-- =====================================================================================

SET NAMES utf8mb4;

-- ---------- LOCALIZAÇÃO E CONTAS ----------------------------------------------------

CREATE TABLE cities (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  state       CHAR(2)      NOT NULL,
  slug        VARCHAR(140) NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cities_slug (slug),
  UNIQUE KEY uq_cities_name_state (name, state)
) ENGINE=InnoDB;

CREATE TABLE admins (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  password_hash  VARCHAR(100) NOT NULL,
  active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB;

CREATE TABLE stores (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug               VARCHAR(80)  NOT NULL,              -- usado na URL do cardápio: /{slug}
  name               VARCHAR(120) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  password_hash      VARCHAR(100) NOT NULL,
  email_verified_at  DATETIME(3)  NULL,
  phone              VARCHAR(20)  NOT NULL,
  city_id            INT UNSIGNED NOT NULL,
  street             VARCHAR(160) NULL,
  number             VARCHAR(20)  NULL,
  complement         VARCHAR(80)  NULL,
  district           VARCHAR(100) NULL,
  zip_code           VARCHAR(9)   NULL,
  latitude           DECIMAL(10,7) NULL,
  longitude          DECIMAL(10,7) NULL,
  logo_url           VARCHAR(500) NULL,
  bg_color           CHAR(7)      NULL,                   -- #RRGGBB
  text_color         CHAR(7)      NULL,
  pix_key            VARCHAR(140) NULL,
  pix_beneficiary    VARCHAR(140) NULL,
  wait_min_minutes   SMALLINT UNSIGNED NULL,              -- "30 a 40 min"
  wait_max_minutes   SMALLINT UNSIGNED NULL,
  active             BOOLEAN      NOT NULL DEFAULT TRUE,  -- conta liberada pelo admin
  is_open            BOOLEAN      NOT NULL DEFAULT FALSE, -- loja aberta agora
  opened_at          DATETIME(3)  NULL,                   -- início do turno atual (lista "pedidos do turno")
  order_seq          INT UNSIGNED NOT NULL DEFAULT 0,     -- contador do número do pedido (ver README)
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_stores_slug (slug),
  UNIQUE KEY uq_stores_email (email),
  KEY ix_stores_city (city_id),
  CONSTRAINT fk_stores_city FOREIGN KEY (city_id) REFERENCES cities (id),
  CONSTRAINT ck_stores_wait CHECK (wait_max_minutes IS NULL OR wait_min_minutes IS NULL OR wait_max_minutes >= wait_min_minutes)
) ENGINE=InnoDB;

-- aparelhos que recebem push (a loja pode ter vários; logout apaga só o do aparelho)
CREATE TABLE store_devices (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  push_token  VARCHAR(255) NOT NULL,
  platform    ENUM('ANDROID','IOS','WEB') NOT NULL DEFAULT 'ANDROID',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_store_devices_token (push_token),
  KEY ix_store_devices_store (store_id),
  CONSTRAINT fk_store_devices_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- códigos de verificação de e-mail e de redefinição de senha (guarde só o hash)
CREATE TABLE auth_codes (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id     INT UNSIGNED NOT NULL,
  purpose      ENUM('VERIFY_EMAIL','RESET_PASSWORD') NOT NULL,
  code_hash    VARCHAR(100) NOT NULL,
  attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at   DATETIME(3)  NOT NULL,
  consumed_at  DATETIME(3)  NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_auth_codes_lookup (store_id, purpose, expires_at),
  CONSTRAINT fk_auth_codes_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- CONFIGURAÇÃO DA LOJA ----------------------------------------------------

-- vários intervalos por dia (almoço e jantar). Dia sem linha = fechado.
-- closes_at <= opens_at significa que fecha depois da meia-noite.
CREATE TABLE business_hours (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  weekday     TINYINT UNSIGNED NOT NULL,                  -- 0 = domingo ... 6 = sábado
  opens_at    TIME NOT NULL,
  closes_at   TIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_hours (store_id, weekday, opens_at),
  CONSTRAINT fk_business_hours_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT ck_business_hours_weekday CHECK (weekday <= 6)
) ENGINE=InnoDB;

-- taxa de entrega por bairro (antes: "taxas")
CREATE TABLE delivery_zones (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  district    VARCHAR(100) NOT NULL,
  fee_cents   INT UNSIGNED NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_zones (store_id, district),
  CONSTRAINT fk_delivery_zones_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payment_methods (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(60) NOT NULL,
  type        ENUM('CASH','PIX','CARD','OTHER') NOT NULL DEFAULT 'OTHER',  -- CASH habilita "troco para"
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_methods (store_id, name),
  CONSTRAINT fk_payment_methods_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- mensagens de WhatsApp por status (antes: tabela "mensagens" com 7 colunas fixas)
CREATE TABLE store_message_templates (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  status      ENUM('PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','REJECTED','CANCELED','RETURNED') NOT NULL,
  body        VARCHAR(500) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_message_templates (store_id, status),
  CONSTRAINT fk_message_templates_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- CATÁLOGO ----------------------------------------------------------------
-- Ideia central: TUDO é um produto com 1+ variações (tamanho/versão) e 0+ grupos de opções.
--   * hambúrguer ........ 1 variação "Único" + grupos "Ponto da carne" (obrigatório) e "Adicionais"
--   * refrigerante ...... 3 variações (350 ml, 600 ml, 2 L), sem grupos
--   * pizza ............. variações Broto/Grande (preço base 0) + grupos "Sabores" (1..2, cobra o MAIOR),
--                          "Borda" (0..1) e "Adicionais" — o preço de cada opção pode variar por tamanho
-- Não existe tabela nem flag "pizza": o comportamento vem da configuração dos grupos.

CREATE TABLE categories (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(80) NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_tenant (id, store_id),          -- alvo das FKs compostas
  UNIQUE KEY uq_categories_name (store_id, name),
  CONSTRAINT fk_categories_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE products (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id     INT UNSIGNED NOT NULL,
  category_id  INT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,
  description  VARCHAR(500) NULL,
  image_url    VARCHAR(500) NULL,
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,              -- aparece no cardápio
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_tenant (id, store_id),
  KEY ix_products_category (store_id, category_id, position),
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id, store_id) REFERENCES categories (id, store_id)
) ENGINE=InnoDB;

-- toda venda sai de uma variação; produto simples tem uma só ("Único")
CREATE TABLE product_variants (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id   INT UNSIGNED NOT NULL,
  name         VARCHAR(60) NOT NULL,                       -- "Único", "Broto", "Grande", "600 ml"
  description  VARCHAR(120) NULL,                          -- "8 fatias, serve 3 pessoas"
  price_cents  INT UNSIGNED NOT NULL DEFAULT 0,            -- preço base (pode ser 0 quando o grupo define o preço)
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_name (product_id, name),
  CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- grupo de opções reutilizável entre produtos (como "modifier list" do Square / "modifier group" do Toast)
--   min_select = 0  -> opcional      min_select >= 1 -> obrigatório
--   max_select      -> total máximo de unidades escolhidas no grupo
--   max_per_option  -> quantas vezes a MESMA opção pode ser repetida (2x bacon)
--   pricing_mode:
--     ADDITIVE -> soma o preço de cada opção escolhida (borda, adicionais, molhos)
--     HIGHEST  -> cobra só a opção mais cara e as demais saem sem custo (pizza meio a meio)
CREATE TABLE option_groups (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id        INT UNSIGNED NOT NULL,
  name            VARCHAR(80) NOT NULL,                    -- mostrado ao cliente: "Borda", "Ponto da carne"
  min_select      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_select      TINYINT UNSIGNED NOT NULL DEFAULT 1,
  max_per_option  TINYINT UNSIGNED NOT NULL DEFAULT 1,
  pricing_mode    ENUM('ADDITIVE','HIGHEST') NOT NULL DEFAULT 'ADDITIVE',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_option_groups_tenant (id, store_id),
  UNIQUE KEY uq_option_groups_name (store_id, name),
  CONSTRAINT fk_option_groups_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT ck_option_groups_range CHECK (max_select >= 1 AND max_select >= min_select AND max_per_option >= 1),
  CONSTRAINT ck_option_groups_highest CHECK (pricing_mode = 'ADDITIVE' OR max_per_option = 1)
) ENGINE=InnoDB;

CREATE TABLE options (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id     INT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,                      -- "Catupiry", "Calabresa", "Ao ponto"
  description  VARCHAR(500) NULL,                          -- ingredientes do sabor
  image_url    VARCHAR(500) NULL,
  price_cents  INT UNSIGNED NOT NULL DEFAULT 0,            -- preço padrão (vale quando não há preço por variação)
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,             -- já vem marcada
  position     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active       BOOLEAN NOT NULL DEFAULT TRUE,              -- desativar = "acabou hoje"
  PRIMARY KEY (id),
  UNIQUE KEY uq_options_name (group_id, name),
  CONSTRAINT fk_options_group FOREIGN KEY (group_id) REFERENCES option_groups (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- preço da opção por variação (borda Catupiry: Broto 8,00 / Grande 12,00; sabor Calabresa: 45,00 / 65,00)
-- sem linha para a variação -> vale options.price_cents
CREATE TABLE option_variant_prices (
  option_id    INT UNSIGNED NOT NULL,
  variant_id   INT UNSIGNED NOT NULL,
  price_cents  INT UNSIGNED NOT NULL,
  PRIMARY KEY (option_id, variant_id),
  KEY ix_ovp_variant (variant_id),
  CONSTRAINT fk_ovp_option  FOREIGN KEY (option_id)  REFERENCES options (id) ON DELETE CASCADE,
  CONSTRAINT fk_ovp_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- quais grupos cada produto oferece, e em que ordem (store_id garante produto e grupo da mesma loja)
CREATE TABLE product_option_groups (
  product_id  INT UNSIGNED NOT NULL,
  group_id    INT UNSIGNED NOT NULL,
  store_id    INT UNSIGNED NOT NULL,
  position    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id),
  KEY ix_pog_group (group_id),
  CONSTRAINT fk_pog_product FOREIGN KEY (product_id, store_id) REFERENCES products (id, store_id) ON DELETE CASCADE,
  CONSTRAINT fk_pog_group   FOREIGN KEY (group_id, store_id)   REFERENCES option_groups (id, store_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- PEDIDOS -----------------------------------------------------------------
-- O pedido guarda uma FOTOGRAFIA do que foi vendido (nomes e preços da época).
-- Mudar/apagar produto depois NÃO altera o histórico. Por isso as FKs de catálogo são SET NULL.

CREATE TABLE customers (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  store_id    INT UNSIGNED NOT NULL,
  name        VARCHAR(120) NOT NULL,
  phone       VARCHAR(20)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_phone (store_id, phone),
  CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id            VARCHAR(40)  NOT NULL,             -- acompanhamento do pedido (aleatório, não sequencial)
  store_id             INT UNSIGNED NOT NULL,
  order_number         INT UNSIGNED NOT NULL,             -- "Pedido #128", sequencial por loja
  customer_id          INT UNSIGNED NULL,
  customer_name        VARCHAR(120) NOT NULL,
  customer_phone       VARCHAR(20)  NOT NULL,
  fulfillment          ENUM('DELIVERY','PICKUP') NOT NULL,
  status               ENUM('RECEIVED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','REJECTED','CANCELED','RETURNED')
                       NOT NULL DEFAULT 'RECEIVED',
  delivery_zone_id     INT UNSIGNED NULL,
  delivery_address     VARCHAR(255) NULL,
  delivery_district    VARCHAR(100) NULL,                  -- cópia do bairro na hora do pedido
  payment_method_id    INT UNSIGNED NULL,
  payment_method_name  VARCHAR(60)  NOT NULL,              -- cópia
  payment_type         ENUM('CASH','PIX','CARD','OTHER') NOT NULL DEFAULT 'OTHER',
  cash_change_for_cents INT UNSIGNED NULL,                 -- "troco para R$ 100,00"
  subtotal_cents       INT UNSIGNED NOT NULL,
  delivery_fee_cents   INT UNSIGNED NOT NULL DEFAULT 0,
  discount_cents       INT UNSIGNED NOT NULL DEFAULT 0,
  total_cents          INT UNSIGNED NOT NULL,
  notes                VARCHAR(500) NULL,
  created_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_public_id (public_id),
  UNIQUE KEY uq_orders_number (store_id, order_number),
  KEY ix_orders_store_created (store_id, created_at),
  KEY ix_orders_store_status (store_id, status, created_at),
  KEY ix_orders_customer (customer_id),
  CONSTRAINT fk_orders_store    FOREIGN KEY (store_id)          REFERENCES stores (id),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)       REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_zone     FOREIGN KEY (delivery_zone_id)  REFERENCES delivery_zones (id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_payment  FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id) ON DELETE SET NULL,
  CONSTRAINT ck_orders_delivery CHECK (fulfillment = 'PICKUP' OR delivery_address IS NOT NULL),
  CONSTRAINT ck_orders_total    CHECK (CAST(total_cents AS SIGNED) = CAST(subtotal_cents AS SIGNED) + CAST(delivery_fee_cents AS SIGNED) - CAST(discount_cents AS SIGNED))
) ENGINE=InnoDB;

-- histórico de status (substitui status_pedidos + status_pedidos_logs; a lista de status vive no código)
CREATE TABLE order_status_history (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    INT UNSIGNED NOT NULL,
  status      ENUM('RECEIVED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','PICKED_UP','REJECTED','CANCELED','RETURNED') NOT NULL,
  reason      VARCHAR(255) NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_osh_order (order_id, created_at),
  CONSTRAINT fk_osh_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id            INT UNSIGNED NOT NULL,
  product_id          INT UNSIGNED NULL,
  variant_id          INT UNSIGNED NULL,
  product_name        VARCHAR(120) NOT NULL,
  variant_name        VARCHAR(60)  NOT NULL,
  unit_price_cents    INT UNSIGNED NOT NULL,              -- preço base da variação
  options_total_cents INT UNSIGNED NOT NULL DEFAULT 0,    -- soma do que as opções cobraram (por unidade)
  quantity            SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  line_total_cents    INT UNSIGNED NOT NULL,              -- (unit + options) * quantity
  notes               VARCHAR(255) NULL,
  legacy_description  TEXT NULL,                          -- só para itens migrados do Laravel (texto antigo)
  PRIMARY KEY (id),
  KEY ix_order_items_order (order_id),
  KEY ix_order_items_product (product_id),
  CONSTRAINT fk_order_items_order   FOREIGN KEY (order_id)   REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE SET NULL,
  CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT ck_order_items_qty   CHECK (quantity >= 1),
  CONSTRAINT ck_order_items_total CHECK (line_total_cents = (unit_price_cents + options_total_cents) * quantity)
) ENGINE=InnoDB;

-- opções escolhidas em cada item (borda, sabores, adicionais, ponto da carne...)
--   list_price_cents = preço de tabela da opção naquele tamanho
--   charged_cents    = quanto de fato foi cobrado (em grupo HIGHEST só a mais cara cobra; as outras ficam 0)
CREATE TABLE order_item_options (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_item_id     INT UNSIGNED NOT NULL,
  group_id          INT UNSIGNED NULL,
  option_id         INT UNSIGNED NULL,
  group_name        VARCHAR(80)  NOT NULL,
  option_name       VARCHAR(120) NOT NULL,
  quantity          TINYINT UNSIGNED NOT NULL DEFAULT 1,
  list_price_cents  INT UNSIGNED NOT NULL DEFAULT 0,
  charged_cents     INT UNSIGNED NOT NULL DEFAULT 0,      -- total cobrado por esta linha (já considera quantity)
  position          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_oio_item (order_item_id),
  KEY ix_oio_option (option_id),
  CONSTRAINT fk_oio_item   FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE CASCADE,
  CONSTRAINT fk_oio_group  FOREIGN KEY (group_id)  REFERENCES option_groups (id) ON DELETE SET NULL,
  CONSTRAINT fk_oio_option FOREIGN KEY (option_id) REFERENCES options (id) ON DELETE SET NULL,
  CONSTRAINT ck_oio_charged CHECK (charged_cents <= list_price_cents * quantity)
) ENGINE=InnoDB;
