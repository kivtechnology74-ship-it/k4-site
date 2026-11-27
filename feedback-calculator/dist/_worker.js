const endpoint = '/api/calculator-event';
const project = 'gpu-economics-feedback-ru.pages.dev';
const production = 'calc.getworkhorseweb.com';
const powerBands = ['<1','1–5','5–20','20+'];
const gasBands = ['<1','1–5','5–10','10–20','20+'];
const gasUnits = ['RUB/Nm3','RUB/m3','RUB/scf','RUB/MJ','RUB/kWh_th'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const reply = status => new Response(null, {status, headers:{'Cache-Control':'no-store'}});

async function readSmallBody(request) {
  if (Number(request.headers.get('content-length')) > 384) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const bytes = new Uint8Array(384);
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) return new TextDecoder('utf-8', {fatal:true}).decode(bytes.subarray(0,size));
    if (size + chunk.value.length > bytes.length) {
      await reader.cancel();
      return null;
    }
    bytes.set(chunk.value,size);
    size += chunk.value.length;
  }
}

function valid(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  const {sid, ordinal, test, power, unit, gas} = event;
  if (typeof sid !== 'string' || sid.length !== 36 || !uuid.test(sid) || typeof test !== 'boolean' || !Number.isInteger(ordinal)) return false;
  const calculation = ordinal >= 2 && ordinal <= 33;
  if (!calculation && ![0,1,40].includes(ordinal)) return false;
  const keys = calculation ? ['sid','ordinal','test','power','unit','gas'] : ['sid','ordinal','test'];
  if (Object.keys(event).length !== keys.length || !keys.every(k => Object.hasOwn(event,k))) return false;
  return !calculation || (powerBands.includes(power) && (unit === 'unknown' ? gas === 'unknown' : gasUnits.includes(unit) && gasBands.includes(gas)));
}

// D1 serializes this single statement. Taking the next indexed slot also enforces the
// hourly budget for sessions that rotate IDs. Duplicate deliveries never consume slots.
const insert = `INSERT INTO calculator_events(sid,is_test,ordinal,hour_utc,slot,power_mw,gas_unit,gas_band)
 SELECT ?1,?2,?3,?4,used+1,?5,?6,?7 FROM
 (SELECT coalesce(max(slot),0) AS used FROM calculator_events WHERE is_test=?2 AND hour_utc=?4)
 WHERE used < ?8 AND (?3=0 OR EXISTS (
 SELECT 1 FROM calculator_events WHERE sid=?1 AND is_test=?2 AND ordinal=CASE WHEN ?3=40 THEN 0 ELSE ?3-1 END))
 ON CONFLICT(sid,is_test,ordinal) DO NOTHING`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== endpoint) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return reply(405);
    if (url.search || url.protocol !== 'https:' || !(url.hostname === production || url.hostname === project || url.hostname.endsWith('.'+project))) return reply(403);
    if (request.headers.get('origin') !== url.origin || (request.headers.has('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) return reply(403);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415);
    let event;
    try {
      const raw = await readSmallBody(request);
      if (raw === null) return reply(413);
      event = JSON.parse(raw);
      if (!valid(event)) return reply(400);
    } catch { return reply(400); }
    const test = Number(event.test || url.hostname !== production);
    const {sid,ordinal,power,unit,gas} = event;
    try {
      const hour = Math.floor(Date.now()/3600000);
      const result = await env.CALC_DB.prepare(insert).bind(sid,test,ordinal,hour,power??null,unit??null,gas??null,test ? 60 : 360).run();
      if (result.meta.changes) return reply(204);
      const exists = await env.CALC_DB.prepare('SELECT 1 FROM calculator_events WHERE sid=? AND is_test=? AND ordinal=?').bind(sid,test,ordinal).first();
      return reply(exists ? 204 : 429);
    } catch { return reply(503); }
  }
};
