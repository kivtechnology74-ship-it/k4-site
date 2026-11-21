import worker from "../../cloudflare/remote-diagnostics-worker.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const buckets = new Map();
const previewRateLimit = {
  async limit({ key }) {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= WINDOW_MS) bucket = { startedAt: now, count: 0 };
    bucket.count++;
    buckets.set(key, bucket);
    if (buckets.size > 5000) {
      for (const [id, value] of buckets) if (now - value.startedAt >= WINDOW_MS) buckets.delete(id);
    }
    return { success: bucket.count <= MAX_REQUESTS };
  }
};

export async function onRequest({ request, env }) {
  const hostname = new URL(request.url).hostname;
  if (!hostname.endsWith(".k4-technology.pages.dev") || hostname === "k4-technology.pages.dev") {
    return new Response("Not found", { status: 404 });
  }
  const previewEnv = Object.create(env);
  previewEnv.SUBMIT_RATE_LIMIT = previewRateLimit;
  previewEnv.K4_PREVIEW_QA = true;
  return worker.fetch(request, previewEnv);
}
