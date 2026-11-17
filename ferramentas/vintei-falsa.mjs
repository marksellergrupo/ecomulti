/* API falsa da 20i (só para testes, sem custos nem registos reais).
   Regras: só aceita "Bearer base64(CHAVE)"; domínios com "ocupado" → já registados;
   domínios com "falha" → erro 500 (para testar o recurso ao RDAP/DNS). */
import http from "node:http";

export const pedidos20i = [];

export function iniciar20iFalsa(porta = 8789, chave = "chave-teste-20i") {
  const esperado = "Bearer " + Buffer.from(chave).toString("base64");
  const srv = http.createServer((req, res) => { let txt = ""; req.on("data", (c) => (txt += c)); req.on("end", () => {
    const responder = (estado, corpo) => { res.writeHead(estado, { "content-type": "application/json" }); res.end(JSON.stringify(corpo)); };
    let corpo = null; try { corpo = txt ? JSON.parse(txt) : null; } catch { /* corpo inválido */ }
    pedidos20i.push({ metodo: req.method, url: req.url, auth: req.headers.authorization, corpo });
    if (req.headers.authorization !== esperado) return responder(401, { error: { message: "Unauthorised" } });

    if (req.method === "GET" && req.url === "/reseller") return responder(200, { id: 12345, name: "ECOMULTI (teste)" });
    if (req.method === "GET" && req.url === "/reseller/*/packageTypes")
      return responder(200, [{ id: 111, label: "ECOMULTI Start", platform: "linux" }, { id: 222, label: "ECOMULTI Pro", platform: "linux" }]);
    if (req.method === "POST" && req.url === "/reseller/*/addWeb") {
      if (!corpo || !["111", "222"].includes(String(corpo.type)) || !corpo.domain_name) return responder(400, { error: { message: "Invalid package type or domain" } });
      if (String(corpo.domain_name).includes("recusado")) return responder(400, { error: { message: "Domain already hosted" } });
      return responder(200, { result: 987654 });
    }
    if (req.method === "POST" && req.url === "/reseller/*/addDomain") {
      const c = corpo?.contact || {};
      if (!corpo?.name || !(corpo.years >= 1) || !c.name || !c.address || !c.city || !/^[A-Z]{2}$/.test(c.cc || "") || !/^\+\d{1,3}\.\d{6,}$/.test(c.telephone || "") || !/@/.test(c.email || ""))
        return responder(400, { error: { message: "Invalid domain registration data" } });
      if (String(corpo.name).includes("semsaldo")) return responder(400, { error: { message: "Insufficient account balance" } });
      return responder(200, { result: { [corpo.name]: true } });
    }

    const m = req.url.match(/^\/domain-search\/([^/?]+)$/);
    if (req.method === "GET" && m) {
      const dom = decodeURIComponent(m[1]).toLowerCase();
      if (dom.includes("falha")) return responder(500, { error: { message: "Internal error" } });
      if (dom.endsWith(".ao")) return responder(200, [{ header: { names: [dom] } }]);   // a 20i não vende .ao
      const nome = dom.split(".")[0];
      return responder(200, [                                // formato real confirmado com a conta ECOMULTI
        { header: { names: [dom] } },
        { name: dom, can: dom.includes("ocupado") ? "transfer-prepare" : "register" },
        { name: nome + ".co.uk", can: "register" }           // sugestão extra, como a 20i faz
      ]);
    }
    responder(404, { error: { message: "Not found" } });
  }); });
  return new Promise((ok) => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  await iniciar20iFalsa(Number(process.env.PORTA || 8789));
  console.log("20i falsa em http://127.0.0.1:" + (process.env.PORTA || 8789) + " (chave: chave-teste-20i)");
}
