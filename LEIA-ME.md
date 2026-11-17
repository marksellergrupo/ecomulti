# ECOMULTI 2.0 — novo site

Site estático (HTML + CSS + JavaScript), sem dependências. Funciona no mesmo alojamento do site actual.

## Como ver no computador
- Abra `index.html` com duplo clique, **ou**
- Para testar como no servidor: na pasta, execute `npx serve .` e abra o endereço indicado.

## Estrutura
| Ficheiro | Para quê |
|---|---|
| `index.html` | Página inicial |
| `dominios.html` | Pesquisa e preços de domínios |
| `hospedagem-ecomulti.html` | Planos e calculadora de hospedagem |
| `email-corporativo-ecomulti.html` | Pacotes e calculadora de e-mail |
| `desenvolvimento-ecomulti.html` | Pacotes e calculadora de websites |
| `orcamento-ecomulti.html` | Orçamento: rever serviços → dados → enviar pedido |
| `privacidade.html` | Política de privacidade (rever com jurista) |
| `404.html` | Página de erro |
| `ecomulti-pagamento.html`, `dominios-ecomulti.html` | Redireccionam os endereços antigos |
| `assets/js/config.js` | **Contactos, dados da empresa e TODOS os preços** |
| `assets/js/app.js` | Lógica comum (menu, orçamento, formulários) |
| `assets/js/dominio.js` | Verificação de domínios |
| `assets/css/style.css` | Design |
| `_original/` | Cópia do site antigo, só para referência — **não enviar para o servidor** |

## Assistente automático (chat do site e WhatsApp)
Ver **`AGENTE-LEIA-ME.md`** — como activar a IA, ligar o WhatsApp, custos, painel da equipa e testes.

## Alterar preços ou contactos
Edite só `assets/js/config.js`. Os preços da base de dados (`/api/catalogo.php`, tabela `regras_preco`)
têm prioridade; para os alinhar, execute `npm run precos-sql` e importe `ferramentas/api-bd/precos.sql`
no phpMyAdmin. Valores absurdos (abaixo de 100 Kz) são ignorados automaticamente.

## Antes de publicar — confirmar
1. Preços em `config.js` e na base de dados (`precos.sql` importado).
2. Horário de atendimento, morada, NIF e redes sociais em `config.js` (vazios = não aparecem).
3. Taxa de IVA e se os preços já incluem IVA (`fiscal` em `config.js`).
4. Texto da política de privacidade.

## Publicar na AngoWeb
Tudo corre na AngoWeb: **site** (`public_html`), **API** (aplicação Node.js do cPanel em `ecomulti.ao/api`) e **dados** (MySQL `ecomulti_ecomulti`).

1. No computador: `npm run angoweb` → gera `_publicar/ecomulti-angoweb.zip` (com `LEIA-PRIMEIRO.txt`).
2. **Site:** o conteúdo de `public_html/` vai para o `public_html` da AngoWeb. Se existir a pasta `public_html/api` antiga (com `catalogo.php`), apague-a: agora é a aplicação Node que responde em `/api`.
3. **Configuração:** `config-20i.php` e `config-bd.php` ficam na pasta acima do `public_html` (modelos em `fora-do-public_html/`).
4. **Aplicação Node:** a pasta `ecomulti-servidor/` vai para a sua pasta pessoal (ao lado do `public_html`). No cPanel → **Setup Node.js App → Create Application**:
   - Node.js 20 ou superior · modo **Production**
   - Application root: `ecomulti-servidor` · Application URL: `ecomulti.ao` / `api` · Startup file: `app.cjs`
   - **Environment variables:** `DB_NOME`, `DB_UTILIZADOR`, `DB_SENHA`, `VINTEI_URL`, `VINTEI_PROXY_CHAVE`, `BD_URL`, `BD_CHAVE`, e para a área do cliente `SMTP_HOST` (ex.: `mail.ecomulti.ao`), `SMTP_PORTA` (`465`), `SMTP_UTILIZADOR` (ex.: `nao-responder@ecomulti.ao`), `SMTP_SENHA` (opcional: `ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_SENHA`)
   - **Run NPM Install** e depois **Restart**.
5. Testar: `https://ecomulti.ao/api/saude` deve responder `{"ok":true,"bd":"ok",...}`; depois entrar em `https://ecomulti.ao/admin.html`.

Na primeira utilização com a base de dados nova, a conta do painel é criada com `ADMIN_EMAIL`/`ADMIN_SENHA` (ou os valores iniciais do código) — **mude a senha logo em "Conta e segurança"**.
