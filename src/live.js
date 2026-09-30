import { setInfraLive } from './infra.js';

// Opt-in live CPU/RAM from the optional local metrics agent (metrics_agent.py).
// Off by default so the viewer never makes a network call unless asked; the
// choice is remembered in localStorage.
export function initLive(port = 8770) {
  const box = document.getElementById('infra-live');
  if (!box) return;
  const url = `http://127.0.0.1:${port}/metrics`;
  let timer = null;

  const poll = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const m = await res.json();
      if (typeof m.cpu_pct === 'number' && m.cpu_pct >= 0) {
        const note = `Live from local agent · RAM ${m.ram_used_mb} / ${m.ram_total_mb} MB`;
        setInfraLive(m.cpu_pct, m.ram_pct, note);
      }
    } catch {
      // agent not running; keep the static estimates
    }
  };
  const start = () => { poll(); if (!timer) timer = setInterval(poll, 4000); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  box.checked = localStorage.getItem('codecity.live') === '1';
  box.onchange = () => {
    localStorage.setItem('codecity.live', box.checked ? '1' : '0');
    if (box.checked) start(); else stop();
  };
  if (box.checked) start();
}
