import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "./remote-diagnostics-worker.js";
import { onRequest as onPreviewCalculatorEvents } from "../functions/api/calculator-events.js";
import { onRequest as onPreviewRemoteDiagnostics } from "../functions/api/remote-diagnostics.js";

class MemoryD1 {
  rows = new Map();
  completions = new Map();
  events = new Map();
  legacyRows = [];
  prepare(sql) {
    const statement = { values: [] };
    statement.bind = (...values) => { statement.values = values; return statement; };
    statement.run = async () => {
      if (sql.includes("INSERT INTO site_leads")) {
        const [id, created_at, language, form_type, contact, message, details_json, source_url, timezone, attribution_json, safety_ack, calc_id, email_status, next_attempt_at, updated_at] = statement.values;
        if (this.rows.has(id)) throw new Error("UNIQUE constraint failed");
        this.rows.set(id, { id, created_at, language, form_type, contact, message, details_json, source_url, timezone, attribution_json, safety_ack, calc_id, email_status, email_attempts: 0, email_error: null, next_attempt_at, updated_at });
        return { success: true, meta: { changes: 1 } };
      }
      if (sql.includes("INSERT OR IGNORE INTO calculator_completions")) {
        const [calc_id, created_at, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class] = statement.values;
        const exists = this.completions.has(calc_id);
        if (!exists) this.completions.set(calc_id, { calc_id, created_at, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class });
        return { meta: { changes: exists ? 0 : 1 } };
      }
      if (sql.includes("INSERT OR IGNORE INTO calculator_events")) {
        const [event_id, created_at, event_name, session_id, calc_id, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class] = sql.includes("'generate_lead'")
          ? [statement.values[0], statement.values[1], "generate_lead", ...statement.values.slice(2)]
          : statement.values;
        const exists = this.events.has(event_id);
        if (!exists) this.events.set(event_id, { event_id, created_at, event_name, session_id, calc_id, brand, model_id, model_name, profile_type, language, calculator_version, page_path, traffic_class });
        return { meta: { changes: exists ? 0 : 1 } };
      }
      if (sql.includes("UPDATE site_leads SET email_status")) {
        const success = sql.includes("email_status = 'sent'");
        const [status, attempts, error, updated_at, id] = success
          ? ["sent", statement.values[0], null, statement.values[1], statement.values[2]]
          : statement.values;
        Object.assign(this.rows.get(id), { email_status: status, email_attempts: attempts, email_error: error, updated_at });
        return { success: true };
      }
      if (sql.includes("UPDATE site_leads SET next_attempt_at")) {
        const [next_attempt_at, updated_at, id] = statement.values;
        Object.assign(this.rows.get(id), { next_attempt_at, updated_at });
        return { success: true };
      }
      if (sql.includes("UPDATE diagnostic_requests SET email_status = 'sent'")) {
        const [email_message_id, email_attempts, email_next_attempt_at, updated_at, id] = statement.values;
        Object.assign(this.legacyRows.find(item => item.id === id), { email_status: "sent", email_message_id, email_attempts, email_next_attempt_at, email_error: null, updated_at });
        return { success: true };
      }
      if (sql.includes("UPDATE diagnostic_requests SET email_status = ?")) {
        const [email_status, email_error, email_attempts, email_next_attempt_at, updated_at, id] = statement.values;
        Object.assign(this.legacyRows.find(item => item.id === id), { email_status, email_error, email_attempts, email_next_attempt_at, updated_at });
        return { success: true };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    };
    statement.first = async () => {
      if (sql.includes("FROM calculator_completions")) {
        const completion = this.completions.get(statement.values[0]);
        const allowQa = statement.values[1] === 1;
        return completion && (completion.traffic_class === "production" || (allowQa && completion.traffic_class === "qa")) ? completion : null;
      }
      const row = this.rows.get(statement.values[0]);
      return row ? { id: row.id, email_status: row.email_status, calc_id: row.calc_id } : null;
    };
    statement.all = async () => ({ results: sql.includes("diagnostic_requests")
      ? this.legacyRows.filter(row => ["pending", "failed"].includes(row.email_status) && row.status === "received" && row.email_attempts < statement.values[0] && row.email_next_attempt_at <= statement.values[1]).slice(0, 20)
      : [...this.rows.values()].filter(row => row.email_status === "pending" && row.next_attempt_at <= statement.values[0]) });
    return statement;
  }
  async batch(statements) {
    if (this.batchFailure) throw new Error("Synthetic analytics store failure");
    return Promise.all(statements.map(statement => statement.run()));
  }
  batchFailure = false;
}

const requestId = "19a292b0-99dc-4d11-84bb-ce431d72b59a";
const relaySecret = "test-shared-secret";
const payload = (overrides = {}) => ({
  requestId, contact: "test@example.com", message: "Synthetic test inquiry; no customer data.",
  formType: "remote_diagnostics", language: "en",
  sourceUrl: "https://k4-technology.com/services/remote-gas-engine-diagnostics/?utm_source=test&email=should-not-be-kept#form",
  timezone: "Africa/Johannesburg", attribution: { utm_source: "test", email: "should-not-be-kept" },
  details: [{ name: "Test", value: "Synthetic only" }], ...overrides
});
const makeEnv = (db, options = {}) => ({
  LEADS_DB: db, SUBMIT_RATE_LIMIT: { limit: async () => ({ success: options.rateAllowed !== false }) },
  CALCULATOR_EVENT_RATE_LIMIT: { limit: async () => ({ success: options.eventRateAllowed !== false }) },
  GMAIL_RELAY_URL: "https://script.google.com/macros/s/test/exec", GMAIL_RELAY_SECRET: relaySecret
});
const post = (body, origin = "https://k4-technology.com") => new Request("https://k4-technology.com/api/remote-diagnostics", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const calculatorPost = (body, origin = "https://k4-technology.com") => new Request("https://k4-technology.com/api/calculator-events", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const eventPayload = (overrides = {}) => ({
  event_id: "a02185d0-3937-42db-9776-e932565e889b", event_name: "calculator_result_completed",
  session_id: "b02185d0-3937-42db-9776-e932565e889b", calc_id: "c02185d0-3937-42db-9776-e932565e889b",
  brand: "Jenbacher", model_id: "r5_10", model_name: "J320", profile_type: "oem", language: "en",
  calculator_version: "1.0-beta", page_path: "/gpu-estimate/en-beta/", traffic_class: "production", ...overrides
});
const withRelay = async (handler, fn) => {
  const previous = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = previous; }
};

test("stores first and sends signed lead data to the Gmail relay", async () => {
  const db = new MemoryD1(), emailCalls = { count: 0 };
  await withRelay(async (url, init) => {
    assert.equal(String(url), "https://script.google.com/macros/s/test/exec");
    const request = JSON.parse(init.body);
    const expected = createHmac("sha256", relaySecret).update(`${request.timestamp}.${JSON.stringify(request.lead)}`).digest("base64url");
    assert.equal(request.signature, expected);
    assert.equal(request.lead.contact, "test@example.com");
    assert.equal(request.lead.form_type, "remote_diagnostics");
    assert.deepEqual(request.lead.details, [{ name: "Test", value: "Synthetic only" }]);
    emailCalls.count++;
    return Response.json({ ok: true, reference: "19A292B0" });
  }, async () => {
    const response = await worker.fetch(post(payload()), makeEnv(db));
    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(result.stored, true);
    assert.equal(result.emailStatus, "sent");
  });
  assert.equal(db.rows.size, 1);
  assert.equal(emailCalls.count, 1);
  const row = [...db.rows.values()][0];
  assert.equal(row.source_url, "https://k4-technology.com/services/remote-gas-engine-diagnostics/?utm_source=test");
  assert.equal(JSON.parse(row.attribution_json).email, undefined);
});

test("preview synthetic lead is stored in QA with calculator attribution and email suppressed", async () => {
  const db = new MemoryD1();
  db.completions.set(eventPayload().calc_id, { ...eventPayload(), traffic_class: "qa" });
  let emailCalls = 0;
  await withRelay(async () => { emailCalls++; return Response.json({ ok: true }); }, async () => {
    const request = new Request("https://branch.k4-technology.pages.dev/api/remote-diagnostics", {
      method: "POST", headers: { origin: "https://branch.k4-technology.pages.dev", "content-type": "application/json" },
      body: JSON.stringify(payload({
        requestId: "29a292b0-99dc-4d11-84bb-ce431d72b59a",
        calcId: eventPayload().calc_id,
        sourceUrl: "https://branch.k4-technology.pages.dev/ru/services/remote-gas-engine-diagnostics/",
        contact: "synthetic@example.invalid", message: "Synthetic Preview QA only"
      }))
    });
    const response = await onPreviewRemoteDiagnostics({ request, env: makeEnv(db) });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.stored, true);
    assert.equal(result.emailStatus, "suppressed");
    assert.equal(result.calculatorAttributionStored, true);
  });
  assert.equal(emailCalls, 0);
  assert.equal([...db.rows.values()][0].email_status, "suppressed");
  assert.equal([...db.rows.values()][0].calc_id, eventPayload().calc_id);
  assert.equal([...db.events.values()].filter(event => event.event_name === "generate_lead").length, 1);
  assert.equal([...db.events.values()].find(event => event.event_name === "generate_lead").traffic_class, "qa");
});

test("accepts only a phone number with no message", async () => {
  const db = new MemoryD1();
  await withRelay(async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.lead.contact, "+998 90 123 45 67");
    return Response.json({ ok: true });
  }, async () => {
    const response = await worker.fetch(post(payload({ contact: "+998 90 123 45 67", message: "" })), makeEnv(db));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).emailStatus, "sent");
  });
});

test("accepts a Cloudflare Pages preview origin for controlled testing", async () => {
  const db = new MemoryD1();
  await withRelay(async () => Response.json({ ok: true }), async () => {
    const response = await worker.fetch(post(payload({ sourceUrl: "https://branch.k4-technology.pages.dev/ru/services/remote-gas-engine-diagnostics/" }), "https://branch.k4-technology.pages.dev"), makeEnv(db));
    assert.equal(response.status, 201);
    assert.match([...db.rows.values()][0].source_url, /^https:\/\/branch\.k4-technology\.pages\.dev\/ru\//);
  });
});

test("duplicate request id does not send a duplicate email", async () => {
  const db = new MemoryD1(); let count = 0; const env = makeEnv(db);
  await withRelay(async () => { count++; return Response.json({ ok: true }); }, async () => {
    await worker.fetch(post(payload()), env);
    const response = await worker.fetch(post(payload()), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).stored, true);
  });
  assert.equal(db.rows.size, 1);
  assert.equal(count, 1);
});

test("keeps a saved lead and retries failed relay delivery", async () => {
  const db = new MemoryD1(), env = makeEnv(db); let fails = true;
  await withRelay(async () => fails ? Response.json({ ok: false }, { status: 503 }) : Response.json({ ok: true }), async () => {
    const response = await worker.fetch(post(payload()), env);
    const result = await response.json();
    assert.equal(result.stored, true);
    assert.equal(result.emailStatus, "pending");
    assert.equal(db.rows.size, 1);
    fails = false;
    let scheduled;
    await worker.scheduled({}, env, { waitUntil: promise => { scheduled = promise; } });
    await scheduled;
  });
  assert.equal([...db.rows.values()][0].email_status, "sent");
});

test("rejects invalid origin and rate limited requests before storage", async () => {
  const db = new MemoryD1(), env = makeEnv(db, { rateAllowed: false });
  assert.equal((await worker.fetch(post(payload(), "https://attacker.example"), env)).status, 403);
  assert.equal((await worker.fetch(post(payload()), env)).status, 429);
  assert.equal(db.rows.size, 0);
});

test("honeypot traffic is quietly discarded", async () => {
  const db = new MemoryD1();
  const response = await worker.fetch(post(payload({ website: "bot-filled" })), makeEnv(db));
  assert.equal(response.status, 202);
  assert.equal((await response.json()).stored, false);
  assert.equal(db.rows.size, 0);
});

test("scheduled retry delivers previously stored diagnostics through Gmail relay", async () => {
  const db = new MemoryD1();
  db.legacyRows.push({ id: requestId, created_at: "2026-11-06T17:30:00.000Z", contact: "test@example.com", fault_description: "Synthetic legacy case", language: "en", source_url: "https://k4-technology.com/services/remote-gas-engine-diagnostics/", status: "received", email_status: "failed", email_attempts: 0, email_next_attempt_at: "1970-01-01T00:00:00.000Z", details_json: "[]", attribution_json: "{}", safety_ack: 1 });
  const env = makeEnv(db); let count = 0;
  await withRelay(async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.lead.message, "Synthetic legacy case");
    count++;
    return Response.json({ ok: true });
  }, async () => {
    let scheduled;
    await worker.scheduled({}, env, { waitUntil: promise => { scheduled = promise; } });
    await scheduled;
  });
  assert.equal(db.legacyRows[0].email_status, "sent");
  assert.equal(count, 1);
});

test("stores an allowlisted completion once and rejects demo completion", async () => {
  const db = new MemoryD1(), env = makeEnv(db);
  const response = await worker.fetch(calculatorPost(eventPayload()), env);
  assert.equal(response.status, 202);
  assert.equal(db.completions.size, 1);
  assert.equal(db.events.size, 1);
  const duplicate = await worker.fetch(calculatorPost(eventPayload()), env);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(db.events.size, 1);
  const demo = await worker.fetch(calculatorPost(eventPayload({
    event_id: "d02185d0-3937-42db-9776-e932565e889b", calc_id: "e02185d0-3937-42db-9776-e932565e889b", profile_type: "demo"
  })), env);
  assert.equal(demo.status, 422);
  assert.equal(db.completions.size, 1);
});

test("classifies preview and probable automation separately", async () => {
  const db = new MemoryD1(), env = makeEnv(db);
  await worker.fetch(calculatorPost(eventPayload({ event_name: "calculator_page_view", event_id: "f02185d0-3937-42db-9776-e932565e889b", calc_id: "a12185d0-3937-42db-9776-e932565e889b" }), "https://branch.k4-technology.pages.dev"), env);
  await worker.fetch(new Request("https://k4-technology.com/api/calculator-events", {
    method: "POST", headers: { origin: "https://k4-technology.com", "content-type": "application/json", "user-agent": "ExampleCrawler/1.0" },
    body: JSON.stringify(eventPayload({ event_name: "calculator_page_view", event_id: "a12185d0-3937-42db-9776-e932565e889b", calc_id: "b12185d0-3937-42db-9776-e932565e889b" }))
  }), env);
  assert.deepEqual([...db.events.values()].map(event => event.traffic_class), ["qa", "probable_automation"]);
  const qaDemo = await worker.fetch(calculatorPost(eventPayload({ event_id: "b12185d0-3937-42db-9776-e932565e889b", calc_id: "c12185d0-3937-42db-9776-e932565e889b", event_name: "calculator_page_view", profile_type: "demo" }), "https://branch.k4-technology.pages.dev"), env);
  assert.equal(qaDemo.status, 202);
  assert.equal([...db.events.values()].at(-1).traffic_class, "qa");
  assert.equal([...db.events.values()].at(-1).profile_type, "demo");
});

test("links only a production completion after the lead row is stored", async () => {
  const db = new MemoryD1(), env = makeEnv(db);
  db.completions.set(eventPayload().calc_id, { ...eventPayload(), traffic_class: "production" });
  await withRelay(async () => Response.json({ ok: true }), async () => {
    const response = await worker.fetch(post(payload({ calcId: eventPayload().calc_id })), env);
    const result = await response.json();
    assert.equal(result.stored, true);
    assert.equal(result.calculatorAttributionStored, true);
    assert.equal([...db.rows.values()][0].calc_id, eventPayload().calc_id);
  });
  assert.equal([...db.events.values()].filter(event => event.event_name === "generate_lead").length, 1);
  const qaDb = new MemoryD1();
  qaDb.completions.set(eventPayload().calc_id, { ...eventPayload(), traffic_class: "qa" });
  await withRelay(async () => Response.json({ ok: true }), async () => {
    const response = await worker.fetch(post(payload({ calcId: eventPayload().calc_id })), makeEnv(qaDb));
    const result = await response.json();
    assert.equal(result.stored, true);
    assert.equal(result.calculatorAttributionStored, false);
    assert.equal([...qaDb.rows.values()][0].calc_id, null);
  });
});

test("analytics write failures return safely and rate limits events", async () => {
  const db = new MemoryD1(), env = makeEnv(db);
  db.batchFailure = true;
  assert.equal((await worker.fetch(calculatorPost(eventPayload()), env)).status, 503);
  assert.equal((await worker.fetch(calculatorPost(eventPayload()), makeEnv(db, { eventRateAllowed: false }))).status, 429);
});

test("Pages preview route writes QA events to its bound D1 and rejects the production Pages host", async () => {
  const db = new MemoryD1();
  const env = { LEADS_DB: db };
  const previewRequest = new Request("https://branch.k4-technology.pages.dev/api/calculator-events", {
    method: "POST", headers: { origin: "https://branch.k4-technology.pages.dev", "content-type": "application/json" },
    body: JSON.stringify(eventPayload({
    event_name: "calculator_page_view",
    event_id: "c12185d0-3937-42db-9776-e932565e889b",
    calc_id: "d12185d0-3937-42db-9776-e932565e889b"
    }))
  });
  const response = await onPreviewCalculatorEvents({ request: previewRequest, env });
  assert.equal(response.status, 202);
  assert.equal([...db.events.values()][0].traffic_class, "qa");
  const production = await onPreviewCalculatorEvents({
    request: calculatorPost(eventPayload({ event_name: "calculator_page_view" })), env
  });
  assert.equal(production.status, 404);
  assert.equal(db.events.size, 1);
});
