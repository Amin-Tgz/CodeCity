const DEFAULT_PROFILE={version:1,mapping:{height:'nom',footprint:'noa',color:'loc',mode:'boxplot'}};
function validateProfile(value) {
  const mapping=value?.mapping;
  if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw Error('Invalid metric profile.');
  const allowed={height:['nom','noa','loc','deps'],footprint:['nom','noa','loc','deps'],color:['nom','noa','loc','deps','language','coverage'],mode:['boxplot','threshold','linear']};
  const clean={};
  for(const [key,values] of Object.entries(allowed)) {
    if(!values.includes(mapping[key]))throw Error('Invalid metric profile.');
    clean[key]=mapping[key];
  }
  return {version:1,mapping:clean};
}
module.exports={DEFAULT_PROFILE,validateProfile};
