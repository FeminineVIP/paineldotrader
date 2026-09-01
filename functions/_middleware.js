// ============================================================================
// Middleware do Cloudflare Pages — Painel do Trader
//
// Roda ANTES de qualquer página do site ser entregue ao navegador.
// Bloqueia o acesso ao painel (index.html) para quem não tem uma sessão
// válida com assinatura ativa, redirecionando para a página de assinatura.
//
// Páginas sempre liberadas (não passam por essa checagem):
//   /assinar.html, /login.html (se existir), arquivos estáticos comuns
//   (imagens, css, js) e a própria pasta /functions.
// ============================================================================

const API_URL = "https://api.paineldotrader.com.br";

// Caminhos que nunca são bloqueados, mesmo sem sessão.
const CAMINHOS_LIVRES = [
  "/assinar.html",
  "/login.html",
  "/favicon.ico",
  "/robots.txt"
];

function ehCaminhoLivre(pathname) {
  if (CAMINHOS_LIVRES.includes(pathname)) return true;

  // Libera qualquer arquivo com extensão de asset estático
  // (evita bloquear imagens, css, js, fontes, etc.)
  if (/\.(css|js|png|jpg|jpeg|svg|webp|ico|woff2?|ttf|map)$/i.test(pathname)) {
    return true;
  }

  return false;
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  if (ehCaminhoLivre(url.pathname)) {
    return next();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/painel_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;

  if (!sessionToken) {
    return Response.redirect(
      new URL("/assinar.html", url.origin).toString(),
      302
    );
  }

  // Confirma a sessão direto com a API, encaminhando o mesmo cookie.
  let autenticado = false;

  try {
    const resp = await fetch(`${API_URL}/me`, {
      headers: { Cookie: `painel_session=${sessionToken}` }
    });

    if (resp.ok) {
      const data = await resp.json();
      autenticado = !!data.authenticated;
    }
  } catch (err) {
    // Se a API estiver fora do ar, por segurança bloqueamos o acesso
    // em vez de liberar (falha fechada, não aberta).
    autenticado = false;
  }

  if (!autenticado) {
    return Response.redirect(
      new URL("/assinar.html", url.origin).toString(),
      302
    );
  }

  return next();
}
