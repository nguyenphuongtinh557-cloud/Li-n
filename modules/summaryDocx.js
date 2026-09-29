import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSum,
  MathSuperScript,
  PageBreak,
  PageOrientation,
  PageNumber,
  Paragraph,
  Packer,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';
import JSZip from 'jszip';

const PAGE_WIDTH = 9000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const DOCX_PAGE_SIZES = {
  A4: { width: 11906, height: 16838 },
  Letter: { width: 12240, height: 15840 },
  Legal: { width: 12240, height: 20160 }
};
const SUMMARY_DOCX_TEXT_EFFECTS = [
  { className: 'summary-study-text-effect--outline', name: 'outline' },
  { className: 'summary-study-text-effect--shadow', name: 'shadow' },
  { className: 'summary-study-text-effect--reflection', name: 'reflection' },
  { className: 'summary-study-text-effect--glow', name: 'glow' }
];
let summaryDocxEffectExportSequence = 0;

function textRun(text, style = {}) {
  return new TextRun({
    text: style.textEffectMarker ? `${style.textEffectMarker}${text}` : text,
    font: 'Arial',
    size: style.fontSize || 22,
    bold: style.bold,
    italics: style.italics,
    underline: style.underline ? {} : undefined,
    strike: style.strike,
    subScript: style.subScript,
    superScript: style.superScript,
    color: style.color,
    shading: style.shading ? { fill: style.shading } : undefined,
    break: style.break
  });
}

function parseHexColor(value) {
  const hex = String(value || '').trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (!hex) return null;
  const expanded = hex.length === 3 ? [...hex].map(char => char + char).join('') : hex;
  return expanded.toUpperCase();
}

function parseRgbColor(value) {
  const match = String(value || '').trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!match) return null;
  const channels = match.slice(1, 4).map(Number);
  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (channels.some(channel => channel > 255) || alpha !== 1) return null;
  return channels.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function docxCellBorder(value) {
  const border = String(value || '').trim();
  if (/^(?:0|none)$/i.test(border)) return { style: BorderStyle.NONE, color: 'FFFFFF', size: 0 };
  const match = border.match(/^(\d+(?:\.\d+)?)(px|pt)\s+(solid|dashed|dotted|double)\s+(#[\da-f]{3,6}|rgba?\([\d\s.,]+\)|[a-z]{1,20})$/i);
  if (!match) return undefined;
  const color = parseHexColor(match[4]) || parseRgbColor(match[4]);
  if (!color) return undefined;
  const style = {
    solid: BorderStyle.SINGLE,
    dashed: BorderStyle.DASHED,
    dotted: BorderStyle.DOTTED,
    double: BorderStyle.DOUBLE
  }[match[3].toLowerCase()];
  return {
    style,
    color,
    size: Math.max(1, Math.min(48, Math.round(Number(match[1]) * (match[2] === 'pt' ? 8 : 6))))
  };
}

function summaryDocxTableWidth(table) {
  const value = String(table.style?.width || '').trim();
  const percentage = value.match(/^(\d+(?:\.\d+)?)%$/);
  if (percentage) return Math.max(1, Math.round(PAGE_WIDTH * Math.min(100, Number(percentage[1])) / 100));
  const width = cssMeasureToTwips(value);
  return width && width > 0 ? Math.min(PAGE_WIDTH, width) : PAGE_WIDTH;
}

function summaryDocxTableCellOptions(cell, width) {
  const style = cell.style || {};
  const padding = cssMeasureToTwips(style.padding);
  const margins = padding === null
    ? { top: 80, bottom: 80, left: 100, right: 100 }
    : Object.fromEntries(['top', 'bottom', 'left', 'right'].map(side => [
      side,
      Math.max(0, Math.min(600, cssMeasureToTwips(style[`padding${side[0].toUpperCase()}${side.slice(1)}`]) ?? padding))
    ]));
  const shading = parseHexColor(style.backgroundColor) || parseRgbColor(style.backgroundColor);
  const border = docxCellBorder(style.border);
  const borders = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => {
    const sideValue = style[`border${side[0].toUpperCase()}${side.slice(1)}`];
    return [side, sideValue ? docxCellBorder(sideValue) : border];
  }));
  const verticalAlign = { top: 'top', middle: 'center', center: 'center', bottom: 'bottom' }[style.verticalAlign];
  const columnSpan = Math.max(1, Math.min(20, Number(cell.colSpan) || 1));
  const rowSpan = Math.max(1, Math.min(100, Number(cell.rowSpan) || 1));
  return {
    ...(cell.tagName === 'TH' && !shading ? { shading: { fill: 'EAF0F5' } } : shading ? { shading: { fill: shading } } : {}),
    margins: { ...margins, marginUnitType: WidthType.DXA },
    width: { size: width, type: WidthType.DXA },
    ...(verticalAlign ? { verticalAlign } : {}),
    ...(columnSpan > 1 ? { columnSpan } : {}),
    ...(rowSpan > 1 ? { rowSpan } : {}),
    ...(Object.values(borders).some(Boolean) ? { borders } : {})
  };
}

function summaryEquationMathChildren(nodes, depth = 0, counter = { count: 0 }) {
  if (!Array.isArray(nodes) || depth > 8) throw new Error('Cấu trúc phương trình vượt quá giới hạn DOCX.');
  return nodes.map(node => {
    counter.count += 1;
    if (counter.count > 120 || !node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('Phương trình vượt quá giới hạn DOCX.');
    }
    if (node.type === 'text') {
      if (typeof node.value !== 'string' || node.value.length > 120) throw new Error('Văn bản trong phương trình không hợp lệ.');
      return new MathRun(node.value);
    }
    if (node.type === 'fraction') {
      return new MathFraction({
        numerator: summaryEquationMathChildren(node.numerator, depth + 1, counter),
        denominator: summaryEquationMathChildren(node.denominator, depth + 1, counter)
      });
    }
    if (node.type === 'sqrt' || node.type === 'root') {
      return new MathRadical({
        children: summaryEquationMathChildren(node.children, depth + 1, counter),
        ...(node.type === 'root' ? { degree: summaryEquationMathChildren(node.degree, depth + 1, counter) } : {})
      });
    }
    if (node.type === 'sup') {
      return new MathSuperScript({
        children: summaryEquationMathChildren(node.base, depth + 1, counter),
        superScript: summaryEquationMathChildren(node.exponent, depth + 1, counter)
      });
    }
    if (node.type === 'sub') {
      return new MathSubScript({
        children: summaryEquationMathChildren(node.base, depth + 1, counter),
        subScript: summaryEquationMathChildren(node.index, depth + 1, counter)
      });
    }
    if (node.type === 'sum') {
      return new MathSum({
        children: summaryEquationMathChildren(node.base, depth + 1, counter),
        subScript: summaryEquationMathChildren(node.lower, depth + 1, counter),
        superScript: summaryEquationMathChildren(node.upper, depth + 1, counter)
      });
    }
    throw new Error('Cấu trúc phương trình không được DOCX hỗ trợ.');
  });
}

function imageTransform(element) {
  const value = element.style?.transform || '';
  const rotation = Number(value.match(/rotate\((0|90|180|270)deg\)/)?.[1] || 0);
  return {
    rotation,
    flip: {
      horizontal: value.includes('scaleX(-1)'),
      vertical: value.includes('scaleY(-1)')
    }
  };
}

function summaryShapeDimensions(element, image) {
  if (!element.closest?.('figure.summary-study-shape')) return { width: image.width, height: image.height };
  const styledDimension = value => {
    const match = String(value || '').match(/^(\d+(?:\.\d+)?)px$/);
    return match ? Number(match[1]) : 0;
  };
  const width = styledDimension(element.style?.width);
  const height = styledDimension(element.style?.height);
  if (width && height) return { width, height };
  if (width) return { width, height: width * image.height / image.width };
  if (height) return { width: height * image.width / image.height, height };
  return { width: image.width, height: image.height };
}

function summaryShapeAlignment(element) {
  const explicitAlignment = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT
  }[element?.dataset?.summaryShapeAlign];
  if (explicitAlignment) return explicitAlignment;
  const layout = element?.classList;
  if (layout?.contains('summary-study-image-layout--float-left')) return AlignmentType.LEFT;
  if (layout?.contains('summary-study-image-layout--float-right')) return AlignmentType.RIGHT;
  if (layout?.contains('summary-study-image-layout--inline')) return AlignmentType.LEFT;
  return AlignmentType.CENTER;
}

function imageOutline(element) {
  const match = String(element.style?.border || '').match(/^(\d+(?:\.\d+)?)px\s+solid\s+(#[\da-f]{3}|#[\da-f]{6}|rgba?\([\d\s.,]+\))$/i);
  const color = parseHexColor(match?.[2]) || parseRgbColor(match?.[2]);
  if (!match || !color) return undefined;
  return {
    width: Math.round(Number(match[1]) * 9525),
    type: 'solidFill',
    solidFillType: 'rgb',
    value: color
  };
}

function runStyle(element, parentStyle) {
  const style = { ...parentStyle };
  if (element.dataset?.summaryDocxEffectMarker) style.textEffectMarker = element.dataset.summaryDocxEffectMarker;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'b' || tag === 'strong') style.bold = true;
  if (tag === 'i' || tag === 'em') style.italics = true;
  if (tag === 'u') style.underline = true;
  if (tag === 's' || tag === 'del' || tag === 'strike') style.strike = true;
  if (tag === 'sub') style.subScript = true;
  if (tag === 'sup') style.superScript = true;
  const css = element.style;
  if (css?.fontWeight && (css.fontWeight === 'bold' || Number(css.fontWeight) >= 600)) style.bold = true;
  if (css?.fontStyle === 'italic') style.italics = true;
  if (css?.textDecorationLine?.includes('underline')) style.underline = true;
  if (css?.textDecorationLine?.includes('line-through')) style.strike = true;
  const color = parseHexColor(css?.color) || parseRgbColor(css?.color);
  if (color) style.color = color;
  const shading = parseHexColor(css?.backgroundColor) || parseRgbColor(css?.backgroundColor);
  if (shading && shading !== 'FFFFFF' && shading !== 'TRANSPARENT') style.shading = shading;
  const size = Number.parseFloat(css?.fontSize || '');
  if (Number.isFinite(size) && size >= 8 && size <= 48) style.fontSize = Math.round(size * 1.5);
  return style;
}

function decodeDataUrl(value) {
  const match = String(value || '').match(/^data:image\/(png|jpe?g|gif|bmp|webp);base64,([a-z\d+/]+=*)$/i);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, type: `image/${match[1].toLowerCase()}` };
}

async function loadImageBytes(source) {
  const dataUrlImage = decodeDataUrl(source);
  let imageBlob;
  if (dataUrlImage) {
    imageBlob = new Blob([dataUrlImage.bytes], { type: dataUrlImage.type });
  } else {
    const url = new URL(source, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Định dạng ảnh không được hỗ trợ khi xuất DOCX.');
    const response = await fetch(url.href);
    if (!response.ok) throw new Error(`Không tải được ảnh (${response.status}) để xuất DOCX.`);
    imageBlob = await response.blob();
    if (!imageBlob.type.startsWith('image/')) throw new Error('Tài liệu có tệp đính kèm không phải ảnh.');
  }
  if (imageBlob.size > MAX_IMAGE_BYTES) throw new Error('Ảnh vượt quá giới hạn 12 MB khi xuất DOCX.');

  const bitmap = await createImageBitmap(imageBlob);
  try {
    const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Không thể chuyển ảnh sang định dạng DOCX.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Không thể mã hóa ảnh cho DOCX.')), 'image/png');
    });
    if (png.size > MAX_IMAGE_BYTES) throw new Error('Ảnh sau khi xử lý vượt quá giới hạn 12 MB.');
    return { data: new Uint8Array(await png.arrayBuffer()), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

async function inlineChildren(node, style = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ? [textRun(node.nodeValue, style)] : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node;
  const tag = element.tagName.toLowerCase();
  if (tag === 'span' && element.classList.contains('summary-study-equation') && element.dataset?.summaryEquation) {
    try {
      if (element.dataset.summaryEquation.length > 6000) throw new Error('Phương trình vượt quá giới hạn DOCX.');
      const model = JSON.parse(element.dataset.summaryEquation);
      if (model?.version !== 1 || !Array.isArray(model.nodes)) throw new Error('Dữ liệu phương trình không hợp lệ.');
      return [new DocxMath({ children: summaryEquationMathChildren(model.nodes) })];
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('Không thể đọc cấu trúc phương trình khi xuất DOCX.');
      throw error;
    }
  }
  if (tag === 'span' && element.classList.contains('summary-study-page-number')) {
    return [new TextRun({ children: [element.textContent || 'Trang ', PageNumber.CURRENT], font: 'Arial', size: 22 })];
  }
  if (tag === 'br') return [textRun('', { ...style, break: 1 })];
  if (tag === 'img') {
    const image = await loadImageBytes(element.getAttribute('src'));
    const transform = imageTransform(element);
    const dimensions = summaryShapeDimensions(element, image);
    const rotated = transform.rotation % 180 !== 0;
    const displayWidth = rotated ? dimensions.height : dimensions.width;
    const displayHeight = rotated ? dimensions.width : dimensions.height;
    const fit = Math.min(1, 550 / displayWidth, 720 / displayHeight);
    return [new ImageRun({
      type: 'png',
      data: image.data,
      transformation: {
        width: Math.max(1, Math.round(displayWidth * fit)),
        height: Math.max(1, Math.round(displayHeight * fit)),
        rotation: transform.rotation,
        flip: transform.flip
      },
      outline: imageOutline(element),
      altText: { title: element.getAttribute('alt') || '', description: element.getAttribute('alt') || '' }
    })];
  }
  const children = [];
  for (const child of element.childNodes) children.push(...await inlineChildren(child, runStyle(element, style)));
  if (tag === 'a') {
    const href = element.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) return [new ExternalHyperlink({ link: href, children })];
  }
  return children;
}

function paragraphOptions(block, children, listPrefix = '') {
  const tag = block.tagName.toLowerCase();
  const heading = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6
  }[tag];
  const align = block.style?.textAlign;
  const formatting = paragraphFormatting(block);
  return {
    children: listPrefix ? [textRun(listPrefix), ...children] : (children.length ? children : [textRun('')]),
    heading,
    alignment: align === 'center' ? AlignmentType.CENTER : align === 'right' ? AlignmentType.RIGHT : align === 'justify' ? AlignmentType.JUSTIFIED : undefined,
    indent: formatting.indent,
    spacing: formatting.spacing,
    keepNext: formatting.keepNext,
    keepLines: formatting.keepLines,
    pageBreakBefore: formatting.pageBreakBefore,
    tabStops: formatting.tabStops
  };
}

function hasVisibleContent(element) {
  return Boolean(element.textContent.replace(/[\s\u00a0\u200b]+/g, '') || element.querySelector('img,table'));
}

function cssMeasureToTwips(value) {
  const match = String(value || '').trim().match(/^(-?\d+(?:\.\d+)?)(pt|px)$/i);
  if (!match) return null;
  const multiplier = match[2].toLowerCase() === 'pt' ? 20 : 15;
  return Math.round(Number(match[1]) * multiplier);
}

function paragraphFormatting(block) {
  const style = block.style || {};
  const before = cssMeasureToTwips(style.marginTop);
  const after = cssMeasureToTwips(style.marginBottom);
  const left = cssMeasureToTwips(style.marginLeft);
  const right = cssMeasureToTwips(style.marginRight);
  const firstLine = cssMeasureToTwips(style.textIndent);
  const lineHeight = Number(style.lineHeight);
  const tabs = (block.getAttribute('data-summary-tabs') || '')
    .split(',')
    .map(value => Number(value.trim()))
    .filter(value => Number.isFinite(value) && value > 0 && value <= 500)
    .slice(0, 10)
    .map(position => ({ type: 'left', position: Math.round(position * 20) }));
  return {
    indent: left !== null || right !== null || firstLine !== null
      ? {
        ...(left !== null ? { left } : {}),
        ...(right !== null ? { right } : {}),
        ...(firstLine !== null && firstLine < 0 ? { hanging: Math.abs(firstLine) } : {}),
        ...(firstLine !== null && firstLine >= 0 ? { firstLine } : {})
      }
      : block.tagName.toLowerCase() === 'blockquote' ? { left: 360 } : undefined,
    spacing: {
      before: before ?? (block.tagName.match(/^H[1-6]$/) ? 120 : 0),
      after: after ?? (block.tagName.match(/^H[1-6]$/) ? 60 : 80),
      ...(Number.isFinite(lineHeight) && lineHeight >= 0.5 && lineHeight <= 5
        ? { line: Math.round(lineHeight * 240), lineRule: 'auto' }
        : { line: 276 })
    },
    keepNext: block.getAttribute('data-summary-keep-next') === 'true',
    keepLines: block.getAttribute('data-summary-keep-lines') === 'true',
    pageBreakBefore: block.getAttribute('data-summary-page-break-before') === 'true',
    tabStops: tabs.length ? tabs : undefined
  };
}

async function convertTable(element) {
  const sourceRows = [...element.querySelectorAll('tr')].filter(row => row.closest('table') === element);
  if (!sourceRows.length) return [];
  if (sourceRows.length > 100) throw new Error('Bảng có quá 100 dòng, không thể xuất DOCX an toàn.');
  const columnCount = Math.min(20, Math.max(1, ...sourceRows.map(row => (
    [...row.children].reduce((count, cell) => count + Math.max(1, Math.min(20, Number(cell.colSpan) || 1)), 0)
  ))));
  const tableWidth = summaryDocxTableWidth(element);
  const defaultColumnWidth = Math.floor(tableWidth / columnCount);
  const columnWidths = Array.from({ length: columnCount }, (_, index) => (
    index === columnCount - 1 ? tableWidth - defaultColumnWidth * (columnCount - 1) : defaultColumnWidth
  ));
  const rows = [];
  for (const [rowIndex, row] of sourceRows.entries()) {
    const cells = [...row.children];
    const tableCells = [];
    let columnIndex = 0;
    for (const cell of cells) {
      if (columnIndex >= columnCount) break;
      const columnSpan = Math.max(1, Math.min(Number(cell.colSpan) || 1, columnCount - columnIndex));
      const children = await blockChildren(cell);
      const paragraphs = children.filter(child => child instanceof Paragraph);
      const content = paragraphs.length ? paragraphs : [new Paragraph({ children: [textRun(cell.textContent || '')] })];
      const cellWidth = columnWidths.slice(columnIndex, columnIndex + columnSpan).reduce((sum, width) => sum + width, 0);
      tableCells.push(new TableCell({
        children: content,
        ...summaryDocxTableCellOptions(cell, cellWidth),
        ...(Number(cell.rowSpan) > 1 ? { rowSpan: Math.min(Number(cell.rowSpan), sourceRows.length - rowIndex) } : {})
      }));
      columnIndex += columnSpan;
    }
    while (columnIndex < columnCount) {
      const width = columnWidths[columnIndex];
      tableCells.push(new TableCell({
        children: [new Paragraph('')],
        width: { size: width, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 100, right: 100, marginUnitType: WidthType.DXA }
      }));
      columnIndex += 1;
    }
    rows.push(new TableRow({
      children: tableCells,
      tableHeader: row.parentElement?.tagName === 'THEAD' || [...row.children].some(cell => cell.tagName === 'TH')
    }));
  }
  return [new Table({
    rows,
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths,
    layout: element.style?.tableLayout === 'fixed' ? 'fixed' : 'autofit',
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'AAB7C4' }
    }
  })];
}

const SUMMARY_DOCX_TEXT_EFFECT_XML = {
  outline: '<w14:textOutline w14:w="9525" w14:cap="flat" w14:cmpd="sng" w14:algn="ctr"><w14:solidFill><w14:srgbClr w14:val="2563EB"/></w14:solidFill><w14:prstDash w14:val="solid"/></w14:textOutline><w14:textFill><w14:noFill/></w14:textFill>',
  shadow: '<w14:shadow w14:blurRad="28575" w14:dist="26941" w14:dir="2700000"><w14:srgbClr w14:val="64748B"/></w14:shadow>',
  reflection: '<w14:reflection w14:blurRad="0" w14:stA="0" w14:stPos="0" w14:endA="24000" w14:endPos="100000" w14:dist="9525" w14:dir="5400000" w14:fadeDir="5400000" w14:sx="100000" w14:sy="-100000" w14:kx="0" w14:ky="0" w14:algn="bl"/>',
  glow: '<w14:glow w14:rad="114300"><w14:srgbClr w14:val="38BDF8"><w14:alpha w14:val="80000"/></w14:srgbClr></w14:glow>'
};

function markSummaryDocxTextEffects(root) {
  const sourceHtml = root.innerHTML;
  let prefix;
  do {
    summaryDocxEffectExportSequence += 1;
    prefix = `QLCLDOCXFX${summaryDocxEffectExportSequence}X`;
  } while (sourceHtml.includes(prefix));

  const markers = [];
  root.querySelectorAll('span').forEach(span => {
    const effect = SUMMARY_DOCX_TEXT_EFFECTS.find(item => span.classList.contains(item.className));
    if (!effect) return;
    const marker = `${prefix}${effect.name.toUpperCase()}_${markers.length}END`;
    span.dataset.summaryDocxEffectMarker = marker;
    markers.push({ marker, name: effect.name });
  });
  return markers;
}

function addSummaryDocxTextEffectsToRun(run, marker, effectName) {
  if (!run.includes(marker)) return run;
  const effectXml = SUMMARY_DOCX_TEXT_EFFECT_XML[effectName];
  if (!effectXml) throw new Error('Hiệu ứng chữ không được DOCX hỗ trợ.');
  let updatedRun = run.replaceAll(marker, '');
  const propertiesEnd = updatedRun.indexOf('</w:rPr>');
  if (propertiesEnd >= 0) {
    const changeStart = updatedRun.indexOf('<w:rPrChange');
    const insertionPoint = changeStart > -1 && changeStart < propertiesEnd ? changeStart : propertiesEnd;
    updatedRun = `${updatedRun.slice(0, insertionPoint)}${effectXml}${updatedRun.slice(insertionPoint)}`;
  } else {
    updatedRun = updatedRun.replace(/<w:r(?:\s[^>]*)?>/, opening => `${opening}<w:rPr>${effectXml}</w:rPr>`);
  }
  return updatedRun;
}

function ensureSummaryDocxEffectNamespaces(xml) {
  const rootMatch = xml.match(/<w:(?:document|hdr|ftr)\b[^>]*>/);
  if (!rootMatch) throw new Error('Không nhận diện được phần XML của DOCX.');
  let root = rootMatch[0];
  if (!/xmlns:mc="http:\/\/schemas\.openxmlformats\.org\/markup-compatibility\/2006"/.test(root)) {
    root = root.replace(/>$/, ' xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">');
  }
  if (!/xmlns:w14="http:\/\/schemas\.microsoft\.com\/office\/word\/2010\/wordml"/.test(root)) {
    root = root.replace(/>$/, ' xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">');
  }
  const ignorable = root.match(/\bmc:Ignorable="([^"]*)"/);
  if (ignorable) {
    const prefixes = ignorable[1].split(/\s+/).filter(Boolean);
    if (!prefixes.includes('w14')) {
      root = root.replace(ignorable[0], `mc:Ignorable="${[...prefixes, 'w14'].join(' ')}"`);
    }
  } else {
    root = root.replace(/>$/, ' mc:Ignorable="w14">');
  }
  return xml.replace(rootMatch[0], root);
}

async function preserveSummaryDocxTextEffects(blob, markers) {
  if (!markers.length) return blob;
  const archive = await JSZip.loadAsync(blob);
  const documentParts = Object.values(archive.files).filter(file => (
    !file.dir && /^word\/(?:document|header\d*|footer\d*)\.xml$/i.test(file.name)
  ));
  if (!documentParts.length) throw new Error('Không tìm thấy nội dung DOCX để áp dụng hiệu ứng chữ.');
  for (const part of documentParts) {
    let xml = await part.async('string');
    const partMarkers = markers.filter(({ marker }) => xml.includes(marker));
    if (!partMarkers.length) continue;
    xml = ensureSummaryDocxEffectNamespaces(xml);
    for (const { marker, name } of partMarkers) {
      xml = xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, run => (
        addSummaryDocxTextEffectsToRun(run, marker, name)
      ));
    }
    if (partMarkers.some(({ marker }) => xml.includes(marker))) {
      throw new Error('Không thể gắn hiệu ứng chữ vào nội dung DOCX.');
    }
    archive.file(part.name, xml);
  }

  return archive.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
}

async function blockChildren(root) {
  const blocks = [];
  let inline = [];
  let inlineHasContent = false;
  const flushInline = async container => {
    if (inlineHasContent) blocks.push(new Paragraph(paragraphOptions(container, inline)));
    inline = [];
    inlineHasContent = false;
  };
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      inline.push(...await inlineChildren(child));
      if (child.nodeValue.trim()) inlineHasContent = true;
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    if (child.matches('header.summary-study-document-header,footer.summary-study-document-footer')) continue;
    const textBox = tag === 'aside' && child.classList.contains('summary-study-text-box');
    const container = ['div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'blockquote'].includes(tag) && !textBox;
    const block = textBox || container || ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'table', 'figure'].includes(tag)
      || child.matches('.summary-study-page-break,[data-summary-page-break="true"]');
    if (!block) {
      inline.push(...await inlineChildren(child));
      if (child.tagName.toLowerCase() !== 'br' && hasVisibleContent(child)) inlineHasContent = true;
      continue;
    }
    await flushInline(root);
    if (child.matches('.summary-study-page-break,[data-summary-page-break="true"]')) {
      blocks.push(new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } }));
      continue;
    }
    if (container) {
      blocks.push(...await blockChildren(child));
      continue;
    }
    if (tag === 'aside' && child.classList.contains('summary-study-text-box')) {
      const contents = (await blockChildren(child)).filter(item => item instanceof Paragraph);
      if (contents.length) {
        blocks.push(new Table({
          rows: [new TableRow({
            children: [new TableCell({
              children: contents,
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
                bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
                left: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
                right: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' }
              }
            })]
          })],
          width: { size: PAGE_WIDTH, type: WidthType.DXA },
          columnWidths: [PAGE_WIDTH],
          layout: 'fixed',
          borders: {
            top: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
            left: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
            right: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8' },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
          }
        }));
      }
      continue;
    }
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      if (!hasVisibleContent(child)) continue;
      const children = [];
      for (const node of child.childNodes) children.push(...await inlineChildren(node));
      blocks.push(new Paragraph(paragraphOptions(child, children)));
      continue;
    }
    if (tag === 'table') {
      blocks.push(...await convertTable(child));
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...child.children].filter(item => item.tagName === 'LI');
      for (let index = 0; index < items.length; index += 1) {
        const itemChildren = [];
        for (const itemChild of items[index].childNodes) {
          if (itemChild.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes(itemChild.tagName)) continue;
          itemChildren.push(...await inlineChildren(itemChild));
        }
        if (!hasVisibleContent(items[index])) continue;
        blocks.push(new Paragraph(paragraphOptions(items[index], itemChildren, tag === 'ol' ? `${index + 1}. ` : '• ')));
        for (const nested of items[index].querySelectorAll(':scope > ul, :scope > ol')) {
          for (const nestedItem of nested.children) {
            blocks.push(new Paragraph(paragraphOptions(nestedItem, await inlineChildren(nestedItem), nested.tagName === 'OL' ? '  1. ' : '  • ')));
          }
        }
      }
    } else if (tag === 'figure') {
      if (!hasVisibleContent(child)) continue;
      const figureContent = [];
      for (const node of child.childNodes) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'FIGCAPTION') continue;
        figureContent.push(...await inlineChildren(node));
      }
      if (figureContent.length) {
        const content = figureContent;
        blocks.push(new Paragraph({
          children: content,
          alignment: child.classList.contains('summary-study-shape')
            ? summaryShapeAlignment(child)
            : AlignmentType.CENTER,
          spacing: { after: 60 }
        }));
      }
      const caption = child.querySelector(':scope > figcaption');
      if (caption) blocks.push(new Paragraph({
        children: [textRun(caption.textContent || '', { italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 }
      }));
    }
  }
  await flushInline(root);
  return blocks;
}

export async function exportSummaryHtmlToDocx(html, title) {
  const source = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const textEffectMarkers = markSummaryDocxTextEffects(source.body);
  const page = source.body.querySelector(':scope > .summary-study-page');
  const pageSize = DOCX_PAGE_SIZES[page?.dataset.summaryPageSize] || DOCX_PAGE_SIZES.A4;
  const landscape = page?.dataset.summaryPageOrientation === 'landscape';
  const margins = ['top', 'right', 'bottom', 'left'].map(side => {
    const value = Number(page?.dataset[`summaryPageMargin${side[0].toUpperCase()}${side.slice(1)}`]);
    return Number.isInteger(value) && value >= 5 && value <= 50 ? Math.round(value * 1440 / 25.4) : Math.round(18 * 1440 / 25.4);
  });
  const gutterMm = Number(page?.dataset.summaryPageGutter);
  const gutter = Number.isInteger(gutterMm) && gutterMm >= 0 && gutterMm <= 50
    ? Math.round(gutterMm * 1440 / 25.4)
    : 0;
  const columnCount = Math.min(3, Math.max(1, Number(page?.dataset.summaryPageColumns) || 1));
  const columnGap = Number(page?.dataset.summaryPageColumnGap);
  const columnSpace = Number.isInteger(columnGap) && columnGap >= 5 && columnGap <= 50
    ? Math.round(columnGap * 1440 / 25.4)
    : Math.round(10 * 1440 / 25.4);
  const headerElement = page?.querySelector(':scope > header.summary-study-document-header');
  const footerElement = page?.querySelector(':scope > footer.summary-study-document-footer');
  const headerChildren = headerElement ? await blockChildren(headerElement) : [];
  const footerChildren = footerElement ? await blockChildren(footerElement) : [];
  const children = await blockChildren(source.body);
  const document = new Document({
    creator: 'QLCL',
    title: String(title || 'Tài liệu ôn tập'),
    sections: [{
      properties: {
        page: {
          size: landscape
            ? { width: pageSize.height, height: pageSize.width, orientation: PageOrientation.LANDSCAPE }
            : { width: pageSize.width, height: pageSize.height },
          margin: { top: margins[0], right: margins[1], bottom: margins[2], left: margins[3], gutter, footer: 567 }
        },
        ...(columnCount > 1 ? { column: { count: columnCount, space: columnSpace, equalWidth: true } } : {})
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '64748B' })]
          }), ...footerChildren]
        })
      },
      ...(headerChildren.length ? { headers: { default: new Header({ children: headerChildren }) } } : {}),
      children
    }]
  });
  return preserveSummaryDocxTextEffects(await Packer.toBlob(document), textEffectMarkers);
}
