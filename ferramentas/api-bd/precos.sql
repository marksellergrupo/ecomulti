-- GERADO por ferramentas/precos-para-sql.mjs a partir de assets/js/config.js (2026-11-16).
-- Importe no phpMyAdmin, na base ecomulti_ecomulti. Pode ser importado várias vezes.
SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO regras_preco (chave, valor, unidade) VALUES
  ('hospedagem.starter', 3325, 'kz_mes'),
  ('hospedagem.business', 6660, 'kz_mes'),
  ('hospedagem.premium', 15900, 'kz_mes'),
  ('vps.desde', 35000, 'kz'),
  ('automacao.desde', 75000, 'kz'),
  ('email.essencial', 1500, 'kz_mes'),
  ('email.profissional', 4500, 'kz_mes'),
  ('email.empresarial', 9000, 'kz_mes'),
  ('desenvolvimento.landing', 120000, 'kz'),
  ('desenvolvimento.institucional', 280000, 'kz'),
  ('desenvolvimento.loja', 650000, 'kz'),
  ('regra.pagina_extra', 15000, 'kz'),
  ('extra.blog', 40000, 'kz'),
  ('extra.idiomas', 50000, 'kz'),
  ('extra.seo', 45000, 'kz'),
  ('extra.logo', 35000, 'kz'),
  ('extra.formacao', 20000, 'kz'),
  ('regra.prioritario', 20, 'pct'),
  ('dominio.ao', 35000, 'kz_ano'),
  ('dominio.co.ao', 40000, 'kz_ano'),
  ('dominio.it.ao', 32400, 'kz_ano'),
  ('dominio.edu.ao', 32400, 'kz_ano'),
  ('dominio.org.ao', 32400, 'kz_ano'),
  ('dominio.com', 32000, 'kz_ano'),
  ('dominio.net', 32000, 'kz_ano'),
  ('dominio.org', 32000, 'kz_ano'),
  ('regra.desconto_2anos', 10, 'pct'),
  ('regra.desconto_3anos', 15, 'pct')
ON DUPLICATE KEY UPDATE valor = VALUES(valor), unidade = VALUES(unidade);

INSERT INTO dominio_precos (extensao, preco_ano, ativo) VALUES
  ('.ao',35000, 1),
  ('.co.ao',40000, 1),
  ('.it.ao',32400, 1),
  ('.edu.ao',32400, 1),
  ('.org.ao',32400, 1),
  ('.com',32000, 1),
  ('.net',32000, 1),
  ('.org',32000, 1)
ON DUPLICATE KEY UPDATE preco_ano = VALUES(preco_ano);

COMMIT;
