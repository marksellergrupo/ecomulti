# ECOMULTI 2.0

Site institucional e de vendas da **ECOMULTI** (domínios, hospedagem, e-mail corporativo e desenvolvimento de websites) com um **assistente de atendimento com IA** (Claude, da Anthropic) que funciona no site e no WhatsApp.

## Visão geral

- **Site estático** em HTML, CSS e JavaScript, sem dependências no navegador.
- **Calculadoras e orçamento** para domínios, hospedagem, e-mail e websites.
- **Assistente com IA** que recomenda serviços, verifica domínios, monta o orçamento e regista o pedido (`ECO-AAMMDD-XXXX`). Sem chave da IA, o chat continua a funcionar em modo guiado.
- **WhatsApp Business** via Cloud API da Meta.
- **Painel da equipa** (`/painel.html`) com pedidos e pedidos de atendimento humano.
- **Blog** com área de administração.
- Funções de servidor em **Netlify Functions** (Node.js 20 ou superior), com armazenamento em Netlify Blobs.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `index.html`, `dominios.html`, `hospedagem-ecomulti.html`, `email-corporativo-ecomulti.html`, `desenvolvimento-ecomulti.html`, `orcamento-ecomulti.html` | Páginas do site |
| `blog.html`, `artigo.html`, `blog/posts.json`, `blog-admin.html` | Blog e administração |
| `painel.html`, `admin.html` | Painel da equipa e administração |
| `assets/js/config.js` | Contactos, dados da empresa e **todos os preços** |
| `assets/` | CSS, JavaScript e imagens |
| `agente/` | Lógica do assistente: conversa, prompt, catálogo, domínios e armazenamento |
| `netlify/functions/` | Funções: `agente`, `whatsapp`, `painel`, `blog`, `newsletter`, `pedido`, `admin`, `limpar` |
| `ferramentas/` | Scripts de teste, preview e sincronização de preços |
| `_original/` | Cópia do site antigo, só para referência |
| `_publicar/` | Pasta gerada por `npm run preview` (é a pasta publicada no Netlify) |

## Como começar

Requisitos: Node.js 20 ou superior.

```bash
npm install
node ferramentas/servidor-local.mjs   # site + chat em http://localhost:8099
```

Para usar a IA real localmente, defina `ANTHROPIC_API_KEY` antes de iniciar o servidor.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run testar` | Testes do agente com API falsa (sem custos) |
| `node ferramentas/testar-whatsapp.mjs` | Testes do WhatsApp com API falsa |
| `npm run testar-bd` | Testes da base de dados (PHP + MySQL do XAMPP, numa base de teste temporária) |
| `npm run precos-sql` | Gera `ferramentas/api-bd/precos.sql` com os preços do `config.js` para importar no MySQL |
| `npm run testar-20i` | Testes da ligação à 20i com API falsa (`-- --real` testa a conta real, só leitura) |
| `npm run precos` | Sincroniza os preços |
| `npm run preview` | Prepara `_publicar/ecomulti-preview` e copia os preços do `config.js` para o agente |

## Configuração

Os segredos ficam nas **variáveis de ambiente do Netlify**. Nunca os escreva no código.

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Activa a IA |
| `AGENTE_MODELO`, `AGENTE_ESFORCO` | Modelo e esforço da IA |
| `AGENTE_LIMITE_DIARIO`, `AGENTE_LIMITE_CONVERSA`, `AGENTE_LIMITE_CONVERSA_WA` | Limites de custo |
| `AGENTE_ORIGENS`, `SITE_URL` | Domínios autorizados e endereço usado nos links |
| `PAINEL_CHAVE` | Chave de acesso ao painel (mínimo 12 caracteres) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` | Ligação ao WhatsApp |
| `EQUIPA_WHATSAPP`, `WHATSAPP_MODELO_AVISO`, `WHATSAPP_MODELO_IDIOMA`, `WHATSAPP_PAUSA_HUMANO_HORAS` | Avisos à equipa |
| `BD_URL`, `BD_CHAVE` | Cópia dos pedidos e clientes no MySQL da AngoWeb, através de `ferramentas/api-bd/api-bd.php` |
| `VINTEI_URL`, `VINTEI_PROXY_CHAVE` | Ligação à conta de revenda da 20i através do proxy na AngoWeb (`ferramentas/proxy-20i/`) |

A lista completa, com valores por omissão e o passo a passo da ligação ao WhatsApp, está em [AGENTE-LEIA-ME.md](AGENTE-LEIA-ME.md).

## Alterar preços, planos e textos

- **Preços e contactos:** edite só `assets/js/config.js` e execute `npm run preview`.
- **O que cada plano inclui:** `agente/catalogo.mjs` e as páginas HTML correspondentes.
- **Tom e regras de venda do assistente:** `agente/prompt.mjs`.

## Publicação

O Netlify publica a pasta `_publicar/ecomulti-preview` e usa `netlify/functions` para as funções (ver `netlify.toml`).

```bash
npm run preview
netlify deploy --prod --dir _publicar/ecomulti-preview --functions netlify/functions
```

Para hospedar o site noutro servidor (por exemplo, Hostinger), envie apenas os ficheiros do site e aponte `agente.endpoint` em `assets/js/config.js` para a função no Netlify. Detalhes em [LEIA-ME.md](LEIA-ME.md).

## Documentação

- [LEIA-ME.md](LEIA-ME.md): site, estrutura e checklist antes de publicar
- [AGENTE-LEIA-ME.md](AGENTE-LEIA-ME.md): assistente, IA, WhatsApp, painel, custos e testes

## Licença

Projeto privado da ECOMULTI. Todos os direitos reservados.
