import {t} from './i18n.js';
import {renderQualityGuide} from './quality-guide.js';

export const HELP_SECTIONS=[
  ['Getting started',[
    'Open a folder from Project → Open project. Browse folders, go to the parent folder, or paste a path. Source is scanned locally without running project code.',
    'Open recent reopens a saved folder. Close project clears the city. Exclusions hide files, folders, symbols, or path patterns; Apply rescans, and removing a rule restores them.',
  ]],
  ['Interface mode',[
    'Simple mode includes metric mapping, saved defaults, Git history, building details, and source preview. Advanced adds search, district filtering, street controls, queries, and investigations. Your mode is remembered.',
  ]],
  ['Map metrics',[
    'Height controls how tall buildings are; footprint controls their ground area; colour controls their surface tint. Change each independently and check the legend for the current meaning.',
    'NOM counts methods; NOA counts attributes; LOC counts source lines. Dependencies measures connected links. Select a metric value in building details to inspect its evidence in Advanced mode.',
    'Boxplot groups sizes into five categories using this project’s quartiles and whiskers. Threshold uses fixed bands. Linear varies sizes continuously with compressed height so large buildings remain readable.',
    'Language assigns a distinct colour to each language. Coverage uses red for low and green for high coverage; grey means unknown. Import a file coverage JSON report under Advanced investigations.',
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
    'Search finds a class or file and moves the camera to it. District limits the view to one folder. Streets can show all links, only the selected building’s links, or none.',
    'Queries tag matching buildings and dim the rest. Combine filters such as loc>200, type:class, and lang:ts. Run applies the query, clear removes it, and save stores a named query.',
    'Investigations rank review candidates by size, coupling, complexity, churn, or coverage. Generated code is excluded. Use sorting to explore results; select a minimap building to inspect it.',
  ]],
  ['Navigation and tips',[
    'Drag to orbit, wheel to zoom, and right-drag to pan. [ and ] select previous and next buildings. ⌂ resets the view, ☰ opens the building list, and ? opens help. Escape closes help.',
    'Panel headers fold or expand controls. Auto-hide folds idle panels in Advanced mode. Pause motion stops ambient animation; pause Git playback separately. Auto-orbit rotates the camera.',
    'Compare similar classes inside a district, then confirm outliers in source and tests. Some dependency links cannot be drawn as streets; inspect the link list. Estimates and missing links limit conclusions.',
  ]],
];

export function renderHelp(host) {
  host.replaceChildren();
  for(const [title,paragraphs] of HELP_SECTIONS) {
    const section=document.createElement('section');
    const heading=document.createElement('h3');heading.textContent=t(title);section.append(heading);
    for(const text of paragraphs){const p=document.createElement('p');p.textContent=t(text);section.append(p);}
    host.append(section);
  }
  renderQualityGuide(host);
}
