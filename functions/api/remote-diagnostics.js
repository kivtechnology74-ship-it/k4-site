const UPSTREAM = "https://k4-remote-diagnostics.kiv-technology74.workers.dev/submit";

export async function onRequestPost({ request }) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 30000) {
    return Response.json({ success: false, error: "Request is too large." }, { status: 413 });
  }

  const response = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": new URL(request.url).origin
    },
    body: await request.text()
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { "allow": "POST, OPTIONS" } });
}
