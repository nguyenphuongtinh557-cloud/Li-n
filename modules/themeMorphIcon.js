import { createMorph } from '../node_modules/morphicons/dist/dom.js';
import Moon from '../node_modules/lucide/dist/esm/icons/moon.mjs';
import Sun from '../node_modules/lucide/dist/esm/icons/sun.mjs';

const morphHandles = new WeakMap();

function ensureMorphHandle(button, icon) {
  let handle = morphHandles.get(button);
  if (handle) return handle;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'theme-morph-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  button.replaceChildren(svg);

  handle = createMorph(path, icon);
  morphHandles.set(button, handle);
  return handle;
}

export function updateThemeMorphIcons(theme, { animate = false } = {}) {
  const icon = theme === 'dark' ? Sun : Moon;
  for (const button of document.querySelectorAll('#btn-theme-top, #summary-study-theme-toggle')) {
    const handle = ensureMorphHandle(button, icon);
    if (animate) handle.morphTo(icon, { stiffness: 36, damping: 12 });
    else handle.set(icon);

    const label = theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối';
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  }
}
