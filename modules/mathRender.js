/**
 * Render công thức LaTeX trong nội dung bài giảng.
 * KaTeX chỉ được tải khi nội dung thật sự có công thức, nên các trang
 * không có toán không phải trả thêm chi phí CDN.
 */

const KATEX_VERSION = '0.16.11';
const KATEX_BASE = `https://cdnjs.cloudflare.com/ajax/libs/KaTeX/${KATEX_VERSION}`;

const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false }
];

const IGNORED_TAGS = ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'];

let katexLoader = null;

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    const selector = `link[data-fteca-katex="style"]`;
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.ftecaKatex = 'style';
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('katex-style-failed'));
    document.head.appendChild(link);
  });
}

function loadScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (window[globalName]) {
      resolve();
      return;
    }
    const selector = `script[data-fteca-katex="${globalName}"]`;
    const existing = document.querySelector(selector);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('katex-script-failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.ftecaKatex = globalName;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('katex-script-failed'));
    document.head.appendChild(script);
  });
}

export function containsMath(value) {
  const text = String(value || '');
  return /\\\(|\\\[|\$\$|\$[^$\n]{1,300}\$/.test(text);
}

export function ensureKatex() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.katex?.render && window.renderMathInElement) return Promise.resolve(window.katex);
  if (katexLoader) return katexLoader;
  katexLoader = (async () => {
    await loadStylesheet(`${KATEX_BASE}/katex.min.css`);
    await loadScript(`${KATEX_BASE}/katex.min.js`, 'katex');
    await loadScript(`${KATEX_BASE}/contrib/auto-render.min.js`, 'renderMathInElement');
    return window.katex || null;
  })().catch(error => {
    katexLoader = null;
    throw error;
  });
  return katexLoader;
}

export async function renderMathIn(element) {
  if (!element || typeof element.textContent !== 'string') return false;
  if (!containsMath(element.textContent)) return false;
  try {
    await ensureKatex();
    if (typeof window.renderMathInElement !== 'function') return false;
    window.renderMathInElement(element, {
      delimiters: DELIMITERS,
      ignoredTags: IGNORED_TAGS,
      throwOnError: false,
      strict: false
    });
    return true;
  } catch (error) {
    console.warn('[MathRender] Không tải được KaTeX:', error?.message || error);
    return false;
  }
}
