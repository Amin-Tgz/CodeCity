import { setInfraLive } from './infra.js';

// Opt-in live CPU/RAM from the optional local metrics agent (metrics_agent.py).
// Off by default so the viewer never makes a network call unless asked; the
// choice is remembered in localStorage.
export function initLive(port = 8770) {
  const box = document.getElementById('infra-live');
  if (!box) return;
  const url = `http://127.0.0.1:${port}/metrics`;
  let timer = null;
  let request = null;
  const gauges = [...document.querySelectorAll('#infra .gauge')];
  const original = gauges.map((g) => g.innerHTML);
  const note = document.getElementById('infra-note');
  const originalNote = note?.textContent;
  const restore = (message) => {
    gauges.forEach((g, i) => { g.innerHTML = original[i]; });
    if (note) note.textContent = message || originalNote;
  };

  const poll = async () => {
    if (!box.checked || request) return;
    const controller = new AbortController();
    request = controller;
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();
      if (!box.checked || controller.signal.aborted) return;
      if (Number.isFinite(m.cpu_pct) && m.cpu_pct >= 0 && m.cpu_pct <= 100 && Number.isFinite(m.ram_pct) && m.ram_pct >= 0 && m.ram_pct <= 100) {
        const note = `Live whole-machine usage · RAM ${m.ram_used_mb} / ${m.ram_total_mb} MB (not this project alone)`;
        setInfraLive(m.cpu_pct, m.ram_pct, note);
      } else restore('Live sample unavailable; showing static estimates.');
    } catch {
      if (box.checked) restore('Local metrics agent unavailable; showing static estimates.');
    } finally {
      clearTimeout(timeout);
      if (request === controller) request = null;
    }
  };
  const start = () => { poll(); if (!timer) timer = setInterval(poll, 4000); };
  const stop = () => {
    if (timer) { clearInterval(timer); timer = null; }
    request?.abort();
    restore();
  };

  try { box.checked = localStorage.getItem('codecity.live') === '1'; } catch { box.checked = false; }
  box.onchange = () => {
    try { localStorage.setItem('codecity.live', box.checked ? '1' : '0'); } catch { /* optional persistence */ }
    if (box.checked) start(); else stop();
  };
  if (box.checked) start();
  return stop;
}
