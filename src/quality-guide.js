// Relative visual signals, not an invented code-quality score.
export function renderQualityGuide(host) {
  const section=document.createElement('section');section.className='quality-guide';
  const heading=document.createElement('h3');heading.textContent='Recognizing code quality visually';section.append(heading);
  const intro=document.createElement('p');intro.textContent='Use the default mapping for these examples: height = methods, footprint = attributes, colour = lines of code. Language, coverage, and comparison colours have different meanings.';section.append(intro);
  const examples=document.createElement('div');examples.className='quality-examples';
  const picture=outlier=>`<svg viewBox="0 0 240 130" aria-hidden="true"><path d="M16 106 106 65l118 40-97 23Z" fill="#243746"/><path d="M37 99h150M69 90l127 16M112 73v43" stroke="#65828a" stroke-width="2"/>${outlier?'<path d="M105 24h42v78h-42z" fill="#d17a57"/><path d="M147 24l14 7v75l-14-4Z" fill="#a65742"/><path d="M105 24l14-6 42 13-14-7Z" fill="#ecb383"/><path d="M30 111 124 99 205 114M49 88l75 11 72-7M124 99l58-25" stroke="#d4ac74" stroke-width="3"/>':'<path d="M61 65h22v35H61zM108 53h24v47h-24zM155 62h23v42h-23z" fill="#68b6b2"/><path d="M83 65l8 4v34l-8-3ZM132 53l8 4v46l-8-3ZM178 62l8 4v41l-8-3Z" fill="#3c8487"/>'}<path d="M42 80h16v20H42zM189 89h15v18h-15z" fill="#91a6aa"/></svg>`;
  for(const [title,text,outlier] of [
    ['More balanced','Related buildings have comparable sizes, and most streets stay inside their district.',false],
    ['Worth investigating','One unusually tall, wide, warm-coloured building attracts many streets from other districts.',true],
  ]) {
    const card=document.createElement('div');card.className='quality-example';card.innerHTML=picture(outlier);
    const label=document.createElement('b');label.textContent=title;
    const p=document.createElement('p');p.textContent=text;card.append(label,p);examples.append(card);
  }
  section.append(examples);
  const rows=[
    ['Similar-sized neighbours','A tall, warm-coloured outlier','Inspect long methods and multiple responsibilities; a large class may need splitting.'],
    ['Compact, coherent districts','A district dominates the city','Check whether the folder mixes unrelated features; consider clearer module boundaries.'],
    ['Mostly local streets','Many streets cross district boundaries','Inspect coupling and dependency direction. A shared core can be legitimate; look for cycles and costly changes.'],
    ['A proportionate footprint','A very wide base with few methods','Inspect stored state and field ownership. Data models and DTOs can correctly look like this.'],
    ['Coverage colours are mostly green','Red coverage hotspots or grey unknowns','In coverage mode, inspect tests around risky code. Grey means missing coverage data, not zero coverage.'],
  ];
  const table=document.createElement('table');table.className='help-table quality-table';
  const head=document.createElement('thead');const tr=document.createElement('tr');
  for(const title of ['Healthier signal','Review signal','What to check']){const th=document.createElement('th');th.textContent=title;tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');
  for(const row of rows){const tr=document.createElement('tr');for(const text of row){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);section.append(table);
  const note=document.createElement('p');note.className='help-note';note.textContent='Compare buildings with their peers, select outliers to trace their streets, then open the source and tests. Small or green does not prove good code, and large or red does not prove bad code. The city points to review candidates; it cannot judge correctness, security, or architecture by itself.';section.append(note);
  const decor=document.createElement('p');decor.textContent='The meadow, river, trees, birds, and outer road are decoration. Only buildings, districts, and inner dependency streets represent your code.';section.append(decor);
  host.prepend(section);
}
