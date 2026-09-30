// Git-history time-lapse: scrub (or play) the city growing commit by commit.
// Each frame carries per-file (net) line counts; buildings whose file does not
// exist yet are hidden, and existing ones grow toward their final height.

export function initTimeline(history, city) {
  const host = document.getElementById('timeline-host');
  const row = document.getElementById('timeline-row');
  if (!host || !row) return;
  if (!history || !history.frames || history.frames.length < 2) {
    row.style.display = 'none';
    return;
  }
  const frames = history.frames;
  const finalFiles = frames[frames.length - 1].files;
  for (const e of city.byBuilding.values()) {
    e.baseH = e.body.geometry.parameters.height;
    e.finalLoc = finalFiles[e.building.file] || 0;
  }

  host.innerHTML = `
    <button id="tl-play" class="mini-btn" title="play history">▶</button>
    <input id="tl-range" type="range" min="0" max="${frames.length - 1}" value="${frames.length - 1}" />
    <div id="tl-label" class="tl-label"></div>`;
  const range = host.querySelector('#tl-range');
  const label = host.querySelector('#tl-label');
  const play = host.querySelector('#tl-play');

  const apply = (i) => {
    const f = frames[i];
    let present = 0;
    for (const e of city.byBuilding.values()) {
      const loc = f.files[e.building.file] || 0;
      if (!loc || !e.finalLoc) { e.group.visible = false; continue; }
      e.group.visible = true;
      present++;
      const r = Math.max(0.05, Math.min(1.25, loc / e.finalLoc));
      e.body.scale.y = r;
      e.body.position.y = 0.62 + (e.altitude || 0) + (e.baseH * r) / 2;
    }
    const date = new Date(f.t * 1000).toISOString().slice(0, 10);
    label.textContent = `${f.hash.slice(0, 7)} · ${date} · ${present} buildings · ${f.total} lines`;
  };

  let timer = null;
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } play.textContent = '▶'; };
  range.oninput = () => { stop(); apply(Number(range.value)); };
  play.onclick = () => {
    if (timer) { stop(); return; }
    play.textContent = '⏸';
    if (Number(range.value) >= frames.length - 1) range.value = '0';
    timer = setInterval(() => {
      let v = Number(range.value) + 1;
      if (v >= frames.length) { v = frames.length - 1; stop(); }
      range.value = String(v);
      apply(v);
    }, 320);
  };

  apply(frames.length - 1);
}
