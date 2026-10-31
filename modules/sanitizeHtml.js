/**
 * Sanitizer nhẹ cho HTML do quản trị viên/AI tạo và hiển thị bằng innerHTML.
 * Không thay thế DOMPurify, nhưng loại bỏ script, iframe, event handler và
 * URL javascript: — đủ để chặn XSS lưu trữ ở thông báo và bài viết.
 */

const ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DIV', 'EM', 'FIGCAPTION', 'FIGURE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'LI', 'MARK', 'OL', 'P', 'PRE',
  'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH',
  'THEAD', 'TR', 'U', 'UL'
]);

const SAFE_URL = /^(https?:\/\/|mailto:|#|\/(?!\/))/i;
const SAFE_IMAGE = /^(https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i;
const SAFE_STYLE = /^(?!.*(?:url\s*\(|expression\s*\(|@import)).*$/i;

export function sanitizeDisplayHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');

  for (const node of [...template.content.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ''));
      continue;
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      let keep = ['class', 'title', 'alt', 'width', 'height', 'colspan', 'rowspan', 'align', 'loading'].includes(name);

      if (name === 'style') keep = SAFE_STYLE.test(attr.value);
      if (node.tagName === 'A' && name === 'href') keep = SAFE_URL.test(attr.value);
      if (node.tagName === 'IMG' && name === 'src') keep = SAFE_IMAGE.test(attr.value);

      if (!keep) node.removeAttribute(attr.name);
    }
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }

  return template.innerHTML;
}
