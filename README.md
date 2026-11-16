# ECOMULTI 2.0

Site institucional e de vendas da **ECOMULTI** (domínios, hospedagem, e-mail corporativo e desenvolvimento de websites), com painel de vendas, ligação à conta de revenda da **20i** e um **assistente de atendimento com IA** (Claude, da Anthropic) para o site e o WhatsApp.

Tudo corre na hospedagem da **AngoWeb**: o site em `public_html`, a API numa aplicação **Node.js** do cPanel (`ecomulti.ao/api`) e os dados na base **MySQL** `ecomulti_ecomulti`.

## Visão geral

- **Site estático** em HTML, CSS e JavaScript, sem dependências no navegador.
- **Calculadoras e orçamento** para domínios, hospedagem, e-mail e websites. Os pedidos ficam registados no painel e no MySQL.
- **Painel admin** (`/admin.html`): vendas, clientes, leads, blog e o botão **"Activar na 20i"**, que cria a hospedagem de uma venda paga.
- **20i:** verificação de domínios e criação de alojamento, através de um proxy PHP com IP autorizado.
- **Assistente com IA** (opcional): recomenda serviços, verifica domínios, monta o orçamento e regista o pedido (`ECO-AAMMDD-XXXX`). Sem chave da IA, o chat funciona em modo guiado.
- **Popups promocionais** nas páginas de serviços.

## Arquitectura

```
ecomulti.ao (AngoWeb)
├── /                 páginas do site (public_html)
├── /api/...          servidor Node.js (servidor/app.mjs) → painel, pedidos, chat, blog, newsletter, WhatsApp
├── /proxy-20i.php    ponte para a API da 20i (guarda a chave da 20i)
├── /api-bd.php       grava pedidos nas tabelas clientes / encomendas
└── MySQL             ecomulti_ecomulti — tabelas do catálogo e das encomendas + app_dados (dados do servidor)
```

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html`, `dominios.html`, `hospedagem-ecomulti.html`, `email-corporativo-ecomulti.html`, `desenvolvimento-ecomulti.html`, `orcamento-ecomulti.html` | Páginas do site |
| `blog.html`, `artigo.html`, `blog/posts.json` | Blog |
| `admin.html`, `painel.html` | Painel administrativo e painel do assistente |
| `assets/js/config.js` | Contactos, dados da empresa e **todos os preços** |
| `assets/` | CSS, JavaScript e imagens |
| `app.cjs` | Arranque da aplicação Node no cPanel |
| `servidor/app.mjs`, `servidor/rotas/` | Servidor e rotas da API: `admin`, `pedido`, `agente`, `blog`, `newsletter`, `painel`, `whatsapp`, `limpar` |
| `agente/` | Lógica partilhada: armazenamento MySQL, autenticação, catálogo, 20i, assistente |
| `ferramentas/proxy-20i/`, `ferramentas/api-bd/` | PHP para a AngoWeb e modelos de configuração |
| `ferramentas/` | Testes, servidor local, sincronização de preços e pacote para a AngoWeb |
| `_original/` | Cópia do site antigo, só para referência |

## Como começar

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run local        # site + API em http://localhost:8099 (dados em memória)
```

Para usar o MySQL do XAMPP localmente, defina `DB_NOME`, `DB_UTILIZADOR`, `DB_SENHA` e `DB_PORTA` (3900 no XAMPP deste projecto) antes de arrancar. Para usar a IA, defina `ANTHROPIC_API_KEY`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run local` | Site + API no computador |
| `npm run testar-servidor` | Testes do servidor por HTTP (usa o MySQL do XAMPP se estiver ligado) |
| `npm run testar` | Testes do agente com API falsa (sem custos) |
| `node ferramentas/testar-whatsapp.mjs` | Testes do WhatsApp com API falsa |
| `npm run testar-20i` | Testes da 20i e do painel com 20i falsa (`-- --real` testa a conta real, só leitura) |
| `npm run testar-bd` | Testes da `api-bd.php` (PHP + MySQL do XAMPP, numa base temporária) |
| `npm run precos` | Copia os preços do `config.js` para o servidor |
| `npm run precos-sql` | Gera `ferramentas/api-bd/precos.sql` com os preços do `config.js` |
| `npm run angoweb` | Gera `_publicar/ecomulti-angoweb.zip` para subir na AngoWeb |

## Configuração (variáveis da aplicação Node no cPanel)

Os segredos ficam nas **variáveis de ambiente da aplicação Node** (cPanel → Setup Node.js App) e nos ficheiros `config-*.php` fora do `public_html`. Nunca os escreva no código.

| Variável | Para quê |
|---|---|
| `DB_NOME`, `DB_UTILIZADOR`, `DB_SENHA` (`DB_HOST`, `DB_PORTA`) | Base de dados MySQL (obrigatório em produção) |
| `BD_URL`, `BD_CHAVE` | Cópia dos pedidos nas tabelas `clientes`/`encomendas`, através de `api-bd.php` |
| `VINTEI_URL`, `VINTEI_PROXY_CHAVE` | Ligação à 20i através de `proxy-20i.php` |
| `ADMIN_EMAIL`, `ADMIN_SENHA`, `ADMIN_SEGREDO` | Conta inicial do painel e segredo das sessões (opcionais) |
| `ANTHROPIC_API_KEY`, `AGENTE_MODELO`, `AGENTE_ESFORCO`, `AGENTE_LIMITE_*` | Assistente com IA (opcional) |
| `PAINEL_CHAVE` | Chave do painel do assistente (`/painel.html`) |
| `WHATSAPP_*`, `EQUIPA_WHATSAPP` | WhatsApp Business (opcional) |

A lista completa está em [AGENTE-LEIA-ME.md](AGENTE-LEIA-ME.md).

## Alterar preços, planos e textos

- **Preços e contactos:** edite só `assets/js/config.js`, execute `npm run precos-sql` e importe o `precos.sql` no phpMyAdmin.
- **O que cada plano inclui:** `agente/catalogo.mjs` e as páginas HTML correspondentes.
- **Tom e regras de venda do assistente:** `agente/prompt.mjs`.

## Publicação na AngoWeb

```bash
npm run angoweb      # gera _publicar/ecomulti-angoweb.zip
```

O zip traz o `public_html/`, a aplicação `ecomulti-servidor/` e os modelos de configuração, com as instruções em `LEIA-PRIMEIRO.txt`. Passo a passo em [LEIA-ME.md](LEIA-ME.md).

## Documentação

- [LEIA-ME.md](LEIA-ME.md): publicação na AngoWeb (site, aplicação Node, MySQL) e checklist
- [AGENTE-LEIA-ME.md](AGENTE-LEIA-ME.md): assistente, IA, WhatsApp, variáveis, custos e testes

## Licença

Projeto privado da ECOMULTI. Todos os direitos reservados.
