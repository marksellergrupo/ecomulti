/* Servidor local para experimentar o site + API no computador (o mesmo servidor da AngoWeb).
   Uso:  node ferramentas/servidor-local.mjs      → http://localhost:8099
   Opcional: $env:ANTHROPIC_API_KEY="..." (chat com IA) e DB_NOME/DB_UTILIZADOR/DB_SENHA/DB_PORTA (MySQL do XAMPP).
   Sem base de dados, guarda tudo em memória (perde-se ao fechar). */
process.env.SERVIR_SITE = "1";
process.env.PORTA = process.env.PORTA || "8099";
await import("../servidor/app.mjs");
