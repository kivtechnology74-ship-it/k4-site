export async function onRequest({ request, next }) {
  const response = await next();
  const hostname = new URL(request.url).hostname.toLowerCase();

  // Cloudflare Pages branch and deployment preview URLs use pages.dev.
  // Keep those out of search results while allowing the canonical domain to index.
  if (!hostname.endsWith(".pages.dev")) return response;

  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
