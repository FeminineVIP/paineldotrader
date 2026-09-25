// ============================================================================
// Middleware do Cloudflare Pages — Painel do Trader
//
// Roda ANTES de qualquer página do site ser entregue ao navegador.
// Bloqueia o acesso ao painel (index.html) para quem não tem uma sessão
// válida com assinatura ativa, redirecionando para a página de assinatura.
//
// Páginas sempre liberadas (não passam pela checagem de sessão):
//   /assinar.html, /login.html (se existir), arquivos estáticos comuns
//   (imagens, css, js) e a própria pasta /functions.
//
// A página /assinar-especial.html tem uma regra própria: só é liberada
// para quem chegar com o código de acesso certo na URL (?codigo=...),
// verificado aqui no servidor contra a variável de ambiente
// CODIGO_ESPECIAL (nunca fica exposto no código público do GitHub).
// Quem não tiver o código é mandado para a página normal, como se a
// especial não existisse.
// ============================================================================

const API_URL = "https://api.paineldotrader.com.br";

// Caminhos que nunca são bloqueados, mesmo sem sessão.
const CAMINHOS_LIVRES = [
  "/assinar",
  "/assinar.html",
  "/login",
  "/login.html",
  "/favicon.ico",
  "/robots.txt"
];

// Caminhos que exigem o código de acesso especial (ver CODIGO_ESPECIAL).
const CAMINHOS_ESPECIAIS = [
  "/assinar-especial",
  "/assinar-especial.html"
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
  const { request, next, env } = context;
  const url = new URL(request.url);

  // --------------------------------------------------------------------------
  // Página especial: exige código de acesso
  // --------------------------------------------------------------------------

  if (CAMINHOS_ESPECIAIS.includes(url.pathname)) {
    const codigoRecebido = url.searchParams.get("codigo");

    const cookieHeader = request.headers.get("Cookie") || "";
    const jaValidado = /acesso_especial=1(;|$)/.test(cookieHeader);

    const codigoCorreto =
      !!env.CODIGO_ESPECIAL &&
      codigoRecebido === env.CODIGO_ESPECIAL;

    if (!codigoCorreto && !jaValidado) {
      // Código errado, ausente, ou variável ainda não configurada:
      // manda para a página normal, sem revelar que existe algo diferente.
      return Response.redirect(
        new URL("/assinar", url.origin).toString(),
        302
      );
    }

    const resposta = await next();

    if (codigoCorreto && !jaValidado) {
      // Primeira vez com o código certo: grava um cookie para a pessoa
      // não precisar digitar o código de novo em visitas futuras.
      const novaResposta = new Response(resposta.body, resposta);

      novaResposta.headers.append(
        "Set-Cookie",
        `acesso_especial=1; Domain=.paineldotrader.com.br; Secure; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 180}; Path=/`
      );

      return novaResposta;
    }

    return resposta;
  }

  // --------------------------------------------------------------------------
  // Demais páginas: checagem normal de sessão/assinatura
  // --------------------------------------------------------------------------

  if (ehCaminhoLivre(url.pathname)) {
    return next();
  }

  const cookieHeader = request.headers.get("Cookie") || "";
  const match = cookieHeader.match(/painel_session=([^;]+)/);
  const sessionToken = match ? match[1] : null;

  if (!sessionToken) {
    return Response.redirect(
      new URL("/assinar", url.origin).toString(),
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
      new URL("/assinar", url.origin).toString(),
      302
    );
  }

  return next();
}
