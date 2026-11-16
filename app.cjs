/* Arranque da aplicação Node.js no cPanel da AngoWeb ("Setup Node.js App").
   Application startup file: app.cjs   ·   Application URL: ecomulti.ao/api
   (o cPanel arranca ficheiros CommonJS; o servidor está em servidor/app.mjs) */
import("./servidor/app.mjs").catch((e) => { console.error("Falha ao arrancar o servidor:", e); process.exit(1); });
