import {t} from './i18n.js';
import {renderQualityGuide} from './quality-guide.js';
import {PRESETS} from './investigation.js';

export const HELP_SECTIONS=[
  ['Getting started',[
    'Open a folder from Project → Open project. Browse folders, go to the parent folder, or paste a path. Source is scanned locally without running project code.',
    'Open recent reopens a saved folder. Close project clears the city. Exclusions hide files, folders, symbols, or path patterns; Apply rescans, and removing a rule restores them.',
  ]],
  ['Interface mode',[
    'Advanced adds district filtering, street controls, and investigations. Your mode is remembered.',
  ]],
  ['Map metrics',[
    'Height controls how tall buildings are; footprint controls their ground area; colour controls their surface tint. Change each independently and check the legend for the current meaning.',
    'NOM counts methods; NOA counts attributes; LOC counts source lines. Dependencies measures connected links. Select a metric value in building details to inspect its evidence in Advanced mode.',
    'Boxplot groups sizes into five categories using this project’s quartiles and whiskers. Threshold uses fixed bands. Linear varies sizes continuously with compressed height so large buildings remain readable.',
    'Dependencies sums the weights of identified incoming and outgoing connections. Language colours indicate programming languages, not interface languages.',
    'Save as default writes height, footprint, colour, and mapping to your user profile. The saved mapping loads on the next app launch for any project. Unsaved changes affect this session.',
  ]],
  ['Git history',[
    'Build history and ▶ play commits from oldest to newest; ⏸ pauses. Drag the timeline to inspect a commit. The last position restores the current model, including uncommitted files.',
    'Approximate growth estimates past sizes from file lines. Commit structure parses source at each commit. Compare with current shows additions, changes, and removed buildings. Git commits are required.',
  ]],
  ['Inspecting buildings',[
    'Click a building or select it from the building list. Preview source shows its lines; copy path copies its location; Open in file manager reveals the source file.',
    'Advanced details include metric evidence, members, incoming and outgoing links, and cycles. Select a member to preview its lines. Editor link settings accepts {path}, {line}, and {end} placeholders.',
  ]],
  ['Advanced tools',[
    'Highlight related buildings',
    'Evidence-based candidates for review. Generated code is excluded.',
  ]],
  ['Investigate',Object.values(PRESETS).map(p=>p.explain)],
  ['Shared connections',[
    'Select a building to highlight its neighbors and explore the dependency map.',
    'Related buildings glow briefly on selection. Blue is incoming, amber is outgoing, and purple is both directions. Pause animations and reduced motion disable the pulse.',
    'No connection was identified in the project analysis. This does not prove independence.',
  ]],
  ['Navigation and tips',[
    'Drag to orbit, wheel to zoom, and right-drag to pan. [ and ] select previous and next buildings. ⌂ resets the view, ☰ opens the building list, and ? opens help. Escape closes help.',
    'Pause animations stops pedestrians and ambient motion. Camera rotation and Git playback have separate controls.',
    'Select a node to explore its connections.',
  ]],
];

export function renderHelp(host) {
  host.replaceChildren();
  for(const [title,paragraphs] of HELP_SECTIONS) {
    const section=document.createElement('section');
    const heading=document.createElement('h3');heading.textContent=t(title);section.append(heading);
    for(const text of paragraphs){const p=document.createElement('p');const preset=Object.values(PRESETS).find(item=>item.explain===text);p.textContent=(preset?t(preset.label)+': ':'')+t(text);section.append(p);}
    host.append(section);
  }
  renderQualityGuide(host);
}
