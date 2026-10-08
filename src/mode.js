import {t} from './i18n.js';

export function getMode() {
  return document.documentElement.dataset.mode === 'advanced' ? 'advanced' : 'simple';
}

export function setMode(mode, {persist = true} = {}) {
  const value = mode === 'advanced' ? 'advanced' : 'simple';
  document.documentElement.dataset.mode = value;
  for (const button of document.querySelectorAll('[data-mode-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.modeChoice === value));
  }
  // Native hidden state removes advanced controls from keyboard and screen-reader navigation.
  for (const node of document.querySelectorAll('[data-advanced]')) node.hidden = value !== 'advanced';
  for (const node of document.querySelectorAll('[data-simple]')) node.hidden = value !== 'simple';
  if (persist) try { localStorage.setItem('codecity.mode', value); } catch {}
  const status = document.getElementById('mode-status');
  if (status) status.textContent = t(value === 'simple' ? 'Simple mode: essential controls.' : 'Advanced mode: all controls.');
  window.dispatchEvent(new CustomEvent('modechange', {detail: value}));
}

export function initMode() {
  let saved;
  try { saved = localStorage.getItem('codecity.mode'); } catch {}
  setMode(saved, {persist: false});
  for (const button of document.querySelectorAll('[data-mode-choice]')) {
    button.onclick = () => setMode(button.dataset.modeChoice);
  }
  window.addEventListener('languagechange', () => setMode(getMode(), {persist: false}));
}
