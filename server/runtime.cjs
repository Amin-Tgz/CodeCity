const MIN_NODE = '22.13.0';
function compatibleNode(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 13);
}
module.exports = {MIN_NODE, compatibleNode};
