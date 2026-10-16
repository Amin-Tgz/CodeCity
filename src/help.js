import {t} from './i18n.js';
import {renderQualityGuide} from './quality-guide.js';

export const HELP_SECTIONS=[
  ['🚀 Getting started',[
    'Open a folder from Project → Open project. Browse folders, go to the parent folder, or paste a path. Source is scanned locally without running project code.',
    'Open recent reopens a saved folder. Close project clears the city. Exclusions hide files, folders, symbols, or path patterns; Apply rescans, and removing a rule restores them.',
    'Manage exclusions from Project → Exclusions in either mode. Exclude this building applies immediately to the selected building only. Open in editor opens the source file directly in your preferred editor.',
    'Add several exclusion rules before applying. Source files stay on disk. If a saved Folder: . rule hides the whole project, remove it and apply. An empty city keeps Exclusions available for recovery.',
  ]],
  ['⚙️ Interface mode',[
    'Advanced adds district filtering, street controls, and investigations. Your mode is remembered.',
  ]],
  ['📐 Map metrics',[
    'Height controls how tall buildings are; footprint controls their ground area; colour controls their surface tint. Change each independently and check the legend for the current meaning.',
    'NOM counts methods; NOA counts attributes; LOC counts source lines. Dependencies measures connected links. Select a metric value in building details to inspect its evidence in Advanced mode.',
    'Boxplot groups sizes into five categories using this project’s quartiles and whiskers. Threshold uses fixed bands. Linear varies sizes continuously with compressed height so large buildings remain readable.',
    'Dependencies sums the weights of identified incoming and outgoing connections. Language colours indicate programming languages, not interface languages.',
    'Save as default writes height, footprint, colour, and mapping to your user profile. The saved mapping loads on the next app launch for any project. Unsaved changes affect this session.',
  ]],
  ['📜 Git history',[
    'Build history and ▶ play commits from oldest to newest; ⏸ pauses. Drag the timeline to inspect a commit. The last position restores the current model, including uncommitted files.',
    'Approximate growth estimates past sizes from file lines. Commit structure parses source at each commit. Compare with current shows additions, changes, and removed buildings. Git commits are required.',
  ]],
  ['🔍 Inspecting buildings',[
    'Click a building or select it from the building list. Open in editor opens the file at line in your preferred editor; Open in file manager reveals the source file.',
    'Advanced details include metric evidence, members, incoming and outgoing links, and cycles. Select a member to open in editor. Editor link settings accepts {path}, {line}, and {end} placeholders.',
  ]],
  ['🛠️ Advanced tools',[
    'Highlight related buildings',
    'Evidence-based candidates for review. Generated code is excluded.',
  ]],
  ['🧭 Navigation and tips',[
    'Drag to orbit, wheel to zoom, and right-drag to pan. [ and ] select previous and next buildings. ⌂ resets the view, ☰ opens the building list, and ? opens help. Escape closes help.',
    'Pause animations stops pedestrians and ambient motion. Camera rotation and Git playback have separate controls.',
  ]],
];

function createMetricsDiagram() {
  const card=document.createElement('figure');card.className='help-visual-card';
  card.innerHTML=`<svg viewBox="0 0 420 180" aria-label="${t('Building Dimensions')}">
    <!-- District Ground Plate -->
    <polygon points="120,150 260,150 340,110 200,110" fill="#182c35" stroke="#334f58" stroke-width="1.5" />
    <!-- Building Footprint (Base) -->
    <polygon points="160,135 240,135 285,115 205,115" fill="#1b3f4c" stroke="#38bdf8" stroke-width="1.2" stroke-dasharray="3 2" />
    <!-- Building 3D Block -->
    <!-- Left face -->
    <polygon points="160,135 240,135 240,65 160,65" fill="#245869" stroke="#132b39" stroke-width="1" />
    <!-- Right face -->
    <polygon points="240,135 285,115 285,45 240,65" fill="#1b4553" stroke="#132b39" stroke-width="1" />
    <!-- Top roof face (Color mapped) -->
    <polygon points="160,65 240,65 285,45 205,45" fill="#38bdf8" stroke="#7dd3fc" stroke-width="1" />
    <!-- Height Indicator -->
    <line x1="140" y1="135" x2="140" y2="65" stroke="#f59e0b" stroke-width="2" marker-end="url(#arrow-h)" marker-start="url(#arrow-h-start)" />
    <text x="130" y="103" fill="#f59e0b" font-size="11" font-weight="bold" text-anchor="end">📏 ${t('Height (NOM) = Methods')}</text>
    <!-- Footprint Indicator -->
    <line x1="160" y1="150" x2="240" y2="150" stroke="#38bdf8" stroke-width="2" />
    <text x="200" y="167" fill="#38bdf8" font-size="11" font-weight="bold" text-anchor="middle">🔲 ${t('Footprint (NOA) = Attributes')}</text>
    <!-- Color Indicator -->
    <text x="245" y="32" fill="#7dd3fc" font-size="11" font-weight="bold" text-anchor="middle">🎨 ${t('Colour (LOC) = Lines of Code')}</text>
    <path d="M 245 37 L 245 48" stroke="#7dd3fc" stroke-width="1.5" />
  </svg>`;
  return card;
}

function createNavGrid() {
  const grid=document.createElement('div');grid.className='help-nav-grid';
  const items=[
    {icon:'🖱️',label:t('Orbit'),desc:t('Left click + drag')},
    {icon:'🖲️',label:t('Zoom'),desc:t('Mouse wheel')},
    {icon:'🖐️',label:t('Pan'),desc:t('Right click + drag')},
    {icon:'⌨️',label:t('Shortcuts'),desc:'[ ] Space ⌂ ?'},
  ];
  for(const it of items){
    const col=document.createElement('div');col.className='help-nav-item';
    col.innerHTML=`<div class="help-nav-icon">${it.icon}</div><div class="help-nav-label">${it.label}</div><div class="help-nav-desc">${it.desc}</div>`;
    grid.append(col);
  }
  return grid;
}

export function renderHelp(host) {
  host.replaceChildren();
  for(const [title,paragraphs] of HELP_SECTIONS) {
    const section=document.createElement('section');
    const heading=document.createElement('h3');heading.textContent=t(title);section.append(heading);
    for(const text of paragraphs){const p=document.createElement('p');p.textContent=t(text);section.append(p);}
    if(title.includes('Map metrics')) section.append(createMetricsDiagram());
    if(title.includes('Navigation')) section.append(createNavGrid());
    host.append(section);
  }
  renderQualityGuide(host);
}
