import './tts.js?v=20261001-piper-tts-v1';

const ALLOWED_TAGS = new Set([
  'A', 'ARTICLE', 'ASIDE', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DD', 'DIV', 'DL', 'DT', 'EM', 'FOOTER', 'HEADER',
  'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'IMG', 'LI', 'MARK',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'S', 'TABLE', 'TBODY',
  'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U'
]);
const DROP_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON']);
const SAFE_COLOR = /^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d\s.,%+-]+\)|[a-z]{1,20})$/i;
const PARAGRAPH_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']);
const SUMMARY_STYLE_STORAGE_KEY = 'fteca_summary_editor_named_styles_v1';
const SAFE_NAMED_STYLE_PROPERTIES = [
  'color', 'background-color', 'font-family', 'font-size', 'font-weight',
  'font-style', 'text-decoration', 'text-align'
];
const PARAGRAPH_DATA_ATTRIBUTES = new Set([
  'data-summary-keep-next',
  'data-summary-keep-lines',
  'data-summary-page-break-before',
  'data-summary-tabs',
  'data-summary-outline-level',
  'data-summary-no-space-same-style',
  'data-summary-widow-control',
  'data-summary-line-spacing-mode',
  'data-summary-line-spacing-value'
]);
const SUMMARY_PARAGRAPH_DEFAULTS_KEY = 'fteca_summary_editor_paragraph_defaults_v1';
const PAGE_SIZE_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 }
};
const PAGE_SETTINGS_ATTRIBUTES = new Set([
  'data-summary-page-size',
  'data-summary-page-orientation',
  'data-summary-page-margin-top',
  'data-summary-page-margin-right',
  'data-summary-page-margin-bottom',
  'data-summary-page-margin-left',
  'data-summary-page-columns',
  'data-summary-page-column-gap',
  'data-summary-page-gutter'
]);
const CITATION_FIELDS = ['author', 'title', 'year', 'publisher', 'url'];
const CITATION_FORMATS = {
  APA: 'APA 7',
  MLA: 'MLA 9',
  Chicago: 'Chicago Author-Date'
};
const SUMMARY_TABLE_OPTIONS = new Set([
  'header-row', 'total-row', 'banded-rows', 'first-column', 'last-column', 'banded-columns'
]);
const SUMMARY_CHART_TYPES = new Set(['bar', 'column', 'line', 'pie']);
const SUMMARY_CHART_PALETTES = {
  teal: '#168c71',
  blue: '#2563eb',
  orange: '#ea580c'
};
const SUMMARY_CHART_MAX_DATA_LENGTH = 1800;
const SUMMARY_DIAGRAM_LAYOUTS = new Set(['process', 'cycle', 'hierarchy']);
const SUMMARY_DIAGRAM_PALETTES = {
  teal: ['#0f766e', '#168c71', '#70ad47', '#d1fae5'],
  blue: ['#1d4ed8', '#3b82f6', '#60a5fa', '#dbeafe'],
  orange: ['#c2410c', '#ea580c', '#f59e0b', '#ffedd5']
};
const SUMMARY_DIAGRAM_MAX_DATA_LENGTH = 1000;
const SUMMARY_DIAGRAM_MAX_STEPS = 8;
const SUMMARY_DIAGRAM_MAX_STEP_LENGTH = 60;
const SUMMARY_SHAPE_TYPES = new Set([
  'rectangle', 'rounded-rectangle', 'ellipse', 'line', 'arrow', 'triangle', 'diamond', 'star', 'callout'
]);
const SUMMARY_SHAPE_DEFAULT_FILL = '#DDF4EE';
const SUMMARY_SHAPE_DEFAULT_OUTLINE = '#168C71';
const SUMMARY_SHAPE_MAX_LABEL_LENGTH = 80;
const SUMMARY_SHAPE_ALIGNMENTS = new Set(['left', 'center', 'right']);
const SAFE_TABLE_BORDER = /^(?:0|(?:[1-9]\d?(?:\.\d+)?)(?:px|pt))\s+(?:none|solid|dotted|dashed|double)\s+(?:#[0-9a-f]{3,8}|[a-z]{1,20})$/i;
const SAFE_IMAGE_TRANSFORM = /^(?:rotate\((?:0|90|180|270)deg\)(?: scaleX\(-1\))?(?: scaleY\(-1\))?|scaleX\(-1\)(?: scaleY\(-1\))?|scaleY\(-1\))$/;
const CITATION_DATA_ATTRIBUTES = new Set([
  'data-summary-citation-style',
  ...CITATION_FIELDS.map(field => `data-summary-${field}`)
]);

function safeRichTextUrl(value, { image = false } = {}) {
  const url = String(value || '').trim();
  if (!image && /^#[A-Za-z][\w:.-]{0,127}$/.test(url)) return url;
  if (image && /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/]+=*$/i.test(url) && url.length <= 1_400_000) return url;
  try {
    const parsed = new URL(url);
    if (image) return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function sanitizeRichTextStyle(value) {
  const declaration = document.createElement('span').style;
  declaration.cssText = String(value || '');
  const result = [];
  const colors = ['color', 'background-color'];
  for (const property of colors) {
    const item = declaration.getPropertyValue(property).trim();
    if (item && SAFE_COLOR.test(item)) result.push(`${property}:${item}`);
  }
  for (const property of ['font-weight', 'font-style', 'text-decoration', 'text-align', 'vertical-align', 'border-collapse', 'table-layout']) {
    const item = declaration.getPropertyValue(property).trim().toLowerCase();
    if (/^(?:normal|bold|bolder|lighter|[1-9]00|italic|oblique|underline|line-through|overline|none|left|right|center|justify|baseline|middle|top|bottom|collapse|separate|auto|fixed)$/.test(item)) {
      result.push(`${property}:${item}`);
    }
  }
  for (const property of ['border', 'border-top', 'border-right', 'border-bottom', 'border-left']) {
    const item = declaration.getPropertyValue(property).trim().toLowerCase();
    if (SAFE_TABLE_BORDER.test(item)) result.push(`${property}:${item}`);
  }
  const imageTransform = declaration.getPropertyValue('transform').trim().replace(/\s+/g, ' ');
  if (SAFE_IMAGE_TRANSFORM.test(imageTransform)) result.push(`transform:${imageTransform}`);
  for (const property of [
    'font-size', 'width', 'height', 'padding', 'margin', 'margin-top',
    'margin-right', 'margin-bottom', 'margin-left', 'text-indent', 'min-height', 'max-width',
    'column-gap'
  ]) {
    const item = declaration.getPropertyValue(property).trim().toLowerCase();
    if (property === 'text-indent') {
      const signedMatch = item.match(/^(-?\d+(?:\.\d+)?)(px|pt)$/);
      if (signedMatch && Math.abs(Number(signedMatch[1])) <= 720) result.push(`${property}:${item}`);
      continue;
    }
    const match = item.match(/^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/);
    if (!match) continue;
    const amount = Number(match[1]);
    const maximum = match[2] === '%' ? 100 : (property === 'font-size' ? 96 : 2400);
    if (amount > 0 && amount <= maximum) result.push(`${property}:${item}`);
  }
  const columnCount = declaration.getPropertyValue('column-count').trim();
  if (/^[1-3]$/.test(columnCount)) result.push(`column-count:${columnCount}`);
  const lineHeight = declaration.getPropertyValue('line-height').trim().toLowerCase();
  const multipleLineHeight = /^(?:0?\.\d+|[1-5](?:\.\d+)?)$/.test(lineHeight)
    && Number(lineHeight) >= 0.5
    && Number(lineHeight) <= 5;
  const pointLineHeight = /^(\d+(?:\.\d+)?)pt$/.exec(lineHeight);
  if (multipleLineHeight || (pointLineHeight && Number(pointLineHeight[1]) >= 0.5 && Number(pointLineHeight[1]) <= 500)) {
    result.push(`line-height:${lineHeight}`);
  }
  return result.join(';');
}

function sanitizeElement(element) {
  if (DROP_CONTENT_TAGS.has(element.tagName)) {
    element.remove();
    return;
  }
  if (!ALLOWED_TAGS.has(element.tagName)) {
    const children = [...element.childNodes];
    for (const child of children) if (child.nodeType === 1) sanitizeElement(child);
    element.replaceWith(...element.childNodes);
    return;
  }

  let equationModel = null;
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value.trim();
    if (name === 'class') {
      const classes = value.split(/\s+/).filter(token => /^[a-z][a-z\d_-]{0,63}$/i.test(token));
      if (classes.length) element.setAttribute('class', classes.join(' '));
      else element.removeAttribute('class');
    } else if (name === 'style') {
      const style = sanitizeRichTextStyle(value);
      if (style) element.setAttribute('style', style);
      else element.removeAttribute('style');
    } else if (name === 'href' && element.tagName === 'A') {
      const url = safeRichTextUrl(value);
      if (url) element.setAttribute('href', url);
      else element.removeAttribute('href');
    } else if (name === 'src' && element.tagName === 'IMG') {
      const url = safeRichTextUrl(value, { image: true });
      if (url) element.setAttribute('src', url);
      else element.removeAttribute('src');
    } else if (['alt', 'title', 'colspan', 'rowspan', 'scope'].includes(name)
      && ['IMG', 'A', 'SPAN', 'TD', 'TH', 'TABLE', 'FIGURE', 'FIGCAPTION'].includes(element.tagName)) {
      if (['colspan', 'rowspan'].includes(name)) {
        const number = Number(value);
        if (!Number.isInteger(number) || number < 1 || number > 20) element.removeAttribute(name);
      } else if (value.length > 500) {
        element.setAttribute(name, value.slice(0, 500));
      }
    } else if (name === 'id' && (
      /^summary-study-(?:section|heading)-\d{1,3}$/.test(value)
      || /^summary-study-(?:footnote|footnote-ref|endnote|endnote-ref|figure|table)-\d{1,6}$/.test(value)
      || /^summary-study-(?:index|authority)-entry-\d{1,6}$/.test(value)
      || /^summary-study-bookmark-\d{1,6}$/.test(value)
      || value === 'summary-study-endnotes'
    )) {
      element.setAttribute(name, value);
    } else if (name === 'data-summary-reference' && element.tagName === 'A' && ['heading', 'figure', 'table', 'bookmark'].includes(value)) {
      element.setAttribute(name, value);
    } else if (name === 'data-summary-table-options' && element.tagName === 'TABLE') {
      const options = value.split(',').filter(option => SUMMARY_TABLE_OPTIONS.has(option));
      if (options.length) element.setAttribute(name, [...new Set(options)].join(','));
      else element.removeAttribute(name);
    } else if (name === 'data-summary-table-formula' && element.tagName === 'SPAN'
      && element.classList.contains('summary-study-table-formula')) {
      try {
        const { functionName, range } = parseSummaryTableFormula(value);
        element.setAttribute(name, `${functionName}(${range})`);
      } catch {
        element.removeAttribute(name);
      }
    } else if (name === 'data-summary-equation' && element.tagName === 'SPAN'
      && element.classList.contains('summary-study-equation')) {
      try {
        equationModel = normalizeSummaryEquationModel(JSON.parse(value));
        element.setAttribute(name, JSON.stringify(equationModel));
      } catch {
        element.removeAttribute(name);
      }
    } else if (name === 'data-summary-chart-type' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-chart')) {
      if (SUMMARY_CHART_TYPES.has(value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-chart-palette' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-chart')) {
      if (Object.hasOwn(SUMMARY_CHART_PALETTES, value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-chart-data' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-chart')) {
      try {
        const data = JSON.parse(value);
        if (value.length <= SUMMARY_CHART_MAX_DATA_LENGTH
          && Array.isArray(data) && data.length >= 2 && data.length <= 12
          && data.every(item => item && typeof item.label === 'string' && item.label.trim().length <= 40
            && typeof item.value === 'number' && Number.isFinite(item.value) && item.value >= 0 && item.value <= 1_000_000_000)) {
          element.setAttribute(name, JSON.stringify(data.map(item => ({ label: item.label.trim(), value: item.value }))));
        } else {
          element.removeAttribute(name);
        }
      } catch {
        element.removeAttribute(name);
      }
    } else if (name === 'data-summary-diagram-layout' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-diagram')) {
      if (SUMMARY_DIAGRAM_LAYOUTS.has(value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-diagram-palette' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-diagram')) {
      if (Object.hasOwn(SUMMARY_DIAGRAM_PALETTES, value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-diagram-data' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-diagram')) {
      try {
        if (value.length > SUMMARY_DIAGRAM_MAX_DATA_LENGTH) {
          element.removeAttribute(name);
        } else {
          const steps = JSON.parse(value);
          if (Array.isArray(steps) && steps.length >= 2 && steps.length <= SUMMARY_DIAGRAM_MAX_STEPS
            && steps.every(step => typeof step === 'string' && step.trim().length > 0 && step.trim().length <= SUMMARY_DIAGRAM_MAX_STEP_LENGTH)) {
            element.setAttribute(name, JSON.stringify(steps.map(step => step.trim())));
          } else {
            element.removeAttribute(name);
          }
        }
      } catch {
        element.removeAttribute(name);
      }
    } else if (name === 'data-summary-shape-type' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-shape')) {
      if (SUMMARY_SHAPE_TYPES.has(value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (['data-summary-shape-fill', 'data-summary-shape-outline'].includes(name)
      && element.tagName === 'FIGURE' && element.classList.contains('summary-study-shape')) {
      if (/^#[\da-f]{6}$/i.test(value)) element.setAttribute(name, value.toUpperCase());
      else element.removeAttribute(name);
    } else if (name === 'data-summary-shape-label' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-shape')) {
      if (value.length <= SUMMARY_SHAPE_MAX_LABEL_LENGTH) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-shape-align' && element.tagName === 'FIGURE' && element.classList.contains('summary-study-shape')) {
      if (SUMMARY_SHAPE_ALIGNMENTS.has(value)) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-comment' && element.tagName === 'SPAN' && value === 'true') {
      element.setAttribute(name, 'true');
    } else if (name === 'data-summary-page-break' && element.tagName === 'DIV' && value === 'true') {
      element.setAttribute(name, 'true');
    } else if (PAGE_SETTINGS_ATTRIBUTES.has(name) && element.tagName === 'DIV' && element.classList.contains('summary-study-page')) {
      const number = Number(value);
      const valid = name === 'data-summary-page-size'
        ? Object.hasOwn(PAGE_SIZE_MM, value)
        : name === 'data-summary-page-orientation'
          ? ['portrait', 'landscape'].includes(value)
          : name === 'data-summary-page-columns'
            ? Number.isInteger(number) && number >= 1 && number <= 3
                : name === 'data-summary-page-gutter'
                  ? Number.isInteger(number) && number >= 0 && number <= 50
                  : Number.isInteger(number) && number >= 5 && number <= 50;
      if (valid) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (CITATION_DATA_ATTRIBUTES.has(name) && element.tagName === 'SPAN' && element.classList.contains('summary-study-citation')) {
      if (name === 'data-summary-citation-style') {
        if (Object.hasOwn(CITATION_FORMATS, value)) element.setAttribute(name, value);
        else element.removeAttribute(name);
      } else if (name === 'data-summary-url') {
        const url = safeRichTextUrl(value);
        if (url && /^https?:/i.test(url)) element.setAttribute(name, url);
        else element.removeAttribute(name);
      } else if (value && value.length <= 240) {
        element.setAttribute(name, value);
      } else {
        element.removeAttribute(name);
      }
    } else if (name === 'data-summary-index-entry' && element.tagName === 'SPAN' && element.classList.contains('summary-study-index-entry')) {
      if (value && value.length <= 160) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-authority' && element.tagName === 'SPAN' && element.classList.contains('summary-study-authority-entry')) {
      if (value && value.length <= 240) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (name === 'data-summary-bookmark-label' && element.tagName === 'SPAN' && element.classList.contains('summary-study-bookmark')) {
      if (value && value.length <= 120) element.setAttribute(name, value);
      else element.removeAttribute(name);
    } else if (PARAGRAPH_DATA_ATTRIBUTES.has(name) && PARAGRAPH_TAGS.has(element.tagName)) {
      if (name === 'data-summary-tabs') {
        const positions = value.split(',').map(position => Number(position.trim()));
        if (positions.length <= 10 && positions.every(position => Number.isFinite(position) && position > 0 && position <= 500)) {
          element.setAttribute(name, [...new Set(positions)].sort((a, b) => a - b).join(','));
        } else {
          element.removeAttribute(name);
        }
      } else if (name === 'data-summary-outline-level') {
        if (/^[0-9]$/.test(value)) element.setAttribute(name, value);
        else element.removeAttribute(name);
      } else if (name === 'data-summary-line-spacing-mode') {
        if (['single', 'one-half', 'double', 'multiple', 'exactly', 'at-least'].includes(value)) {
          element.setAttribute(name, value);
        } else {
          element.removeAttribute(name);
        }
      } else if (name === 'data-summary-line-spacing-value') {
        const amount = Number(value);
        if (Number.isFinite(amount) && amount >= 0.5 && amount <= 500) element.setAttribute(name, String(amount));
        else element.removeAttribute(name);
      } else if (name === 'data-summary-widow-control') {
        if (value === 'true' || value === 'false') element.setAttribute(name, value);
        else element.removeAttribute(name);
      } else if (value === 'true') {
        element.setAttribute(name, 'true');
      } else {
        element.removeAttribute(name);
      }
    } else if (name === 'contenteditable' && element.tagName === 'DIV' && element.dataset.summaryPageBreak === 'true' && value === 'false') {
      element.setAttribute(name, 'false');
    } else if (name === 'width' || name === 'height') {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 1 || number > 2400) element.removeAttribute(name);
    } else {
      element.removeAttribute(name);
    }
  }

  if (equationModel) {
    element.setAttribute('role', 'math');
    element.setAttribute('aria-label', summaryEquationAccessibleText(equationModel.nodes).slice(0, 500));
  }
  if (element.tagName === 'A' && element.hasAttribute('href')) {
    if (element.getAttribute('href').startsWith('#')) {
      element.removeAttribute('target');
      element.removeAttribute('rel');
    } else {
      element.setAttribute('target', '_blank');
      element.setAttribute('rel', 'noopener noreferrer');
    }
  }
  for (const child of [...element.children]) sanitizeElement(child);
}

export function sanitizeRichTextHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  for (const child of [...template.content.children]) sanitizeElement(child);
  normalizeSummaryPageContainer(template.content);
  return template.innerHTML;
}

function normalizeSummaryPageContainer(root) {
  let page = [...root.children].find(child => child.matches('div.summary-study-page'));
  if (!page) {
    page = document.createElement('div');
    page.className = 'summary-study-page';
    root.append(page);
    while (page.previousSibling) page.append(page.previousSibling);
  }
  const size = Object.hasOwn(PAGE_SIZE_MM, page.dataset.summaryPageSize)
    ? page.dataset.summaryPageSize
    : 'A4';
  const orientation = page.dataset.summaryPageOrientation === 'landscape' ? 'landscape' : 'portrait';
  const margins = ['top', 'right', 'bottom', 'left'].map(side => {
    const value = Number(page.dataset[`summaryPageMargin${side[0].toUpperCase()}${side.slice(1)}`]);
    return Number.isInteger(value) && value >= 5 && value <= 50 ? value : 18;
  });
  const gutter = Number(page.dataset.summaryPageGutter);
  const pageGutter = Number.isInteger(gutter) && gutter >= 0 && gutter <= 50 ? gutter : 0;
  const columns = Math.min(3, Math.max(1, Number(page.dataset.summaryPageColumns) || 1));
  const columnGap = Number(page.dataset.summaryPageColumnGap);
  const dimensions = PAGE_SIZE_MM[size];
  const pageWidth = orientation === 'landscape' ? dimensions.height : dimensions.width;
  const pageHeight = orientation === 'landscape' ? dimensions.width : dimensions.height;
  [
    ['data-summary-page-size', size],
    ['data-summary-page-orientation', orientation],
    ...margins.map((value, index) => [`data-summary-page-margin-${['top', 'right', 'bottom', 'left'][index]}`, String(value)]),
    ['data-summary-page-gutter', String(pageGutter)],
    ['data-summary-page-columns', String(columns)],
    ['data-summary-page-column-gap', String(Number.isInteger(columnGap) && columnGap >= 5 && columnGap <= 50 ? columnGap : 10)]
  ].forEach(([name, value]) => page.setAttribute(name, value));
  page.style.width = `${Math.round(pageWidth * 96 / 25.4)}px`;
  page.style.maxWidth = '100%';
  page.style.minHeight = `${Math.round(pageHeight * 96 / 25.4)}px`;
  page.style.padding = `${margins[0]}mm ${margins[1]}mm ${margins[2]}mm ${margins[3] + pageGutter}mm`;
  page.style.columnCount = String(columns);
  page.style.columnGap = `${Number.isInteger(columnGap) && columnGap >= 5 && columnGap <= 50 ? columnGap : 10}mm`;
  page.removeAttribute('data-mce-style');
  return page;
}

function applySummaryPageSettings(editor, settings) {
  const page = normalizeSummaryPageContainer(editor.getBody());
  Object.entries(settings).forEach(([name, value]) => page.setAttribute(name, String(value)));
  normalizeSummaryPageContainer(editor.getBody());
}

function figureCaptionDescription(caption) {
  return String(caption || '').replace(/^\s*Hình\s+\d+\.\s*/i, '').trim();
}

function normalizeFigureCaptions(root) {
  root.querySelectorAll('figure.summary-study-figure, figure.summary-study-chart, figure.summary-study-diagram').forEach((figure, index) => {
    figure.id = `summary-study-figure-${index + 1}`;
    let caption = figure.querySelector(':scope > figcaption');
    if (!caption) {
      caption = document.createElement('figcaption');
      figure.append(caption);
    }
    const description = figureCaptionDescription(caption.textContent);
    caption.textContent = `Hình ${index + 1}.${description ? ` ${description}` : ''}`;
  });
}

function getSummaryReferenceTargets(root) {
  const headings = [...root.querySelectorAll('h1, h2, h3')]
    .filter(heading => !heading.closest('.summary-study-toc, .summary-study-figure-list, .summary-study-table-list, .summary-study-bibliography, .summary-study-index, .summary-study-authorities'));
  headings.forEach((heading, index) => {
    heading.id = `summary-study-heading-${index + 1}`;
  });
  const figures = [...root.querySelectorAll('figure.summary-study-figure, figure.summary-study-chart, figure.summary-study-diagram')];
  normalizeFigureCaptions(root);
  const tables = [...root.querySelectorAll('table')];
  tables.forEach((table, index) => {
    table.id = `summary-study-table-${index + 1}`;
  });

  return [
    ...headings.map(heading => ({
      id: heading.id,
      type: 'heading',
      label: `Mục: ${heading.textContent.trim() || 'Tiêu đề chưa đặt tên'}`
    })),
    ...figures.map(figure => ({
      id: figure.id,
      type: 'figure',
      label: figure.querySelector(':scope > figcaption')?.textContent.trim() || 'Hình'
    })),
    ...tables.map((table, index) => {
      const caption = table.querySelector(':scope > caption')?.textContent.trim();
      return {
        id: table.id,
        type: 'table',
        label: `Bảng ${index + 1}.${caption ? ` ${caption}` : ''}`
      };
    }),
    ...[...root.querySelectorAll('span.summary-study-bookmark[id]')].map(bookmark => ({
      id: bookmark.id,
      type: 'bookmark',
      label: `Dấu trang: ${bookmark.dataset.summaryBookmarkLabel || bookmark.textContent.trim() || bookmark.id}`
    }))
  ];
}

function updateSummaryObjectList(editor, kind) {
  const isFigureList = kind === 'figure';
  const body = editor.getBody();
  const listClass = isFigureList ? 'summary-study-figure-list' : 'summary-study-table-list';
  const title = isFigureList ? 'Danh sách hình' : 'Danh sách bảng';
  const targets = getSummaryReferenceTargets(body)
    .filter(target => target.type === kind);

  if (!targets.length) {
    editor.notificationManager.open({
      text: isFigureList
        ? 'Hãy thêm hình và chú thích hình trước khi tạo danh sách hình.'
        : 'Hãy thêm ít nhất một bảng trước khi tạo danh sách bảng.',
      type: 'info',
      timeout: 3500
    });
    return;
  }

  const contents = `<h2>${title}</h2><ol>${targets.map(target => (
    `<li><a href="#${editor.dom.encode(target.id)}">${editor.dom.encode(target.label)}</a></li>`
  )).join('')}</ol>`;
  const existing = body.querySelector(`.${listClass}`);
  if (existing) {
    editor.undoManager.transact(() => editor.dom.setHTML(existing, contents));
  } else {
    const list = editor.getDoc().createElement('nav');
    list.className = listClass;
    list.innerHTML = contents;
    editor.undoManager.transact(() => {
      const otherList = body.querySelector(isFigureList ? '.summary-study-table-list' : '.summary-study-figure-list');
      if (otherList) {
        if (isFigureList) otherList.parentNode.insertBefore(list, otherList);
        else editor.dom.insertAfter(list, otherList);
      } else {
        body.insertBefore(list, body.firstChild);
      }
    });
  }
  editor.nodeChanged();
  editor.fire('change');
}

function setSelectedSummaryShapeAlignment(editor, alignment, selectedShape = null) {
  if (!SUMMARY_SHAPE_ALIGNMENTS.has(alignment)) {
    editor.notificationManager.open({ text: 'Căn chỉnh hình dạng không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  if (!shape) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi căn chỉnh.', type: 'info', timeout: 3000 });
    return;
  }
  editor.undoManager.transact(() => shape.setAttribute('data-summary-shape-align', alignment));
  editor.nodeChanged();
  editor.fire('change');
}

function normalizeSummaryReferences(root) {
  const targets = getSummaryReferenceTargets(root);
  const targetsById = new Map(targets.map(target => [target.id, target]));
  root.querySelectorAll('a.summary-study-cross-reference').forEach(reference => {
    const target = targetsById.get(reference.getAttribute('href')?.slice(1));
    if (!target || reference.dataset.summaryReference !== target.type) {
      reference.replaceWith(...reference.childNodes);
      return;
    }
    reference.textContent = target.label;
  });
}

function insertSummaryCrossReference(editor) {
  const targets = getSummaryReferenceTargets(editor.getBody());
  if (!targets.length) {
    editor.notificationManager.open({ text: 'Hãy thêm ít nhất một tiêu đề, hình có chú thích hoặc bảng trước.', type: 'info', timeout: 3500 });
    return;
  }

  editor.windowManager.open({
    title: 'Chèn tham chiếu chéo',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'targetId',
        label: 'Chọn tiêu đề, hình hoặc bảng',
        items: targets.map(target => ({ text: target.label, value: target.id }))
      }]
    },
    initialData: { targetId: targets[0].id },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn tham chiếu', primary: true }
    ],
    onSubmit(api) {
      const target = targets.find(item => item.id === api.getData().targetId);
      if (!target) {
        editor.notificationManager.open({ text: 'Không tìm thấy đích tham chiếu đã chọn. Hãy mở lại hộp thoại và chọn mục khác.', type: 'error', timeout: 4000 });
        api.close();
        return;
      }
      editor.undoManager.transact(() => {
        editor.insertContent(`<a class="summary-study-cross-reference" data-summary-reference="${target.type}" href="#${editor.dom.encode(target.id)}">${editor.dom.encode(target.label)}</a>`);
      });
      editor.nodeChanged();
      api.close();
    }
  });
}

function citationData(element) {
  return Object.fromEntries(CITATION_FIELDS.map(field => [
    field,
    String(element.getAttribute(`data-summary-${field}`) || '').trim()
  ]));
}

function citationKey(source) {
  return JSON.stringify(CITATION_FIELDS.map(field => source[field].toLocaleLowerCase()));
}

function citationLabel(source, style) {
  const author = source.author || source.title;
  if (style === 'MLA') return `(${author})`;
  return `(${author}, ${source.year})`;
}

function uniqueCitationSources(root) {
  const sources = new Map();
  root.querySelectorAll('span.summary-study-citation').forEach(citation => {
    const source = citationData(citation);
    if (!source.author || !source.title || !source.year) return;
    const key = citationKey(source);
    if (!sources.has(key)) sources.set(key, source);
  });
  return [...sources.values()].sort((left, right) => (
    left.author.localeCompare(right.author, 'vi') || left.year.localeCompare(right.year)
  ));
}

function formatCitationEntry(source, style) {
  const author = source.author.replace(/[.,;:\s]+$/, '');
  const title = `<i>${editorEncode(source.title)}</i>`;
  const year = editorEncode(source.year);
  const publisher = editorEncode(source.publisher);
  const url = source.url
    ? ` <a href="${editorEncode(source.url)}">${editorEncode(source.url)}</a>`
    : '';
  if (style === 'MLA') return `${editorEncode(author)}. ${title}. ${publisher ? `${publisher}, ` : ''}${year}.${url}`;
  if (style === 'Chicago') return `${editorEncode(author)}. ${year}. ${title}.${publisher ? ` ${publisher}.` : ''}${url}`;
  return `${editorEncode(author)}. (${year}). ${title}.${publisher ? ` ${publisher}.` : ''}${url}`;
}

function editorEncode(value) {
  const element = document.createElement('div');
  element.textContent = String(value || '');
  return element.innerHTML;
}

function refreshSummaryBibliography(root) {
  const bibliography = root.querySelector('.summary-study-bibliography');
  if (!bibliography) return;
  const sources = uniqueCitationSources(root);
  if (!sources.length) {
    bibliography.remove();
    return;
  }
  const style = Object.hasOwn(CITATION_FORMATS, bibliography.dataset.summaryCitationStyle)
    ? bibliography.dataset.summaryCitationStyle
    : (root.querySelector('.summary-study-citation')?.dataset.summaryCitationStyle || 'APA');
  root.querySelectorAll('.summary-study-citation').forEach(citation => {
    citation.dataset.summaryCitationStyle = style;
    citation.textContent = citationLabel(citationData(citation), style);
  });
  bibliography.dataset.summaryCitationStyle = style;
  bibliography.innerHTML = `<h2>Tài liệu tham khảo (${CITATION_FORMATS[style]})</h2><ol>${sources
    .map(source => `<li>${formatCitationEntry(source, style)}</li>`).join('')}</ol>`;
}

function insertSummaryCitation(editor) {
  editor.windowManager.open({
    title: 'Thêm trích dẫn và nguồn',
    size: 'medium',
    body: {
      type: 'panel',
      items: [
        { type: 'input', name: 'author', label: 'Tác giả / tổ chức' },
        { type: 'input', name: 'title', label: 'Tên tài liệu' },
        { type: 'input', name: 'year', label: 'Năm xuất bản' },
        { type: 'input', name: 'publisher', label: 'Tạp chí / nhà xuất bản' },
        { type: 'input', name: 'url', label: 'URL (không bắt buộc)' },
        {
          type: 'selectbox',
          name: 'style',
          label: 'Chuẩn trích dẫn',
          items: Object.entries(CITATION_FORMATS).map(([value, text]) => ({ text, value }))
        }
      ]
    },
    initialData: { author: '', title: '', year: '', publisher: '', url: '', style: 'APA' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn trích dẫn', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      const source = Object.fromEntries(CITATION_FIELDS.map(field => [
        field,
        String(data[field] || '').trim()
      ]));
      const url = source.url ? safeRichTextUrl(source.url) : '';
      if (!source.author || !source.title || !source.year || source.author.length > 240
        || source.title.length > 240 || source.year.length > 12 || source.publisher.length > 240
        || (source.url && (!url || !/^https?:/i.test(url)))
        || !Object.hasOwn(CITATION_FORMATS, data.style)) {
        editor.notificationManager.open({
          text: 'Nhập tác giả, tên tài liệu, năm hợp lệ; URL nếu có phải bắt đầu bằng HTTP(S).',
          type: 'error',
          timeout: 4500
        });
        return;
      }
      source.url = url;
      const marker = editor.getDoc().createElement('span');
      marker.className = 'summary-study-citation';
      marker.dataset.summaryCitationStyle = data.style;
      CITATION_FIELDS.forEach(field => marker.setAttribute(`data-summary-${field}`, source[field]));
      marker.textContent = citationLabel(source, data.style);
      editor.undoManager.transact(() => editor.selection.setContent(marker.outerHTML));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function insertSummaryBibliography(editor) {
  const sources = uniqueCitationSources(editor.getBody());
  if (!sources.length) {
    editor.notificationManager.open({ text: 'Hãy chèn ít nhất một trích dẫn có thông tin nguồn trước.', type: 'info', timeout: 3500 });
    return;
  }
  const existing = editor.getBody().querySelector('.summary-study-bibliography');
  const defaultStyle = existing?.dataset.summaryCitationStyle
    || editor.getBody().querySelector('.summary-study-citation')?.dataset.summaryCitationStyle
    || 'APA';
  editor.windowManager.open({
    title: 'Tạo tài liệu tham khảo',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'style',
        label: 'Chuẩn định dạng nguồn',
        items: Object.entries(CITATION_FORMATS).map(([value, text]) => ({ text, value }))
      }]
    },
    initialData: { style: defaultStyle },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Tạo / cập nhật', primary: true }
    ],
    onSubmit(api) {
      const style = api.getData().style;
      if (!Object.hasOwn(CITATION_FORMATS, style)) {
        editor.notificationManager.open({ text: 'Chuẩn trích dẫn không hợp lệ.', type: 'error', timeout: 3500 });
        return;
      }
      const bibliography = existing || editor.getDoc().createElement('section');
      bibliography.className = 'summary-study-bibliography';
      bibliography.dataset.summaryCitationStyle = style;
      if (!bibliography.isConnected) editor.getBody().append(bibliography);
      editor.undoManager.transact(() => refreshSummaryBibliography(editor.getBody()));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function insertSummaryIndexEntry(editor, kind) {
  const selectedText = editor.selection.getContent({ format: 'text' }).trim();
  const selectedHtml = editor.selection.getContent({ format: 'html' });
  if (!selectedText || /<(?:p|div|section|table|ul|ol)\b/i.test(selectedHtml)) {
    editor.notificationManager.open({ text: 'Chọn một cụm từ trong cùng đoạn văn để đánh dấu.', type: 'info', timeout: 3500 });
    return;
  }
  const bookmark = editor.selection.getBookmark(2, true);
  const authority = kind === 'authority';
  editor.windowManager.open({
    title: authority ? 'Đánh dấu căn cứ pháp lý' : 'Đánh dấu mục chỉ mục',
    body: {
      type: 'panel',
      items: [{ type: 'input', name: 'entry', label: authority ? 'Tên vụ việc / căn cứ' : 'Mục chỉ mục' }]
    },
    initialData: { entry: selectedText },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Đánh dấu', primary: true }
    ],
    onSubmit(api) {
      const entry = String(api.getData().entry || '').trim();
      if (!entry || entry.length > (authority ? 240 : 160)) {
        editor.notificationManager.open({ text: 'Nội dung mục đánh dấu quá dài hoặc đang để trống.', type: 'error', timeout: 3500 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      if (editor.selection.isCollapsed()) {
        editor.notificationManager.open({ text: 'Không thể khôi phục vùng chọn. Hãy chọn cụm từ lại.', type: 'error', timeout: 4000 });
        return;
      }
      const html = editor.selection.getContent({ format: 'html' });
      const marker = authority
        ? `<span class="summary-study-authority-entry" data-summary-authority="${editorEncode(entry)}">${html}</span>`
        : `<span class="summary-study-index-entry" data-summary-index-entry="${editorEncode(entry)}">${html}</span>`;
      editor.undoManager.transact(() => editor.selection.setContent(marker));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function refreshSummaryIndex(root, kind) {
  const authority = kind === 'authority';
  const className = authority ? 'summary-study-authorities' : 'summary-study-index';
  const attribute = authority ? 'data-summary-authority' : 'data-summary-index-entry';
  const markerClass = authority ? 'summary-study-authority-entry' : 'summary-study-index-entry';
  const section = root.querySelector(`.${className}`);
  if (!section) return;
  const entries = new Map();
  [...root.querySelectorAll(`span.${markerClass}`)].forEach((marker, index) => {
    const label = String(marker.getAttribute(attribute) || '').trim();
    if (!label) return;
    const id = `summary-study-${authority ? 'authority' : 'index'}-entry-${index + 1}`;
    marker.id = id;
    const key = label.toLocaleLowerCase();
    if (!entries.has(key)) entries.set(key, { label, targets: [] });
    entries.get(key).targets.push(id);
  });
  if (!entries.size) {
    section.remove();
    return;
  }
  const title = authority ? 'Bảng căn cứ pháp lý' : 'Chỉ mục';
  const contents = [...entries.values()]
    .sort((left, right) => left.label.localeCompare(right.label, 'vi'))
    .map(entry => `<li>${editorEncode(entry.label)} — ${entry.targets.map((id, index) => (
      `<a href="#${id}" aria-label="Đi đến lần xuất hiện ${index + 1}">${index + 1}</a>`
    )).join(', ')}</li>`)
    .join('');
  section.innerHTML = `<h2>${title}</h2><ol>${contents}</ol>`;
}

function insertSummaryIndex(editor, kind) {
  const authority = kind === 'authority';
  const markerClass = authority ? '.summary-study-authority-entry' : '.summary-study-index-entry';
  if (!editor.getBody().querySelector(markerClass)) {
    editor.notificationManager.open({
      text: authority ? 'Hãy đánh dấu ít nhất một trích dẫn pháp lý trước.' : 'Hãy đánh dấu ít nhất một mục chỉ mục trước.',
      type: 'info',
      timeout: 3500
    });
    return;
  }
  const section = editor.getBody().querySelector(authority ? '.summary-study-authorities' : '.summary-study-index')
    || editor.getDoc().createElement('section');
  section.className = authority ? 'summary-study-authorities' : 'summary-study-index';
  if (!section.isConnected) editor.getBody().append(section);
  refreshSummaryIndex(editor.getBody(), kind);
  editor.nodeChanged();
  editor.fire('change');
}

function normalizeSummaryReferencesDocument(root) {
  refreshSummaryBibliography(root);
  refreshSummaryIndex(root, 'index');
  refreshSummaryIndex(root, 'authority');
}

function normalizeSummaryNotes(root) {
  for (const kind of ['footnote', 'endnote']) {
    const noteSelector = kind === 'footnote' ? '.summary-study-footnote' : '.summary-study-endnote';
    const markerSelector = `a.summary-study-${kind}-ref`;
    const notes = new Map([...root.querySelectorAll(noteSelector)].map(note => [note.id, note]));
    const markers = [...root.querySelectorAll(markerSelector)];
    const retainedNotes = new Set();

    let number = 0;
    markers.forEach(marker => {
      const note = notes.get(marker.getAttribute('href')?.slice(1));
      if (!note) {
        marker.closest('sup')?.remove();
        return;
      }
      if (retainedNotes.has(note)) {
        marker.closest('sup')?.remove();
        return;
      }
      number += 1;
      const noteId = `summary-study-${kind}-${number}`;
      const markerId = `summary-study-${kind}-ref-${number}`;
      note.id = noteId;
      marker.id = markerId;
      marker.href = `#${noteId}`;
      marker.textContent = String(number);
      const backlink = note.querySelector(`a.summary-study-${kind}-backref`);
      if (backlink) {
        backlink.href = `#${markerId}`;
        backlink.textContent = `${number}.`;
      }
      retainedNotes.add(note);
    });

    for (const note of notes.values()) {
      if (!retainedNotes.has(note)) note.remove();
    }
  }

  const endnotes = root.querySelector('#summary-study-endnotes');
  if (endnotes && !endnotes.querySelector('.summary-study-endnote')) endnotes.remove();
}

function insertSummaryNote(editor, kind, noteText) {
  const normalizedText = String(noteText || '').trim();
  if (!normalizedText) {
    editor.notificationManager.open({ text: 'Nhập nội dung chú thích trước khi chèn.', type: 'info', timeout: 3000 });
    return;
  }

  const body = editor.getBody();
  normalizeSummaryNotes(body);
  const noteSelector = kind === 'footnote' ? '.summary-study-footnote' : '.summary-study-endnote';
  const number = body.querySelectorAll(noteSelector).length + 1;
  const noteId = `summary-study-${kind}-${number}`;
  const markerId = `summary-study-${kind}-ref-${number}`;
  const doc = editor.getDoc();
  const markerBlock = editor.dom.getParent(editor.selection.getNode(), 'p, li, blockquote, h1, h2, h3, h4, h5, h6');

  editor.undoManager.transact(() => {
    editor.insertContent(`<sup><a class="summary-study-${kind}-ref" id="${markerId}" href="#${noteId}">${number}</a></sup>`);
    if (kind === 'footnote') {
      const note = doc.createElement('div');
      note.className = 'summary-study-footnote';
      note.id = noteId;
      const backlink = doc.createElement('a');
      backlink.className = 'summary-study-footnote-backref';
      backlink.href = `#${markerId}`;
      backlink.textContent = `${number}.`;
      const text = doc.createElement('span');
      text.textContent = ` ${normalizedText}`;
      note.append(backlink, text);
      const currentBlock = editor.dom.getParent(editor.selection.getNode(), 'p, li, blockquote, h1, h2, h3, h4, h5, h6') || markerBlock;
      if (currentBlock?.parentNode) editor.dom.insertAfter(note, currentBlock);
      else body.append(note);
    } else {
      let section = body.querySelector('#summary-study-endnotes');
      if (!section) {
        section = doc.createElement('section');
        section.id = 'summary-study-endnotes';
        section.className = 'summary-study-endnotes';
        const heading = doc.createElement('h2');
        heading.textContent = 'Chú thích cuối tài liệu';
        const list = doc.createElement('ol');
        section.append(heading, list);
        body.append(section);
      }
      const item = doc.createElement('li');
      item.className = 'summary-study-endnote';
      item.id = noteId;
      const backlink = doc.createElement('a');
      backlink.className = 'summary-study-endnote-backref';
      backlink.href = `#${markerId}`;
      backlink.textContent = `${number}.`;
      item.append(backlink, doc.createTextNode(` ${normalizedText}`));
      section.querySelector('ol').append(item);
    }
  });

  editor.selection.collapse(false);
  editor.nodeChanged();
  editor.fire('change');
}

function openSummaryNoteDialog(editor, kind) {
  const isFootnote = kind === 'footnote';
  editor.windowManager.open({
    title: isFootnote ? 'Chèn chú thích cuối trang' : 'Chèn chú thích cuối tài liệu',
    body: {
      type: 'panel',
      items: [{ type: 'textarea', name: 'noteText', label: 'Nội dung chú thích' }]
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn chú thích', primary: true }
    ],
    initialData: { noteText: '' },
    onSubmit(api) {
      insertSummaryNote(editor, kind, api.getData().noteText);
      api.close();
    }
  });
}

function makeSummaryTableOfContents(editor) {
  const body = editor.getBody();
  const headings = [...body.querySelectorAll('h1, h2, h3')]
    .filter(heading => !heading.closest('.summary-study-toc, .summary-study-figure-list, .summary-study-table-list, .summary-study-bibliography, .summary-study-index, .summary-study-authorities'));
  if (!headings.length) {
    editor.notificationManager.open({ text: 'Hãy thêm tiêu đề Heading 1–3 trước khi tạo mục lục.', type: 'info', timeout: 3000 });
    return;
  }
  const tocContents = () => {
    const items = headings.map((heading, index) => {
      const id = `summary-study-heading-${index + 1}`;
      heading.id = id;
      const level = Number(heading.tagName.slice(1));
      return `<li class="summary-study-toc-level-${level}"><a href="#${id}">${editor.dom.encode(heading.textContent.trim()) || `Mục ${index + 1}`}</a></li>`;
    });
    return `<h2>Mục lục</h2><ol>${items.join('')}</ol>`;
  };
  const existing = body.querySelector('.summary-study-toc');
  if (existing) {
    editor.undoManager.transact(() => editor.dom.setHTML(existing, tocContents()));
    editor.fire('change');
  } else {
    const contents = tocContents();
    editor.insertContent(`<nav class="summary-study-toc">${contents}</nav>`);
  }
}

function makeSummaryObjectList(editor, kind) {
  updateSummaryObjectList(editor, kind);
}

function addFigureCaption(editor) {
  const selected = editor.selection.getNode();
  const image = selected?.nodeName === 'IMG' ? selected : selected?.closest?.('img');
  const existingFigure = image?.closest('figure') || selected?.closest?.('figure');
  if (!image && !existingFigure) {
    editor.notificationManager.open({ text: 'Hãy chọn một hình ảnh trước khi thêm chú thích.', type: 'info', timeout: 3000 });
    return;
  }

  const existingCaption = existingFigure?.querySelector(':scope > figcaption');
  const initialCaption = figureCaptionDescription(existingCaption?.textContent || '');
  editor.windowManager.open({
    title: 'Chú thích hình',
    body: {
      type: 'panel',
      items: [{ type: 'input', name: 'caption', label: 'Nội dung chú thích' }]
    },
    initialData: { caption: initialCaption },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Lưu chú thích', primary: true }
    ],
    onSubmit(api) {
      let figure = existingFigure;
      if (!figure) {
        figure = document.createElement('figure');
        if (image.parentNode?.nodeName === 'P') {
          const paragraph = image.parentNode;
          paragraph.parentNode.insertBefore(figure, paragraph);
          image.remove();
          if (!paragraph.textContent.trim() && !paragraph.querySelector('img')) paragraph.remove();
        } else {
          image.parentNode.insertBefore(figure, image);
          image.remove();
        }
        figure.append(image);
      }
      figure.classList.add('summary-study-figure');
      let caption = figure.querySelector(':scope > figcaption');
      if (!caption) {
        caption = document.createElement('figcaption');
        figure.append(caption);
      }
      caption.textContent = api.getData().caption.trim();
      normalizeFigureCaptions(editor.getBody());
      editor.undoManager.add();
      editor.fire('change');
      api.close();
    }
  });
}

function setSelectedImageLayout(editor, layout) {
  if (!['inline', 'center', 'float-left', 'float-right'].includes(layout)) {
    editor.notificationManager.open({ text: 'Bố cục hình ảnh đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  const selected = editor.selection.getNode();
  const image = selected?.nodeName === 'IMG' ? selected : selected?.closest?.('img');
  const target = image?.closest('figure') || image;
  if (!target) {
    editor.notificationManager.open({ text: 'Chọn một hình ảnh trước khi đổi bố cục.', type: 'info', timeout: 3000 });
    return;
  }

  const layoutClasses = [
    'summary-study-image-layout--inline',
    'summary-study-image-layout--center',
    'summary-study-image-layout--float-left',
    'summary-study-image-layout--float-right'
  ];
  editor.undoManager.transact(() => {
    target.classList.remove(...layoutClasses);
    target.classList.add(`summary-study-image-layout--${layout}`);
  });
  editor.nodeChanged();
  editor.fire('change');
}

function selectedSummaryImage(editor) {
  const node = editor.selection.getNode();
  const image = node?.nodeName === 'IMG' ? node : node?.closest?.('img');
  return image && !image.closest('figure.summary-study-diagram') && editor.getBody().contains(image) ? image : null;
}

function selectedSummaryChart(editor) {
  const node = editor.selection.getNode();
  const chart = node?.closest?.('figure.summary-study-chart');
  return chart && editor.getBody().contains(chart) ? chart : null;
}

function selectedSummaryShape(editor) {
  const node = editor.selection.getNode();
  const shape = node?.closest?.('figure.summary-study-shape');
  return shape && editor.getBody().contains(shape) ? shape : null;
}

function summaryChartData(figure) {
  try {
    const data = JSON.parse(figure?.getAttribute('data-summary-chart-data') || '[]');
    if (!Array.isArray(data) || data.length < 2 || data.length > 12) return [];
    return data.filter(item => item && typeof item.label === 'string'
      && Number.isFinite(item.value) && item.value >= 0 && item.value <= 1_000_000_000)
      .map(item => ({ label: item.label.slice(0, 40), value: item.value }));
  } catch {
    return [];
  }
}

function parseSummaryChartData(value) {
  const rows = parseDelimitedRows(value, ',');
  const dataRows = rows[0]?.[0]?.trim().toLowerCase() === 'label'
    && rows[0]?.[1]?.trim().toLowerCase() === 'value'
    ? rows.slice(1)
    : rows;
  return normalizeSummaryChartRows(dataRows);
}

function normalizeSummaryChartRows(dataRows) {
  if (dataRows.length < 2 || dataRows.length > 12) {
    throw new Error('Biểu đồ cần từ 2 đến 12 dòng dữ liệu.');
  }
  const data = dataRows.map(row => {
    const [label, rawValue, ...extra] = Array.isArray(row)
      ? row
      : [row?.label, row?.value];
    const name = String(label ?? '').trim();
    const rawNumber = String(rawValue ?? '').trim();
    const number = Number(rawNumber);
    if (!name || name.length > 40 || extra.some(item => String(item ?? '').trim())
      || !rawNumber || !Number.isFinite(number) || number < 0 || number > 1_000_000_000) {
      throw new Error('Mỗi dòng cần nhãn tối đa 40 ký tự và một giá trị số từ 0 đến 1.000.000.000.');
    }
    return { label: name, value: number };
  });
  if (data.every(item => item.value === 0)) throw new Error('Ít nhất một giá trị biểu đồ phải lớn hơn 0.');
  return data;
}

function drawSummaryChart(data, type, palette) {
  if (!SUMMARY_CHART_TYPES.has(type) || !Object.hasOwn(SUMMARY_CHART_PALETTES, palette)) {
    throw new Error('Loại hoặc bảng màu biểu đồ không hợp lệ.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể tạo biểu đồ trong trình duyệt.');
  const color = SUMMARY_CHART_PALETTES[palette];
  const labels = data.map(item => item.label);
  const max = Math.max(...data.map(item => item.value));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = '20px Arial, sans-serif';
  context.fillStyle = '#475569';
  context.strokeStyle = '#dbe3ea';
  context.lineWidth = 1;

  if (type === 'bar') {
    const left = 230;
    const top = 36;
    const rowHeight = 38;
    const chartHeight = Math.max(360, data.length * rowHeight);
    canvas.height = Math.min(540, chartHeight + top * 2);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '20px Arial, sans-serif';
    data.forEach((item, index) => {
      const y = top + index * rowHeight + 6;
      context.fillStyle = '#475569';
      context.textAlign = 'right';
      context.fillText(item.label, left - 16, y + 17, left - 24);
      context.fillStyle = color;
      context.fillRect(left, y, Math.max(2, (canvas.width - left - 90) * item.value / max), 24);
      context.fillStyle = '#334155';
      context.textAlign = 'left';
      context.fillText(String(item.value), left + (canvas.width - left - 90) * item.value / max + 12, y + 19, 76);
    });
    return canvas;
  }

  if (type === 'pie') {
    const series = {
      teal: ['#168c71', '#22a982', '#43b88d', '#70c79e', '#9bd6ae', '#187f8d', '#269caf', '#56b5c5', '#80cbd4', '#4d996f', '#7bb485', '#b8d9bd'],
      blue: ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af', '#4f46e5', '#6366f1', '#818cf8', '#0e7490', '#0891b2', '#67e8f9'],
      orange: ['#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#b45309', '#d97706', '#eab308', '#facc15', '#be123c', '#e11d48', '#fb7185']
    }[palette];
    const total = data.reduce((sum, item) => sum + item.value, 0);
    const centerX = 270;
    const centerY = 270;
    const radius = 190;
    let angle = -Math.PI / 2;
    context.font = '18px Arial, sans-serif';
    data.forEach((item, index) => {
      const slice = Math.PI * 2 * item.value / total;
      if (slice > 0) {
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.arc(centerX, centerY, radius, angle, angle + slice);
        context.closePath();
        context.fillStyle = series[index % series.length];
        context.fill();
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3;
        context.stroke();
      }
      angle += slice;

      const legendY = 91 + index * 34;
      context.fillStyle = series[index % series.length];
      context.fillRect(530, legendY - 14, 18, 18);
      context.fillStyle = '#334155';
      context.textAlign = 'left';
      context.fillText(`${item.label} · ${item.value} (${(item.value / total * 100).toFixed(1)}%)`, 562, legendY, 360);
    });
    return canvas;
  }

  const left = 76;
  const right = 28;
  const top = 30;
  const bottom = 106;
  const width = canvas.width - left - right;
  const height = canvas.height - top - bottom;
  for (let tick = 0; tick <= 4; tick += 1) {
    const y = top + height * tick / 4;
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(canvas.width - right, y);
    context.stroke();
    context.textAlign = 'right';
    context.fillStyle = '#64748b';
    context.fillText(String(Math.round(max * (4 - tick) / 4)), left - 12, y + 7);
  }
  const slot = width / data.length;
  data.forEach((item, index) => {
    const x = left + slot * (index + 0.5);
    const y = top + height * (1 - item.value / max);
    if (type === 'column') {
      context.fillStyle = color;
      context.fillRect(x - slot * 0.28, y, slot * 0.56, top + height - y);
    } else {
      if (index) {
        const previousX = left + slot * (index - 0.5);
        const previousY = top + height * (1 - data[index - 1].value / max);
        context.beginPath();
        context.moveTo(previousX, previousY);
        context.lineTo(x, y);
        context.strokeStyle = color;
        context.lineWidth = 5;
        context.stroke();
      }
      context.beginPath();
      context.arc(x, y, 8, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
    }
    context.textAlign = 'center';
    context.fillStyle = '#334155';
    context.fillText(String(item.value), x, Math.max(top + 20, y - 12), Math.max(40, slot - 4));
    context.textAlign = 'center';
    context.fillStyle = '#475569';
    context.fillText(labels[index], x, canvas.height - 54, Math.max(24, slot - 8));
  });
  return canvas;
}

async function summaryChartImage(data, type, palette) {
  const canvas = drawSummaryChart(data, type, palette);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result
      ? resolve(result)
      : reject(new Error('Không thể mã hóa hình biểu đồ.')), 'image/webp', 0.82);
  });
  return imageBlobToDataUrl(blob);
}

const SUMMARY_CHART_ICONS = {
  column: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4 19h16v2H2V3h2v16Zm2-2V9h4v8H6Zm6 0V4h4v13h-4Zm6 0v-6h4v6h-4Z"/></svg>',
  bar: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h2v16H3V4Zm4 2h5v3H7V6Zm0 5h11v3H7v-3Zm0 5h14v3H7v-3Z"/></svg>',
  line: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="m3 17 5-6 4 3 7-9 2 1-8 11-4-3-4 5-2-2Z"/><circle cx="8" cy="11" r="1.5" fill="currentColor"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/><circle cx="19" cy="5" r="1.5" fill="currentColor"/></svg>',
  pie: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M11 2a10 10 0 1 0 11 11H11V2Zm2 0v9h9A10 10 0 0 0 13 2Z"/></svg>'
};
const SUMMARY_CHART_ICON_EDITORS = new WeakSet();

function registerSummaryChartIcons(editor) {
  if (!editor.ui?.registry?.addIcon || SUMMARY_CHART_ICON_EDITORS.has(editor)) return;
  Object.entries(SUMMARY_CHART_ICONS).forEach(([name, svg]) => {
    editor.ui.registry.addIcon(`summary-chart-${name}`, svg);
  });
  SUMMARY_CHART_ICON_EDITORS.add(editor);
}

async function applySummaryChart(editor, { chart, bookmark, title, type, palette, data }, api) {
  try {
    const values = normalizeSummaryChartRows(data);
    const chartTitle = String(title || '').trim().slice(0, 120);
    if (!chartTitle) throw new Error('Nhập tên biểu đồ.');
    if (chart && !editor.getBody().contains(chart)) {
      throw new Error('Biểu đồ đã bị xóa khỏi tài liệu trước khi cập nhật.');
    }
    const src = await summaryChartImage(values, type, palette);
    const chartTypeLabel = {
      bar: 'Biểu đồ thanh',
      column: 'Biểu đồ cột',
      line: 'Biểu đồ đường',
      pie: 'Biểu đồ tròn'
    }[type];
    const alt = `${chartTypeLabel}: ${chartTitle}. ${values.map(item => `${item.label}: ${item.value}`).join('; ')}`.slice(0, 500);
    if (chart) {
      const image = chart.querySelector(':scope > img');
      const caption = chart.querySelector(':scope > figcaption');
      if (!image || !caption) throw new Error('Cấu trúc biểu đồ hiện tại không hợp lệ.');
      editor.undoManager.transact(() => {
        chart.setAttribute('data-summary-chart-type', type);
        chart.setAttribute('data-summary-chart-palette', palette);
        chart.setAttribute('data-summary-chart-data', JSON.stringify(values));
        image.setAttribute('src', src);
        image.setAttribute('alt', alt);
        caption.textContent = chartTitle;
      });
    } else {
      const figure = editor.getDoc().createElement('figure');
      figure.className = 'summary-study-chart';
      figure.setAttribute('data-summary-chart-type', type);
      figure.setAttribute('data-summary-chart-palette', palette);
      figure.setAttribute('data-summary-chart-data', JSON.stringify(values));
      const image = editor.getDoc().createElement('img');
      image.setAttribute('src', src);
      image.setAttribute('alt', alt);
      const caption = editor.getDoc().createElement('figcaption');
      caption.textContent = chartTitle;
      figure.append(image, caption);
      editor.selection.moveToBookmark(bookmark);
      editor.undoManager.transact(() => editor.insertContent(figure.outerHTML));
    }
    editor.nodeChanged();
    editor.fire('change');
    api.close();
  } catch (error) {
    console.error('[SummaryStudyEditor] Không thể cập nhật biểu đồ:', error);
    editor.notificationManager.open({
      text: error.message || 'Không thể cập nhật biểu đồ.',
      type: 'error',
      timeout: 5000
    });
  }
}

function openSummaryChartDialog(editor, chart = null, overrides = {}) {
  registerSummaryChartIcons(editor);
  const bookmark = chart ? null : editor.selection.getBookmark(2, true);
  const data = chart ? summaryChartData(chart) : [
    { label: 'Nhóm A', value: 12 },
    { label: 'Nhóm B', value: 18 },
    { label: 'Nhóm C', value: 9 }
  ];
  if (chart && data.length < 2) {
    editor.notificationManager.open({ text: 'Không đọc được dữ liệu biểu đồ để chỉnh sửa.', type: 'error', timeout: 4000 });
    return;
  }
  let chartType = overrides.type || chart?.dataset.summaryChartType || 'column';
  let rowCount = data.length;
  const getRowsFromForm = formData => Array.from({ length: rowCount }, (_, index) => ({
    label: String(formData[`chart-label-${index}`] || ''),
    value: String(formData[`chart-value-${index}`] ?? '')
  }));
  const getFormData = (formData, rows) => ({
    ...formData,
    ...rows.reduce((fields, row, index) => ({
      ...fields,
      [`chart-label-${index}`]: row.label,
      [`chart-value-${index}`]: String(row.value)
    }), {})
  });
  const createDialog = initialData => ({
    title: chart ? 'Sửa dữ liệu biểu đồ' : 'Chèn biểu đồ',
    size: 'normal',
    body: {
      type: 'panel',
      items: [
        { type: 'input', name: 'title', label: 'Tên biểu đồ', inputMode: 'text' },
        {
          type: 'grid',
          columns: 3,
          items: [
            { type: 'button', name: 'chart-type-column', text: 'Cột', icon: 'summary-chart-column', primary: chartType === 'column' },
            { type: 'button', name: 'chart-type-bar', text: 'Thanh', icon: 'summary-chart-bar', primary: chartType === 'bar' },
            { type: 'button', name: 'chart-type-line', text: 'Đường', icon: 'summary-chart-line', primary: chartType === 'line' },
            { type: 'button', name: 'chart-type-pie', text: 'Tròn', icon: 'summary-chart-pie', primary: chartType === 'pie' }
          ]
        },
        {
          type: 'selectbox',
          name: 'palette',
          label: 'Màu biểu đồ',
          items: [
            { text: 'Xanh ngọc', value: 'teal' },
            { text: 'Xanh dương', value: 'blue' },
            { text: 'Cam', value: 'orange' }
          ]
        },
        ...Array.from({ length: rowCount }, (_, index) => ({
          type: 'grid',
          columns: 3,
          items: [
            { type: 'input', name: `chart-label-${index}`, label: index === 0 ? 'Nhãn' : `Nhãn ${index + 1}`, inputMode: 'text' },
            { type: 'input', name: `chart-value-${index}`, label: index === 0 ? 'Giá trị' : `Giá trị ${index + 1}`, inputMode: 'decimal' },
            rowCount <= 2
              ? { type: 'button', name: `chart-minimum-${index}`, text: 'Tối thiểu 2 hàng', enabled: false }
              : { type: 'button', name: `chart-remove-row-${index}`, text: 'Xóa' }
          ]
        })),
        {
          type: 'button',
          name: 'chart-add-row',
          text: rowCount >= 12 ? 'Đã đủ 12 hàng' : '+ Thêm hàng',
          disabled: rowCount >= 12
        }
      ]
    },
    initialData,
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: chart ? 'Cập nhật biểu đồ' : 'Chèn biểu đồ', primary: true }
    ],
    onAction(api, details) {
      const name = details.name || '';
      const typeAction = /^chart-type-(column|bar|line|pie)$/.exec(name);
      if (typeAction) {
        const current = api.getData();
        chartType = typeAction[1];
        api.redial(createDialog({ ...current, type: chartType }));
      } else if (name === 'chart-add-row' && rowCount < 12) {
        const current = api.getData();
        rowCount += 1;
        api.redial(createDialog(getFormData(current, [...getRowsFromForm(current), { label: '', value: '' }])));
        api.focus(`chart-label-${rowCount - 1}`);
      } else if (name.startsWith('chart-remove-row-') && rowCount > 2) {
        const removeIndex = Number(name.slice('chart-remove-row-'.length));
        if (!Number.isInteger(removeIndex) || removeIndex < 0 || removeIndex >= rowCount) return;
        const current = api.getData();
        const rows = getRowsFromForm(current).filter((_, index) => index !== removeIndex);
        rowCount = rows.length;
        api.redial(createDialog(getFormData(current, rows)));
        api.focus(`chart-label-${Math.min(removeIndex, rowCount - 1)}`);
      }
    },
    onSubmit(api) {
      const values = api.getData();
      void applySummaryChart(editor, {
        chart,
        bookmark,
        title: values.title,
        type: chartType,
        palette: values.palette,
        data: getRowsFromForm(values)
      }, api);
    }
  });
  editor.windowManager.open(createDialog({
      title: figureCaptionDescription(chart?.querySelector(':scope > figcaption')?.textContent || '') || 'Biểu đồ mới',
      type: chartType,
      palette: overrides.palette || chart?.dataset.summaryChartPalette || 'teal',
      ...data.reduce((fields, row, index) => ({
        ...fields,
        [`chart-label-${index}`]: row.label,
        [`chart-value-${index}`]: String(row.value)
      }), {})
  }));
}

function editSelectedSummaryChart(editor, overrides = {}) {
  const chart = selectedSummaryChart(editor);
  if (!chart) {
    editor.notificationManager.open({ text: 'Chọn một biểu đồ để chỉnh sửa dữ liệu.', type: 'info', timeout: 3500 });
    return;
  }
  openSummaryChartDialog(editor, chart, overrides);
}

function setSelectedSummaryChartOption(editor, setting, value) {
  if (!['type', 'palette'].includes(setting)) {
    editor.notificationManager.open({ text: 'Tùy chọn biểu đồ không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  editSelectedSummaryChart(editor, { [setting]: value });
}

function normalizeSummaryDiagramOptions({ layout, palette, steps }) {
  if (!SUMMARY_DIAGRAM_LAYOUTS.has(layout) || !Object.hasOwn(SUMMARY_DIAGRAM_PALETTES, palette)) {
    throw new Error('Kiểu hoặc bảng màu sơ đồ không hợp lệ.');
  }
  const normalizedSteps = (Array.isArray(steps) ? steps : String(steps || '').split(/\r?\n/))
    .map(step => String(step).trim())
    .filter(Boolean);
  if (normalizedSteps.length < 2 || normalizedSteps.length > SUMMARY_DIAGRAM_MAX_STEPS) {
    throw new Error(`Sơ đồ cần từ 2 đến ${SUMMARY_DIAGRAM_MAX_STEPS} bước.`);
  }
  if (normalizedSteps.some(step => step.length > SUMMARY_DIAGRAM_MAX_STEP_LENGTH)) {
    throw new Error(`Mỗi bước trong sơ đồ tối đa ${SUMMARY_DIAGRAM_MAX_STEP_LENGTH} ký tự.`);
  }
  if (JSON.stringify(normalizedSteps).length > SUMMARY_DIAGRAM_MAX_DATA_LENGTH) {
    throw new Error('Dữ liệu sơ đồ vượt quá giới hạn cho phép.');
  }
  return { layout, palette, steps: normalizedSteps };
}

function summaryDiagramSteps(figure) {
  try {
    const steps = JSON.parse(figure?.getAttribute('data-summary-diagram-data') || '[]');
    if (!Array.isArray(steps)) return [];
    return steps.filter(step => typeof step === 'string' && step.trim().length > 0
      && step.trim().length <= SUMMARY_DIAGRAM_MAX_STEP_LENGTH)
      .slice(0, SUMMARY_DIAGRAM_MAX_STEPS)
      .map(step => step.trim());
  } catch {
    return [];
  }
}

function drawSummaryDiagram({ layout, palette, steps }) {
  const colors = SUMMARY_DIAGRAM_PALETTES[palette];
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = layout === 'cycle' ? 760 : layout === 'hierarchy' ? 500 : 100 + steps.length * 100;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể tạo sơ đồ trong trình duyệt.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineWidth = 5;
  context.lineJoin = 'round';
  context.lineCap = 'round';

  const drawNode = (label, x, y, width, height, index) => {
    context.fillStyle = colors[index % (colors.length - 1)];
    context.strokeStyle = colors[0];
    context.beginPath();
    if (context.roundRect) context.roundRect(x, y, width, height, 18);
    else {
      context.moveTo(x + 18, y);
      context.lineTo(x + width - 18, y);
      context.arcTo(x + width, y, x + width, y + 18, 18);
      context.lineTo(x + width, y + height - 18);
      context.arcTo(x + width, y + height, x + width - 18, y + height, 18);
      context.lineTo(x + 18, y + height);
      context.arcTo(x, y + height, x, y + height - 18, 18);
      context.lineTo(x, y + 18);
      context.arcTo(x, y, x + 18, y, 18);
      context.closePath();
    }
    context.fill();
    context.stroke();
    context.fillStyle = index % (colors.length - 1) === 2 ? '#16324f' : '#ffffff';
    context.font = 'bold 23px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const words = label.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > width - 36) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    const visible = lines.slice(0, 2);
    if (lines.length > 2) visible[1] = `${visible[1].slice(0, Math.max(1, visible[1].length - 1))}…`;
    visible.forEach((text, lineIndex) => {
      context.fillText(text, x + width / 2, y + height / 2 + (lineIndex - (visible.length - 1) / 2) * 29, width - 28);
    });
  };
  const drawArrow = (x1, y1, x2, y2) => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    context.strokeStyle = colors[0];
    context.fillStyle = colors[0];
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
    context.beginPath();
    context.moveTo(x2, y2);
    context.lineTo(x2 - 16 * Math.cos(angle - Math.PI / 6), y2 - 16 * Math.sin(angle - Math.PI / 6));
    context.lineTo(x2 - 16 * Math.cos(angle + Math.PI / 6), y2 - 16 * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();
  };

  if (layout === 'process') {
    const nodeX = 270;
    const nodeWidth = 660;
    const nodeHeight = 72;
    steps.forEach((step, index) => {
      const y = 24 + index * 100;
      drawNode(step, nodeX, y, nodeWidth, nodeHeight, index);
      if (index < steps.length - 1) drawArrow(600, y + nodeHeight + 5, 600, y + 95);
    });
  } else if (layout === 'cycle') {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radiusX = 345;
    const radiusY = 250;
    const positions = steps.map((_, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / steps.length;
      return { x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY };
    });
    positions.forEach((position, index) => {
      const next = positions[(index + 1) % positions.length];
      const dx = next.x - position.x;
      const dy = next.y - position.y;
      const edgeScale = Math.max(Math.abs(dx) / 115, Math.abs(dy) / 39);
      drawArrow(
        position.x + dx / edgeScale,
        position.y + dy / edgeScale,
        next.x - dx / edgeScale,
        next.y - dy / edgeScale
      );
    });
    context.fillStyle = '#334155';
    context.font = 'bold 24px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('CHU TRÌNH', centerX, centerY);
    positions.forEach((position, index) => drawNode(steps[index], position.x - 115, position.y - 39, 230, 78, index));
  } else {
    const rootWidth = 520;
    drawNode(steps[0], (canvas.width - rootWidth) / 2, 30, rootWidth, 78, 0);
    const childCount = steps.length - 1;
    const childWidth = Math.min(220, 1050 / childCount);
    const gap = childCount > 1 ? (1050 - childWidth * childCount) / (childCount - 1) : 0;
    const startX = (canvas.width - (childWidth * childCount + gap * (childCount - 1))) / 2;
    steps.slice(1).forEach((step, index) => {
      const x = startX + index * (childWidth + gap);
      drawArrow(canvas.width / 2, 108, x + childWidth / 2, 298);
      drawNode(step, x, 300, childWidth, 100, index + 1);
    });
  }
  return canvas;
}

async function summaryDiagramImage(options) {
  const canvas = drawSummaryDiagram(options);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result
      ? resolve(result)
      : reject(new Error('Không thể mã hóa sơ đồ.')), 'image/webp', 0.9);
  });
  return imageBlobToDataUrl(blob);
}

const summaryDiagramRevisions = new WeakMap();

async function applySummaryDiagram(editor, { diagram, bookmark, title, layout, palette, steps }, api) {
  try {
    const options = normalizeSummaryDiagramOptions({ layout, palette, steps });
    const diagramTitle = String(title || '').trim().slice(0, 120);
    if (!diagramTitle) throw new Error('Nhập tên sơ đồ.');
    if (diagram && !editor.getBody().contains(diagram)) {
      throw new Error('Sơ đồ đã bị xóa khỏi tài liệu trước khi cập nhật.');
    }
    const revision = diagram ? (summaryDiagramRevisions.get(diagram) || 0) + 1 : 0;
    if (diagram) summaryDiagramRevisions.set(diagram, revision);
    const src = await summaryDiagramImage(options);
    if (diagram && (!editor.getBody().contains(diagram) || summaryDiagramRevisions.get(diagram) !== revision)) return;
    const alt = `${options.layout === 'cycle' ? 'Sơ đồ chu trình' : options.layout === 'hierarchy' ? 'Sơ đồ phân cấp' : 'Sơ đồ quy trình'}: ${options.steps.join(' → ')}`.slice(0, 500);
    if (diagram) {
      const image = diagram.querySelector(':scope > img');
      const caption = diagram.querySelector(':scope > figcaption');
      if (!image || !caption) throw new Error('Cấu trúc sơ đồ hiện tại không hợp lệ.');
      editor.undoManager.transact(() => {
        diagram.setAttribute('data-summary-diagram-layout', options.layout);
        diagram.setAttribute('data-summary-diagram-palette', options.palette);
        diagram.setAttribute('data-summary-diagram-data', JSON.stringify(options.steps));
        image.setAttribute('src', src);
        image.setAttribute('alt', alt);
        caption.textContent = diagramTitle;
      });
    } else {
      const figure = editor.getDoc().createElement('figure');
      figure.className = 'summary-study-diagram';
      figure.setAttribute('data-summary-diagram-layout', options.layout);
      figure.setAttribute('data-summary-diagram-palette', options.palette);
      figure.setAttribute('data-summary-diagram-data', JSON.stringify(options.steps));
      const image = editor.getDoc().createElement('img');
      image.setAttribute('src', src);
      image.setAttribute('alt', alt);
      const caption = editor.getDoc().createElement('figcaption');
      caption.textContent = diagramTitle;
      figure.append(image, caption);
      editor.selection.moveToBookmark(bookmark);
      editor.undoManager.transact(() => editor.insertContent(figure.outerHTML));
    }
    editor.nodeChanged();
    editor.fire('change');
    api.close();
  } catch (error) {
    console.error('[SummaryStudyEditor] Không thể cập nhật sơ đồ:', error);
    editor.notificationManager.open({
      text: error.message || 'Không thể cập nhật sơ đồ.',
      type: 'error',
      timeout: 5000
    });
  }
}

function openSummaryDiagramDialog(editor, diagram = null, overrides = {}) {
  const bookmark = diagram ? null : editor.selection.getBookmark(2, true);
  const steps = diagram ? summaryDiagramSteps(diagram) : ['Xác định mục tiêu', 'Thực hiện', 'Đánh giá kết quả'];
  if (diagram && steps.length < 2) {
    editor.notificationManager.open({ text: 'Không đọc được dữ liệu sơ đồ để chỉnh sửa.', type: 'error', timeout: 4000 });
    return;
  }
  editor.windowManager.open({
    title: diagram ? 'Sửa sơ đồ' : 'Chèn sơ đồ',
    size: 'normal',
    body: {
      type: 'panel',
      items: [
        { type: 'input', name: 'title', label: 'Tên sơ đồ', inputMode: 'text' },
        {
          type: 'selectbox',
          name: 'layout',
          label: 'Bố cục',
          items: [
            { text: 'Quy trình', value: 'process' },
            { text: 'Chu trình', value: 'cycle' },
            { text: 'Phân cấp', value: 'hierarchy' }
          ]
        },
        {
          type: 'selectbox',
          name: 'palette',
          label: 'Màu sơ đồ',
          items: [
            { text: 'Xanh ngọc', value: 'teal' },
            { text: 'Xanh dương', value: 'blue' },
            { text: 'Cam', value: 'orange' }
          ]
        },
        { type: 'textarea', name: 'steps', label: 'Nội dung (mỗi bước một dòng)' }
      ]
    },
    initialData: {
      title: figureCaptionDescription(diagram?.querySelector(':scope > figcaption')?.textContent || '') || 'Sơ đồ mới',
      layout: overrides.layout || diagram?.dataset.summaryDiagramLayout || 'process',
      palette: overrides.palette || diagram?.dataset.summaryDiagramPalette || 'teal',
      steps: steps.join('\n')
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: diagram ? 'Cập nhật sơ đồ' : 'Chèn sơ đồ', primary: true }
    ],
    onSubmit(api) {
      const values = api.getData();
      void applySummaryDiagram(editor, {
        diagram,
        bookmark,
        title: values.title,
        layout: values.layout,
        palette: values.palette,
        steps: values.steps
      }, api);
    }
  });
}

function selectedSummaryDiagram(editor) {
  const node = editor.selection.getNode();
  const diagram = node?.closest?.('figure.summary-study-diagram');
  return diagram && editor.getBody().contains(diagram) ? diagram : null;
}

function editSelectedSummaryDiagram(editor, overrides = {}) {
  const diagram = selectedSummaryDiagram(editor);
  if (!diagram) {
    editor.notificationManager.open({ text: 'Chọn một sơ đồ để chỉnh sửa.', type: 'info', timeout: 3500 });
    return;
  }
  openSummaryDiagramDialog(editor, diagram, overrides);
}

function setSelectedSummaryDiagramOption(editor, setting, value, diagramOverride = null) {
  if (!['layout', 'palette'].includes(setting)) {
    editor.notificationManager.open({ text: 'Tùy chọn sơ đồ không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  const diagram = diagramOverride && editor.getBody().contains(diagramOverride)
    ? diagramOverride
    : selectedSummaryDiagram(editor);
  if (!diagram) {
    editor.notificationManager.open({ text: 'Chọn một sơ đồ trước khi đổi tùy chọn.', type: 'info', timeout: 3500 });
    return;
  }
  openSummaryDiagramDialog(editor, diagram, { [setting]: value });
}

function normalizeSummaryShapeOptions({ type, fill, outline, label }) {
  const normalizedLabel = String(label || '').trim();
  if (!SUMMARY_SHAPE_TYPES.has(type)) throw new Error('Kiểu hình dạng không được hỗ trợ.');
  if (!/^#[\da-f]{6}$/i.test(fill) || !/^#[\da-f]{6}$/i.test(outline)) {
    throw new Error('Màu hình dạng không hợp lệ.');
  }
  if (normalizedLabel.length > SUMMARY_SHAPE_MAX_LABEL_LENGTH) {
    throw new Error(`Nội dung trong hình tối đa ${SUMMARY_SHAPE_MAX_LABEL_LENGTH} ký tự.`);
  }
  return { type, fill: fill.toUpperCase(), outline: outline.toUpperCase(), label: normalizedLabel };
}

function drawSummaryShapeLabel(context, label, type) {
  if (!label) return;
  const fill = context.fillStyle;
  const color = String(fill).match(/^#([\da-f]{6})$/i)?.[1] || 'DDF4EE';
  const channels = [0, 2, 4].map(index => Number.parseInt(color.slice(index, index + 2), 16));
  const darkFill = channels[0] * 0.299 + channels[1] * 0.587 + channels[2] * 0.114 < 150;
  context.fillStyle = darkFill ? '#ffffff' : '#16324f';
  context.shadowColor = darkFill ? 'rgba(0, 0, 0, 0.55)' : 'rgba(255, 255, 255, 0.75)';
  context.shadowBlur = 3;
  context.font = '36px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const maxWidth = type === 'arrow' ? 430 : type === 'triangle' || type === 'star' ? 360 : 540;
  const lines = [];
  let line = '';
  let truncated = false;
  for (const word of label.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      if (lines.length === 2) {
        truncated = true;
        break;
      }
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < 3) lines.push(line);
  else if (line) truncated = true;
  if (truncated && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}…`;
  const visibleLines = lines;
  const y = type === 'line' ? 155 : 260;
  visibleLines.forEach((text, index) => {
    context.fillText(text, 450, y + (index - (visibleLines.length - 1) / 2) * 46, maxWidth);
  });
  context.shadowBlur = 0;
}

function drawSummaryShape({ type, fill, outline, label }) {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 520;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Không thể tạo hình dạng trong trình duyệt.');
  context.fillStyle = fill;
  context.strokeStyle = outline;
  context.lineWidth = 10;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();

  if (type === 'rectangle') {
    context.rect(110, 70, 680, 380);
  } else if (type === 'rounded-rectangle') {
    context.moveTo(160, 70);
    context.lineTo(740, 70);
    context.quadraticCurveTo(790, 70, 790, 120);
    context.lineTo(790, 400);
    context.quadraticCurveTo(790, 450, 740, 450);
    context.lineTo(160, 450);
    context.quadraticCurveTo(110, 450, 110, 400);
    context.lineTo(110, 120);
    context.quadraticCurveTo(110, 70, 160, 70);
  } else if (type === 'ellipse') {
    context.ellipse(450, 260, 340, 190, 0, 0, Math.PI * 2);
  } else if (type === 'line') {
    context.moveTo(130, 340);
    context.lineTo(770, 180);
  } else if (type === 'arrow') {
    context.moveTo(130, 190);
    context.lineTo(610, 190);
    context.lineTo(610, 110);
    context.lineTo(790, 260);
    context.lineTo(610, 410);
    context.lineTo(610, 330);
    context.lineTo(130, 330);
    context.closePath();
  } else if (type === 'triangle') {
    context.moveTo(450, 65);
    context.lineTo(790, 445);
    context.lineTo(110, 445);
    context.closePath();
  } else if (type === 'diamond') {
    context.moveTo(450, 65);
    context.lineTo(790, 260);
    context.lineTo(450, 455);
    context.lineTo(110, 260);
    context.closePath();
  } else if (type === 'star') {
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const radius = index % 2 ? 175 : 340;
      const x = 450 + Math.cos(angle) * radius;
      const y = 260 + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
  } else if (type === 'callout') {
    context.moveTo(160, 70);
    context.lineTo(740, 70);
    context.quadraticCurveTo(790, 70, 790, 120);
    context.lineTo(790, 340);
    context.quadraticCurveTo(790, 390, 740, 390);
    context.lineTo(455, 390);
    context.lineTo(340, 475);
    context.lineTo(365, 390);
    context.lineTo(160, 390);
    context.quadraticCurveTo(110, 390, 110, 340);
    context.lineTo(110, 120);
    context.quadraticCurveTo(110, 70, 160, 70);
    context.closePath();
  }

  if (type === 'line') {
    context.stroke();
    context.beginPath();
    context.moveTo(770, 180);
    context.lineTo(740, 170);
    context.moveTo(770, 180);
    context.lineTo(750, 205);
    context.stroke();
  } else {
    context.fill();
    context.stroke();
  }
  drawSummaryShapeLabel(context, label, type);
  return canvas;
}

async function summaryShapeImage(options) {
  const canvas = drawSummaryShape(options);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result
      ? resolve(result)
      : reject(new Error('Không thể mã hóa hình dạng.')), 'image/webp', 0.9);
  });
  return imageBlobToDataUrl(blob);
}

const summaryShapeRevisions = new WeakMap();

async function applySummaryShape(editor, { shape, bookmark, type, fill, outline, label }, api) {
  try {
    const options = normalizeSummaryShapeOptions({ type, fill, outline, label });
    if (shape && !editor.getBody().contains(shape)) {
      throw new Error('Hình dạng đã bị xóa khỏi tài liệu trước khi cập nhật.');
    }
    const revision = shape ? (summaryShapeRevisions.get(shape) || 0) + 1 : 0;
    if (shape) summaryShapeRevisions.set(shape, revision);
    const src = await summaryShapeImage(options);
    if (shape && (!editor.getBody().contains(shape) || summaryShapeRevisions.get(shape) !== revision)) return;
    const alt = `Hình dạng ${options.type}${options.label ? `: ${options.label}` : ''}`.slice(0, 500);
    if (shape) {
      const image = shape.querySelector(':scope > img');
      if (!image) throw new Error('Cấu trúc hình dạng hiện tại không hợp lệ.');
      const previousAlt = `Hình dạng ${shape.dataset.summaryShapeType || 'rectangle'}${shape.dataset.summaryShapeLabel ? `: ${shape.dataset.summaryShapeLabel}` : ''}`.slice(0, 500);
      editor.undoManager.transact(() => {
        shape.setAttribute('data-summary-shape-type', options.type);
        shape.setAttribute('data-summary-shape-fill', options.fill);
        shape.setAttribute('data-summary-shape-outline', options.outline);
        shape.setAttribute('data-summary-shape-label', options.label);
        image.setAttribute('src', src);
        if (!image.getAttribute('alt') || image.getAttribute('alt') === previousAlt) image.setAttribute('alt', alt);
      });
    } else {
      const figure = editor.getDoc().createElement('figure');
      figure.className = 'summary-study-shape';
      figure.setAttribute('data-summary-shape-type', options.type);
      figure.setAttribute('data-summary-shape-fill', options.fill);
      figure.setAttribute('data-summary-shape-outline', options.outline);
      figure.setAttribute('data-summary-shape-label', options.label);
      figure.setAttribute('data-summary-shape-align', 'center');
      const image = editor.getDoc().createElement('img');
      image.setAttribute('src', src);
      image.setAttribute('alt', alt);
      figure.append(image);
      editor.selection.moveToBookmark(bookmark);
      editor.undoManager.transact(() => editor.insertContent(figure.outerHTML));
    }
    editor.nodeChanged();
    editor.fire('change');
    api?.close();
  } catch (error) {
    console.error('[SummaryStudyEditor] Không thể cập nhật hình dạng:', error);
    editor.notificationManager.open({
      text: error.message || 'Không thể cập nhật hình dạng.',
      type: 'error',
      timeout: 5000
    });
  }
}

function openSummaryShapeDialog(editor, shape = null, overrides = {}) {
  const bookmark = shape ? null : editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: shape ? 'Sửa hình dạng' : 'Chèn hình dạng',
    size: 'normal',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'type',
          label: 'Hình dạng',
          items: [
            { text: 'Hình chữ nhật', value: 'rectangle' },
            { text: 'Hình chữ nhật bo góc', value: 'rounded-rectangle' },
            { text: 'Hình elip', value: 'ellipse' },
            { text: 'Đường thẳng', value: 'line' },
            { text: 'Mũi tên', value: 'arrow' },
            { text: 'Tam giác', value: 'triangle' },
            { text: 'Hình thoi', value: 'diamond' },
            { text: 'Ngôi sao', value: 'star' },
            { text: 'Chú thích hội thoại', value: 'callout' }
          ]
        },
        { type: 'input', name: 'label', label: 'Văn bản trong hình (không bắt buộc)', inputMode: 'text' }
      ]
    },
    initialData: {
      type: overrides.type || shape?.dataset.summaryShapeType || 'rectangle',
      label: overrides.label ?? shape?.dataset.summaryShapeLabel ?? ''
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: shape ? 'Cập nhật hình' : 'Chèn hình', primary: true }
    ],
    onSubmit(api) {
      const values = api.getData();
      void applySummaryShape(editor, {
        shape,
        bookmark,
        type: values.type,
        fill: overrides.fill || shape?.dataset.summaryShapeFill || SUMMARY_SHAPE_DEFAULT_FILL,
        outline: overrides.outline || shape?.dataset.summaryShapeOutline || SUMMARY_SHAPE_DEFAULT_OUTLINE,
        label: values.label
      }, api);
    }
  });
}

function editSelectedSummaryShape(editor, overrides = {}) {
  const shape = selectedSummaryShape(editor);
  if (!shape) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng để chỉnh sửa.', type: 'info', timeout: 3500 });
    return;
  }
  openSummaryShapeDialog(editor, shape, overrides);
}

function setSelectedSummaryShapeOption(editor, setting, value, selectedShape = null) {
  if (!['type', 'fill', 'outline'].includes(setting)) {
    editor.notificationManager.open({ text: 'Tùy chọn hình dạng không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  if (!shape) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi định dạng.', type: 'info', timeout: 3500 });
    return;
  }
  void applySummaryShape(editor, {
    shape,
    type: setting === 'type' ? value : shape.dataset.summaryShapeType,
    fill: setting === 'fill' ? value : shape.dataset.summaryShapeFill,
    outline: setting === 'outline' ? value : shape.dataset.summaryShapeOutline,
    label: shape.dataset.summaryShapeLabel || ''
  }, null);
}

function summaryShapeLayout(shape) {
  for (const layout of ['inline', 'center', 'float-left', 'float-right']) {
    if (shape.classList.contains(`summary-study-image-layout--${layout}`)) return layout;
  }
  return 'center';
}

function setSelectedSummaryShapeLayout(editor, layout, selectedShape = null) {
  const layouts = ['inline', 'center', 'float-left', 'float-right'];
  if (!layouts.includes(layout)) {
    editor.notificationManager.open({ text: 'Bố trí hình dạng không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  if (!shape) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi đổi bố trí.', type: 'info', timeout: 3000 });
    return;
  }
  editor.undoManager.transact(() => {
    shape.classList.remove(
      'summary-study-image-layout--inline',
      'summary-study-image-layout--center',
      'summary-study-image-layout--float-left',
      'summary-study-image-layout--float-right'
    );
    shape.classList.add(`summary-study-image-layout--${layout}`);
  });
  editor.nodeChanged();
  editor.fire('change');
}

function editSelectedSummaryShapeAltText(editor, selectedShape = null) {
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  const image = shape?.querySelector(':scope > img');
  if (!image) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi thêm văn bản thay thế.', type: 'info', timeout: 3000 });
    return;
  }
  editor.windowManager.open({
    title: 'Văn bản thay thế cho hình dạng',
    body: {
      type: 'panel',
      items: [{
        type: 'input',
        name: 'alt',
        label: 'Mô tả hình dạng (để trống nếu chỉ trang trí)'
      }]
    },
    initialData: { alt: image.getAttribute('alt') || '' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      const alt = String(api.getData().alt || '').trim();
      if (alt.length > 500) {
        editor.notificationManager.open({ text: 'Mô tả hình dạng tối đa 500 ký tự.', type: 'error', timeout: 3500 });
        return;
      }
      editor.undoManager.transact(() => image.setAttribute('alt', alt));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function summaryImageLayout(image) {
  const target = image.closest('figure') || image;
  for (const layout of ['center', 'float-left', 'float-right', 'inline']) {
    if (target.classList.contains(`summary-study-image-layout--${layout}`)) return layout;
  }
  return 'inline';
}

function updateSelectedSummaryImage(editor, update) {
  const image = selectedSummaryImage(editor);
  if (!image) {
    editor.notificationManager.open({ text: 'Chọn một hình ảnh trước khi chỉnh sửa.', type: 'info', timeout: 3000 });
    return;
  }
  editor.undoManager.transact(() => update(image));
  editor.nodeChanged();
  editor.fire('change');
}

function editSelectedSummaryImageAlt(editor) {
  const image = selectedSummaryImage(editor);
  if (!image) {
    editor.notificationManager.open({ text: 'Chọn một hình ảnh trước khi thêm văn bản thay thế.', type: 'info', timeout: 3000 });
    return;
  }
  editor.windowManager.open({
    title: 'Văn bản thay thế cho hình ảnh',
    body: {
      type: 'panel',
      items: [{
        type: 'input',
        name: 'alt',
        label: 'Mô tả ảnh (để trống nếu ảnh chỉ trang trí)'
      }]
    },
    initialData: { alt: image.getAttribute('alt') || '' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      const alt = String(api.getData().alt || '').trim();
      if (alt.length > 500) {
        editor.notificationManager.open({ text: 'Mô tả ảnh tối đa 500 ký tự.', type: 'error', timeout: 3500 });
        return;
      }
      editor.undoManager.transact(() => image.setAttribute('alt', alt));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function replaceSelectedSummaryImage(editor) {
  const image = selectedSummaryImage(editor);
  if (!image) {
    editor.notificationManager.open({ text: 'Chọn một hình ảnh trước khi thay ảnh.', type: 'info', timeout: 3000 });
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.hidden = true;
  document.body.append(input);
  input.addEventListener('cancel', () => input.remove(), { once: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) {
      input.remove();
      return;
    }
    try {
      const src = await imageBlobToDataUrl(file);
      editor.undoManager.transact(() => image.setAttribute('src', src));
      editor.nodeChanged();
      editor.fire('change');
    } catch (error) {
      console.error('[SummaryStudyEditor] Không thể thay hình ảnh:', error);
      editor.notificationManager.open({
        text: error.message || 'Không thể thay hình ảnh đã chọn.',
        type: 'error',
        timeout: 5000
      });
    } finally {
      input.remove();
    }
  }, { once: true });
  input.click();
}

function setSelectedSummaryImageSize(editor, dimension, value) {
  const size = Number(value);
  if (!['width', 'height'].includes(dimension) || !Number.isInteger(size) || size < 16 || size > 2400) {
    editor.notificationManager.open({ text: 'Kích thước ảnh phải từ 16 đến 2400 px.', type: 'error', timeout: 3500 });
    return;
  }
  updateSelectedSummaryImage(editor, image => {
    const target = image.closest('figure') || image;
    if (dimension === 'width' && target !== image
      && (target.classList.contains('summary-study-image-layout--float-left')
        || target.classList.contains('summary-study-image-layout--float-right'))) {
      target.style.width = `${size}px`;
      target.style.maxWidth = `${size}px`;
      image.style.width = '100%';
      return;
    }
    image.style[dimension] = `${size}px`;
  });
}

function normalizeSummaryShapeSize(dimension, value) {
  const size = Number(value);
  if (!['width', 'height'].includes(dimension) || !Number.isInteger(size) || size < 16 || size > 2400) {
    throw new Error('Kích thước hình phải là số nguyên từ 16 đến 2400 px.');
  }
  return size;
}

function setSelectedSummaryShapeSize(editor, dimension, value, selectedShape = null) {
  let size;
  try {
    size = normalizeSummaryShapeSize(dimension, value);
  } catch (error) {
    editor.notificationManager.open({ text: error.message, type: 'error', timeout: 3500 });
    return;
  }
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  const image = shape?.querySelector(':scope > img');
  if (!shape || !image) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi đổi kích thước.', type: 'info', timeout: 3000 });
    return;
  }
  editor.undoManager.transact(() => {
    image.style[dimension] = `${size}px`;
  });
  editor.nodeChanged();
  editor.fire('change');
}

function resetSelectedSummaryImageSize(editor) {
  updateSelectedSummaryImage(editor, image => {
    image.style.removeProperty('width');
    image.style.removeProperty('height');
    const target = image.closest('figure');
    target?.style.removeProperty('width');
    target?.style.removeProperty('max-width');
  });
}

function setSelectedSummaryImageTransform(editor, operation) {
  if (!['rotate-left', 'rotate-right', 'flip-horizontal', 'flip-vertical', 'reset-image-transform'].includes(operation)) {
    editor.notificationManager.open({ text: 'Thao tác xoay hoặc lật ảnh không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  updateSelectedSummaryImage(editor, image => {
    const current = image.style.transform || '';
    const rotation = Number(current.match(/rotate\((0|90|180|270)deg\)/)?.[1] || 0);
    let nextRotation = rotation;
    let flipHorizontal = current.includes('scaleX(-1)');
    let flipVertical = current.includes('scaleY(-1)');
    if (operation === 'rotate-left') nextRotation = (rotation + 270) % 360;
    if (operation === 'rotate-right') nextRotation = (rotation + 90) % 360;
    if (operation === 'flip-horizontal') flipHorizontal = !flipHorizontal;
    if (operation === 'flip-vertical') flipVertical = !flipVertical;
    if (operation === 'reset-image-transform') {
      image.style.removeProperty('transform');
      return;
    }
    image.style.transform = [
      nextRotation ? `rotate(${nextRotation}deg)` : '',
      flipHorizontal ? 'scaleX(-1)' : '',
      flipVertical ? 'scaleY(-1)' : ''
    ].filter(Boolean).join(' ');
  });
}

function summaryShapeTransformValue(current, operation) {
  if (!['rotate-left', 'rotate-right', 'reset'].includes(operation)) {
    throw new Error('Thao tác xoay hình không hợp lệ.');
  }
  if (operation === 'reset') return '';
  const rotation = Number(String(current || '').match(/rotate\((0|90|180|270)deg\)/)?.[1] || 0);
  const horizontal = String(current || '').includes('scaleX(-1)');
  const vertical = String(current || '').includes('scaleY(-1)');
  const nextRotation = (rotation + (operation === 'rotate-left' ? 270 : 90)) % 360;
  return [
    nextRotation ? `rotate(${nextRotation}deg)` : '',
    horizontal ? 'scaleX(-1)' : '',
    vertical ? 'scaleY(-1)' : ''
  ].filter(Boolean).join(' ');
}

function setSelectedSummaryShapeTransform(editor, operation, selectedShape = null) {
  const shape = selectedShape && editor.getBody().contains(selectedShape)
    ? selectedShape
    : selectedSummaryShape(editor);
  let transform;
  try {
    transform = summaryShapeTransformValue(shape?.querySelector(':scope > img')?.style.transform, operation);
  } catch (error) {
    editor.notificationManager.open({ text: error.message, type: 'error', timeout: 3500 });
    return;
  }
  const image = shape?.querySelector(':scope > img');
  if (!shape || !image) {
    editor.notificationManager.open({ text: 'Chọn một hình dạng trước khi xoay.', type: 'info', timeout: 3000 });
    return;
  }
  editor.undoManager.transact(() => {
    if (transform) image.style.transform = transform;
    else image.style.removeProperty('transform');
  });
  editor.nodeChanged();
  editor.fire('change');
}

function setSelectedSummaryImageBorder(editor, value) {
  const borders = {
    none: '',
    gray: '1px solid #94a3b8',
    teal: '2px solid #0f766e',
    black: '1px solid #111827'
  };
  if (!Object.hasOwn(borders, value)) {
    editor.notificationManager.open({ text: 'Kiểu viền ảnh đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
    return;
  }
  updateSelectedSummaryImage(editor, image => {
    if (borders[value]) image.style.border = borders[value];
    else image.style.removeProperty('border');
  });
}

function imageCropBounds(width, height, crop) {
  const edges = ['top', 'right', 'bottom', 'left'].reduce((result, edge) => {
    const value = Number(crop[edge]);
    if (!Number.isFinite(value) || value < 0 || value > 45) {
      throw new Error('Mức cắt mỗi cạnh phải nằm trong khoảng 0–45%.');
    }
    result[edge] = value;
    return result;
  }, {});
  if (edges.left + edges.right >= 90 || edges.top + edges.bottom >= 90) {
    throw new Error('Tổng mức cắt hai cạnh đối diện phải nhỏ hơn 90%.');
  }
  const x = Math.round(width * edges.left / 100);
  const y = Math.round(height * edges.top / 100);
  const right = Math.round(width * edges.right / 100);
  const bottom = Math.round(height * edges.bottom / 100);
  return { x, y, width: width - x - right, height: height - y - bottom };
}

function imageTransformValues(image) {
  const transform = image.style.transform || '';
  return {
    rotation: Number(transform.match(/rotate\((0|90|180|270)deg\)/)?.[1] || 0),
    flipHorizontal: transform.includes('scaleX(-1)'),
    flipVertical: transform.includes('scaleY(-1)')
  };
}

async function cropSelectedSummaryImage(editor, image, crop, api) {
  try {
    if (typeof createImageBitmap !== 'function') throw new Error('Trình duyệt hiện tại chưa hỗ trợ cắt ảnh.');
    const response = await fetch(image.currentSrc || image.src);
    if (!response.ok) throw new Error(`Không tải được ảnh để cắt (${response.status}).`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const { rotation, flipHorizontal, flipVertical } = imageTransformValues(image);
      const rotated = rotation % 180 !== 0;
      const orientedWidth = rotated ? bitmap.height : bitmap.width;
      const orientedHeight = rotated ? bitmap.width : bitmap.height;
      const bounds = imageCropBounds(orientedWidth, orientedHeight, crop);
      const canvas = document.createElement('canvas');
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Không thể tạo vùng cắt ảnh trong trình duyệt.');
      context.translate(orientedWidth / 2 - bounds.x, orientedHeight / 2 - bounds.y);
      context.rotate(rotation * Math.PI / 180);
      context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      const cropped = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể mã hóa ảnh đã cắt.')), 'image/webp', 0.78);
      });
      const src = await imageBlobToDataUrl(cropped);
      if (!image.isConnected) throw new Error('Ảnh đã bị xóa khỏi tài liệu trước khi thao tác cắt hoàn tất.');
      editor.undoManager.transact(() => {
        const displayedWidth = Math.round(image.getBoundingClientRect().width);
        if (!image.style.width && displayedWidth > 0) image.style.width = `${displayedWidth}px`;
        image.style.removeProperty('height');
        image.style.removeProperty('transform');
        image.setAttribute('src', src);
      });
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.error('[SummaryStudyEditor] Không thể cắt hình ảnh:', error);
    editor.notificationManager.open({
      text: error instanceof TypeError
        ? 'Không thể đọc ảnh để cắt. Nếu ảnh lấy từ trang web khác, hãy tải ảnh về rồi chèn vào tài liệu.'
        : error.message || 'Không thể cắt hình ảnh đã chọn.',
      type: 'error',
      timeout: 5000
    });
  }
}

function openSummaryImageCropDialog(editor) {
  const image = selectedSummaryImage(editor);
  if (!image) {
    editor.notificationManager.open({ text: 'Chọn một hình ảnh trước khi cắt.', type: 'info', timeout: 3000 });
    return;
  }
  editor.windowManager.open({
    title: 'Cắt hình ảnh',
    size: 'normal',
    body: {
      type: 'panel',
      items: [
        {
          type: 'htmlpanel',
          html: '<p>Nhập phần trăm cần cắt khỏi từng cạnh. Tổng phần cắt của hai cạnh đối diện phải nhỏ hơn 90%. Thao tác có thể hoàn tác.</p>'
        },
        { type: 'input', name: 'top', label: 'Cắt phía trên (%)', inputMode: 'numeric' },
        { type: 'input', name: 'right', label: 'Cắt bên phải (%)', inputMode: 'numeric' },
        { type: 'input', name: 'bottom', label: 'Cắt phía dưới (%)', inputMode: 'numeric' },
        { type: 'input', name: 'left', label: 'Cắt bên trái (%)', inputMode: 'numeric' }
      ]
    },
    initialData: { top: '0', right: '0', bottom: '0', left: '0' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng cắt', primary: true }
    ],
    onSubmit(api) {
      void cropSelectedSummaryImage(editor, image, api.getData(), api);
    }
  });
}

function registerImageLayoutMenu(editor) {
  const layouts = [
    { name: 'inline', text: 'Cùng dòng với văn bản' },
    { name: 'center', text: 'Căn giữa' },
    { name: 'float-left', text: 'Chữ ôm bên trái' },
    { name: 'float-right', text: 'Chữ ôm bên phải' }
  ];
  editor.ui.registry.addMenuButton('summaryimagelayout', {
    text: 'Bố cục ảnh',
    tooltip: 'Căn ảnh và điều chỉnh cách chữ bao quanh',
    fetch(callback) {
      callback(layouts.map(layout => ({
        type: 'menuitem',
        text: layout.text,
        onAction: () => setSelectedImageLayout(editor, layout.name)
      })));
    }
  });
}

function openSummaryImageLayoutDialog(editor) {
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Bố trí hình ảnh',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'layout',
        label: 'Cách hiển thị',
        items: [
          { text: 'Cùng dòng với văn bản', value: 'inline' },
          { text: 'Căn giữa', value: 'center' },
          { text: 'Chữ ôm bên trái', value: 'float-left' },
          { text: 'Chữ ôm bên phải', value: 'float-right' }
        ]
      }]
    },
    initialData: { layout: 'center' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      editor.selection.moveToBookmark(bookmark);
      setSelectedImageLayout(editor, api.getData().layout);
      api.close();
    }
  });
}

export function prepareRichTextDocument(editor) {
  if (!editor) return '';
  normalizeFigureCaptions(editor.getBody());
  normalizeSummaryReferences(editor.getBody());
  normalizeSummaryReferencesDocument(editor.getBody());
  normalizeSummaryNotes(editor.getBody());
  editor.getBody().querySelectorAll('.summary-study-toc').forEach(toc => {
    const headings = [...editor.getBody().querySelectorAll('h1, h2, h3')]
      .filter(heading => !heading.closest('.summary-study-toc, .summary-study-figure-list, .summary-study-table-list, .summary-study-bibliography, .summary-study-index, .summary-study-authorities'));
    if (!headings.length) {
      toc.remove();
      return;
    }
    const entries = headings.map((heading, index) => {
      const id = `summary-study-heading-${index + 1}`;
      heading.id = id;
      const level = Number(heading.tagName.slice(1));
      return `<li class="summary-study-toc-level-${level}"><a href="#${id}">${editor.dom.encode(heading.textContent.trim()) || `Mục ${index + 1}`}</a></li>`;
    });
    editor.dom.setHTML(toc, `<h2>Mục lục</h2><ol>${entries.join('')}</ol>`);
  });
  for (const kind of ['figure', 'table']) {
    const listClass = kind === 'figure' ? '.summary-study-figure-list' : '.summary-study-table-list';
    editor.getBody().querySelectorAll(listClass).forEach(list => {
      const targets = getSummaryReferenceTargets(editor.getBody()).filter(target => target.type === kind);
      if (!targets.length) {
        list.remove();
        return;
      }
      const title = kind === 'figure' ? 'Danh sách hình' : 'Danh sách bảng';
      const items = targets.map(target => (
        `<li><a href="#${editor.dom.encode(target.id)}">${editor.dom.encode(target.label)}</a></li>`
      ));
      editor.dom.setHTML(list, `<h2>${title}</h2><ol>${items.join('')}</ol>`);
    });
  }
  editor.getBody().querySelectorAll('table[data-summary-table-options]').forEach(table => {
    const options = summaryTableOptions(table);
    const rows = [...table.rows];
    rows.forEach((row, rowIndex) => {
      [...row.cells].forEach((cell, columnIndex) => {
        if (options.has('header-row') && rowIndex === 0) {
          cell.style.fontWeight = '700';
          cell.style.backgroundColor ||= '#e8f3ef';
        }
        if (options.has('total-row') && rowIndex === rows.length - 1) {
          cell.style.fontWeight = '700';
          cell.style.borderTop ||= '1px solid #64748b';
        }
        if (options.has('banded-rows') && rowIndex > (options.has('header-row') ? 0 : -1) && rowIndex % 2 === 1) {
          cell.style.backgroundColor ||= '#f3f7f6';
        }
        if ((options.has('first-column') && columnIndex === 0)
          || (options.has('last-column') && columnIndex === row.cells.length - 1)
          || (options.has('banded-columns') && columnIndex % 2 === 1)) {
          cell.style.backgroundColor ||= '#edf2f7';
        }
      });
    });
  });
  return sanitizeRichTextHtml(editor.getContent());
}

function paragraphSelection(editor) {
  const selected = typeof editor.selection.getSelectedBlocks === 'function'
    ? editor.selection.getSelectedBlocks()
    : [];
  const blocks = selected.filter(block => PARAGRAPH_TAGS.has(block.tagName));
  if (blocks.length) return [...new Set(blocks)];
  const node = editor.selection.getNode();
  const block = node.nodeType === 1
    ? node.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre')
    : node.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre');
  return block ? [block] : [];
}

function cssPointValue(value) {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)(pt|px)$/);
  if (!match) return '';
  const points = Number(match[1]) * (match[2] === 'px' ? 0.75 : 1);
  return Number.isInteger(points) ? String(points) : points.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function paragraphTabsValue(block) {
  return (block.getAttribute('data-summary-tabs') || '').split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .join(', ');
}

function readSummaryParagraphDefaults() {
  const stored = localStorage.getItem(SUMMARY_PARAGRAPH_DEFAULTS_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Dữ liệu cài đặt mặc định không hợp lệ.');
    }
    normalizeSummaryParagraphFormat(parsed);
    return parsed;
  } catch (error) {
    throw new Error('Cài đặt đoạn văn mặc định bị lỗi, không thể đọc an toàn.', { cause: error });
  }
}

function normalizeSummaryParagraphFormat(data) {
  const measurements = [
    ['before', 'margin-top', false],
    ['after', 'margin-bottom', false],
    ['left', 'margin-left', false],
    ['right', 'margin-right', false]
  ];
  const styles = {};
  for (const [field, property] of measurements) {
    const raw = String(data[field] || '').trim();
    if (!raw) {
      styles[property] = '';
      continue;
    }
    if (!/^\d+(?:\.\d+)?$/.test(raw) || Number(raw) > 720) {
      throw new Error('Khoảng cách phải là số đo từ 0 đến 720 pt.');
    }
    styles[property] = `${Number(raw)}pt`;
  }

  const indentBy = String(data.indentBy || '').trim();
  if (data.specialIndent && data.specialIndent !== 'none'
    && (!/^\d+(?:\.\d+)?$/.test(indentBy) || Number(indentBy) > 720)) {
    throw new Error('Thụt dòng đặc biệt phải nằm trong khoảng 0–720 pt.');
  }
  styles['text-indent'] = !data.specialIndent || data.specialIndent === 'none'
    ? ''
    : `${data.specialIndent === 'hanging' ? '-' : ''}${Number(indentBy)}pt`;

  const alignment = String(data.alignment || '');
  if (alignment && !['left', 'center', 'right', 'justify'].includes(alignment)) {
    throw new Error('Kiểu căn lề không hợp lệ.');
  }

  const outlineLevel = String(data.outlineLevel || 'body');
  if (outlineLevel !== 'body' && !/^[1-9]$/.test(outlineLevel)) {
    throw new Error('Cấp độ dàn ý phải là Văn bản nội dung hoặc cấp 1–9.');
  }

  const lineSpacingMode = String(data.lineSpacingMode || 'multiple');
  if (!['single', 'one-half', 'double', 'multiple', 'exactly', 'at-least'].includes(lineSpacingMode)) {
    throw new Error('Kiểu giãn dòng không hợp lệ.');
  }
  const lineSpacingValue = String(data.lineSpacingValue || (lineSpacingMode === 'exactly' || lineSpacingMode === 'at-least' ? '' : '1.08')).trim();
  const pointSpacing = lineSpacingMode === 'exactly' || lineSpacingMode === 'at-least';
  const maxLineSpacing = pointSpacing ? 500 : 5;
  if (lineSpacingMode === 'multiple' || pointSpacing) {
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(lineSpacingValue)
      || Number(lineSpacingValue) < 0.5
      || Number(lineSpacingValue) > maxLineSpacing) {
      throw new Error(pointSpacing
        ? 'Khoảng cách dòng phải nằm trong khoảng 0,5–500 pt.'
        : 'Giãn dòng phải nằm trong khoảng 0,5–5.');
    }
  }
  const lineMultipliers = { single: 1, 'one-half': 1.5, double: 2 };
  const lineHeight = pointSpacing
    ? `${Number(lineSpacingValue)}pt`
    : String(lineMultipliers[lineSpacingMode] || Number(lineSpacingValue));

  const tabs = String(data.tabs || '').trim()
    ? String(data.tabs).split(',').map(value => Number(value.trim()))
    : [];
  if (tabs.length > 10 || tabs.some(value => !Number.isFinite(value) || value <= 0 || value > 500)) {
    throw new Error('Nhập tối đa 10 điểm dừng tab, mỗi điểm từ trên 0 đến 500 pt.');
  }

  return {
    styles,
    alignment,
    lineHeight,
    lineSpacingMode,
    lineSpacingValue: lineSpacingMode === 'single' || lineSpacingMode === 'one-half' || lineSpacingMode === 'double'
      ? String(lineMultipliers[lineSpacingMode])
      : String(Number(lineSpacingValue)),
    outlineLevel: outlineLevel === 'body' ? '9' : String(Number(outlineLevel) - 1),
    tabs: [...new Set(tabs)].sort((a, b) => a - b),
    keepNext: Boolean(data.keepNext),
    keepLines: Boolean(data.keepLines),
    pageBreakBefore: Boolean(data.pageBreakBefore),
    noSpaceSameStyle: Boolean(data.noSpaceSameStyle),
    widowControl: data.widowControl !== false
  };
}

function paragraphElementsForValidation() {
  const attributes = ['style', ...PARAGRAPH_DATA_ATTRIBUTES].join('|');
  return [...PARAGRAPH_TAGS].map(tag => `${tag.toLowerCase()}[${attributes}]`).join(',');
}

function createSummaryNavigationPane(editor) {
  const pane = document.createElement('aside');
  pane.className = 'summary-study-navigation-pane';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'Điều hướng tài liệu');
  pane.innerHTML = '<div class="summary-study-navigation-header"><strong>Điều hướng</strong><button type="button" aria-label="Đóng điều hướng">&times;</button></div><label class="summary-study-navigation-search"><span class="visually-hidden">Tìm trong tài liệu</span><input type="search" placeholder="Tìm trong tài liệu" autocomplete="off"></label><div class="summary-study-navigation-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-navigation-tab="headings">Tiêu đề</button><button type="button" role="tab" aria-selected="false" data-navigation-tab="pages">Trang</button><button type="button" role="tab" aria-selected="false" data-navigation-tab="results">Kết quả</button></div><div class="summary-study-navigation-content" role="tabpanel"></div>';
  const search = pane.querySelector('input');
  const content = pane.querySelector('.summary-study-navigation-content');
  const tabs = [...pane.querySelectorAll('[data-navigation-tab]')];
  let activeTab = 'headings';

  function navigateTo(element, range) {
    editor.focus();
    if (range) editor.selection.setRng(range);
    else {
      editor.selection.select(element);
      editor.selection.collapse(true);
    }
    editor.selection.scrollIntoView();
  }

  function addNavigationButton(label, detail, onClick, level = 0) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'summary-study-navigation-item';
    button.style.setProperty('--navigation-level', String(level));
    const title = document.createElement('span');
    title.textContent = label;
    button.append(title);
    if (detail) {
      const caption = document.createElement('small');
      caption.textContent = detail;
      button.append(caption);
    }
    button.addEventListener('click', onClick);
    content.append(button);
  }

  function render() {
    const body = editor.getBody();
    if (!body) return;
    content.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    if (activeTab === 'headings') {
      const headings = [...body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
      headings.forEach((heading, index) => {
        const title = heading.textContent.trim() || '(Tiêu đề trống)';
        if (query && !title.toLocaleLowerCase().includes(query)) return;
        addNavigationButton(title, `Tiêu đề ${heading.tagName.slice(1)}`, () => navigateTo(heading), Number(heading.tagName.slice(1)) - 1);
      });
      if (!content.childElementCount) content.textContent = headings.length ? 'Không tìm thấy tiêu đề phù hợp.' : 'Tài liệu chưa có tiêu đề.';
      return;
    }

    if (activeTab === 'pages') {
      const pages = [];
      let pageNumber = 1;
      let currentPage = [];
      const pageRoot = body.querySelector(':scope > .summary-study-page') || body;
      for (const block of pageRoot.children) {
        const beginsPage = block.matches('.summary-study-page-break,[data-summary-page-break="true"]')
          || block.getAttribute('data-summary-page-break-before') === 'true';
        if (beginsPage && currentPage.length) {
          pages.push(currentPage);
          currentPage = [];
          pageNumber += 1;
        }
        currentPage.push(block);
      }
      if (currentPage.length) pages.push(currentPage);
      pages.forEach((blocks, index) => {
        const first = blocks.find(block => block.textContent.trim());
        const title = first?.textContent.trim() || 'Trang chưa có nội dung';
        if (query && !blocks.some(block => block.textContent.toLocaleLowerCase().includes(query))) return;
        addNavigationButton(`Trang ${index + 1}`, title, () => navigateTo(first || blocks[0]));
      });
      if (!content.childElementCount) content.textContent = 'Không tìm thấy trang phù hợp.';
      return;
    }

    if (!query) {
      content.textContent = 'Nhập từ khóa để tìm trong tài liệu.';
      return;
    }
    const walker = editor.getDoc().createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('script,style,textarea,[contenteditable="false"]')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      }
    });
    let node;
    let count = 0;
    while ((node = walker.nextNode()) && count < 50) {
      const text = node.nodeValue || '';
      const lowerText = text.toLocaleLowerCase();
      let offset = 0;
      let matchIndex;
      while ((matchIndex = lowerText.indexOf(query, offset)) !== -1 && count < 50) {
        const start = matchIndex;
        const end = start + query.length;
        const range = editor.getDoc().createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const excerptStart = Math.max(0, start - 35);
        const excerptEnd = Math.min(text.length, end + 55);
        const excerpt = `${excerptStart ? '…' : ''}${text.slice(excerptStart, excerptEnd)}${excerptEnd < text.length ? '…' : ''}`;
        addNavigationButton(excerpt, 'Kết quả tìm kiếm', () => navigateTo(node.parentElement, range));
        count += 1;
        offset = end;
      }
    }
    if (!count) content.textContent = 'Không tìm thấy kết quả.';
    else if (count === 50) {
      const limit = document.createElement('small');
      limit.className = 'summary-study-navigation-limit';
      limit.textContent = 'Đang hiển thị tối đa 50 kết quả.';
      content.append(limit);
    }
  }

  tabs.forEach(tab => tab.addEventListener('click', () => {
    activeTab = tab.dataset.navigationTab;
    tabs.forEach(item => item.setAttribute('aria-selected', String(item === tab)));
    render();
  }));
  search.addEventListener('input', render);
  pane.querySelector('.summary-study-navigation-header button').addEventListener('click', () => { pane.hidden = true; });
  render();
  return {
    element: pane,
    toggle() {
      pane.hidden = !pane.hidden;
      if (!pane.hidden) {
        render();
        search.focus();
      }
    },
    refresh: render
  };
}

function replaceSummaryTextPattern(search, matchCase, wholeWord) {
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord
    ? `(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`
    : escaped;
  return new RegExp(pattern, matchCase ? 'gu' : 'giu');
}

function replaceSummaryTextValue(text, search, replacement, matchCase, wholeWord = false) {
  if (!search) return { value: text, count: 0 };
  const expression = replaceSummaryTextPattern(search, matchCase, wholeWord);
  let count = 0;
  const value = text.replace(expression, () => {
    count += 1;
    return replacement;
  });
  return { value, count };
}

function replaceSummaryTextRuns(values, search, replacement, matchCase, wholeWord = false) {
  const source = values.join('');
  if (!source || !search) return { values, count: 0 };
  const expression = replaceSummaryTextPattern(search, matchCase, wholeWord);
  const segments = [];
  let offset = 0;
  values.forEach((value, index) => {
    segments.push({ index, start: offset, end: offset + value.length });
    offset += value.length;
  });
  const matches = [...source.matchAll(expression)].map(match => ({
    start: match.index,
    end: match.index + match[0].length
  }));
  const result = [...values];
  for (const { start, end } of matches.reverse()) {
    const first = segments.findIndex(segment => segment.end > start);
    const last = segments.findIndex(segment => segment.end >= end && segment.start < end);
    if (first < 0 || last < first) continue;
    const firstSegment = segments[first];
    const lastSegment = segments[last];
    if (first === last) {
      result[first] = `${result[first].slice(0, start - firstSegment.start)}${replacement}${result[first].slice(end - firstSegment.start)}`;
    } else {
      result[first] = `${result[first].slice(0, start - firstSegment.start)}${replacement}`;
      for (let index = first + 1; index < last; index += 1) result[index] = '';
      result[last] = result[last].slice(end - lastSegment.start);
    }
  }
  return { values: result, count: matches.length };
}

function replaceSummaryDocumentText(editor, search, replacement, matchCase, wholeWord = false) {
  const normalizedSearch = String(search || '');
  const normalizedReplacement = String(replacement ?? '');
  if (!normalizedSearch.trim()) throw new Error('Nhập nội dung cần tìm.');
  if (normalizedSearch.length > 256 || normalizedReplacement.length > 1000) {
    throw new Error('Từ cần tìm tối đa 256 ký tự và nội dung thay thế tối đa 1.000 ký tự.');
  }
  const body = editor.getBody();
  const walker = editor.getDoc().createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('script,style,textarea,[contenteditable="false"]')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  const groups = new Map();
  const changedNodes = new Set();
  nodes.forEach(textNode => {
    const block = textNode.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre,div') || body;
    if (!groups.has(block)) groups.set(block, []);
    groups.get(block).push(textNode);
  });
  let count = 0;
  editor.undoManager.transact(() => {
    groups.forEach(textNodes => {
      const result = replaceSummaryTextRuns(
        textNodes.map(textNode => textNode.nodeValue || ''),
        normalizedSearch,
        normalizedReplacement,
        matchCase,
        wholeWord
      );
      if (!result.count) return;
      textNodes.forEach((textNode, index) => {
        textNode.nodeValue = result.values[index];
        changedNodes.add(textNode);
      });
      count += result.count;
    });
    const emptyFormatting = new Set(['B', 'STRONG', 'EM', 'I', 'U', 'S']);
    changedNodes.forEach(textNode => {
      let parent = textNode.parentElement;
      while (parent && parent !== body && emptyFormatting.has(parent.tagName)
        && !parent.textContent && parent.children.length === 0) {
        const emptyParent = parent;
        parent = parent.parentElement;
        emptyParent.remove();
      }
    });
  });
  if (count) {
    editor.nodeChanged();
    editor.fire('change');
  }
  return count;
}

function openSummaryFindReplaceDialog(editor) {
  editor.windowManager.open({
    title: 'Tìm và thay thế',
    size: 'normal',
    body: {
      type: 'panel',
      items: [
        { type: 'input', name: 'search', label: 'Tìm nội dung', inputMode: 'text' },
        { type: 'input', name: 'replacement', label: 'Thay bằng', inputMode: 'text' },
        { type: 'checkbox', name: 'matchCase', label: 'Phân biệt chữ hoa và chữ thường' },
        { type: 'checkbox', name: 'wholeWord', label: 'Chỉ khớp từ hoàn chỉnh' }
      ]
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Thay thế tất cả', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      try {
        const count = replaceSummaryDocumentText(editor, data.search, data.replacement, data.matchCase, data.wholeWord);
        editor.notificationManager.open({
          text: count ? `Đã thay thế ${count} vị trí.` : 'Không tìm thấy nội dung phù hợp.',
          type: count ? 'success' : 'info',
          timeout: 3500
        });
        api.close();
      } catch (error) {
        console.error('[SummaryStudyEditor] Không thể thay thế nội dung:', error);
        editor.notificationManager.open({ text: error.message, type: 'error', timeout: 4500 });
      }
    }
  });
}

function loadSummaryNamedStyles() {
  const raw = localStorage.getItem(SUMMARY_STYLE_STORAGE_KEY);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Danh sách kiểu định dạng đã lưu không hợp lệ.');
  return value.filter(item => item && typeof item.name === 'string'
    && typeof item.styles === 'string' && item.styles.length <= 1200
    && typeof item.block === 'string' && /^(?:p|h[1-6]|blockquote|pre)$/.test(item.block));
}

function saveSummaryNamedStyle(editor) {
  const selectionNode = editor.selection.getNode();
  const block = selectionNode.nodeType === 1
    ? selectionNode.closest('p,h1,h2,h3,h4,h5,h6,blockquote,pre')
    : selectionNode.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,blockquote,pre');
  if (!block) {
    editor.notificationManager.open({ text: 'Đặt con trỏ trong đoạn có định dạng cần lưu.', type: 'info', timeout: 3500 });
    return;
  }
  const styles = SAFE_NAMED_STYLE_PROPERTIES
    .map(property => [property, block.style.getPropertyValue(property).trim()])
    .filter(([, value]) => value)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
  if (!styles) {
    editor.notificationManager.open({ text: 'Đoạn này chưa có định dạng tùy chỉnh để lưu.', type: 'info', timeout: 3500 });
    return;
  }
  const initialName = '';
  editor.windowManager.open({
    title: 'Lưu kiểu định dạng cá nhân',
    body: { type: 'panel', items: [{ type: 'input', name: 'name', label: 'Tên kiểu' }] },
    initialData: { name: initialName },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Lưu kiểu', primary: true }
    ],
    onSubmit(api) {
      const name = String(api.getData().name || '').trim();
      if (!name || name.length > 40) {
        editor.notificationManager.open({ text: 'Tên kiểu phải có từ 1 đến 40 ký tự.', type: 'error', timeout: 3500 });
        return;
      }
      try {
        const saved = loadSummaryNamedStyles();
        const existing = saved.findIndex(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
        const item = { name, block: block.tagName.toLowerCase(), styles };
        if (existing >= 0) saved[existing] = item;
        else if (saved.length < 30) saved.push(item);
        else {
          editor.notificationManager.open({ text: 'Đã đạt giới hạn 30 kiểu cá nhân. Hãy ghi đè kiểu cũ.', type: 'error', timeout: 4000 });
          return;
        }
        localStorage.setItem(SUMMARY_STYLE_STORAGE_KEY, JSON.stringify(saved));
        api.close();
        editor.notificationManager.open({ text: `Đã lưu kiểu “${name}” trên thiết bị này.`, type: 'success', timeout: 3000 });
      } catch (error) {
        console.error('[SummaryEditorStyles] Không thể lưu kiểu:', error);
        editor.notificationManager.open({ text: error.message || 'Không thể lưu kiểu định dạng.', type: 'error', timeout: 4500 });
      }
    }
  });
}

function applySummaryNamedStyle(editor, style) {
  const blocks = paragraphSelection(editor);
  if (!blocks.length) {
    editor.notificationManager.open({ text: 'Đặt con trỏ trong đoạn cần áp dụng kiểu.', type: 'info', timeout: 3500 });
    return;
  }
  const parsedStyles = document.createElement('span').style;
  parsedStyles.cssText = style.styles;
  editor.undoManager.transact(() => {
    if (blocks.some(block => block.tagName.toLowerCase() !== style.block)) {
      editor.execCommand('FormatBlock', false, style.block);
    }
    paragraphSelection(editor).forEach(target => {
      for (const property of SAFE_NAMED_STYLE_PROPERTIES) {
        const value = parsedStyles.getPropertyValue(property);
        if (value) editor.dom.setStyle(target, property, value);
      }
    });
  });
  editor.nodeChanged();
  editor.fire('change');
}

function openSummaryNamedStyleDialog(editor) {
  let saved;
  try {
    saved = loadSummaryNamedStyles();
  } catch (error) {
    console.error('[SummaryEditorStyles] Không thể đọc kiểu đã lưu:', error);
    editor.notificationManager.open({ text: error.message || 'Không thể đọc kiểu đã lưu.', type: 'error', timeout: 4500 });
    return;
  }
  if (!saved.length) {
    editor.notificationManager.open({ text: 'Chưa có kiểu cá nhân nào. Hãy định dạng một đoạn rồi chọn “Lưu kiểu cá nhân”.', type: 'info', timeout: 4000 });
    return;
  }
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Áp dụng kiểu cá nhân',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'styleName',
        label: 'Kiểu định dạng',
        items: saved.map(style => ({ text: style.name, value: style.name }))
      }]
    },
    initialData: { styleName: saved[0].name },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      const style = saved.find(item => item.name === api.getData().styleName);
      if (!style) {
        editor.notificationManager.open({ text: 'Kiểu đã chọn không còn tồn tại. Hãy mở lại danh sách.', type: 'warning', timeout: 3500 });
        api.close();
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      applySummaryNamedStyle(editor, style);
      api.close();
    }
  });
}

function manageSummaryNamedStyles(editor) {
  let saved;
  try {
    saved = loadSummaryNamedStyles();
  } catch (error) {
    console.error('[SummaryEditorStyles] Không thể đọc kiểu đã lưu:', error);
    editor.notificationManager.open({ text: error.message || 'Không thể đọc kiểu đã lưu.', type: 'error', timeout: 4500 });
    return;
  }
  if (!saved.length) {
    editor.notificationManager.open({ text: 'Chưa có kiểu cá nhân nào để quản lý.', type: 'info', timeout: 3500 });
    return;
  }
  editor.windowManager.open({
    title: 'Quản lý kiểu cá nhân',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'styleName',
        label: 'Chọn kiểu cần xóa',
        items: saved.map(style => ({ text: style.name, value: style.name }))
      }]
    },
    initialData: { styleName: saved[0].name },
    buttons: [
      { type: 'cancel', text: 'Đóng' },
      { type: 'submit', text: 'Xóa kiểu', primary: true }
    ],
    onSubmit(api) {
      const name = String(api.getData().styleName || '');
      const current = loadSummaryNamedStyles();
      const remaining = current.filter(style => style.name !== name);
      if (remaining.length === current.length) {
        editor.notificationManager.open({ text: 'Kiểu đã chọn không còn tồn tại. Hãy mở lại danh sách.', type: 'warning', timeout: 3500 });
        api.close();
        return;
      }
      try {
        localStorage.setItem(SUMMARY_STYLE_STORAGE_KEY, JSON.stringify(remaining));
        api.close();
        editor.notificationManager.open({ text: `Đã xóa kiểu “${name}”.`, type: 'success', timeout: 3000 });
      } catch (error) {
        console.error('[SummaryEditorStyles] Không thể xóa kiểu:', error);
        editor.notificationManager.open({ text: error.message || 'Không thể xóa kiểu định dạng.', type: 'error', timeout: 4500 });
      }
    }
  });
}

function registerSummaryNamedStyles(editor) {
  editor.ui.registry.addMenuButton('summarycustomstyles', {
    text: 'Kiểu cá nhân',
    tooltip: 'Lưu hoặc áp dụng kiểu định dạng riêng',
    fetch(callback) {
      let saved = [];
      try {
        saved = loadSummaryNamedStyles();
      } catch (error) {
        console.error('[SummaryEditorStyles] Không thể đọc kiểu đã lưu:', error);
        editor.notificationManager.open({ text: error.message || 'Không thể đọc kiểu đã lưu.', type: 'error', timeout: 4500 });
      }
      callback([
        ...saved.map(style => ({
          type: 'menuitem',
          text: style.name,
          onAction: () => applySummaryNamedStyle(editor, style)
        })),
        { type: 'separator' },
        { type: 'menuitem', text: 'Lưu định dạng đoạn hiện tại…', onAction: () => saveSummaryNamedStyle(editor) },
        { type: 'menuitem', text: 'Quản lý kiểu cá nhân…', onAction: () => manageSummaryNamedStyles(editor) }
      ]);
    }
  });
}

function selectedEditorText(editor) {
  return editor.selection.getContent({ format: 'text' }).trim();
}

function openSummaryCommentDialog(editor) {
  const selectionText = selectedEditorText(editor);
  if (!selectionText) {
    editor.notificationManager.open({ text: 'Bôi đen nội dung cần bình luận trước.', type: 'info', timeout: 3000 });
    return;
  }
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Thêm bình luận',
    body: { type: 'panel', items: [{ type: 'textarea', name: 'comment', label: 'Nội dung bình luận' }] },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Thêm bình luận', primary: true }
    ],
    onSubmit(api) {
      const comment = String(api.getData().comment || '').trim();
      if (!comment || comment.length > 500) {
        editor.notificationManager.open({ text: 'Bình luận phải có từ 1 đến 500 ký tự.', type: 'error', timeout: 3500 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      if (editor.selection.isCollapsed()) {
        editor.notificationManager.open({ text: 'Không thể khôi phục vùng chọn. Hãy bôi đen lại rồi thử.', type: 'error', timeout: 4000 });
        return;
      }
      editor.undoManager.transact(() => {
        editor.formatter.apply('summaryInlineComment');
        const node = editor.selection.getNode();
        const wrapper = node.nodeType === 1
          ? node.closest('span.summary-study-inline-comment')
          : node.parentElement?.closest('span.summary-study-inline-comment');
        if (wrapper) editor.dom.setAttrib(wrapper, 'title', comment);
      });
      api.close();
      editor.nodeChanged();
      editor.fire('change');
    }
  });
}

const SUMMARY_TEXT_EFFECTS = [
  { name: 'summaryTextOutline', title: 'Viền chữ', classes: 'summary-study-text-effect--outline' },
  { name: 'summaryTextShadow', title: 'Bóng đổ', classes: 'summary-study-text-effect--shadow' },
  { name: 'summaryTextReflection', title: 'Phản chiếu', classes: 'summary-study-text-effect--reflection' },
  { name: 'summaryTextGlow', title: 'Phát sáng', classes: 'summary-study-text-effect--glow' }
];

function applySummaryTextEffect(editor, effectName, bookmark) {
  const effect = SUMMARY_TEXT_EFFECTS.find(item => item.name === effectName);
  if (effectName !== 'remove' && !effect) {
    editor.notificationManager.open({ text: 'Hiệu ứng chữ đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
    return false;
  }
  if (bookmark) editor.selection.moveToBookmark(bookmark);
  if (!selectedEditorText(editor)) {
    editor.notificationManager.open({ text: 'Bôi đen chữ cần áp dụng hoặc gỡ hiệu ứng trước.', type: 'info', timeout: 3500 });
    return false;
  }
  editor.undoManager.transact(() => {
    SUMMARY_TEXT_EFFECTS.forEach(item => editor.formatter.remove(item.name));
    if (effect) editor.formatter.apply(effect.name);
  });
  editor.nodeChanged();
  editor.fire('change');
  return true;
}

function openSummaryTextEffectsDialog(editor) {
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Hiệu ứng chữ',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'effect',
        label: 'Chọn hiệu ứng',
        items: [
          ...SUMMARY_TEXT_EFFECTS.map(effect => ({ text: effect.title, value: effect.name })),
          { text: 'Bỏ hiệu ứng chữ', value: 'remove' }
        ]
      }]
    },
    initialData: { effect: 'summaryTextShadow' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      if (applySummaryTextEffect(editor, api.getData().effect, bookmark)) api.close();
    }
  });
}

const SUMMARY_EQUATION_TEMPLATES = {
  circle: {
    label: 'Diện tích hình tròn — A = πr²',
    nodes: [{ type: 'text', value: 'A = π' }, { type: 'sup', base: [{ type: 'text', value: 'r' }], exponent: [{ type: 'text', value: '2' }] }]
  },
  pythagorean: {
    label: 'Định lý Pythagore — a² + b² = c²',
    nodes: [
      { type: 'sup', base: [{ type: 'text', value: 'a' }], exponent: [{ type: 'text', value: '2' }] },
      { type: 'text', value: ' + ' },
      { type: 'sup', base: [{ type: 'text', value: 'b' }], exponent: [{ type: 'text', value: '2' }] },
      { type: 'text', value: ' = ' },
      { type: 'sup', base: [{ type: 'text', value: 'c' }], exponent: [{ type: 'text', value: '2' }] }
    ]
  },
  binomial: {
    label: 'Định lý nhị thức — (x + a)ⁿ',
    nodes: [
      { type: 'sup', base: [{ type: 'text', value: '(x + a)' }], exponent: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' = ' },
      { type: 'sum', base: [{ type: 'text', value: 'Σ' }], lower: [{ type: 'text', value: 'k = 0' }], upper: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' C(n,k)' },
      { type: 'sup', base: [{ type: 'text', value: 'x' }], exponent: [{ type: 'text', value: 'k' }] },
      { type: 'text', value: ' ' },
      { type: 'sup', base: [{ type: 'text', value: 'a' }], exponent: [{ type: 'text', value: 'n − k' }] }
    ]
  },
  expansion: {
    label: 'Khai triển tổng — (1 + x)ⁿ',
    nodes: [
      { type: 'sup', base: [{ type: 'text', value: '(1 + x)' }], exponent: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' = 1 + ' },
      { type: 'fraction', numerator: [{ type: 'text', value: 'n x' }], denominator: [{ type: 'text', value: '1!' }] },
      { type: 'text', value: ' + ' },
      {
        type: 'fraction',
        numerator: [
          { type: 'text', value: 'n(n − 1)' },
          { type: 'sup', base: [{ type: 'text', value: 'x' }], exponent: [{ type: 'text', value: '2' }] }
        ],
        denominator: [{ type: 'text', value: '2!' }]
      },
      { type: 'text', value: ' + ⋯' }
    ]
  },
  fourier: {
    label: 'Chuỗi Fourier',
    nodes: [
      { type: 'text', value: 'f(x) = ' },
      { type: 'sub', base: [{ type: 'text', value: 'a' }], index: [{ type: 'text', value: '0' }] },
      { type: 'text', value: ' + ' },
      { type: 'sum', base: [{ type: 'text', value: 'Σ' }], lower: [{ type: 'text', value: 'n = 1' }], upper: [{ type: 'text', value: '∞' }] },
      { type: 'text', value: ' (' },
      { type: 'sub', base: [{ type: 'text', value: 'a' }], index: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' cos(' },
      { type: 'fraction', numerator: [{ type: 'text', value: 'nπx' }], denominator: [{ type: 'text', value: 'L' }] },
      { type: 'text', value: ') + ' },
      { type: 'sub', base: [{ type: 'text', value: 'b' }], index: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' sin(' },
      { type: 'fraction', numerator: [{ type: 'text', value: 'nπx' }], denominator: [{ type: 'text', value: 'L' }] },
      { type: 'text', value: '))' }
    ]
  },
  quadratic: {
    label: 'Nghiệm phương trình bậc hai',
    nodes: [
      { type: 'text', value: 'x = ' },
      {
        type: 'fraction',
        numerator: [
          { type: 'text', value: '−b ± ' },
          { type: 'sqrt', children: [
            { type: 'sup', base: [{ type: 'text', value: 'b' }], exponent: [{ type: 'text', value: '2' }] },
            { type: 'text', value: ' − 4ac' }
          ] }
        ],
        denominator: [{ type: 'text', value: '2a' }]
      }
    ]
  },
  summation: {
    label: 'Tổng từ i = 1 đến n',
    nodes: [
      { type: 'sum', base: [{ type: 'text', value: 'Σ' }], lower: [{ type: 'text', value: 'i = 1' }], upper: [{ type: 'text', value: 'n' }] },
      { type: 'text', value: ' ' },
      { type: 'sub', base: [{ type: 'text', value: 'x' }], index: [{ type: 'text', value: 'i' }] }
    ]
  }
};

const SUMMARY_SYMBOLS = [
  { text: 'α — alpha', value: 'α' }, { text: 'β — beta', value: 'β' }, { text: 'γ — gamma', value: 'γ' },
  { text: 'Δ — Delta', value: 'Δ' }, { text: 'λ — lambda', value: 'λ' }, { text: 'μ — mu', value: 'μ' },
  { text: 'π — pi', value: 'π' }, { text: 'σ — sigma', value: 'σ' }, { text: 'Ω — Omega', value: 'Ω' },
  { text: '± — cộng trừ', value: '±' }, { text: '× — nhân', value: '×' }, { text: '÷ — chia', value: '÷' },
  { text: '≈ — xấp xỉ', value: '≈' }, { text: '≠ — khác', value: '≠' }, { text: '≤ — nhỏ hơn hoặc bằng', value: '≤' },
  { text: '≥ — lớn hơn hoặc bằng', value: '≥' }, { text: '∞ — vô cực', value: '∞' }, { text: '√ — căn bậc hai', value: '√' },
  { text: '∑ — tổng', value: '∑' }, { text: '∫ — tích phân', value: '∫' }, { text: '∂ — đạo hàm riêng', value: '∂' },
  { text: '° — độ', value: '°' }, { text: '℃ — độ C', value: '℃' }, { text: 'µ — micro', value: 'µ' },
  { text: '→ — mũi tên phải', value: '→' }, { text: '← — mũi tên trái', value: '←' }, { text: '↔ — tương đương', value: '↔' },
  { text: '• — dấu đầu dòng', value: '•' }, { text: '… — dấu ba chấm', value: '…' }, { text: '§ — mục', value: '§' }
];

function normalizeSummaryEquationNodes(nodes, depth = 0, counter = { count: 0, length: 0, hasVisibleText: false }) {
  if (!Array.isArray(nodes) || depth > 8) throw new Error('Cấu trúc phương trình không hợp lệ.');
  const normalized = nodes.map(node => {
    counter.count += 1;
    if (counter.count > 120 || !node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('Phương trình vượt quá giới hạn cấu trúc.');
    }
    if (node.type === 'text') {
      const value = String(node.value || '');
      counter.length += Array.from(value).length;
      if (value.trim()) counter.hasVisibleText = true;
      if (!value || value.length > 120 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
        throw new Error('Phần văn bản trong phương trình không hợp lệ.');
      }
      return { type: 'text', value };
    }
    if (node.type === 'sup' || node.type === 'sub') {
      return {
        type: node.type,
        base: normalizeSummaryEquationNodes(node.base, depth + 1, counter),
        [node.type === 'sup' ? 'exponent' : 'index']: normalizeSummaryEquationNodes(
          node[node.type === 'sup' ? 'exponent' : 'index'],
          depth + 1,
          counter
        )
      };
    }
    if (node.type === 'fraction') {
      return {
        type: 'fraction',
        numerator: normalizeSummaryEquationNodes(node.numerator, depth + 1, counter),
        denominator: normalizeSummaryEquationNodes(node.denominator, depth + 1, counter)
      };
    }
    if (node.type === 'sqrt') return { type: 'sqrt', children: normalizeSummaryEquationNodes(node.children, depth + 1, counter) };
    if (node.type === 'root') {
      return {
        type: 'root',
        degree: normalizeSummaryEquationNodes(node.degree, depth + 1, counter),
        children: normalizeSummaryEquationNodes(node.children, depth + 1, counter)
      };
    }
    if (node.type === 'sum') {
      return {
        type: 'sum',
        base: normalizeSummaryEquationNodes(node.base, depth + 1, counter),
        lower: normalizeSummaryEquationNodes(node.lower, depth + 1, counter),
        upper: normalizeSummaryEquationNodes(node.upper, depth + 1, counter)
      };
    }
    throw new Error('Kiểu cấu trúc phương trình không được hỗ trợ.');
  });
  if (!normalized.length) throw new Error('Mỗi phần của phương trình cần có nội dung.');
  return normalized;
}

function normalizeSummaryEquationModel(value) {
  if (!value || value.version !== 1) throw new Error('Phiên bản phương trình không được hỗ trợ.');
  const counter = { count: 0, length: 0, hasVisibleText: false };
  const model = { version: 1, nodes: normalizeSummaryEquationNodes(value.nodes, 0, counter) };
  if (!counter.hasVisibleText || counter.length > 300) throw new Error('Phương trình cần có nội dung và tối đa 300 ký tự.');
  return model;
}

function renderSummaryEquationNodes(nodes, encode) {
  return nodes.map(node => {
    if (node.type === 'text') return encode(node.value);
    if (node.type === 'sup') {
      return `<span class="summary-study-equation-script">${renderSummaryEquationNodes(node.base, encode)}<sup>${renderSummaryEquationNodes(node.exponent, encode)}</sup></span>`;
    }
    if (node.type === 'sub') {
      return `<span class="summary-study-equation-script">${renderSummaryEquationNodes(node.base, encode)}<sub>${renderSummaryEquationNodes(node.index, encode)}</sub></span>`;
    }
    if (node.type === 'fraction') {
      return `<span class="summary-study-equation-fraction"><span class="summary-study-equation-numerator">${renderSummaryEquationNodes(node.numerator, encode)}</span><span class="summary-study-equation-denominator">${renderSummaryEquationNodes(node.denominator, encode)}</span></span>`;
    }
    if (node.type === 'sqrt') {
      return `<span class="summary-study-equation-root"><span class="summary-study-equation-radical-symbol" aria-hidden="true">√</span><span class="summary-study-equation-radicand">${renderSummaryEquationNodes(node.children, encode)}</span></span>`;
    }
    if (node.type === 'root') {
      return `<span class="summary-study-equation-root"><sup class="summary-study-equation-degree">${renderSummaryEquationNodes(node.degree, encode)}</sup><span class="summary-study-equation-radical-symbol" aria-hidden="true">√</span><span class="summary-study-equation-radicand">${renderSummaryEquationNodes(node.children, encode)}</span></span>`;
    }
    return `<span class="summary-study-equation-sum">${renderSummaryEquationNodes(node.base, encode)}<span class="summary-study-equation-limits"><sup>${renderSummaryEquationNodes(node.upper, encode)}</sup><sub>${renderSummaryEquationNodes(node.lower, encode)}</sub></span></span>`;
  }).join('');
}

function summaryEquationAccessibleText(nodes) {
  return nodes.map(node => {
    if (node.type === 'text') return node.value;
    if (node.type === 'fraction') {
      return `${summaryEquationAccessibleText(node.numerator)} trên ${summaryEquationAccessibleText(node.denominator)}`;
    }
    if (node.type === 'sup') {
      return `${summaryEquationAccessibleText(node.base)} mũ ${summaryEquationAccessibleText(node.exponent)}`;
    }
    if (node.type === 'sub') {
      return `${summaryEquationAccessibleText(node.base)} chỉ số ${summaryEquationAccessibleText(node.index)}`;
    }
    if (node.type === 'sqrt') return `căn bậc hai của ${summaryEquationAccessibleText(node.children)}`;
    if (node.type === 'root') {
      return `căn bậc ${summaryEquationAccessibleText(node.degree)} của ${summaryEquationAccessibleText(node.children)}`;
    }
    return `${summaryEquationAccessibleText(node.base)} từ ${summaryEquationAccessibleText(node.lower)} đến ${summaryEquationAccessibleText(node.upper)}`;
  }).join('');
}

function summaryEquationMarkup(editor, model) {
  const normalized = normalizeSummaryEquationModel(model);
  const metadata = editor.dom.encode(JSON.stringify(normalized));
  const content = renderSummaryEquationNodes(normalized.nodes, value => editor.dom.encode(value));
  const accessibleText = editor.dom.encode(summaryEquationAccessibleText(normalized.nodes).slice(0, 500));
  return `<span class="summary-study-equation" role="math" aria-label="${accessibleText}" data-summary-equation="${metadata}">${content}</span>`;
}

function selectedSummaryEquation(editor) {
  const node = editor.selection.getNode();
  return node?.closest?.('span.summary-study-equation[data-summary-equation]')
    || (node?.matches?.('span.summary-study-equation[data-summary-equation]') ? node : null);
}

function summaryEquationBuilderData(model) {
  const structure = model.nodes.at(-1);
  const prefix = model.nodes.slice(0, -1);
  if (!structure || prefix.some(node => node.type !== 'text')) return null;
  const text = nodes => nodes.every(node => node.type === 'text')
    ? nodes.map(node => node.value).join('')
    : null;
  const data = {
    structure: structure.type,
    before: prefix.map(node => node.value).join(''),
    base: '',
    upper: '',
    lower: ''
  };
  if (structure.type === 'fraction') {
    data.base = text(structure.numerator);
    data.upper = text(structure.denominator);
  } else if (structure.type === 'sup') {
    data.base = text(structure.base);
    data.upper = text(structure.exponent);
  } else if (structure.type === 'sub') {
    data.base = text(structure.base);
    data.upper = text(structure.index);
  } else if (structure.type === 'sqrt') {
    data.base = text(structure.children);
  } else if (structure.type === 'root') {
    data.base = text(structure.children);
    data.lower = text(structure.degree);
  } else if (structure.type === 'sum' && text(structure.base) === 'Σ') {
    data.upper = text(structure.upper);
    data.lower = text(structure.lower);
  } else {
    return null;
  }
  return Object.values(data).every(value => value !== null) ? data : null;
}

function openSummaryEquationGallery(editor) {
  const bookmark = editor.selection.getBookmark(2, true);
  const existing = selectedSummaryEquation(editor);
  editor.windowManager.open({
    title: existing ? 'Thay thế phương trình' : 'Phương trình tích hợp',
    size: 'medium',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'template',
          label: 'Chọn mẫu phương trình',
          items: [
            ...Object.entries(SUMMARY_EQUATION_TEMPLATES).map(([value, template]) => ({
              text: template.label,
              value
            }))
          ]
        }
      ]
    },
    initialData: { template: 'circle' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: existing ? 'Thay thế phương trình' : 'Chèn phương trình', primary: true }
    ],
    onSubmit(api) {
      try {
        const template = SUMMARY_EQUATION_TEMPLATES[api.getData().template];
        if (!template) throw new Error('Mẫu phương trình đã chọn không hợp lệ.');
        const model = { version: 1, nodes: template.nodes };
        editor.selection.moveToBookmark(bookmark);
        editor.undoManager.transact(() => {
          if (existing) {
            existing.outerHTML = summaryEquationMarkup(editor, model);
          } else {
            editor.insertContent(summaryEquationMarkup(editor, model));
          }
        });
        editor.nodeChanged();
        editor.fire('change');
        api.close();
      } catch (error) {
        editor.notificationManager.open({ text: error.message || 'Không thể chèn phương trình.', type: 'error', timeout: 4000 });
      }
    }
  });
}

function openSummaryEquationBuilder(editor) {
  const bookmark = editor.selection.getBookmark(2, true);
  const existing = selectedSummaryEquation(editor);
  const initialData = existing
    ? summaryEquationBuilderData(normalizeSummaryEquationModel(JSON.parse(existing.dataset.summaryEquation)))
    : { structure: 'fraction', before: '', base: '', upper: '', lower: '' };
  if (!initialData) {
    editor.notificationManager.open({
      text: 'Phương trình này có cấu trúc lồng nhau; hãy dùng thư viện phương trình để thay bằng một mẫu khác.',
      type: 'info',
      timeout: 4500
    });
    return;
  }
  editor.windowManager.open({
    title: existing ? 'Sửa phương trình' : 'Chèn phương trình mới',
    size: 'medium',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'structure',
          label: 'Cấu trúc',
          items: [
            { text: 'Phân số', value: 'fraction' },
            { text: 'Số mũ', value: 'sup' },
            { text: 'Chỉ số dưới', value: 'sub' },
            { text: 'Căn bậc hai', value: 'sqrt' },
            { text: 'Căn bậc n', value: 'root' },
            { text: 'Tổng có giới hạn', value: 'sum' }
          ]
        },
        { type: 'input', name: 'before', label: 'Nội dung trước cấu trúc (tùy chọn)' },
        { type: 'input', name: 'base', label: 'Cơ số / tử số / biểu thức' },
        { type: 'input', name: 'upper', label: 'Số mũ / mẫu số / giới hạn trên' },
        { type: 'input', name: 'lower', label: 'Chỉ số dưới / giới hạn dưới (nếu cần)' }
      ]
    },
    initialData,
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: existing ? 'Cập nhật phương trình' : 'Chèn phương trình', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      const textNode = value => value ? [{ type: 'text', value: String(value).trim() }] : [];
      let structure;
      if (data.structure === 'fraction') {
        structure = { type: 'fraction', numerator: textNode(data.base), denominator: textNode(data.upper) };
      } else if (data.structure === 'sup') {
        structure = { type: 'sup', base: textNode(data.base), exponent: textNode(data.upper) };
      } else if (data.structure === 'sub') {
        structure = { type: 'sub', base: textNode(data.base), index: textNode(data.upper) };
      } else if (data.structure === 'sqrt') {
        structure = { type: 'sqrt', children: textNode(data.base) };
      } else if (data.structure === 'root') {
        structure = { type: 'root', degree: textNode(data.lower), children: textNode(data.base) };
      } else if (data.structure === 'sum') {
        structure = {
          type: 'sum',
          base: [{ type: 'text', value: 'Σ' }],
          lower: textNode(data.lower),
          upper: textNode(data.upper)
        };
      } else {
        editor.notificationManager.open({ text: 'Cấu trúc phương trình đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
        return;
      }
      try {
        const model = normalizeSummaryEquationModel({
          version: 1,
          nodes: [...textNode(data.before), structure]
        });
        editor.selection.moveToBookmark(bookmark);
        editor.undoManager.transact(() => {
          if (existing) existing.outerHTML = summaryEquationMarkup(editor, model);
          else editor.insertContent(summaryEquationMarkup(editor, model));
        });
        editor.nodeChanged();
        editor.fire('change');
        api.close();
      } catch (error) {
        editor.notificationManager.open({ text: error.message || 'Không thể tạo phương trình.', type: 'error', timeout: 4000 });
      }
    }
  });
}

function openSummarySymbolDialog(editor) {
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Chèn ký hiệu',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'symbol',
        label: 'Ký hiệu',
        items: SUMMARY_SYMBOLS
      }]
    },
    initialData: { symbol: 'α' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn ký hiệu', primary: true }
    ],
    onSubmit(api) {
      const symbol = api.getData().symbol;
      if (!SUMMARY_SYMBOLS.some(item => item.value === symbol)) {
        editor.notificationManager.open({ text: 'Ký hiệu đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      editor.undoManager.transact(() => editor.insertContent(editor.dom.encode(symbol)));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function registerSummaryTextEffects(editor) {
  editor.on('init', () => {
    editor.formatter.register('summaryInlineComment', {
      inline: 'span',
      classes: 'summary-study-inline-comment',
      attributes: { 'data-summary-comment': 'true' }
    });
    SUMMARY_TEXT_EFFECTS.forEach(effect => editor.formatter.register(effect.name, {
      inline: 'span',
      classes: effect.classes
    }));
  });
  editor.ui.registry.addMenuButton('summarytexteffects', {
    text: 'Hiệu ứng chữ',
    tooltip: 'Viền, bóng, phản chiếu và phát sáng',
    fetch(callback) {
      callback([
        ...SUMMARY_TEXT_EFFECTS.map(effect => ({
          type: 'menuitem',
          text: effect.title,
          onAction: () => applySummaryTextEffect(editor, effect.name, editor.selection.getBookmark(2, true))
        })),
        { type: 'separator' },
        {
          type: 'menuitem',
          text: 'Bỏ hiệu ứng chữ',
          onAction: () => applySummaryTextEffect(editor, 'remove', editor.selection.getBookmark(2, true))
        }
      ]);
    }
  });
}

export function readSummaryText(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance !== 'function') {
    return false;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = 'vi-VN';
  window.speechSynthesis.speak(utterance);
  return true;
}

function readSummarySelectedText(editor) {
  const text = selectedEditorText(editor);
  if (!text) {
    editor.notificationManager.open({ text: 'Bôi đen đoạn văn bản cần đọc trước.', type: 'info', timeout: 3000 });
    return;
  }
  const engine = typeof window !== 'undefined' ? window.QLCLTTS : null;
  if (engine) {
    engine.stop();
    engine.speak(text).then(ok => {
      if (!ok) {
        editor.notificationManager.open({ text: 'Trình duyệt này chưa hỗ trợ đọc văn bản.', type: 'error', timeout: 4000 });
      }
    });
    return;
  }
  if (!readSummaryText(text)) {
    editor.notificationManager.open({ text: 'Trình duyệt này chưa hỗ trợ đọc văn bản.', type: 'error', timeout: 4000 });
  }
}

function registerSummaryContextActions(editor) {
  editor.ui.registry.addButton('summaryreadaloudbutton', {
    text: 'Đọc',
    tooltip: 'Đọc đoạn đang chọn',
    onAction: () => readSummarySelectedText(editor)
  });
  editor.ui.registry.addMenuItem('summarycomment', {
    text: 'Thêm bình luận vào đoạn chọn',
    onAction: () => openSummaryCommentDialog(editor)
  });
  editor.ui.registry.addMenuItem('summaryreadaloud', {
    text: 'Đọc đoạn chọn',
    onAction: () => readSummarySelectedText(editor)
  });
}

function paragraphFormatDialog(editor) {
  const blocks = paragraphSelection(editor);
  if (!blocks.length) {
    editor.notificationManager.open({
      text: 'Đặt con trỏ trong đoạn văn hoặc chọn các đoạn cần định dạng trước.',
      type: 'info',
      timeout: 3500
    });
    return;
  }

  const block = blocks[0];
  const style = block.style;
  const blockData = {
    alignment: style.textAlign || '',
    before: cssPointValue(style.marginTop),
    after: cssPointValue(style.marginBottom),
    left: cssPointValue(style.marginLeft),
    right: cssPointValue(style.marginRight),
    specialIndent: style.textIndent
      ? (Number.parseFloat(style.textIndent) < 0 ? 'hanging' : 'first-line')
      : 'none',
    indentBy: style.textIndent ? String(Math.abs(Number.parseFloat(cssPointValue(style.textIndent) || 0))) : '',
    lineSpacingMode: block.getAttribute('data-summary-line-spacing-mode') || 'multiple',
    lineSpacingValue: block.getAttribute('data-summary-line-spacing-value')
      || (Number.parseFloat(style.lineHeight) ? String(Number.parseFloat(style.lineHeight)) : '1.08'),
    tabs: paragraphTabsValue(block),
    outlineLevel: block.hasAttribute('data-summary-outline-level')
      ? (block.getAttribute('data-summary-outline-level') === '9'
        ? 'body'
        : String(Number(block.getAttribute('data-summary-outline-level')) + 1))
      : 'body',
    keepNext: block.getAttribute('data-summary-keep-next') === 'true',
    keepLines: block.getAttribute('data-summary-keep-lines') === 'true',
    pageBreakBefore: block.getAttribute('data-summary-page-break-before') === 'true',
    noSpaceSameStyle: block.getAttribute('data-summary-no-space-same-style') === 'true',
    widowControl: block.getAttribute('data-summary-widow-control') !== 'false'
  };
  const hasBlockFormatting = Boolean(
    style.textAlign || style.marginTop || style.marginBottom || style.marginLeft
      || style.marginRight || style.textIndent || style.lineHeight
  )
    || [...PARAGRAPH_DATA_ATTRIBUTES].some(attribute => block.hasAttribute(attribute));
  let initialData = blockData;
  try {
    const defaults = readSummaryParagraphDefaults();
    if (!hasBlockFormatting && defaults) initialData = { ...blockData, ...defaults };
  } catch (error) {
    editor.notificationManager.open({ text: error.message, type: 'error', timeout: 5000 });
    return;
  }

  editor.windowManager.open({
    title: `Đoạn văn${blocks.length > 1 ? ` (${blocks.length} đoạn)` : ''}`,
    size: 'large',
    body: {
      type: 'tabpanel',
      tabs: [
        {
          name: 'indents-spacing',
          title: 'Thụt lề và khoảng cách',
          items: [
            {
              type: 'grid',
              columns: 2,
              items: [
                {
                  type: 'selectbox',
                  name: 'alignment',
                  label: 'Căn lề',
                  items: [
                    { text: 'Không đổi', value: '' },
                    { text: 'Trái', value: 'left' },
                    { text: 'Giữa', value: 'center' },
                    { text: 'Phải', value: 'right' },
                    { text: 'Căn đều', value: 'justify' }
                  ]
                },
                {
                  type: 'selectbox',
                  name: 'outlineLevel',
                  label: 'Cấp độ dàn ý',
                  items: [
                    { text: 'Văn bản nội dung', value: 'body' },
                    ...Array.from({ length: 9 }, (_, index) => ({ text: `Cấp ${index + 1}`, value: String(index + 1) }))
                  ]
                },
                { type: 'input', name: 'left', label: 'Thụt lề trái (pt)' },
                { type: 'input', name: 'right', label: 'Thụt lề phải (pt)' },
                {
                  type: 'selectbox',
                  name: 'specialIndent',
                  label: 'Thụt lề đặc biệt',
                  items: [
                    { text: '(Không)', value: 'none' },
                    { text: 'Dòng đầu', value: 'first-line' },
                    { text: 'Treo', value: 'hanging' }
                  ]
                },
                { type: 'input', name: 'indentBy', label: 'Mức thụt (pt)' },
                { type: 'input', name: 'before', label: 'Khoảng cách trước (pt)' },
                { type: 'input', name: 'after', label: 'Khoảng cách sau (pt)' },
                {
                  type: 'selectbox',
                  name: 'lineSpacingMode',
                  label: 'Giãn dòng',
                  items: [
                    { text: 'Đơn', value: 'single' },
                    { text: '1,5 dòng', value: 'one-half' },
                    { text: 'Kép', value: 'double' },
                    { text: 'Nhiều lần', value: 'multiple' },
                    { text: 'Chính xác', value: 'exactly' },
                    { text: 'Ít nhất', value: 'at-least' }
                  ]
                },
                { type: 'input', name: 'lineSpacingValue', label: 'Giá trị (hệ số hoặc pt)' },
                { type: 'input', name: 'tabs', label: 'Điểm dừng tab (pt, cách nhau bằng dấu phẩy)' }
              ]
            },
            { type: 'checkbox', name: 'saveAsDefault', label: 'Lưu cài đặt này làm mặc định trên thiết bị' },
            { type: 'checkbox', name: 'noSpaceSameStyle', label: 'Không thêm khoảng cách giữa các đoạn cùng kiểu' },
            {
              type: 'htmlpanel',
              name: 'paragraphPreview',
              html: '<div class="summary-paragraph-preview" aria-label="Xem trước định dạng đoạn"><strong>Xem trước</strong><div class="summary-paragraph-preview-sample"><span>Đoạn trước · Nội dung minh họa để xem cách các đoạn văn được trình bày.</span><p>Nội dung đoạn văn · Thụt lề, căn chỉnh và giãn dòng được áp dụng cho đoạn đang chọn.</p><span>Đoạn sau · Khoảng cách giữa các đoạn được thể hiện trong bản xem trước.</span></div></div>'
            }
          ]
        },
        {
          name: 'line-page-breaks',
          title: 'Ngắt dòng và trang',
          items: [
            { type: 'checkbox', name: 'widowControl', label: 'Kiểm soát dòng mồ côi và dòng đơn' },
            { type: 'checkbox', name: 'keepNext', label: 'Giữ đoạn này cùng đoạn tiếp theo' },
            { type: 'checkbox', name: 'keepLines', label: 'Không tách đoạn giữa hai trang' },
            { type: 'checkbox', name: 'pageBreakBefore', label: 'Bắt đầu đoạn ở trang mới' }
          ]
        }
      ]
    },
    initialData,
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      let format;
      try {
        format = normalizeSummaryParagraphFormat(data);
      } catch (error) {
        editor.notificationManager.open({ text: error.message, type: 'error', timeout: 4000 });
        return;
      }
      if (data.saveAsDefault) {
        try {
          const { saveAsDefault, ...defaults } = data;
          localStorage.setItem(SUMMARY_PARAGRAPH_DEFAULTS_KEY, JSON.stringify(defaults));
        } catch (error) {
          editor.notificationManager.open({ text: 'Không thể lưu cài đặt mặc định trên thiết bị này.', type: 'error', timeout: 5000 });
          return;
        }
      }

      editor.undoManager.transact(() => {
        blocks.forEach(target => {
          Object.entries(format.styles).forEach(([property, value]) => editor.dom.setStyle(target, property, value));
          editor.dom.setStyle(target, 'line-height', format.lineHeight);
          editor.dom.setStyle(target, 'text-align', format.alignment);
          [
            ['data-summary-keep-next', format.keepNext],
            ['data-summary-keep-lines', format.keepLines],
            ['data-summary-page-break-before', format.pageBreakBefore],
            ['data-summary-no-space-same-style', format.noSpaceSameStyle]
          ].forEach(([attribute, enabled]) => {
            if (enabled) target.setAttribute(attribute, 'true');
            else target.removeAttribute(attribute);
          });
          target.setAttribute('data-summary-outline-level', format.outlineLevel);
          target.setAttribute('data-summary-widow-control', String(format.widowControl));
          target.setAttribute('data-summary-line-spacing-mode', format.lineSpacingMode);
          target.setAttribute('data-summary-line-spacing-value', format.lineSpacingValue);
          if (format.tabs.length) {
            target.setAttribute('data-summary-tabs', format.tabs.join(','));
          } else {
            target.removeAttribute('data-summary-tabs');
          }
        });
      });
      editor.nodeChanged();
      editor.fire('change');
      if (data.saveAsDefault) {
        editor.notificationManager.open({ text: 'Đã lưu cài đặt đoạn văn mặc định trên thiết bị này.', type: 'success', timeout: 3500 });
      }
      api.close();
    },
    onChange(api) {
      const sample = document.querySelector('.tox-dialog .summary-paragraph-preview-sample p');
      if (!sample) return;
      let format;
      try {
        format = normalizeSummaryParagraphFormat(api.getData());
      } catch {
        return;
      }
      Object.entries(format.styles).forEach(([property, value]) => {
        sample.style.setProperty(property, value);
      });
      sample.style.lineHeight = format.lineHeight;
      sample.style.textAlign = format.alignment;
    }
  });
}

function insertSummaryBlankPage(editor) {
  const marker = '<div class="summary-study-page-break" data-summary-page-break="true" contenteditable="false"><span>Ngắt trang</span></div>';
  editor.undoManager.transact(() => editor.insertContent(`${marker}<p>&nbsp;</p>${marker}<p>&nbsp;</p>`));
  editor.nodeChanged();
  editor.fire('change');
}

function insertSummaryCoverPage(editor) {
  const year = new Date().getFullYear();
  editor.undoManager.transact(() => editor.insertContent(
    `<section class="summary-study-cover"><p>QLCL · TÀI LIỆU HỌC TẬP</p><h1>Tiêu đề tài liệu</h1><p>Phụ đề hoặc tên học phần</p><p>Người biên soạn: …</p><p>Năm ${year}</p></section><div class="summary-study-page-break" data-summary-page-break="true" contenteditable="false"><span>Ngắt trang</span></div><p>&nbsp;</p>`
  ));
  editor.nodeChanged();
  editor.fire('change');
}

function insertSummaryTextBox(editor) {
  editor.undoManager.transact(() => editor.insertContent(
    '<aside class="summary-study-text-box"><p>Nhập nội dung khung văn bản…</p></aside><p>&nbsp;</p>'
  ));
  editor.nodeChanged();
  editor.fire('change');
}

function insertSummaryStaticDate(editor) {
  const date = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(new Date());
  editor.insertContent(`<span class="summary-study-static-date">${editorEncode(date)}</span>`);
}

function insertSummaryPageNumber(editor) {
  editor.insertContent('<span class="summary-study-page-number">Trang </span>');
}

function insertSummaryBookmark(editor) {
  const selectedText = editor.selection.getContent({ format: 'text' }).trim();
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Đánh dấu vị trí',
    body: {
      type: 'panel',
      items: [{ type: 'input', name: 'label', label: 'Tên dấu trang' }]
    },
    initialData: { label: selectedText.slice(0, 120) },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Tạo dấu trang', primary: true }
    ],
    onSubmit(api) {
      const label = String(api.getData().label || '').trim();
      if (!label || label.length > 120) {
        editor.notificationManager.open({ text: 'Tên dấu trang phải có từ 1–120 ký tự.', type: 'error', timeout: 3500 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      const body = editor.getBody();
      let sequence = body.querySelectorAll('.summary-study-bookmark').length + 1;
      while (body.querySelector(`#summary-study-bookmark-${sequence}`)) sequence += 1;
      const id = `summary-study-bookmark-${sequence}`;
      const marker = editor.getDoc().createElement('span');
      marker.className = 'summary-study-bookmark';
      marker.id = id;
      marker.dataset.summaryBookmarkLabel = label;
      if (editor.selection.isCollapsed()) {
        marker.textContent = '\u200b';
        editor.undoManager.transact(() => editor.selection.getRng().insertNode(marker));
      } else {
        const selectionHtml = editor.selection.getContent({ format: 'html' });
        marker.innerHTML = selectionHtml;
        editor.undoManager.transact(() => editor.selection.setContent(marker.outerHTML));
      }
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function editSummaryPageFurniture(editor, kind) {
  const header = kind === 'header';
  const page = normalizeSummaryPageContainer(editor.getBody());
  const className = header ? 'summary-study-document-header' : 'summary-study-document-footer';
  const existing = page.querySelector(`${header ? 'header' : 'footer'}.${className}`);
  editor.windowManager.open({
    title: header ? 'Đầu trang tài liệu' : 'Chân trang tài liệu',
    body: {
      type: 'panel',
      items: [{ type: 'textarea', name: 'text', label: 'Nội dung (mỗi dòng thành một đoạn)' }]
    },
    initialData: { text: existing?.innerText || '' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Lưu', primary: true }
    ],
    onSubmit(api) {
      const text = String(api.getData().text || '').trim();
      if (text.length > 2000) {
        editor.notificationManager.open({ text: 'Nội dung đầu/chân trang tối đa 2.000 ký tự.', type: 'error', timeout: 4000 });
        return;
      }
      editor.undoManager.transact(() => {
        if (!text) {
          existing?.remove();
        } else {
          const section = existing || editor.getDoc().createElement(header ? 'header' : 'footer');
          section.className = className;
          section.innerHTML = text.split(/\r?\n/).map(line => `<p>${editorEncode(line)}</p>`).join('');
          if (!existing) page.insertBefore(section, header ? page.firstChild : null);
        }
      });
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function openSummaryPageSetup(editor) {
  const page = normalizeSummaryPageContainer(editor.getBody());
  editor.windowManager.open({
    title: 'Thiết lập trang',
    size: 'medium',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'size',
          label: 'Khổ giấy',
          items: [
            { text: 'A4', value: 'A4' },
            { text: 'Letter', value: 'Letter' },
            { text: 'Legal', value: 'Legal' }
          ]
        },
        {
          type: 'selectbox',
          name: 'orientation',
          label: 'Hướng giấy',
          items: [
            { text: 'Dọc', value: 'portrait' },
            { text: 'Ngang', value: 'landscape' }
          ]
        },
        {
          type: 'selectbox',
          name: 'preset',
          label: 'Lề nhanh',
          items: [
            { text: 'Tùy chỉnh / giữ số đo hiện tại', value: 'custom' },
            { text: 'Bình thường — 2,54 cm', value: 'normal' },
            { text: 'Hẹp — 1,27 cm', value: 'narrow' },
            { text: 'Vừa — trên/dưới 2,54 cm, trái/phải 1,91 cm', value: 'moderate' },
            { text: 'Rộng — trái/phải 5,08 cm', value: 'wide' },
            { text: 'Lề trái rộng hơn — 32 mm trái, 25 mm phải (không đổi trang chẵn/lẻ)', value: 'mirrored' }
          ]
        },
        {
          type: 'grid',
          columns: 2,
          items: [
            { type: 'input', name: 'top', label: 'Lề trên (mm)' },
            { type: 'input', name: 'bottom', label: 'Lề dưới (mm)' },
            { type: 'input', name: 'left', label: 'Lề trái (mm)' },
            { type: 'input', name: 'right', label: 'Lề phải (mm)' },
            { type: 'input', name: 'gutter', label: 'Lề đóng gáy (mm, 0–50)' },
            {
              type: 'selectbox',
              name: 'columns',
              label: 'Số cột',
              items: [
                { text: 'Một cột', value: '1' },
                { text: 'Hai cột', value: '2' },
                { text: 'Ba cột', value: '3' }
              ]
            },
            { type: 'input', name: 'columnGap', label: 'Khoảng cách cột (mm)' }
          ]
        }
      ]
    },
    initialData: {
      size: page.dataset.summaryPageSize,
      orientation: page.dataset.summaryPageOrientation,
      preset: 'custom',
      top: page.dataset.summaryPageMarginTop,
      bottom: page.dataset.summaryPageMarginBottom,
      left: page.dataset.summaryPageMarginLeft,
      right: page.dataset.summaryPageMarginRight,
      gutter: page.dataset.summaryPageGutter,
      columns: page.dataset.summaryPageColumns,
      columnGap: page.dataset.summaryPageColumnGap
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Áp dụng', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      const presets = {
        normal: [25, 25, 25, 25],
        narrow: [13, 13, 13, 13],
        moderate: [25, 25, 19, 19],
        wide: [25, 25, 50, 50],
        mirrored: [25, 25, 32, 25]
      };
      const margins = presets[data.preset] || ['top', 'bottom', 'left', 'right'].map(field => Number(data[field]));
      const gutter = Number(data.gutter);
      const columnGap = Number(data.columnGap);
      if (!Object.hasOwn(PAGE_SIZE_MM, data.size)
        || !['portrait', 'landscape'].includes(data.orientation)
        || margins.some(value => !Number.isInteger(value) || value < 5 || value > 50)
        || !Number.isInteger(gutter) || gutter < 0 || gutter > 50
        || !['1', '2', '3'].includes(String(data.columns))
        || !Number.isInteger(columnGap) || columnGap < 5 || columnGap > 50) {
        editor.notificationManager.open({
          text: 'Lề từ 5–50 mm, lề đóng gáy từ 0–50 mm và khoảng cách cột từ 5–50 mm. Hãy kiểm tra lại thiết lập.',
          type: 'error',
          timeout: 4500
        });
        return;
      }
      const settings = {
        'data-summary-page-size': data.size,
        'data-summary-page-orientation': data.orientation,
        'data-summary-page-margin-top': margins[0],
        'data-summary-page-margin-bottom': margins[1],
        'data-summary-page-margin-left': margins[2],
        'data-summary-page-margin-right': margins[3],
        'data-summary-page-gutter': gutter,
        'data-summary-page-columns': data.columns,
        'data-summary-page-column-gap': columnGap
      };
      editor.undoManager.transact(() => applySummaryPageSettings(editor, settings));
      editor.nodeChanged();
      editor.fire('change');
      api.close();
    }
  });
}

function insertSummaryTable(editor, rows, { firstRowHeader = false, fullWidth = true } = {}) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 100
    || rows.some(row => !Array.isArray(row) || !row.length || row.length > 20)) {
    editor.notificationManager.open({
      text: 'Bảng cần có từ 1–100 dòng và 1–20 cột.',
      type: 'error',
      timeout: 4000
    });
    return;
  }
  const columnCount = Math.max(...rows.map(row => row.length));
  const tableRows = rows.map((row, rowIndex) => {
    const cells = Array.from({ length: columnCount }, (_, index) => row[index] || '');
    const cellTag = firstRowHeader && rowIndex === 0 ? 'th' : 'td';
    return `<tr>${cells.map(text => `<${cellTag}>${editor.dom.encode(String(text)) || '&nbsp;'}</${cellTag}>`).join('')}</tr>`;
  }).join('');
  editor.undoManager.transact(() => {
    editor.insertContent(`<table style="border-collapse:collapse;width:${fullWidth ? '100%' : 'auto'}"><tbody>${tableRows}</tbody></table><p>&nbsp;</p>`);
  });
  editor.nodeChanged();
  editor.fire('change');
}

function selectedSummaryTableCell(editor) {
  const node = editor.selection.getNode();
  const cell = node?.nodeName === 'TD' || node?.nodeName === 'TH'
    ? node
    : node?.closest?.('td,th');
  return cell && editor.getBody().contains(cell) ? cell : null;
}

function tableCellsInSelection(editor, table) {
  const selected = editor.plugins?.table?.getSelectedCells?.() || [];
  const cells = [...selected].filter(cell => table.contains(cell));
  if (cells.length) return cells;
  const current = selectedSummaryTableCell(editor);
  return current && table.contains(current) ? [current] : [];
}

function selectedTableRows(editor, table, fallbackRow) {
  const cells = tableCellsInSelection(editor, table);
  const rows = [...new Set(cells.map(cell => cell.parentElement).filter(row => row?.closest('table') === table))];
  return rows.length ? rows : [fallbackRow];
}

function selectedTableColumnIndexes(editor, table, fallbackCell) {
  const cells = tableCellsInSelection(editor, table);
  const indexes = [...new Set(cells.map(cell => cell.cellIndex).filter(Number.isInteger))];
  return indexes.length ? indexes : [fallbackCell.cellIndex];
}

function summaryTableOptions(table) {
  return new Set((table.dataset.summaryTableOptions || '')
    .split(',')
    .filter(option => SUMMARY_TABLE_OPTIONS.has(option)));
}

function refreshSummaryTableDesign(table, options) {
  const rows = [...table.rows];
  if (!rows.length) return;
  const firstRow = rows[0];
  [...firstRow.cells].forEach(cell => {
    if (options.has('header-row') && cell.tagName !== 'TH') {
      const header = table.ownerDocument.createElement('th');
      header.innerHTML = cell.innerHTML;
      for (const attribute of [...cell.attributes]) {
        if (attribute.name !== 'style') header.setAttribute(attribute.name, attribute.value);
      }
      cell.replaceWith(header);
      header.setAttribute('scope', 'col');
    } else if (!options.has('header-row') && cell.tagName === 'TH') {
      const dataCell = table.ownerDocument.createElement('td');
      dataCell.innerHTML = cell.innerHTML;
      for (const attribute of [...cell.attributes]) {
        if (attribute.name !== 'scope') dataCell.setAttribute(attribute.name, attribute.value);
      }
      cell.replaceWith(dataCell);
    }
  });
  rows.forEach((row, rowIndex) => {
    row.classList.toggle('summary-study-table-total-row', options.has('total-row') && rowIndex === rows.length - 1);
  });
  table.classList.toggle('summary-study-table-banded-rows', options.has('banded-rows'));
  table.classList.toggle('summary-study-table-first-column', options.has('first-column'));
  table.classList.toggle('summary-study-table-last-column', options.has('last-column'));
  table.classList.toggle('summary-study-table-banded-columns', options.has('banded-columns'));
  const saved = [...options].sort().join(',');
  if (saved) table.dataset.summaryTableOptions = saved;
  else table.removeAttribute('data-summary-table-options');
}

function requireSummaryTable(editor) {
  const cell = selectedSummaryTableCell(editor);
  const table = cell?.closest('table');
  if (!cell || !table) {
    editor.notificationManager.open({ text: 'Đặt con trỏ trong ô của bảng cần chỉnh sửa trước.', type: 'info', timeout: 3500 });
    return null;
  }
  return { cell, row: cell.parentElement, table };
}

const SUMMARY_TABLE_FORMULAS = new Set(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT']);
const SUMMARY_TABLE_FORMULA_RANGES = new Set(['ABOVE', 'BELOW', 'LEFT', 'RIGHT']);

function parseSummaryTableFormula(value) {
  const formula = String(value || '').trim().toUpperCase();
  const match = formula.match(/^(SUM|AVERAGE|MIN|MAX|COUNT)\((ABOVE|BELOW|LEFT|RIGHT|[A-T][1-9]\d?(?::[A-T][1-9]\d?)?)\)$/);
  if (!match || !SUMMARY_TABLE_FORMULAS.has(match[1])) {
    throw new Error('Công thức hỗ trợ SUM, AVERAGE, MIN, MAX, COUNT với phạm vi ABOVE, BELOW, LEFT, RIGHT hoặc A1:B3.');
  }
  if (!SUMMARY_TABLE_FORMULA_RANGES.has(match[2])) {
    const [first, last] = match[2].split(':');
    const firstPosition = parseSummaryTableCellReference(first);
    const lastPosition = parseSummaryTableCellReference(last || first);
    if (firstPosition.row > lastPosition.row || firstPosition.column > lastPosition.column) {
      throw new Error('Phạm vi ô công thức cần theo thứ tự từ trên trái xuống dưới phải.');
    }
  }
  return { functionName: match[1], range: match[2] };
}

function parseSummaryTableCellReference(value) {
  const match = String(value || '').match(/^([A-T])([1-9]\d?)$/);
  if (!match) throw new Error('Tham chiếu ô cần nằm trong phạm vi A1:T99.');
  return { column: match[1].charCodeAt(0) - 65, row: Number(match[2]) - 1 };
}

function calculateSummaryTableFormula(functionName, values) {
  const numbers = values.map(value => {
    const text = String(value || '').trim().replace(/\s/g, '');
    if (!/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return null;
    const number = Number(text.replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }).filter(value => value !== null);
  if (functionName === 'COUNT') return numbers.length;
  if (!numbers.length) throw new Error('Phạm vi công thức không chứa giá trị số.');
  if (functionName === 'SUM') return numbers.reduce((sum, number) => sum + number, 0);
  if (functionName === 'AVERAGE') return numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
  if (functionName === 'MIN') return Math.min(...numbers);
  if (functionName === 'MAX') return Math.max(...numbers);
  throw new Error('Hàm công thức bảng không được hỗ trợ.');
}

function summaryTableFormulaRangeCells(table, targetCell, range) {
  const rows = [...table.rows];
  const rowIndex = rows.indexOf(targetCell.parentElement);
  if (rowIndex < 0) throw new Error('Không xác định được vị trí ô công thức.');
  const columnIndex = targetCell.cellIndex;
  if (SUMMARY_TABLE_FORMULA_RANGES.has(range)) {
    if (range === 'ABOVE') return rows.slice(0, rowIndex).map(row => row.cells[columnIndex]).filter(Boolean);
    if (range === 'BELOW') return rows.slice(rowIndex + 1).map(row => row.cells[columnIndex]).filter(Boolean);
    if (range === 'LEFT') return [...targetCell.parentElement.cells].slice(0, columnIndex);
    return [...targetCell.parentElement.cells].slice(columnIndex + 1);
  }
  const [startReference, endReference = startReference] = range.split(':');
  const start = parseSummaryTableCellReference(startReference);
  const end = parseSummaryTableCellReference(endReference);
  if (end.row >= rows.length || end.column >= Math.max(0, ...rows.map(row => row.cells.length))) {
    throw new Error('Tham chiếu công thức vượt quá kích thước bảng hiện tại.');
  }
  if (rowIndex >= start.row && rowIndex <= end.row && columnIndex >= start.column && columnIndex <= end.column) {
    throw new Error('Phạm vi công thức không thể chứa chính ô đang đặt công thức.');
  }
  const cells = [];
  for (let currentRow = start.row; currentRow <= end.row; currentRow += 1) {
    for (let currentColumn = start.column; currentColumn <= end.column; currentColumn += 1) {
      const cell = rows[currentRow].cells[currentColumn];
      if (cell) cells.push(cell);
    }
  }
  return cells;
}

function summaryTableFormulaValue(cell) {
  const formula = cell.querySelector(':scope > span.summary-study-table-formula[data-summary-table-formula]');
  return formula?.textContent || cell.textContent;
}

function applySummaryTableFormula(editor, table, cell, formulaText) {
  const { functionName, range } = parseSummaryTableFormula(formulaText);
  const values = summaryTableFormulaRangeCells(table, cell, range).map(summaryTableFormulaValue);
  const result = calculateSummaryTableFormula(functionName, values);
  const formatted = Number.isInteger(result) ? String(result) : String(Number(result.toFixed(6)));
  const formula = cell.ownerDocument.createElement('span');
  formula.className = 'summary-study-table-formula';
  formula.setAttribute('data-summary-table-formula', `${functionName}(${range})`);
  formula.textContent = formatted;
  editor.undoManager.transact(() => cell.replaceChildren(formula));
}

function removeSummaryTableFormula(editor, cell) {
  const formula = cell.querySelector(':scope > span.summary-study-table-formula[data-summary-table-formula]');
  if (!formula) return false;
  const value = formula.textContent || '';
  editor.undoManager.transact(() => cell.replaceChildren(cell.ownerDocument.createTextNode(value)));
  editor.nodeChanged();
  editor.fire('change');
  return true;
}

function recalculateSummaryTableFormulas(editor, table) {
  const formulas = [...table.querySelectorAll('span.summary-study-table-formula[data-summary-table-formula]')]
    .filter(formula => formula.closest('table') === table);
  const formulaCells = new Map(formulas.map(formula => [formula, formula.closest('td,th')]).filter(([, cell]) => cell));
  const calculatedValues = new Map();
  const failures = new Map();
  const calculating = new Set();
  const formatResult = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  const calculateFormula = formula => {
    if (calculatedValues.has(formula)) return calculatedValues.get(formula);
    if (failures.has(formula)) throw failures.get(formula);
    if (calculating.has(formula)) throw new Error('Phát hiện tham chiếu vòng giữa các ô công thức.');
    calculating.add(formula);
    try {
      const cell = formulaCells.get(formula);
      if (!cell) throw new Error('Không xác định được ô chứa công thức.');
      const { functionName, range } = parseSummaryTableFormula(formula.dataset.summaryTableFormula);
      const values = summaryTableFormulaRangeCells(table, cell, range).map(sourceCell => {
        const dependency = sourceCell.querySelector(':scope > span.summary-study-table-formula[data-summary-table-formula]');
        return dependency ? calculateFormula(dependency) : sourceCell.textContent;
      });
      const result = formatResult(calculateSummaryTableFormula(functionName, values));
      calculatedValues.set(formula, result);
      return result;
    } catch (error) {
      failures.set(formula, error);
      throw error;
    } finally {
      calculating.delete(formula);
    }
  };
  formulas.forEach(formula => {
    try {
      calculateFormula(formula);
    } catch {
      // The individual failure is reported after other independent formulas are evaluated.
    }
  });
  let updated = 0;
  editor.undoManager.transact(() => {
    calculatedValues.forEach((formatted, formula) => {
      if (formula.textContent !== formatted) {
        formula.textContent = formatted;
        updated += 1;
      }
    });
  });
  if (updated) {
    editor.nodeChanged();
    editor.fire('change');
  }
  return {
    total: formulas.length,
    updated,
    failures: [...failures].map(([formula, error]) => ({
      cell: formulaCells.get(formula),
      message: error.message || 'Lỗi công thức không xác định.'
    }))
  };
}

function openSummaryTableFormulaDialog(editor, table, cell) {
  const existingFormula = cell.querySelector(':scope > span.summary-study-table-formula[data-summary-table-formula]');
  const current = existingFormula
    ? parseSummaryTableFormula(existingFormula.dataset.summaryTableFormula)
    : null;
  const isQuickRange = current && SUMMARY_TABLE_FORMULA_RANGES.has(current.range);
  editor.windowManager.open({
    title: 'Công thức bảng',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'functionName',
          label: 'Hàm',
          items: [
            { text: 'Tổng (SUM)', value: 'SUM' },
            { text: 'Trung bình (AVERAGE)', value: 'AVERAGE' },
            { text: 'Nhỏ nhất (MIN)', value: 'MIN' },
            { text: 'Lớn nhất (MAX)', value: 'MAX' },
            { text: 'Đếm số (COUNT)', value: 'COUNT' }
          ]
        },
        {
          type: 'selectbox',
          name: 'range',
          label: 'Phạm vi nhanh',
          items: [
            { text: 'Các ô phía trên', value: 'ABOVE' },
            { text: 'Các ô bên trái', value: 'LEFT' },
            { text: 'Các ô phía dưới', value: 'BELOW' },
            { text: 'Các ô bên phải', value: 'RIGHT' }
          ]
        },
        { type: 'input', name: 'customRange', label: 'Hoặc phạm vi ô (ví dụ A1:B3)' }
      ]
    },
    initialData: {
      functionName: current?.functionName || 'SUM',
      range: isQuickRange ? current.range : cell.cellIndex > 0 ? 'LEFT' : 'ABOVE',
      customRange: current && !isQuickRange ? current.range : ''
    },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: current ? 'Cập nhật công thức' : 'Chèn công thức', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      try {
        const range = String(data.customRange || '').trim() || data.range;
        applySummaryTableFormula(editor, table, cell, `${data.functionName}(${range})`);
        editor.nodeChanged();
        editor.fire('change');
        api.close();
      } catch (error) {
        editor.notificationManager.open({ text: error.message || 'Không thể áp dụng công thức bảng.', type: 'error', timeout: 4500 });
      }
    }
  });
}

export function runSummaryEditorTableCommand(editor, command, value) {
  const selectionCommands = new Set(['select-cell', 'select-row', 'select-column', 'select-table']);
  const context = requireSummaryTable(editor);
  if (!context) return;
  const { cell, row, table } = context;
  if (command === 'insert-formula') {
    openSummaryTableFormulaDialog(editor, table, cell);
    return;
  }
  if (command === 'remove-formula') {
    if (!removeSummaryTableFormula(editor, cell)) {
      editor.notificationManager.open({ text: 'Ô hiện tại chưa có công thức.', type: 'info', timeout: 3000 });
      return;
    }
    editor.notificationManager.open({ text: 'Đã chuyển kết quả công thức thành giá trị tĩnh.', type: 'success', timeout: 3000 });
    return;
  }
  if (command === 'recalculate-formulas') {
    const result = recalculateSummaryTableFormulas(editor, table);
    result.failures.forEach(failure => {
      console.error('[SummaryStudyEditor] Không thể cập nhật công thức bảng:', failure.message);
    });
    editor.notificationManager.open({
      text: result.total === 0
        ? 'Bảng này chưa có ô công thức.'
        : result.failures.length
          ? `Đã cập nhật ${result.updated} ô; ${result.failures.length} ô công thức bị lỗi.`
          : result.updated
            ? `Đã cập nhật ${result.updated} ô công thức.`
            : 'Không có ô công thức nào cần cập nhật.',
      type: result.failures.length ? 'error' : result.total === 0 ? 'info' : 'success',
      timeout: 3000
    });
    return;
  }
  if (selectionCommands.has(command)) {
    const tinyCommand = {
      'select-cell': 'mceTableSelectCell',
      'select-row': 'mceTableSelectRow',
      'select-column': 'mceTableSelectCol',
      'select-table': 'mceTableSelectTable'
    }[command];
    editor.execCommand(tinyCommand);
    return;
  }
  if (command.startsWith('option:')) {
    const option = command.slice('option:'.length);
    if (!SUMMARY_TABLE_OPTIONS.has(option)) throw new Error('Tùy chọn kiểu bảng không hợp lệ.');
    const options = summaryTableOptions(table);
    if (value) options.add(option);
    else options.delete(option);
    editor.undoManager.transact(() => refreshSummaryTableDesign(table, options));
  } else if (command.startsWith('style:')) {
    const style = command.slice('style:'.length);
    const styles = {
      plain: { table: '#ffffff', header: '#f1f5f9', border: '#cbd5e1', text: '#26384b' },
      teal: { table: '#e8f3ef', header: '#166f5b', border: '#91b8aa', text: '#ffffff' },
      blue: { table: '#eff6ff', header: '#1e4f91', border: '#a9bfdc', text: '#ffffff' }
    };
    const selectedStyle = styles[style];
    if (!selectedStyle) throw new Error('Kiểu bảng không hợp lệ.');
    editor.undoManager.transact(() => {
      table.style.borderCollapse = 'collapse';
      table.style.width ||= '100%';
      [...table.rows].forEach((tableRow, rowIndex) => {
        [...tableRow.cells].forEach(tableCell => {
          tableCell.style.border = `1px solid ${selectedStyle.border}`;
          tableCell.style.padding ||= '8px';
          tableCell.style.color = style === 'plain' ? selectedStyle.text : '';
          tableCell.style.backgroundColor = style === 'plain' ? '' : (rowIndex === 0 ? selectedStyle.header : '');
          tableCell.style.fontWeight = style !== 'plain' && rowIndex === 0 ? '700' : '';
        });
      });
    });
  } else if (command === 'shading' || command === 'clear-shading') {
    const selectedCells = tableCellsInSelection(editor, table);
    if (command === 'shading' && !/^#[0-9a-f]{6}$/i.test(String(value))) throw new Error('Màu tô ô không hợp lệ.');
    editor.undoManager.transact(() => selectedCells.forEach(selectedCell => {
      selectedCell.style.backgroundColor = command === 'clear-shading' ? '' : value;
    }));
  } else if (command === 'borders') {
    if (!['all', 'outside', 'none'].includes(value)) throw new Error('Kiểu đường viền không hợp lệ.');
    editor.undoManager.transact(() => {
      table.style.borderCollapse = 'collapse';
      [...table.rows].forEach((tableRow, rowIndex) => [...tableRow.cells].forEach((tableCell, columnIndex) => {
        if (value === 'all') tableCell.style.border = '1px solid #cbd5e1';
        else if (value === 'none') tableCell.style.border = '0';
        else {
          tableCell.style.border = '0';
          if (rowIndex === 0) tableCell.style.borderTop = '1px solid #64748b';
          if (rowIndex === table.rows.length - 1) tableCell.style.borderBottom = '1px solid #64748b';
          if (columnIndex === 0) tableCell.style.borderLeft = '1px solid #64748b';
          if (columnIndex === tableRow.cells.length - 1) tableCell.style.borderRight = '1px solid #64748b';
        }
      }));
    });
  } else if (command === 'autofit') {
    if (!['window', 'contents'].includes(value)) throw new Error('Kiểu tự điều chỉnh bảng không hợp lệ.');
    editor.undoManager.transact(() => { table.style.width = value === 'window' ? '100%' : 'auto'; });
  } else if (command === 'row-height' || command === 'column-width') {
    const centimeters = Number(value);
    if (!Number.isFinite(centimeters) || centimeters < 0.2 || centimeters > 30) {
      throw new Error('Kích thước hàng hoặc cột phải từ 0,2 đến 30 cm.');
    }
    const pixels = `${Math.round(centimeters * 37.795)}px`;
    editor.undoManager.transact(() => {
      if (command === 'row-height') {
        selectedTableRows(editor, table, row).forEach(selectedRow => { selectedRow.style.height = pixels; });
      } else {
        const indexes = new Set(selectedTableColumnIndexes(editor, table, cell));
        [...table.rows].forEach(tableRow => [...tableRow.cells].forEach((tableCell, index) => {
          if (indexes.has(index)) tableCell.style.width = pixels;
        }));
      }
    });
  } else if (command === 'distribute-rows') {
    const rows = [...table.rows];
    const equalHeight = Math.ceil(Math.max(...rows.map(tableRow => tableRow.getBoundingClientRect().height)));
    if (!Number.isFinite(equalHeight) || equalHeight < 1) throw new Error('Không xác định được chiều cao hàng để chia đều.');
    editor.undoManager.transact(() => rows.forEach(tableRow => { tableRow.style.height = `${equalHeight}px`; }));
  } else if (command === 'distribute-columns') {
    const columnCount = Math.max(0, ...[...table.rows].map(tableRow => (
      [...tableRow.cells].reduce((count, tableCell) => count + Math.max(1, tableCell.colSpan), 0)
    )));
    if (!columnCount) throw new Error('Bảng không có cột để chia đều.');
    editor.undoManager.transact(() => {
      table.style.width = '100%';
      table.style.tableLayout = 'fixed';
      [...table.rows].forEach(tableRow => {
        [...tableRow.cells].forEach(tableCell => {
          tableCell.style.width = `${(100 * Math.max(1, tableCell.colSpan)) / columnCount}%`;
        });
      });
    });
  } else if (command === 'repeat-header') {
    const headerRow = table.rows[0];
    if (!headerRow) throw new Error('Bảng chưa có hàng để đặt làm tiêu đề.');
    editor.undoManager.transact(() => {
      let tableHead = table.tHead;
      if (!tableHead) {
        tableHead = table.ownerDocument.createElement('thead');
        table.insertBefore(tableHead, table.firstChild);
      }
      if (headerRow.parentElement !== tableHead) tableHead.append(headerRow);
      const options = summaryTableOptions(table);
      options.add('header-row');
      refreshSummaryTableDesign(table, options);
    });
  } else if (command === 'sort-ascending' || command === 'sort-descending') {
    const columnIndex = cell.cellIndex;
    const rows = [...table.tBodies].flatMap(body => [...body.rows])
      .filter(sortRow => !(sortRow.rowIndex === 0 && [...sortRow.cells].some(item => item.tagName === 'TH')));
    if (rows.length < 2 || rows.some(sortRow => !sortRow.cells[columnIndex])) {
      editor.notificationManager.open({ text: 'Cần ít nhất hai hàng dữ liệu có giá trị ở cột đang chọn để sắp xếp.', type: 'info', timeout: 3500 });
      return;
    }
    const direction = command === 'sort-ascending' ? 1 : -1;
    const sortedRows = rows.map((sortRow, index) => ({
      row: sortRow,
      index,
      value: sortRow.cells[columnIndex].textContent.trim()
    })).sort((left, right) => direction * left.value.localeCompare(right.value, 'vi', { numeric: true, sensitivity: 'base' })
      || left.index - right.index);
    const body = rows[0].parentElement;
    editor.undoManager.transact(() => sortedRows.forEach(({ row: sortedRow }) => body.append(sortedRow)));
  } else if (command === 'convert-to-text') {
    const replacement = table.ownerDocument.createDocumentFragment();
    [...table.rows].forEach(tableRow => {
      const paragraph = table.ownerDocument.createElement('p');
      paragraph.textContent = [...tableRow.cells].map(tableCell => tableCell.textContent.trim()).join('\t');
      replacement.append(paragraph);
    });
    const firstParagraph = replacement.firstChild;
    editor.undoManager.transact(() => table.replaceWith(replacement));
    if (firstParagraph) editor.selection.setCursorLocation(firstParagraph, 0);
  } else if (command === 'cell-align' || command === 'cell-padding') {
    const selectedCells = tableCellsInSelection(editor, table);
    editor.undoManager.transact(() => selectedCells.forEach(selectedCell => {
      if (command === 'cell-align') {
        if (!['top', 'middle', 'bottom'].includes(value)) throw new Error('Cách căn ô không hợp lệ.');
        selectedCell.style.verticalAlign = value;
      } else {
        const padding = Number(value);
        if (![4, 8, 12].includes(padding)) throw new Error('Lề trong ô không hợp lệ.');
        selectedCell.style.padding = `${padding}px`;
      }
    }));
  } else if (command === 'row-before' || command === 'row-after') {
    const body = row.parentElement;
    const rowIndex = row.rowIndex;
    const isHeader = row.closest('thead') !== null;
    const newRow = table.ownerDocument.createElement('tr');
    for (let index = 0; index < row.cells.length; index += 1) {
      const newCell = table.ownerDocument.createElement(isHeader ? 'th' : 'td');
      if (isHeader) newCell.setAttribute('scope', 'col');
      newCell.innerHTML = '<br>';
      newRow.append(newCell);
    }
    editor.undoManager.transact(() => body.insertBefore(newRow, command === 'row-before' ? row : row.nextSibling));
    editor.selection.setCursorLocation(newRow.cells[0], 0);
  } else if (command === 'column-before' || command === 'column-after') {
    const columnIndex = cell.cellIndex + (command === 'column-after' ? 1 : 0);
    editor.undoManager.transact(() => [...table.rows].forEach((tableRow, rowIndex) => {
      const newCell = table.ownerDocument.createElement(tableRow.cells[0]?.tagName === 'TH' ? 'th' : 'td');
      if (newCell.tagName === 'TH') newCell.setAttribute('scope', 'col');
      newCell.innerHTML = '<br>';
      tableRow.insertBefore(newCell, tableRow.cells[columnIndex] || null);
    }));
  } else if (command === 'delete-row') {
    if (table.rows.length <= 1) {
      editor.notificationManager.open({ text: 'Bảng phải còn ít nhất một hàng.', type: 'info', timeout: 3500 });
      return;
    }
    const nextRow = row.nextElementSibling || row.previousElementSibling;
    editor.undoManager.transact(() => row.remove());
    if (nextRow?.cells[0]) editor.selection.setCursorLocation(nextRow.cells[0], 0);
  } else if (command === 'delete-column') {
    if ([...table.rows].some(tableRow => tableRow.cells.length <= 1)) {
      editor.notificationManager.open({ text: 'Bảng phải còn ít nhất một cột.', type: 'info', timeout: 3500 });
      return;
    }
    const columnIndex = cell.cellIndex;
    const nextCell = row.cells[columnIndex + 1] || row.cells[columnIndex - 1];
    editor.undoManager.transact(() => [...table.rows].forEach(tableRow => tableRow.cells[columnIndex]?.remove()));
    if (nextCell?.isConnected) editor.selection.setCursorLocation(nextCell, 0);
  } else if (command === 'delete-table') {
    const paragraph = table.ownerDocument.createElement('p');
    paragraph.innerHTML = '<br>';
    editor.undoManager.transact(() => table.replaceWith(paragraph));
    editor.selection.setCursorLocation(paragraph, 0);
  } else if (command === 'split-table') {
    const rows = [...table.rows];
    const splitIndex = rows.indexOf(row) + 1;
    if (splitIndex >= rows.length) {
      editor.notificationManager.open({ text: 'Cần có ít nhất một hàng phía dưới điểm chia bảng.', type: 'info', timeout: 3500 });
      return;
    }
    const newTable = table.cloneNode(false);
    const newBody = table.ownerDocument.createElement('tbody');
    newTable.append(newBody);
    const nextRow = rows[splitIndex];
    editor.undoManager.transact(() => {
      rows.slice(splitIndex).forEach(movedRow => newBody.append(movedRow));
      table.parentNode.insertBefore(newTable, table.nextSibling);
    });
    if (newTable.rows[0]?.cells[0]) editor.selection.setCursorLocation(newTable.rows[0].cells[0], 0);
  } else if (command === 'merge-cells' || command === 'split-cells') {
    editor.execCommand(command === 'merge-cells' ? 'mceTableMergeCells' : 'mceTableSplitCells');
  } else {
    throw new Error(`Lệnh bảng không được hỗ trợ: ${command}`);
  }
  editor.nodeChanged();
  editor.fire('change');
}

function openSummaryTableDialog(editor) {
  editor.windowManager.open({
    title: 'Chèn bảng',
    body: {
      type: 'panel',
      items: [
        {
          type: 'grid',
          columns: 2,
          items: [
            { type: 'input', name: 'rows', label: 'Số dòng (1–100)' },
            { type: 'input', name: 'columns', label: 'Số cột (1–20)' }
          ]
        },
        { type: 'checkbox', name: 'firstRowHeader', label: 'Dùng dòng đầu làm tiêu đề' },
        { type: 'checkbox', name: 'fullWidth', label: 'Điều chỉnh bảng theo chiều rộng trang' }
      ]
    },
    initialData: { rows: '3', columns: '3', firstRowHeader: true, fullWidth: true },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn bảng', primary: true }
    ],
    onSubmit(api) {
      const data = api.getData();
      const rowCount = Number(data.rows);
      const columnCount = Number(data.columns);
      if (!Number.isInteger(rowCount) || rowCount < 1 || rowCount > 100
        || !Number.isInteger(columnCount) || columnCount < 1 || columnCount > 20) {
        editor.notificationManager.open({ text: 'Số dòng phải từ 1–100 và số cột từ 1–20.', type: 'error', timeout: 4000 });
        return;
      }
      insertSummaryTable(editor, Array.from({ length: rowCount }, () => Array(columnCount).fill('')), data);
      api.close();
    }
  });
}

function parseDelimitedRows(value, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(value || '').replace(/\r\n?/g, '\n');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(cell);
      cell = '';
    } else if (!quoted && character === '\n') {
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('Văn bản có dấu ngoặc kép chưa đóng.');
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  const columns = Math.max(0, ...rows.map(cells => cells.length));
  return rows.map(cells => [...cells, ...Array(columns - cells.length).fill('')]);
}

function convertSelectedTextToTable(editor) {
  const selected = editor.selection.getContent({ format: 'text' });
  if (!selected.trim()) {
    editor.notificationManager.open({ text: 'Hãy chọn văn bản có các cột phân tách trước khi chuyển thành bảng.', type: 'info', timeout: 3500 });
    return;
  }
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Chuyển văn bản thành bảng',
    body: {
      type: 'panel',
      items: [
        {
          type: 'selectbox',
          name: 'delimiter',
          label: 'Tách cột bằng',
          items: [
            { text: 'Tab', value: '\t' },
            { text: 'Dấu phẩy', value: ',' },
            { text: 'Chấm phẩy', value: ';' },
            { text: 'Dấu sổ đứng |', value: '|' }
          ]
        },
        { type: 'checkbox', name: 'firstRowHeader', label: 'Dùng dòng đầu làm tiêu đề' }
      ]
    },
    initialData: { delimiter: '\t', firstRowHeader: true },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chuyển thành bảng', primary: true }
    ],
    onSubmit(api) {
      let rows;
      try {
        rows = parseDelimitedRows(selected, api.getData().delimiter);
      } catch (error) {
        editor.notificationManager.open({ text: error.message, type: 'error', timeout: 4000 });
        return;
      }
      if (!rows.length || rows.length > 100 || rows[0].length > 20) {
        editor.notificationManager.open({ text: 'Dữ liệu phải có từ 1–100 dòng và tối đa 20 cột.', type: 'error', timeout: 4000 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      if (editor.selection.isCollapsed()) {
        editor.notificationManager.open({ text: 'Không thể khôi phục vùng chọn. Hãy chọn văn bản lại.', type: 'error', timeout: 4000 });
        return;
      }
      editor.undoManager.transact(() => {
        editor.selection.setContent('');
        insertSummaryTable(editor, rows, { firstRowHeader: api.getData().firstRowHeader, fullWidth: true });
      });
      api.close();
    }
  });
}

function registerSummaryTableTools(editor) {
  editor.ui.registry.addButton('summarytableinsert', {
    text: 'Chèn bảng…',
    tooltip: 'Tạo bảng với số dòng và cột cụ thể',
    onAction: () => openSummaryTableDialog(editor)
  });
  editor.ui.registry.addButton('summarytexttotable', {
    text: 'Văn bản → bảng',
    tooltip: 'Chuyển văn bản đã chọn thành bảng',
    onAction: () => convertSelectedTextToTable(editor)
  });
  editor.ui.registry.addMenuButton('summaryquicktable', {
    text: 'Bảng mẫu',
    tooltip: 'Chèn mẫu bảng có thể chỉnh sửa',
    fetch(callback) {
      callback([
        {
          type: 'menuitem',
          text: 'Bảng so sánh (3 cột)',
          onAction: () => insertSummaryTable(editor, [
            ['Tiêu chí', 'Phương án A', 'Phương án B'],
            ['Ưu điểm', '', ''],
            ['Hạn chế', '', ''],
            ['Kết luận', '', '']
          ], { firstRowHeader: true })
        },
        {
          type: 'menuitem',
          text: 'Kế hoạch hành động (4 cột)',
          onAction: () => insertSummaryTable(editor, [
            ['Công việc', 'Người phụ trách', 'Thời hạn', 'Trạng thái'],
            ['', '', '', ''],
            ['', '', '', ''],
            ['', '', '', '']
          ], { firstRowHeader: true })
        }
      ]);
    }
  });
}

function openSummaryTableTemplateDialog(editor) {
  const templates = {
    comparison: {
      name: 'comparison',
      rows: [
        ['Tiêu chí', 'Phương án A', 'Phương án B'],
        ['Ưu điểm', '', ''],
        ['Hạn chế', '', ''],
        ['Kết luận', '', '']
      ]
    },
    actionPlan: {
      name: 'actionPlan',
      rows: [
        ['Công việc', 'Người phụ trách', 'Thời hạn', 'Trạng thái'],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', '']
      ]
    }
  };
  const bookmark = editor.selection.getBookmark(2, true);
  editor.windowManager.open({
    title: 'Chèn bảng mẫu',
    body: {
      type: 'panel',
      items: [{
        type: 'selectbox',
        name: 'template',
        label: 'Chọn mẫu bảng',
        items: [
          { text: 'Bảng so sánh (3 cột)', value: 'comparison' },
          { text: 'Kế hoạch hành động (4 cột)', value: 'actionPlan' }
        ]
      }]
    },
    initialData: { template: 'comparison' },
    buttons: [
      { type: 'cancel', text: 'Hủy' },
      { type: 'submit', text: 'Chèn bảng', primary: true }
    ],
    onSubmit(api) {
      const templateName = api.getData().template;
      const template = Object.hasOwn(templates, templateName) ? templates[templateName] : null;
      if (!template) {
        editor.notificationManager.open({ text: 'Mẫu bảng đã chọn không hợp lệ.', type: 'error', timeout: 3500 });
        return;
      }
      editor.selection.moveToBookmark(bookmark);
      insertSummaryTable(editor, template.rows, { firstRowHeader: true });
      api.close();
    }
  });
}

async function imageBlobToDataUrl(blob) {
  if (!blob?.type?.startsWith('image/')) throw new Error('Chỉ hỗ trợ tệp hình ảnh.');
  if (blob.size > 12 * 1024 * 1024) throw new Error('Ảnh gốc vượt quá giới hạn 12 MB.');
  if (typeof createImageBitmap !== 'function') {
    const reader = new FileReader();
    const dataUrl = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không đọc được tệp hình ảnh.'));
      reader.readAsDataURL(blob);
    });
    if (String(dataUrl).length > 1_400_000) throw new Error('Ảnh quá lớn sau khi đọc. Hãy chọn ảnh nhỏ hơn.');
    return dataUrl;
  }
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không thể xử lý hình ảnh trong trình duyệt.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const compressed = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!compressed) throw new Error('Không thể nén hình ảnh.');
    if (compressed.size > 1_000_000) throw new Error('Ảnh vẫn quá lớn sau khi nén. Hãy chọn ảnh nhỏ hơn.');
    const reader = new FileReader();
    return await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Không thể mã hóa hình ảnh đã nén.'));
      reader.readAsDataURL(compressed);
    });
  } finally {
    bitmap.close();
  }
}

export async function mountRichTextEditor({ target, initialHtml, onChange, onTableContextChange, onImageContextChange, onChartContextChange, onDiagramContextChange, onShapeContextChange }) {
  if (!target || !window.tinymce) throw new Error('Trình soạn thảo chưa sẵn sàng.');
  target.value = sanitizeRichTextHtml(initialHtml);
  const host = target.parentElement;
  const workspace = document.createElement('div');
  workspace.className = 'summary-study-editor-workspace';
  if (host) {
    host.insertBefore(workspace, target);
    workspace.append(target);
  }
  let navigationPane;
  let editors;
  try {
    editors = await window.tinymce.init({
    target,
    height: 560,
    menubar: false,
    statusbar: true,
    resize: true,
    branding: false,
    promotion: false,
    plugins: 'lists link image table searchreplace code wordcount quickbars',
    toolbar: [
      'undo redo searchreplace summarynavigation | fontfamily fontsize | bold italic underline strikethrough | forecolor backcolor summarytexteffects | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | summaryparagraphformat blockquote | blocks summarycustomstyles',
      'summarycoverpage summaryblankpage summarypagebreak | table summarytableinsert summaryquicktable summarytexttotable | image summaryimagelayout link summarytextbox | summaryheader summaryfooter summarypagenumber summarydate | summarybookmark summaryfigurecaption',
      'summarypagesetup summarypagebreak | summaryparagraphformat outdent indent',
      'summarytoc summaryfigurelist summarytablelist | summaryfootnote summaryendnote summarycrossreference | summarycitation summarybibliography | summaryindexmark summaryindex summaryauthoritymark summaryauthorities',
      'removeformat code'
    ],
    toolbar_mode: 'wrap',
    contextmenu: 'summarycomment summaryreadaloud link table',
    quickbars_selection_toolbar: 'bold italic underline | forecolor backcolor | blocks summarycommentbutton summaryreadaloudbutton',
    extended_valid_elements: paragraphElementsForValidation(),
    block_formats: 'Đoạn văn=p;Tiêu đề 1=h1;Tiêu đề 2=h2;Tiêu đề 3=h3;Tiêu đề 4=h4;Tiêu đề 5=h5;Tiêu đề 6=h6;Trích dẫn=blockquote;Mã=pre',
    fontsize_formats: '10pt 11pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 36pt',
    color_cols: 10,
    custom_colors: true,
    color_map: [
      'FFFFFF', 'Trắng', '000000', 'Đen', 'E7E6E6', 'Xám nhạt', '44546A', 'Xám xanh',
      '4472C4', 'Xanh dương', 'ED7D31', 'Cam', 'A5A5A5', 'Xám', 'FFC000', 'Vàng',
      '70AD47', 'Xanh lá', '5B9BD5', 'Xanh da trời', '1F4E78', 'Xanh đậm', '7030A0', 'Tím',
      'F2F2F2', 'Xám 10%', 'D9E2F3', 'Xanh 10%', 'DDEBF7', 'Lam 10%', 'FCE4D6', 'Cam 10%',
      'E2F0D9', 'Lá 10%', 'FFF2CC', 'Vàng 10%', 'D9EAD3', 'Lá nhạt', 'CFE2F3', 'Lam nhạt',
      'D9D9D9', 'Xám 20%', 'B4C6E7', 'Xanh 20%', '9BC2E6', 'Lam 20%', 'F4B183', 'Cam 20%',
      'A9D18E', 'Lá 20%', 'FFE699', 'Vàng 20%', 'A6A6A6', 'Xám 40%', '8EAADB', 'Xanh 40%',
      '5B9BD5', 'Lam 40%', 'C65911', 'Cam 40%', '548235', 'Lá 40%', 'BF9000', 'Vàng 40%',
      'C00000', 'Đỏ', 'FF0000', 'Đỏ tươi', 'FFC000', 'Vàng tươi', 'FFFF00', 'Vàng sáng',
      '92D050', 'Lá sáng', '00B050', 'Xanh lá', '00B0F0', 'Xanh da trời sáng', '0070C0', 'Xanh dương sáng',
      '002060', 'Xanh navy', '7030A0', 'Tím chuẩn'
    ],
    paste_data_images: true,
    automatic_uploads: true,
    images_upload_handler: blobInfo => imageBlobToDataUrl(blobInfo.blob()),
    table_default_attributes: { border: '1' },
    table_default_styles: { 'border-collapse': 'collapse', width: '100%' },
    content_style: 'body{font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.75;color:#26384b;padding:18px}.summary-study-page{box-sizing:border-box;width:210mm;min-height:270mm;padding:21mm 20mm;margin:20px auto;background:#fff;box-shadow:0 2px 14px #18334a22;column-fill:auto;overflow-wrap:anywhere}@media(max-width:900px){.summary-study-page{width:100%;min-height:240mm;padding:17mm 15mm}}.summary-study-document-header,.summary-study-document-footer{column-span:all;border-bottom:1px solid #dce7ee;padding:4px 0;color:#52677c;font-size:12px}.summary-study-document-footer{border-top:1px solid #dce7ee;border-bottom:0}.summary-study-page table,.summary-study-page figure,.summary-study-page .summary-study-page-break{break-inside:avoid}h1,h2,h3,h4{line-height:1.3}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:8px;vertical-align:top}img{max-width:100%;height:auto}.summary-study-image-layout--inline{float:none!important;display:inline-block!important;vertical-align:middle;margin:4px 6px!important}.summary-study-image-layout--center{float:none!important;display:block!important;margin:12px auto!important}.summary-study-image-layout--float-left{float:left!important;width:42%!important;max-width:320px!important;margin:4px 18px 10px 0!important}.summary-study-image-layout--float-right{float:right!important;width:42%!important;max-width:320px!important;margin:4px 0 10px 18px!important}figure.summary-study-image-layout--float-left,figure.summary-study-image-layout--float-right{display:block!important;text-align:left!important}figure.summary-study-figure.summary-study-image-layout--float-left{float:left!important;width:42%!important;max-width:320px!important;margin:4px 18px 10px 0!important}figure.summary-study-figure.summary-study-image-layout--float-right{float:right!important;width:42%!important;max-width:320px!important;margin:4px 0 10px 18px!important}figure.summary-study-image-layout--float-left img,figure.summary-study-image-layout--float-right img{display:block;width:100%;height:auto}.summary-study-figure figcaption{clear:both}.summary-study-document-clear{clear:both}@media(max-width:600px){.summary-study-image-layout--float-left,.summary-study-image-layout--float-right{float:none!important;width:auto!important;max-width:100%!important;margin:12px auto!important}}blockquote{border-left:3px solid #168c71;margin:12px 0;padding:8px 14px;background:#f1f8f5}pre{white-space:pre-wrap;background:#f1f5f9;padding:12px}.summary-study-page-break{height:24px;margin:24px 0;border-top:2px dashed #94a3b8;position:relative}.summary-study-page-break span{position:absolute;top:-12px;left:50%;padding:0 8px;background:#fff;color:#64748b;font-size:12px;transform:translateX(-50%)}.summary-study-figure{margin:18px auto;text-align:center}.summary-study-figure img{display:block;margin:0 auto}.summary-study-figure figcaption{margin-top:6px;color:#475569;font-size:13px;text-align:center}.summary-study-toc{padding:12px 20px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc}.summary-study-toc a{color:#176b58;text-decoration:none}.summary-study-toc-level-2{margin-left:18px}.summary-study-toc-level-3{margin-left:36px}.summary-study-footnote{margin:4px 0 14px;padding:6px 10px;border-left:2px solid #94a3b8;color:#52677c;font-size:12px;line-height:1.5}.summary-study-footnote-backref,.summary-study-endnote-backref{margin-right:5px;font-weight:700}.summary-study-endnotes{margin-top:30px;padding-top:14px;border-top:1px solid #cbd5e1}.summary-study-endnotes h2{font-size:1.2em}.summary-study-endnotes ol{padding-left:24px}.summary-study-endnote{padding:2px 0 6px}.summary-study-inline-comment{background:#fff2b3;border-bottom:1px dotted #b7791f;cursor:help}.summary-study-text-effect--outline{-webkit-text-stroke:1px #2563eb;color:transparent}.summary-study-text-effect--shadow{text-shadow:2px 2px 3px #64748b}.summary-study-text-effect--reflection{display:inline-block;-webkit-box-reflect:below 1px linear-gradient(transparent,rgba(0,0,0,.24))}.summary-study-text-effect--glow{text-shadow:0 0 5px #38bdf8,0 0 12px #38bdf8}',
    setup(editor) {
      editor.on('init', () => {
        const body = editor.getBody();
        if (body) {
          body.style.fontSize = '17px';
          body.style.lineHeight = '1.8';
        }
        const doc = editor.getDoc();
        if (doc && !doc.getElementById('summary-study-equation-style')) {
          const style = doc.createElement('style');
          style.id = 'summary-study-equation-style';
          style.textContent = '.summary-study-equation{display:inline-block;max-width:100%;overflow-x:auto;font-family:"Cambria Math",Cambria,"Times New Roman",serif;font-size:1.12em;line-height:1.8;white-space:nowrap;padding:2px 5px;border:1px solid #dbe4ef;border-radius:4px;background:#f8fafc;color:#172554;vertical-align:middle}.summary-study-equation sup,.summary-study-equation sub{font-size:.72em;line-height:0}.summary-study-equation-fraction{display:inline-flex;flex-direction:column;align-items:stretch;text-align:center;vertical-align:middle;margin:0 .12em;line-height:1.15}.summary-study-equation-numerator{border-bottom:1px solid currentColor;padding:0 .2em .08em}.summary-study-equation-denominator{padding:.08em .2em 0}.summary-study-equation-root{display:inline-flex;align-items:stretch;vertical-align:middle;margin:0 .06em}.summary-study-equation-root>span:first-child{align-self:center;font-size:1.25em}.summary-study-equation-degree{align-self:flex-start;margin-right:-.15em;font-size:.58em;line-height:1}.summary-study-equation-radicand{border-top:1px solid currentColor;padding:.04em .12em 0}.summary-study-equation-sum{display:inline-flex;align-items:center;vertical-align:middle;margin:0 .12em}.summary-study-equation-limits{display:inline-flex;flex-direction:column;align-items:center;margin-left:.08em;font-size:.58em;line-height:.95}';
          doc.head.append(style);
        }
      });
      editor.ui.registry.addButton('summaryparagraphformat', {
        text: 'Định dạng đoạn',
        tooltip: 'Căn lề, thụt lề, khoảng cách, giãn dòng và ngắt trang',
        onAction: () => paragraphFormatDialog(editor)
      });
      editor.ui.registry.addButton('summarypagesetup', {
        text: 'Trang…',
        tooltip: 'Khổ giấy, hướng, lề và số cột',
        onAction: () => openSummaryPageSetup(editor)
      });
      editor.ui.registry.addButton('summaryheader', {
        text: 'Đầu trang',
        tooltip: 'Chỉnh sửa đầu trang tài liệu',
        onAction: () => editSummaryPageFurniture(editor, 'header')
      });
      editor.ui.registry.addButton('summaryfooter', {
        text: 'Chân trang',
        tooltip: 'Chỉnh sửa nội dung chân trang (DOCX vẫn có số trang tự động)',
        onAction: () => editSummaryPageFurniture(editor, 'footer')
      });
      editor.ui.registry.addButton('summaryblankpage', {
        text: 'Trang trắng',
        tooltip: 'Chèn một trang trắng trước vị trí con trỏ',
        onAction: () => insertSummaryBlankPage(editor)
      });
      editor.ui.registry.addButton('summarycoverpage', {
        text: 'Trang bìa',
        tooltip: 'Chèn mẫu trang bìa có thể sửa',
        onAction: () => insertSummaryCoverPage(editor)
      });
      editor.ui.registry.addButton('summarytextbox', {
        text: 'Khung văn bản',
        tooltip: 'Chèn khung văn bản có viền, xuất được sang DOCX',
        onAction: () => insertSummaryTextBox(editor)
      });
      editor.ui.registry.addButton('summarydate', {
        text: 'Ngày tĩnh',
        tooltip: 'Chèn ngày hiện tại dưới dạng văn bản tĩnh',
        onAction: () => insertSummaryStaticDate(editor)
      });
      editor.ui.registry.addButton('summarypagenumber', {
        text: 'Số trang',
        tooltip: 'Chèn trường số trang tự cập nhật khi in hoặc xuất DOCX',
        onAction: () => insertSummaryPageNumber(editor)
      });
      editor.ui.registry.addButton('summarybookmark', {
        text: 'Dấu trang',
        tooltip: 'Đánh dấu vị trí để tham chiếu chéo',
        onAction: () => insertSummaryBookmark(editor)
      });
      editor.ui.registry.addButton('summarynavigation', {
        text: 'Điều hướng',
        tooltip: 'Tìm trong tiêu đề, trang và nội dung',
        onAction: () => navigationPane?.toggle()
      });
      editor.ui.registry.addButton('summarycommentbutton', {
        text: 'Bình luận',
        tooltip: 'Gắn bình luận vào đoạn đang chọn',
        onAction: () => openSummaryCommentDialog(editor)
      });
      editor.ui.registry.addButton('summarytoc', {
        text: 'Mục lục',
        tooltip: 'Tạo hoặc cập nhật mục lục từ các tiêu đề',
        onAction: () => makeSummaryTableOfContents(editor)
      });
      editor.ui.registry.addButton('summaryfigurelist', {
        text: 'Danh sách hình',
        tooltip: 'Tạo hoặc cập nhật danh sách hình có liên kết',
        onAction: () => makeSummaryObjectList(editor, 'figure')
      });
      editor.ui.registry.addButton('summarytablelist', {
        text: 'Danh sách bảng',
        tooltip: 'Tạo hoặc cập nhật danh sách bảng có liên kết',
        onAction: () => makeSummaryObjectList(editor, 'table')
      });
      editor.ui.registry.addButton('summaryfigurecaption', {
        text: 'Chú thích hình',
        tooltip: 'Thêm chú thích và số thứ tự cho hình đang chọn',
        onAction: () => addFigureCaption(editor)
      });
      editor.ui.registry.addButton('summarypagebreak', {
        text: 'Ngắt trang',
        tooltip: 'Chèn ngắt trang cho bản in PDF',
        onAction: () => {
          const toc = editor.dom.getParent(editor.selection.getNode(), '.summary-study-toc');
          if (toc) {
            const marker = editor.getDoc().createElement('div');
            marker.className = 'summary-study-page-break';
            marker.setAttribute('data-summary-page-break', 'true');
            marker.contentEditable = 'false';
            marker.innerHTML = '<span>Ngắt trang</span>';
            const spacer = editor.getDoc().createElement('p');
            spacer.innerHTML = '&nbsp;';
            editor.undoManager.transact(() => {
              toc.parentNode.insertBefore(marker, toc.nextSibling);
              marker.parentNode.insertBefore(spacer, marker.nextSibling);
            });
            editor.selection.setCursorLocation(spacer, 0);
            editor.nodeChanged();
            editor.fire('change');
            return;
          }
          editor.insertContent('<div class="summary-study-page-break" data-summary-page-break="true" contenteditable="false"><span>Ngắt trang</span></div><p>&nbsp;</p>');
        }
      });
      editor.ui.registry.addButton('summaryfootnote', {
        text: 'Chú thích',
        tooltip: 'Chèn chú thích cuối trang tại đoạn đang chọn',
        onAction: () => openSummaryNoteDialog(editor, 'footnote')
      });
      editor.ui.registry.addButton('summaryendnote', {
        text: 'Cuối tài liệu',
        tooltip: 'Chèn chú thích cuối tài liệu và thêm liên kết quay lại vị trí',
        onAction: () => openSummaryNoteDialog(editor, 'endnote')
      });
      editor.ui.registry.addButton('summarycrossreference', {
        text: 'Tham chiếu',
        tooltip: 'Chèn liên kết tự cập nhật tới tiêu đề, hình hoặc bảng',
        onAction: () => insertSummaryCrossReference(editor)
      });
      editor.ui.registry.addButton('summarycitation', {
        text: 'Trích dẫn…',
        tooltip: 'Thêm nguồn và chèn trích dẫn APA, MLA hoặc Chicago',
        onAction: () => insertSummaryCitation(editor)
      });
      editor.ui.registry.addButton('summarybibliography', {
        text: 'Tài liệu tham khảo',
        tooltip: 'Tạo hoặc cập nhật danh mục nguồn đã trích dẫn',
        onAction: () => insertSummaryBibliography(editor)
      });
      editor.ui.registry.addButton('summaryindexmark', {
        text: 'Đánh dấu chỉ mục',
        tooltip: 'Đánh dấu cụm từ được chọn để tạo chỉ mục',
        onAction: () => insertSummaryIndexEntry(editor, 'index')
      });
      editor.ui.registry.addButton('summaryindex', {
        text: 'Tạo chỉ mục',
        tooltip: 'Tạo hoặc cập nhật chỉ mục từ các mục đã đánh dấu',
        onAction: () => insertSummaryIndex(editor, 'index')
      });
      editor.ui.registry.addButton('summaryauthoritymark', {
        text: 'Đánh dấu căn cứ',
        tooltip: 'Đánh dấu trích dẫn pháp lý đã chọn',
        onAction: () => insertSummaryIndexEntry(editor, 'authority')
      });
      editor.ui.registry.addButton('summaryauthorities', {
        text: 'Bảng căn cứ',
        tooltip: 'Tạo hoặc cập nhật bảng căn cứ pháp lý',
        onAction: () => insertSummaryIndex(editor, 'authority')
      });
      registerSummaryTableTools(editor);
      editor.on('init', () => {
        editor.dom.addStyle('.summary-study-shape{margin:18px auto;text-align:center;break-inside:avoid}.summary-study-shape img{display:block;width:100%;max-width:640px;height:auto;margin:0 auto}');
        editor.dom.addStyle('.summary-study-text-box{border:1px solid #94a3b8;border-radius:6px;padding:12px 16px;margin:12px 0;background:#f8fafc}.summary-study-chart{margin:18px auto;text-align:center;break-inside:avoid}.summary-study-chart img{display:block;width:100%;max-width:100%;height:auto;margin:0 auto}.summary-study-chart figcaption{margin-top:6px;color:#475569;font-size:13px;text-align:center}.summary-study-page-number::after{content:"1";color:#64748b}.summary-study-bookmark{background:#dbeafe;border-bottom:1px dotted #2563eb}.summary-study-table-banded-rows tbody tr:nth-child(even)>td,.summary-study-table-banded-rows tbody tr:nth-child(even)>th{background:#f3f7f6}.summary-study-table-first-column tr>:first-child,.summary-study-table-last-column tr>:last-child{background:#edf2f7;font-weight:600}.summary-study-table-banded-columns tr>:nth-child(even){background:#f3f7f6}.summary-study-table-total-row>:first-child{border-top:1px solid #64748b;font-weight:700}.summary-study-table-total-row>*{font-weight:700}');
        
        const container = editor.getContainer();
        if (container) {
          const header = container.querySelector('.tox-editor-header');
          if (header && !header.querySelector('.summary-editor-ribbon-bar')) {
            header.setAttribute('data-ribbon-tab', '0');
            const ribbonBar = document.createElement('div');
            ribbonBar.className = 'summary-editor-ribbon-bar';
            ribbonBar.innerHTML = `
              <div class="summary-editor-ribbon-tabs" role="tablist">
                <button type="button" class="summary-editor-ribbon-tab active" data-tab-index="0" role="tab" aria-selected="true">Trang chính</button>
                <button type="button" class="summary-editor-ribbon-tab" data-tab-index="1" role="tab" aria-selected="false">Chèn</button>
                <button type="button" class="summary-editor-ribbon-tab" data-tab-index="2" role="tab" aria-selected="false">Bố cục</button>
                <button type="button" class="summary-editor-ribbon-tab" data-tab-index="3" role="tab" aria-selected="false">Tham chiếu</button>
                <button type="button" class="summary-editor-ribbon-tab" data-tab-index="4" role="tab" aria-selected="false">Công cụ</button>
              </div>
            `;
            header.insertBefore(ribbonBar, header.firstChild);

            const tabs = ribbonBar.querySelectorAll('.summary-editor-ribbon-tab');
            tabs.forEach((tab, idx) => {
              tab.addEventListener('click', (e) => {
                e.preventDefault();
                tabs.forEach((t, i) => {
                  const isActive = i === idx;
                  t.classList.toggle('active', isActive);
                  t.setAttribute('aria-selected', String(isActive));
                });
                header.setAttribute('data-ribbon-tab', String(idx));
              });
            });
          }
        }
      });
      registerImageLayoutMenu(editor);
      registerSummaryNamedStyles(editor);
      registerSummaryTextEffects(editor);
      registerSummaryContextActions(editor);
      navigationPane = createSummaryNavigationPane(editor);
      workspace.insertBefore(navigationPane.element, target);
    }
    });
  } catch (error) {
    if (workspace.parentNode) {
      workspace.parentNode.insertBefore(target, workspace);
      workspace.remove();
    }
    throw error;
  }
  const editor = Array.isArray(editors) ? editors[0] : editors;
  if (!editor) throw new Error('Không khởi tạo được trình soạn thảo.');
  editor.setContent(sanitizeRichTextHtml(initialHtml));
  let lastContent = editor.getContent();
  let lastTableContext = false;
  let lastTableOptions = [];
  let lastContextTable = null;
  let lastTableGeometry = '';
  let lastSelectedImage = null;
  let lastImageSignature = '';
  let lastSelectedChart = null;
  let lastChartSignature = '';
  let lastSelectedDiagram = null;
  let lastDiagramSignature = '';
  let lastSelectedShape = null;
  let lastShapeSignature = '';
  const updateTableContext = () => {
    const node = editor.selection.getNode();
    const table = node?.closest?.('table');
    const insideTable = Boolean(table && editor.getBody().contains(table));
    const options = insideTable ? [...summaryTableOptions(table)] : [];
    const cell = insideTable ? selectedSummaryTableCell(editor) : null;
    const rowHeight = cell?.parentElement?.getBoundingClientRect().height || 0;
    const columnWidth = cell?.getBoundingClientRect().width || 0;
    const geometry = `${Math.round(rowHeight)}:${Math.round(columnWidth)}`;
    if (insideTable === lastTableContext && table === lastContextTable
      && options.join(',') === lastTableOptions.join(',') && geometry === lastTableGeometry) return;
    lastTableContext = insideTable;
    lastTableOptions = options;
    lastContextTable = table || null;
    lastTableGeometry = geometry;
    onTableContextChange?.(insideTable, {
      options,
      rowHeightCm: rowHeight ? Math.round((rowHeight / 37.795) * 10) / 10 : '',
      columnWidthCm: columnWidth ? Math.round((columnWidth / 37.795) * 10) / 10 : ''
    });
  };
  const updateImageContext = () => {
    const image = selectedSummaryImage(editor);
    if (!image || selectedSummaryChart(editor) || selectedSummaryShape(editor)) {
      if (!lastSelectedImage) return;
      lastSelectedImage = null;
      lastImageSignature = '';
      onImageContextChange?.(false);
      return;
    }
    const target = image.closest('figure');
    const pixelSize = value => {
      const match = String(value || '').match(/^(\d+(?:\.\d+)?)px$/);
      return match ? Math.round(Number(match[1])) : 0;
    };
    const context = {
      alt: image.getAttribute('alt') || '',
      width: pixelSize(target?.style.width) || pixelSize(image.style.width)
        || Math.round(image.getBoundingClientRect().width || Number(image.getAttribute('width')) || image.naturalWidth || 0),
      height: pixelSize(image.style.height)
        || Math.round(image.getBoundingClientRect().height || Number(image.getAttribute('height')) || image.naturalHeight || 0),
      layout: summaryImageLayout(image),
      border: Object.keys({ gray: true, teal: true, black: true }).find(name => (
        image.style.border === {
          gray: '1px solid rgb(148, 163, 184)',
          teal: '2px solid rgb(15, 118, 110)',
          black: '1px solid rgb(17, 24, 39)'
        }[name]
      )) || 'none'
    };
    const signature = `${context.alt}\u0000${context.width}\u0000${context.height}\u0000${context.layout}\u0000${context.border}`;
    if (image === lastSelectedImage && signature === lastImageSignature) return;
    lastSelectedImage = image;
    lastImageSignature = signature;
    onImageContextChange?.(true, context);
  };
  const updateChartContext = () => {
    const chart = selectedSummaryChart(editor);
    if (!chart || selectedSummaryShape(editor) || selectedSummaryDiagram(editor)) {
      if (!lastSelectedChart) return;
      lastSelectedChart = null;
      lastChartSignature = '';
      onChartContextChange?.(false);
      return;
    }
    const context = {
      type: chart.dataset.summaryChartType || 'column',
      palette: chart.dataset.summaryChartPalette || 'teal'
    };
    const signature = `${context.type}\u0000${context.palette}`;
    if (chart === lastSelectedChart && signature === lastChartSignature) return;
    lastSelectedChart = chart;
    lastChartSignature = signature;
    onChartContextChange?.(true, context);
  };
  const updateDiagramContext = () => {
    const diagram = selectedSummaryDiagram(editor);
    if (!diagram) {
      if (!lastSelectedDiagram) return;
      lastSelectedDiagram = null;
      lastDiagramSignature = '';
      onDiagramContextChange?.(false);
      return;
    }
    const context = {
      layout: diagram.dataset.summaryDiagramLayout || 'process',
      palette: diagram.dataset.summaryDiagramPalette || 'teal'
    };
    const signature = `${context.layout}\u0000${context.palette}`;
    if (diagram === lastSelectedDiagram && signature === lastDiagramSignature) return;
    lastSelectedDiagram = diagram;
    lastDiagramSignature = signature;
    onDiagramContextChange?.(true, context);
  };
  const updateShapeContext = () => {
    const shape = selectedSummaryShape(editor);
    if (!shape) {
      if (!lastSelectedShape) return;
      lastSelectedShape = null;
      lastShapeSignature = '';
      onShapeContextChange?.(false);
      return;
    }
    const context = {
      type: shape.dataset.summaryShapeType || 'rectangle',
      fill: shape.dataset.summaryShapeFill || SUMMARY_SHAPE_DEFAULT_FILL,
      outline: shape.dataset.summaryShapeOutline || SUMMARY_SHAPE_DEFAULT_OUTLINE,
      alt: shape.querySelector(':scope > img')?.getAttribute('alt') || '',
      layout: summaryShapeLayout(shape),
      alignment: SUMMARY_SHAPE_ALIGNMENTS.has(shape.dataset.summaryShapeAlign)
        ? shape.dataset.summaryShapeAlign
        : 'center',
      width: Number.parseInt(shape.querySelector(':scope > img')?.style.width, 10)
        || Math.round(shape.querySelector(':scope > img')?.naturalWidth || 900),
      height: Number.parseInt(shape.querySelector(':scope > img')?.style.height, 10)
        || Math.round(shape.querySelector(':scope > img')?.naturalHeight || 520),
      rotation: Number(shape.querySelector(':scope > img')?.style.transform.match(/rotate\((0|90|180|270)deg\)/)?.[1] || 0)
    };
    const signature = `${context.type}\u0000${context.fill}\u0000${context.outline}\u0000${context.alt}\u0000${context.layout}\u0000${context.alignment}\u0000${context.width}\u0000${context.height}\u0000${context.rotation}`;
    if (shape === lastSelectedShape && signature === lastShapeSignature) return;
    lastSelectedShape = shape;
    lastShapeSignature = signature;
    onShapeContextChange?.(true, context);
  };
  updateTableContext();
  updateImageContext();
  updateChartContext();
  updateDiagramContext();
  updateShapeContext();
  editor.on('NodeChange SelectionChange mouseup keyup', () => {
    updateTableContext();
    updateImageContext();
    updateChartContext();
    updateDiagramContext();
    updateShapeContext();
  });
  editor.on('input change undo redo ExecCommand', () => {
    const currentContent = editor.getContent();
    if (currentContent !== lastContent) {
      lastContent = currentContent;
      onChange?.(editor);
    }
    if (navigationPane && !navigationPane.element.hidden) navigationPane.refresh();
  });
  editor.on('remove', () => {
    onTableContextChange?.(false);
    onImageContextChange?.(false);
    onChartContextChange?.(false);
    onDiagramContextChange?.(false);
    onShapeContextChange?.(false);
    if (!workspace.parentNode) return;
    workspace.parentNode.insertBefore(target, workspace);
    workspace.remove();
  });
  return editor;
}

export function runSummaryEditorTool(editor, tool, options = {}) {
  const actions = {
    'find-replace': () => openSummaryFindReplaceDialog(editor),
    'page-setup': () => openSummaryPageSetup(editor),
    'paragraph-format': () => paragraphFormatDialog(editor),
    'named-styles': () => openSummaryNamedStyleDialog(editor),
    'save-named-style': () => saveSummaryNamedStyle(editor),
    'manage-named-styles': () => manageSummaryNamedStyles(editor),
    'text-effects': () => openSummaryTextEffectsDialog(editor),
    'equation-insert': () => openSummaryEquationGallery(editor),
    'equation-new': () => openSummaryEquationBuilder(editor),
    'symbol-insert': () => openSummarySymbolDialog(editor),
    'insert-table': () => {
      const rows = Number(options.rows);
      const columns = Number(options.columns);
      if (!Number.isInteger(rows) || rows < 1 || rows > 8 || !Number.isInteger(columns) || columns < 1 || columns > 10) {
        editor.notificationManager.open({ text: 'Bảng nhanh cần từ 1–8 hàng và 1–10 cột.', type: 'error', timeout: 3500 });
        return;
      }
      insertSummaryTable(editor, Array.from({ length: rows }, () => Array(columns).fill('')));
    },
    'table-dialog': () => openSummaryTableDialog(editor),
    'table-command': () => runSummaryEditorTableCommand(editor, options.command, options.value),
    'cover-page': () => insertSummaryCoverPage(editor),
    'blank-page': () => insertSummaryBlankPage(editor),
    'table-template': () => openSummaryTableTemplateDialog(editor),
    'text-to-table': () => convertSelectedTextToTable(editor),
    'image-layout': () => openSummaryImageLayoutDialog(editor),
    'image-alt-text': () => editSelectedSummaryImageAlt(editor),
    'replace-image': () => replaceSelectedSummaryImage(editor),
    'set-image-layout': () => setSelectedImageLayout(editor, options.layout),
    'image-size': () => setSelectedSummaryImageSize(editor, options.dimension, options.value),
    'reset-image-size': () => resetSelectedSummaryImageSize(editor),
    'rotate-left': () => setSelectedSummaryImageTransform(editor, 'rotate-left'),
    'rotate-right': () => setSelectedSummaryImageTransform(editor, 'rotate-right'),
    'flip-horizontal': () => setSelectedSummaryImageTransform(editor, 'flip-horizontal'),
    'flip-vertical': () => setSelectedSummaryImageTransform(editor, 'flip-vertical'),
    'reset-image-transform': () => setSelectedSummaryImageTransform(editor, 'reset-image-transform'),
    'image-border': () => setSelectedSummaryImageBorder(editor, options.value),
    'crop-image': () => openSummaryImageCropDialog(editor),
    'chart-insert': () => openSummaryChartDialog(editor),
    'chart-edit': () => editSelectedSummaryChart(editor),
    'chart-config': () => setSelectedSummaryChartOption(editor, options.setting, options.value),
    'diagram-insert': () => openSummaryDiagramDialog(editor),
    'diagram-edit': () => editSelectedSummaryDiagram(editor),
    'diagram-config': () => setSelectedSummaryDiagramOption(editor, options.setting, options.value, options.diagram),
    'shape-insert': () => openSummaryShapeDialog(editor),
    'shape-edit': () => editSelectedSummaryShape(editor),
    'shape-config': () => setSelectedSummaryShapeOption(editor, options.setting, options.value, options.shape),
    'shape-size': () => setSelectedSummaryShapeSize(editor, options.dimension, options.value, options.shape),
    'shape-rotate': () => setSelectedSummaryShapeTransform(editor, options.operation, options.shape),
    'shape-align': () => setSelectedSummaryShapeAlignment(editor, options.alignment, options.shape),
    'shape-layout': () => setSelectedSummaryShapeLayout(editor, options.layout, options.shape),
    'shape-alt-text': () => editSelectedSummaryShapeAltText(editor, options.shape),
    'text-box': () => insertSummaryTextBox(editor),
    'static-date': () => insertSummaryStaticDate(editor),
    'page-number': () => insertSummaryPageNumber(editor),
    bookmark: () => insertSummaryBookmark(editor),
    header: () => editSummaryPageFurniture(editor, 'header'),
    footer: () => editSummaryPageFurniture(editor, 'footer'),
    'figure-caption': () => addFigureCaption(editor),
    comment: () => openSummaryCommentDialog(editor),
    'read-aloud': () => readSummarySelectedText(editor),
    toc: () => makeSummaryTableOfContents(editor),
    'figure-list': () => makeSummaryObjectList(editor, 'figure'),
    'table-list': () => makeSummaryObjectList(editor, 'table'),
    footnote: () => openSummaryNoteDialog(editor, 'footnote'),
    endnote: () => openSummaryNoteDialog(editor, 'endnote'),
    'cross-reference': () => insertSummaryCrossReference(editor),
    citation: () => insertSummaryCitation(editor),
    bibliography: () => insertSummaryBibliography(editor),
    'index-mark': () => insertSummaryIndexEntry(editor, 'index'),
    index: () => insertSummaryIndex(editor, 'index'),
    'authority-mark': () => insertSummaryIndexEntry(editor, 'authority'),
    authorities: () => insertSummaryIndex(editor, 'authority')
  };
  const action = actions[tool];
  if (!action) throw new Error(`Công cụ soạn thảo không được hỗ trợ: ${tool}`);
  action();
}
