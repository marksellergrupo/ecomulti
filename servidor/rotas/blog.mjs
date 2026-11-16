/* API do blog.
   GET    /api/blog            — público: artigos publicados (+ "lápides" dos que foram ocultados)
   GET    /api/blog?todos=1    — painel: todos os artigos, incluindo rascunhos  (Authorization: Bearer PAINEL_CHAVE)
   POST   /api/blog            — painel: cria ou actualiza um artigo (pelo slug)
   DELETE /api/blog?slug=x     — painel: apaga um artigo                                                         */
import { listarTudo, gravarItem, apagarItem } from "../../agente/armazem.mjs";
import { json, cabecalhosCors, autorizado, negar } from "../../agente/util-http.mjs";

const LOJA = "blog-artigos";
const ESTADOS = ["publicado", "rascunho", "arquivado"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const txt = (v, max) => String(v == null ? "" : v).replace(/\u0000/g, "").trim().slice(0, max);
function limpar(d) {
  const slug = txt(d.slug, 90).toLowerCase();
  if (!SLUG.test(slug)) return { erro: "O endereço (slug) só pode ter letras minúsculas, números e hífens." };
  const estado = ESTADOS.includes(d.estado) ? d.estado : "rascunho";
  const titulo = txt(d.titulo, 160);
  if (estado !== "arquivado" && titulo.length < 5) return { erro: "O título é obrigatório (mínimo 5 letras)." };
  const imagem = txt(d.imagem, 500);
  if (imagem && !/^(https:\/\/|assets\/img\/)/.test(imagem)) return { erro: "A imagem deve ser um endereço https:// ou uma imagem em assets/img/." };
  const data = isNaN(Date.parse(d.data)) ? new Date().toISOString().slice(0, 10) : new Date(d.data).toISOString().slice(0, 10);
  return {
    post: {
      slug, estado, titulo,
      resumo: txt(d.resumo, 320),
      conteudo: txt(d.conteudo, 60000),
      categoria: txt(d.categoria, 40) || "Notícias",
      tags: (Array.isArray(d.tags) ? d.tags : []).map((t) => txt(t, 30)).filter(Boolean).slice(0, 8),
      autor: txt(d.autor, 60) || "Equipa ECOMULTI",
      imagem, data,
      destaque: !!d.destaque,
      actualizado: new Date().toISOString()
    }
  };
}

export default async (req) => {
  const cors = cabecalhosCors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const todos = url.searchParams.get("todos") === "1";
    if (todos && !(await autorizado(req))) return negar(cors);
    const lista = await listarTudo(LOJA);
    if (todos) return json({ posts: lista.sort((a, b) => (b.data || "").localeCompare(a.data || "")) }, 200, cors);
    // público: só o que está publicado; os restantes vão só como lápide (escondem o exemplo com o mesmo slug)
    const posts = lista.map((p) => (p.estado === "publicado" ? p : { slug: p.slug, estado: p.estado }));
    return json({ posts }, 200, { ...cors, "cache-control": "public, max-age=60, stale-while-revalidate=300" });
  }

  if (!(await autorizado(req))) return negar(cors);

  if (req.method === "POST") {
    let d; try { d = await req.json(); } catch { return json({ erro: "json" }, 400, cors); }
    const r = limpar(d);
    if (r.erro) return json({ erro: r.erro }, 400, cors);
    await gravarItem(LOJA, r.post.slug, r.post);
    return json({ ok: true, post: r.post }, 200, cors);
  }

  if (req.method === "DELETE") {
    const slug = txt(url.searchParams.get("slug"), 90);
    if (!SLUG.test(slug)) return json({ erro: "slug inválido" }, 400, cors);
    await apagarItem(LOJA, slug);
    return json({ ok: true }, 200, cors);
  }
  return json({ erro: "método" }, 405, cors);
};
