# Assistente automático ECOMULTI — site e WhatsApp

Agente de atendimento com IA (Claude, da Anthropic) que acompanha o cliente **do primeiro "olá" até ao pedido registado**:

1. percebe o que o cliente precisa e recomenda a combinação certa (domínio, site, hospedagem, e-mail, VPS/IA);
2. verifica domínios em tempo real (.ao, .co.ao, .com, .net, .org);
3. monta o orçamento com os **preços oficiais do `config.js`** (descontos de 2/3 anos, extras, prazo prioritário, IVA) — nunca calcula "de cabeça";
4. recolhe os dados (nome, empresa/particular, telefone, e-mail, NIF, forma de pagamento), mostra o resumo e pede confirmação;
5. regista o pedido com número **ECO-AAMMDD-XXXX** e avisa a equipa;
6. passa para uma pessoa quando o cliente pede, em reclamações, suporte a clientes actuais, pedidos de desconto ou dúvidas que não sabe responder.

O pagamento continua como hoje: a equipa confirma e envia a factura proforma (Multicaixa Express, referência ou transferência).

**Sem chave da IA o chat do site não pára:** funciona em **modo guiado** (botões e passos fixos, verificação de domínios, carrinho) e o WhatsApp responde com um menu de links.

---

## 1. Activar a IA (chave da Anthropic)

1. Crie conta em <https://console.anthropic.com>, adicione crédito (Billing) e crie uma chave em **API Keys**.
2. No Netlify: **Project configuration → Environment variables → Add a variable**
   `ANTHROPIC_API_KEY` = a chave (marque como *secret*).
3. Volte a publicar (ou peça-me). O chat passa a mostrar "Online · responde na hora".

> Nunca escreva a chave no código, no `config.js` ou em mensagens. Fica só nas variáveis do Netlify.

### Custos (aproximados — confirme em <https://www.anthropic.com/pricing>)
- Modelo por omissão: **Claude Opus 5.5** (US$ 4 por milhão de tokens de entrada, US$ 20 de saída; instruções em cache a US$ 0,20).
- Uma mensagem típica do cliente custa na ordem de **US$ 0,01–0,03**; uma conversa completa até ao pedido (10–15 mensagens), na ordem de **US$ 0,15–0,40**. Varia com o tamanho da conversa.
- Para gastar menos, defina `AGENTE_MODELO` = `claude-sonnet-5-5` (cerca de metade do preço) ou `claude-haiku-5-5` (muito mais barato; respostas menos cuidadas). É uma decisão comercial vossa — teste antes.
- **Travões de custo incluídos:** máx. `AGENTE_LIMITE_DIARIO` mensagens por dia (600 por omissão; acima disso o site passa a modo guiado), 40 mensagens por conversa no site, 80 no WhatsApp, mensagens até 1200 caracteres. Defina também um limite mensal em console.anthropic.com → **Limits**.

---

## 2. Ligar o WhatsApp (WhatsApp Business Cloud API, da Meta)

Precisa de: conta **Meta Business** (de preferência verificada) e um **número** para o assistente.

> **Qual número?** O número usado na Cloud API deixa de funcionar na app normal do WhatsApp (salvo a opção "coexistência" da Meta para a app WhatsApp Business). Recomendado: **um número novo só para o assistente**; quando é preciso uma pessoa, o assistente dá ao cliente o contacto humano actual (+244 923 340 895) e avisa a equipa com o link do cliente.

Passos:
1. <https://developers.facebook.com> → **My Apps → Create app** (tipo *Business*) → adicione o produto **WhatsApp**.
2. Em **WhatsApp → API Setup**: adicione o número e copie o **Phone number ID**.
3. Crie um token permanente: **Business Settings → Users → System users** → novo utilizador de sistema (Admin) → **Generate token** para a app, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
4. **App settings → Basic**: copie o **App Secret**.
5. No Netlify, crie as variáveis (ver tabela abaixo): `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` (invente uma frase longa) e publique.
6. Em **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://ecomulti-preview.netlify.app/api/whatsapp` (ou o domínio final)
   - Verify token: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Carregue em **Verify and save** e subscreva o campo **messages**.
7. Envie "Olá" para o número a partir de outro telemóvel.

**Avisos à equipa no WhatsApp:** cada pedido novo e cada pedido de atendimento humano é enviado para `EQUIPA_WHATSAPP` (por omissão o número da empresa). O WhatsApp só deixa a empresa escrever livremente a quem lhe falou nas últimas 24 h; para garantir os avisos fora dessa janela, crie em **WhatsApp Manager → Message templates** um modelo (categoria *Utility*) com uma variável `{{1}}` no corpo — ex.: "Novo aviso do assistente: {{1}}" — e indique o nome em `WHATSAPP_MODELO_AVISO`. Em qualquer caso, tudo fica no **painel** (abaixo).

---

## 3. Painel da equipa — `/painel.html`

Lista os pedidos registados pelo assistente (site e WhatsApp) e os pedidos de atendimento humano, com botões para responder no WhatsApp/e-mail.
Defina `PAINEL_CHAVE` (mínimo 12 caracteres; use uma frase longa e aleatória) e entre em `https://ecomulti-preview.netlify.app/painel.html` com essa chave.

---

## 4. Variáveis de ambiente (Netlify)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | para a IA | Chave da Anthropic |
| `AGENTE_MODELO` | não | Modelo (por omissão `claude-opus-5-5`) |
| `AGENTE_ESFORCO` | não | `low` (por omissão, respostas rápidas) · `medium` · `high` |
| `AGENTE_LIMITE_DIARIO` | não | Mensagens por dia, todos os canais (600) |
| `AGENTE_LIMITE_CONVERSA` / `AGENTE_LIMITE_CONVERSA_WA` | não | Mensagens por conversa no site (40) / WhatsApp (80) |
| `AGENTE_ORIGENS` | se o site estiver noutro servidor | Domínios autorizados a usar o chat, separados por vírgula (por omissão `https://www.ecomulti.ao,https://ecomulti.ao`) |
| `SITE_URL` | não | Endereço usado nos links que o agente envia (por omissão `https://www.ecomulti.ao`) |
| `PAINEL_CHAVE` | para o painel | Chave de acesso ao `/painel.html` |
| `WHATSAPP_TOKEN` | para WhatsApp | Token permanente do utilizador de sistema |
| `WHATSAPP_PHONE_NUMBER_ID` | para WhatsApp | ID do número |
| `WHATSAPP_APP_SECRET` | para WhatsApp | Valida que as mensagens vêm mesmo da Meta |
| `WHATSAPP_VERIFY_TOKEN` | para WhatsApp | Frase usada na verificação do webhook |
| `EQUIPA_WHATSAPP` | não | Número que recebe os avisos (só dígitos, ex.: `244923340895`) |
| `WHATSAPP_MODELO_AVISO` / `WHATSAPP_MODELO_IDIOMA` | não | Modelo aprovado para avisos fora das 24 h / idioma (`pt_PT`) |
| `WHATSAPP_PAUSA_HUMANO_HORAS` | não | Só se a equipa responder **no mesmo número** (coexistência): horas que o assistente fica calado depois de chamar uma pessoa |
| `BD_URL` | para o MySQL | Endereço da API da base de dados na AngoWeb (ex.: `https://ecomulti.ao/api-bd.php`). Sem ela, os pedidos ficam só no Netlify |
| `BD_CHAVE` | para o MySQL | Segredo partilhado com a API (igual a `chave_api` no `config-bd.php`) |
| `VINTEI_URL` | para a 20i | Endereço do proxy na AngoWeb, terminado em `?p=` (ex.: `https://SEU-DOMINIO/proxy-20i.php?p=`). Ver `ferramentas/proxy-20i/` |
| `VINTEI_PROXY_CHAVE` | para a 20i | Segredo partilhado com o proxy (igual a `chave_proxy` no `config-20i.php`) |
| `VINTEI_API_KEY` | não (só testes locais) | Chave da 20i para ligação directa sem proxy. **Não** a ponha no Netlify: em produção a chave fica só no proxy |

---

## 5. Site no Hostinger + agente no Netlify

As funções do agente correm no Netlify (o Hostinger partilhado não corre Node.js). Para usar o chat no site oficial:
1. Em `assets/js/config.js`: `agente: { endpoint: "https://ecomulti-preview.netlify.app/api/agente" }`.
2. No Netlify, `AGENTE_ORIGENS` = `https://www.ecomulti.ao,https://ecomulti.ao` (já é o valor por omissão).

Alternativa mais simples: alojar o site todo no Netlify e apontar o domínio para lá.

---

## 6. Mudar preços, planos ou textos

- **Preços e contactos:** só em `assets/js/config.js`. O `npm run preview` copia-os automaticamente para o agente (`agente/dados-empresa.mjs`). Depois publique.
- **O que cada plano inclui:** `agente/catalogo.mjs` (e as páginas HTML correspondentes).
- **Forma de falar, regras de venda, FAQ:** `agente/prompt.mjs`.

---

## 7. Testar e publicar

```bash
npm install                          # uma vez
npm run testar                       # testes do agente (API falsa, sem custos)
node ferramentas/testar-whatsapp.mjs # testes do WhatsApp (API falsa, sem custos)
node ferramentas/servidor-local.mjs  # site + chat em http://localhost:8099 (com ANTHROPIC_API_KEY definida, usa a IA real)
npm run preview                      # prepara _publicar/ecomulti-preview
netlify deploy --prod --dir _publicar/ecomulti-preview --functions netlify/functions
```

## Estrutura
| Ficheiro | Para quê |
|---|---|
| `assets/js/agente.js`, `assets/css/agente.css` | Chat do site (modo IA + modo guiado) |
| `agente/nucleo.mjs` | Agente: ferramentas e conversa com o Claude |
| `agente/prompt.mjs` | Instruções do agente (tom, regras, processo de venda) |
| `agente/catalogo.mjs` | Planos e cálculo de preços (iguais às calculadoras) |
| `agente/dominios.mjs` | Verificação de domínios no servidor (20i, RDAP ou DNS) |
| `agente/vintei.mjs` | Cliente da API de revenda da 20i |
| `agente/bd.mjs` | Envia cada pedido (site e agente) para o MySQL; se falhar, o pedido continua no Netlify |
| `ferramentas/api-bd/` | API PHP do MySQL para a AngoWeb + modelo de `config-bd.php` + `precos.sql` |
| `ferramentas/proxy-20i/` | Proxy PHP para a AngoWeb (IP fixo autorizado na 20i) + modelo de `config-20i.php` |
| `ferramentas/vintei-falsa.mjs`, `ferramentas/testar-20i.mjs` | 20i falsa e testes (`npm run testar-20i`; conta real só leitura: `--real`) |
| `agente/armazem.mjs` | Conversas, pedidos e avisos (Netlify Blobs) |
| `agente/whatsapp-api.mjs` | Envio de mensagens e avisos pelo WhatsApp |
| `netlify/functions/agente.mjs` | `/api/agente` — chat do site |
| `netlify/functions/whatsapp.mjs` + `whatsapp-processar.mjs` | `/api/whatsapp` — webhook da Meta + resposta em segundo plano |
| `netlify/functions/painel.mjs` + `painel.html` | Painel da equipa |
| `netlify/functions/limpar.mjs` | Limpeza diária (conversas com mais de 7 dias) |

## Limitações a saber
- A disponibilidade de .ao/.co.ao é indicativa (DNS público); a equipa confirma sempre antes de registar — o agente diz isso ao cliente.
- No WhatsApp o assistente só lê texto (áudios e imagens recebem um pedido para escrever).
- A política de privacidade foi actualizada para mencionar o assistente (Anthropic, Netlify, Meta) — **rever com jurista**, como o resto do texto.
