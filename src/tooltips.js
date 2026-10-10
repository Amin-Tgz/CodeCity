// Keep tooltip source keys separate from translated labels and dynamic names.
const controls={
  'project-menu-btn':'Open, reopen, exclude parts of, or close a project.',
  'project-open':'Choose a source folder and build its code city.',
  'empty-open':'Choose a source folder and build its code city.',
  'folder-submit':'Choose a source folder and build its code city.',
  'project-close':'Clear the city and keep recent projects.',
  'project-exclusions':'Choose which project parts to hide from the city.',
  'exclusions-apply':'Rescan the project with these exclusion rules.',
  'exclusions-cancel':'Close this dialog without applying changes.',
  'folder-cancel':'Close this dialog without applying changes.',
  'exclusions-close':'Close this dialog without applying changes.',
  'folder-browse':'Browse the folder at the entered path.',
  'folder-parent':'Browse the parent folder.',
  'history-toggle':'Play or pause the project’s Git history.',
  'tl-play':'Play or pause the project’s Git history.',
  'history-compare':'Compare the selected commit structure with the current project.',
  'metric-profile-save':'Save this metric mapping in your user config for future launches.',
  'list-btn':'Open a searchable building list and select a building.',
  'list-close':'Close the building list.',
  'list-minimize':'Fold or expand this panel.',
  'details-minimize':'Fold or expand this panel.',
  'details-close':'Close the selected building’s details.',
  'details-open-file':'Copy the selected source file’s full path.',
  'details-reveal':'Locate the selected source file in your file manager.',
  'reset-view':'Move the camera back to an overview of the city.',
  'auto-rotate':'Turn automatic camera rotation on or off.',
  'auto-hide-panels':'Automatically fold idle panels in Advanced mode.',
  'help-btn':'Open the guide to metrics, menus, and navigation.',
  'help-close':'Close help and return to the city (Escape).',
  'scan-diagnostics-export':'Download scan report',
};
const selectors=[
  ['[data-mode-choice="simple"]','Show metrics and history with essential inspection controls.'],
  ['[data-mode-choice="advanced"]','Show district filters, street controls, and investigations.'],
  ['.panel-fold','Fold or expand this panel.'],
  ['.metric-explain','Explain this metric'],
  ['.recent-project','Reopen this recent project.'],
  ['.folder-row, #folder-roots button','Browse this folder.'],
  ['#exclusion-rules button','Remove this exclusion rule; apply to restore the hidden part.'],
  ['.member-list .member-row','Preview this member’s source lines.'],
  ['.package-crumbs button','Filter the city to this folder.'],
  ['.exclusion-add button','Add rule'],
  ['.list-row, .investigation-results button, #details details .member-row','Select this building and inspect its details.'],
  ['.source-section > button','Preview source'],
  ['.source-section > a','Open selected lines in editor'],
];
export function applyTooltips(root,translate) {
  for(const button of root.querySelectorAll('button, a.mini-btn')) {
    let key=controls[button.id];
    if(!key)key=selectors.find(([selector])=>button.matches(selector))?.[1];
    if(!key)key=button.dataset.tooltip||button.getAttribute('title')||button.getAttribute('aria-label')||button.textContent.trim();
    if(!key)key='Select this item to inspect its details.';
    const title=translate(key);
    if(button.title!==title)button.title=title;
  }
  for(const [selector,key] of [
    ['#sel-height, #sel-footprint, #sel-color','Dependencies sums the weights of identified incoming and outgoing connections. Language colours indicate programming languages, not interface languages.'],
    ['#sel-mode','Boxplot groups sizes into five categories using this project’s quartiles and whiskers. Threshold uses fixed bands. Linear varies sizes continuously with compressed height so large buildings remain readable.'],
    ['#history-mode','Approximate growth estimates past sizes from file lines. Commit structure parses source at each commit. Compare with current shows additions, changes, and removed buildings. Git commits are required.'],
    ['#tl-range','history snapshot'],
    ['#ui-language','Interface language'],
    ['#pause-motion','Pause animations stops pedestrians and ambient motion. Camera rotation and Git playback have separate controls.'],
  ])for(const control of root.querySelectorAll(selector)) {
    const title=translate(key);if(control.title!==title)control.title=title;
  }
}
