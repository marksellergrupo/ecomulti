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
Edite só `assets/js/config.js`. Se `api/catalogo.php` existir no servidor, os preços de lá
têm prioridade; valores absurdos (abaixo de 100 Kz) são ignorados automaticamente.

## Antes de publicar — confirmar
1. Preços em `config.js` (vieram do site actual).
2. **`api/catalogo.php` no servidor tem o plano Starter a 10 Kz** — corrigir na base de dados.
3. Horário de atendimento, morada, NIF e redes sociais em `config.js` (vazios = não aparecem).
4. Taxa de IVA e se os preços já incluem IVA (`fiscal` em `config.js`).
5. Texto da política de privacidade.

## Publicar
Enviar tudo **excepto** `_original/`, `_publicar/`, `node_modules/`, `agente/`, `netlify/`, `ferramentas/`, `package*.json`, `netlify.toml` e os `.md`. Manter a pasta `api/` que já existe no servidor.
(As pastas `agente/` e `netlify/` são o servidor do assistente e correm no Netlify — ver `AGENTE-LEIA-ME.md`.)
