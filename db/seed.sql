-- Dados de exemplo: uma loja com pizza, hambúrguer e refrigerante (para testar o modelo)
INSERT INTO cities (id,name,state,slug) VALUES (1,'Pouso Alegre','MG','pouso-alegre-mg');
INSERT INTO stores (id,slug,name,email,password_hash,phone,city_id) VALUES (1,'pizzaria-exemplo','Pizzaria Exemplo','loja@exemplo.com','x','35999999999',1);
INSERT INTO categories (id,store_id,name,position) VALUES (1,1,'Pizzas',1),(2,1,'Hambúrgueres',2),(3,1,'Bebidas',3);

-- pizza: 1 produto, 2 variações com preço base 0 (o preço vem do grupo "Sabores")
INSERT INTO products (id,store_id,category_id,name,description) VALUES
 (1,1,1,'Pizza','Escolha o tamanho, até 2 sabores e a borda.'),
 (2,1,2,'X-Bacon','Pão, blend 160 g, queijo e bacon.'),
 (3,1,3,'Refrigerante','');
INSERT INTO product_variants (id,product_id,name,description,price_cents,position) VALUES
 (1,1,'Broto','4 fatias',0,1),(2,1,'Grande','8 fatias',0,2),
 (3,2,'Único',NULL,2800,1),
 (4,3,'Lata 350 ml',NULL,600,1),(5,3,'2 L',NULL,1400,2);

INSERT INTO option_groups (id,store_id,name,min_select,max_select,max_per_option,pricing_mode) VALUES
 (1,1,'Sabores',1,2,1,'HIGHEST'),
 (2,1,'Borda',0,1,1,'ADDITIVE'),
 (3,1,'Adicionais da pizza',0,5,1,'ADDITIVE'),
 (4,1,'Ponto da carne',1,1,1,'ADDITIVE'),
 (5,1,'Adicionais do lanche',0,6,2,'ADDITIVE');

INSERT INTO options (id,group_id,name,description,price_cents) VALUES
 (1,1,'Calabresa','Calabresa, cebola e mussarela',0),
 (2,1,'Mussarela','Mussarela e orégano',0),
 (3,1,'Portuguesa','Presunto, ovo, cebola e ervilha',0),
 (4,2,'Catupiry',NULL,0),
 (5,2,'Cheddar',NULL,0),
 (6,3,'Bacon',NULL,0),
 (7,3,'Cebola',NULL,0),
 (8,4,'Mal passado',NULL,0),(9,4,'Ao ponto',NULL,0),(10,4,'Bem passado',NULL,0),
 (11,5,'Bacon extra',NULL,500),(12,5,'Cheddar extra',NULL,400);

-- preços por tamanho: sabores, borda e adicionais da pizza (variações 1=Broto, 2=Grande)
INSERT INTO option_variant_prices (option_id,variant_id,price_cents) VALUES
 (1,1,4500),(1,2,6500),
 (2,1,4000),(2,2,6000),
 (3,1,5000),(3,2,7000),
 (4,1,800),(4,2,1200),
 (5,1,700),(5,2,1100),
 (6,1,500),(6,2,800),
 (7,1,300),(7,2,500);

INSERT INTO product_option_groups (product_id,group_id,store_id,position) VALUES
 (1,1,1,1),(1,2,1,2),(1,3,1,3),
 (2,4,1,1),(2,5,1,2);

INSERT INTO delivery_zones (store_id,district,fee_cents) VALUES (1,'Centro',500),(1,'Faisqueira',800);
INSERT INTO payment_methods (store_id,name,type) VALUES (1,'Pix','PIX'),(1,'Dinheiro','CASH'),(1,'Cartão','CARD');
