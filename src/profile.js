import {request} from './projects.js';
import {t} from './i18n.js';

const fields={height:'sel-height',footprint:'sel-footprint',color:'sel-color',mode:'sel-mode'};
export function selectedMapping() {
  return Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,document.getElementById(id).value]));
}
export async function initProfile() {
  const status=document.getElementById('metric-profile-status');
  let message='';
  const show=key=>{message=key;status.textContent=t(key);};
  window.addEventListener('languagechange',()=>{status.textContent=t(message);});
  for(const id of Object.values(fields))document.getElementById(id).addEventListener('change',()=>show('Changes are temporary until you save them as default.'));
  try {
    const {profile}=await request('profile',null,'GET');
    for(const [key,id] of Object.entries(fields))document.getElementById(id).value=profile.mapping[key];
  } catch {show('Default metrics could not be loaded. Start CodeCity with npm to use your profile.');}
  const button=document.getElementById('metric-profile-save');
  button.onclick=async()=>{
    button.disabled=true;show('Saving default metrics…');
    try {await request('profile',{mapping:selectedMapping()});show('Default metrics saved for the next app launch.');}
    catch {show('Default metrics could not be saved. Check that your user config folder is writable.');}
    finally {button.disabled=false;}
  };
}
