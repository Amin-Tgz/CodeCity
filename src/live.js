import { setInfraLive } from './infra.js';

// Probe the optional local metrics agent (metrics_agent.py). When it is not
// running the viewer silently keeps the static estimates.
export function initLive(port = 8770) {
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
      if (!timer) timer = setInterval(poll, 4000);
    } catch {
      // agent not running; stay on static estimates (no retry loop)
    }
  };

  poll();
}
