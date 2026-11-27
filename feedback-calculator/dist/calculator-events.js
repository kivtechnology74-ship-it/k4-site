(() => {
  'use strict';
  const key = 'calculator-session-v1';
  const test = location.hash === '#watch-test' || location.hostname !== 'calc.getworkhorseweb.com';
  const idle = 30 * 60 * 1000;
  const units = new Map([
    ['нм³','RUB/Nm3'], ['м³','RUB/m3'], ['м³/ч (условия не указаны)','RUB/m3'],
    ['стандартный куб. фут','RUB/scf'], ['мдж','RUB/MJ'], ['квт·ч тепла','RUB/kWh_th']
  ]);
  let editTimer, state, lastScenario, sending = false, retryTimer, attempts = 0;
  try { state = JSON.parse(sessionStorage.getItem(key)); } catch {}
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch {}
  }
  function session() {
    if (!state || state.test !== test || !Array.isArray(state.pending) || !(Date.now()-state.seen < idle)) {
      state = {sid:crypto.randomUUID(),test,seen:Date.now(),started:false,calculations:0,pdf:false,pending:[{ordinal:0}]};
      lastScenario = null;
      attempts = 0;
    }
    state.seen = Date.now();
    save();
    return state;
  }
  async function deliver() {
    if (sending || retryTimer) return;
    sending = true;
    const current = state;
    try {
      while (state === current && current.pending.length) {
        const event = current.pending[0];
        const response = await fetch('/api/calculator-event', {
          method:'POST',credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',
          headers:{'Content-Type':'application/json'},keepalive:true,
          signal:AbortSignal.timeout(6000),
          body:JSON.stringify({sid:current.sid,test:current.test,...event})
        });
        if (!response.ok) throw Error();
        current.pending.shift();
        attempts = 0;
        if (state === current) save();
      }
    } catch {
      if (state === current && attempts < 2) {
        attempts++;
        retryTimer = setTimeout(() => {retryTimer = null; void deliver();}, attempts * 1500);
      }
    } finally {
      sending = false;
      if (state !== current) void deliver();
    }
  }
  function enqueue(event) {
    state.pending.push(event);
    save();
    void deliver();
  }
  function start() {
    session();
    if (!state.started) {
      state.started = true;
      enqueue({ordinal:1});
    } else void deliver();
  }
  function commit() {
    if (!window.CalculatorResult?.valid || !state?.started) return;
    const x = readInput(), r = calculateScenario(x);
    if (r.problems.length || document.querySelector('[aria-invalid="true"]')) return;
    const signature = JSON.stringify({...x,profile:x.profile.id});
    if (lastScenario === signature || state.calculations >= 32) return;
    lastScenario = signature; // Memory only. No raw input or scenario fingerprint is transmitted or persisted.
    const mw = x.power * x.units / 1000;
    const power = mw < 1 ? '<1' : mw < 5 ? '1–5' : mw < 20 ? '5–20' : '20+';
    const unit = units.get(r.fuel.unit.trim().toLowerCase()) || 'unknown';
    const price = x.fuelPrice;
    const gas = unit === 'unknown' ? 'unknown' : price < 1 ? '<1' : price < 5 ? '1–5' : price < 10 ? '5–10' : price < 20 ? '10–20' : '20+';
    enqueue({ordinal:1 + ++state.calculations,power,unit,gas});
  }
  const safe = fn => event => {try {fn(event);} catch {}};
  function edit(event) {
    if (!event.isTrusted || !event.target.matches('.panel input, .panel select') || activeProfile?.is_example) return;
    start();
    if (['project','customModel'].includes(event.target.id)) return;
    clearTimeout(editTimer);
    if (event.type === 'change') commit();
    else editTimer = setTimeout(safe(commit), 2000);
  }
  document.addEventListener('input',safe(edit));
  document.addEventListener('change',safe(edit));
  document.addEventListener('click',safe(event => {
    if (!event.isTrusted || event.target.id !== 'pdfBtn' || activeProfile?.is_example) return;
    session();
    commit();
    if (!state.pdf) {
      state.pdf = true;
      enqueue({ordinal:40});
    }
  }),true);
  try { session(); void deliver(); } catch {}
})();
