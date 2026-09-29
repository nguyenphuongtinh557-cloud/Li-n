import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  Document,
  Footer,
  Math as DocxMath,
  MathFraction,
  MathRadical,
  MathRun,
  MathSubScript,
  MathSum,
  MathSuperScript,
  Packer,
  Paragraph,
  TextRun
} from 'docx';
import JSZip from 'jszip';

const editorSource = fs.readFileSync('modules/richTextEditor.js', 'utf8');
const appSource = fs.readFileSync('app.js', 'utf8');
const htmlSource = fs.readFileSync('index.html', 'utf8');
const styleSource = fs.readFileSync('style.css', 'utf8');
const shareApiSource = fs.readFileSync('api/summary-share.js', 'utf8');
const anchorStart = appSource.indexOf('function reanchorSummaryStudyAnnotations(');
const anchorEnd = appSource.indexOf('\nfunction summaryStudyTextOffset(', anchorStart);
assert.ok(anchorStart >= 0 && anchorEnd > anchorStart);
const urlStart = editorSource.indexOf('function safeRichTextUrl(');
const urlEnd = editorSource.indexOf('\nfunction sanitizeRichTextStyle', urlStart);
assert.ok(urlStart >= 0 && urlEnd > urlStart);

const context = { URL };
vm.createContext(context);
vm.runInContext(`${editorSource.slice(urlStart, urlEnd)}\nthis.safeRichTextUrl = safeRichTextUrl;`, context);
const cleanHtmlStart = shareApiSource.indexOf('function cleanDocumentHtml(');
const cleanHtmlEnd = shareApiSource.indexOf('\nfunction getShareId(', cleanHtmlStart);
assert.ok(cleanHtmlStart >= 0 && cleanHtmlEnd > cleanHtmlStart);
const shareContext = { Buffer };
vm.createContext(shareContext);
vm.runInContext(`const MAX_DOCUMENT_HTML_BYTES = 450_000;\n${shareApiSource.slice(cleanHtmlStart, cleanHtmlEnd)}\nthis.cleanDocumentHtml = cleanDocumentHtml;`, shareContext);

test('rich-text links allow only navigable safe protocols', () => {
  assert.equal(context.safeRichTextUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(context.safeRichTextUrl('mailto:student@example.com'), 'mailto:student@example.com');
  assert.equal(context.safeRichTextUrl('#summary-study-heading-1'), '#summary-study-heading-1');
  assert.equal(context.safeRichTextUrl('#javascript:alert(1)'), '');
  assert.equal(context.safeRichTextUrl('javascript:alert(1)'), '');
  assert.equal(context.safeRichTextUrl('data:text/html,<script>alert(1)</script>'), '');
});

test('rich-text images allow bounded raster data URLs and HTTP(S)', () => {
  assert.equal(context.safeRichTextUrl('https://example.com/image.png', { image: true }), 'https://example.com/image.png');
  assert.equal(context.safeRichTextUrl('data:image/svg+xml;base64,PHN2Zz4=', { image: true }), '');
  assert.equal(context.safeRichTextUrl(`data:image/png;base64,${'A'.repeat(1_400_001)}`, { image: true }), '');
});

test('image crop percentages produce bounded pixel regions', () => {
  const cropStart = editorSource.indexOf('function imageCropBounds(');
  const cropEnd = editorSource.indexOf('\nfunction imageTransformValues', cropStart);
  assert.ok(cropStart >= 0 && cropEnd > cropStart);
  const cropContext = {};
  vm.createContext(cropContext);
  vm.runInContext(`${editorSource.slice(cropStart, cropEnd)}\nthis.imageCropBounds = imageCropBounds;`, cropContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(cropContext.imageCropBounds(200, 100, { top: 20, right: 5, bottom: 0, left: 10 }))),
    { x: 20, y: 20, width: 170, height: 80 }
  );
  assert.throws(() => cropContext.imageCropBounds(200, 100, { top: 0, right: 45, bottom: 0, left: 45 }), /nhỏ hơn 90%/);
  assert.throws(() => cropContext.imageCropBounds(200, 100, { top: 46, right: 0, bottom: 0, left: 0 }), /0–45%/);
});

test('chart data validation supports bounded labels and non-negative numeric values', () => {
  const parserStart = editorSource.indexOf('function parseDelimitedRows(');
  const parserEnd = editorSource.indexOf('\nfunction convertSelectedTextToTable', parserStart);
  const chartStart = editorSource.indexOf('function parseSummaryChartData(');
  const chartEnd = editorSource.indexOf('\nfunction drawSummaryChart', chartStart);
  assert.ok(parserStart >= 0 && parserEnd > parserStart && chartStart >= 0 && chartEnd > chartStart);
  const chartContext = {};
  vm.createContext(chartContext);
  vm.runInContext(`${editorSource.slice(parserStart, parserEnd)}\n${editorSource.slice(chartStart, chartEnd)}\nthis.parseSummaryChartData = parseSummaryChartData;`, chartContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(chartContext.parseSummaryChartData('Label, Value\n"Nhóm A", 12\n"Nhóm B", 18'))),
    [{ label: 'Nhóm A', value: 12 }, { label: 'Nhóm B', value: 18 }]
  );
  assert.throws(() => chartContext.parseSummaryChartData('Một, -1\nHai, 2'), /giá trị số từ 0/);
  assert.throws(() => chartContext.parseSummaryChartData('Một, 0\nHai, 0'), /phải lớn hơn 0/);
  assert.throws(() => chartContext.parseSummaryChartData('Một, 1'), /từ 2 đến 12/);
});

test('process diagrams validate layout, palette, step count, and bounded step text', () => {
  const constantsStart = editorSource.indexOf('const SUMMARY_DIAGRAM_LAYOUTS');
  const constantsEnd = editorSource.indexOf('const SUMMARY_SHAPE_TYPES', constantsStart);
  const normalizeStart = editorSource.indexOf('function normalizeSummaryDiagramOptions(');
  const normalizeEnd = editorSource.indexOf('\nfunction summaryDiagramSteps', normalizeStart);
  assert.ok(constantsStart >= 0 && constantsEnd > constantsStart && normalizeStart >= 0 && normalizeEnd > normalizeStart);
  const diagramContext = {};
  vm.createContext(diagramContext);
  vm.runInContext(`${editorSource.slice(constantsStart, constantsEnd)}\n${editorSource.slice(normalizeStart, normalizeEnd)}\nthis.normalize = normalizeSummaryDiagramOptions;`, diagramContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(diagramContext.normalize({
      layout: 'process',
      palette: 'teal',
      steps: ' Chuẩn bị \nThực hiện\nĐánh giá'
    }))),
    { layout: 'process', palette: 'teal', steps: ['Chuẩn bị', 'Thực hiện', 'Đánh giá'] }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(diagramContext.normalize({
      layout: 'cycle',
      palette: 'blue',
      steps: ['Bước 1', 'Bước 2']
    }))).steps,
    ['Bước 1', 'Bước 2']
  );
  assert.throws(() => diagramContext.normalize({ layout: 'unknown', palette: 'teal', steps: 'A\nB' }), /Kiểu hoặc bảng màu/);
  assert.throws(() => diagramContext.normalize({ layout: 'process', palette: 'bad', steps: 'A\nB' }), /Kiểu hoặc bảng màu/);
  assert.throws(() => diagramContext.normalize({ layout: 'process', palette: 'teal', steps: 'Một bước' }), /từ 2 đến 8 bước/);
  assert.throws(() => diagramContext.normalize({
    layout: 'process',
    palette: 'teal',
    steps: Array.from({ length: 9 }, (_, index) => `Bước ${index + 1}`)
  }), /từ 2 đến 8 bước/);
  assert.throws(() => diagramContext.normalize({
    layout: 'process',
    palette: 'teal',
    steps: [`x${'y'.repeat(60)}`, 'Bước 2']
  }), /tối đa 60 ký tự/);
  assert.throws(() => diagramContext.normalize({ layout: 'process', palette: 'teal', steps: ' \n ' }), /từ 2 đến 8 bước/);
});

test('process diagrams retain validated editing metadata and export accessibly as images', () => {
  assert.match(editorSource, /data-summary-diagram-layout/);
  assert.match(editorSource, /data-summary-diagram-palette/);
  assert.match(editorSource, /data-summary-diagram-data/);
  assert.match(editorSource, /function drawSummaryDiagram\(\{ layout, palette, steps \}\)/);
  assert.match(editorSource, /function openSummaryDiagramDialog\(editor, diagram = null, overrides = \{\}\)/);
  assert.match(editorSource, /function normalizeFigureCaptions\(root\) \{\s*root\.querySelectorAll\('figure\.summary-study-figure, figure\.summary-study-chart, figure\.summary-study-diagram'\)/);
  assert.match(editorSource, /const figures = \[\.\.\.root\.querySelectorAll\('figure\.summary-study-figure, figure\.summary-study-chart, figure\.summary-study-diagram'\)\]/);
  assert.match(editorSource, /title: figureCaptionDescription\(diagram\?\.querySelector\(':scope > figcaption'\)\?\.textContent \|\| ''\) \|\| 'Sơ đồ mới'/);
  assert.match(editorSource, /title: figureCaptionDescription\(chart\?\.querySelector\(':scope > figcaption'\)\?\.textContent \|\| ''\) \|\| 'Biểu đồ mới'/);
  assert.match(editorSource, /'diagram-insert': \(\) => openSummaryDiagramDialog\(editor\)/);
  assert.match(editorSource, /'diagram-edit': \(\) => editSelectedSummaryDiagram\(editor\)/);
  assert.match(editorSource, /'diagram-config': \(\) => setSelectedSummaryDiagramOption\(editor, options\.setting, options\.value, options\.diagram\)/);
  assert.match(editorSource, /onDiagramContextChange\?\.\(true, context\)/);
  assert.match(editorSource, /summary-study-diagram'\)\)/);
  assert.match(htmlSource, /data-editor-tool="diagram-insert"/);
  assert.match(htmlSource, /data-editor-tool="diagram-edit"/);
  assert.match(htmlSource, /data-summary-diagram-layout/);
  assert.match(htmlSource, /data-summary-diagram-palette/);
  const ribbonStart = htmlSource.indexOf('<section class="summary-study-ribbon"');
  const ribbonEnd = htmlSource.indexOf('</section>', ribbonStart);
  const diagramPanelPosition = htmlSource.indexOf('id="summary-study-panel-diagram-design"');
  assert.ok(ribbonStart >= 0 && diagramPanelPosition > ribbonStart && diagramPanelPosition < ribbonEnd);
  assert.match(appSource, /onDiagramContextChange: \(isInsideDiagram, context\) => summaryStudySetDiagramContext\(isInsideDiagram, context\)/);
  assert.match(appSource, /function summaryStudySetDiagramContext\(isInsideDiagram, context = \{\}\)/);
  assert.match(appSource, /summaryStudyRunDiagramTool\('diagram-config'/);
  assert.match(styleSource, /\.summary-study-richtext \.summary-study-diagram img/);
  assert.match(appSource, /summary-study-diagram figcaption/);
  assert.match(appSource, /richTextEditor\.js\?v=20260928-summary-study-ribbon-v35/);
  assert.match(htmlSource, /style\.css\?v=20260928-summary-study-ribbon-v25/);
  assert.match(htmlSource, /app\.js\?v=20260928-summary-study-ribbon-v38/);
});

test('find and replace handles literal Unicode matches, casing, and replacement tokens', () => {
  const helperStart = editorSource.indexOf('function replaceSummaryTextPattern(');
  const helperEnd = editorSource.indexOf('\nfunction replaceSummaryDocumentText', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const replaceContext = {};
  vm.createContext(replaceContext);
  vm.runInContext(`${editorSource.slice(helperStart, helperEnd)}\nthis.replace = replaceSummaryTextValue;\nthis.replaceRuns = replaceSummaryTextRuns;`, replaceContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('A+B a+b', 'a+b', '$&', false))),
    { value: '$& $&', count: 2 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('Tài liệu tài liệu', 'Tài liệu', 'Văn bản', true))),
    { value: 'Văn bản tài liệu', count: 1 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('Không đổi', 'vắng mặt', 'mới', false))),
    { value: 'Không đổi', count: 0 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('AI và AIO, AI.', 'AI', 'LLM', false, true))),
    { value: 'LLM và AIO, LLM.', count: 2 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('mô hình Ngôn ngữ', 'ngôn ngữ', 'LLM', false, true))),
    { value: 'mô hình LLM', count: 1 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replace('foo_bar foo2 foo', 'foo', 'x', false, true))),
    { value: 'foo_bar foo2 x', count: 1 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replaceRuns(['Mô hình ', 'ngôn', ' ngữ'], 'mô hình ngôn ngữ', 'LLM', false))),
    { values: ['LLM', '', ''], count: 1 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replaceRuns(['Alpha', ' Beta'], 'alpha beta', 'Gamma', false))),
    { values: ['Gamma', ''], count: 1 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(replaceContext.replaceRuns(['Alpha', ' Beta'], 'alpha beta', 'Gamma', true))),
    { values: ['Alpha', ' Beta'], count: 0 }
  );
  assert.match(editorSource, /textNode\.parentElement\?\.closest\('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,pre,div'\)/);
  assert.match(editorSource, /function replaceSummaryTextRuns\(values, search, replacement, matchCase, wholeWord = false\)/);
  assert.match(editorSource, /function replaceSummaryTextPattern\(search, matchCase, wholeWord\)/);
  assert.match(editorSource, /name: 'wholeWord', label: 'Chỉ khớp từ hoàn chỉnh'/);
  assert.match(editorSource, /emptyFormatting\.has\(parent\.tagName\)/);
  assert.match(editorSource, /function replaceSummaryDocumentText\(editor, search, replacement, matchCase, wholeWord = false\)/);
  assert.match(editorSource, /editor\.undoManager\.transact\(\(\) => \{\s*groups\.forEach/);
  assert.match(editorSource, /function openSummaryFindReplaceDialog\(editor\)/);
  assert.match(editorSource, /'find-replace': \(\) => openSummaryFindReplaceDialog\(editor\)/);
  assert.match(htmlSource, /data-editor-tool="find-replace"/);
  assert.match(htmlSource, /Tìm &amp; thay thế/);
  assert.match(appSource, /richTextEditor\.js\?v=20260928-summary-study-ribbon-v35/);
  assert.match(htmlSource, /app\.js\?v=20260928-summary-study-ribbon-v38/);
});

test('table formulas validate supported ranges and calculate numeric aggregates', () => {
  const formulaStart = editorSource.indexOf('const SUMMARY_TABLE_FORMULAS');
  const formulaEnd = editorSource.indexOf('\nexport function runSummaryEditorTableCommand', formulaStart);
  assert.ok(formulaStart >= 0 && formulaEnd > formulaStart);
  const formulaContext = {};
  vm.createContext(formulaContext);
  vm.runInContext(`${editorSource.slice(formulaStart, formulaEnd)}\nthis.parse = parseSummaryTableFormula;\nthis.calculate = calculateSummaryTableFormula;\nthis.reference = parseSummaryTableCellReference;\nthis.recalculate = recalculateSummaryTableFormulas;\nthis.remove = removeSummaryTableFormula;\nthis.openDialog = openSummaryTableFormulaDialog;`, formulaContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(formulaContext.parse('sum(ABOVE)'))),
    { functionName: 'SUM', range: 'ABOVE' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(formulaContext.parse('SUM(A1)'))),
    { functionName: 'SUM', range: 'A1' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(formulaContext.parse('AVERAGE(A1:C4)'))),
    { functionName: 'AVERAGE', range: 'A1:C4' }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(formulaContext.reference('T99'))),
    { column: 19, row: 98 }
  );
  assert.throws(() => formulaContext.parse('IMPORTXML(A1)'));
  assert.throws(() => formulaContext.parse('SUM(A4:B1)'), /thứ tự từ trên trái/);
  assert.throws(() => formulaContext.reference('U1'), /A1:T99/);
  assert.equal(formulaContext.calculate('SUM', ['12', '3,5', 'Tiêu đề']), 15.5);
  assert.equal(formulaContext.calculate('AVERAGE', ['2', '6', '']), 4);
  assert.equal(formulaContext.calculate('MIN', ['-2', '6']), -2);
  assert.equal(formulaContext.calculate('MAX', ['-2', '6']), 6);
  assert.equal(formulaContext.calculate('COUNT', ['1', 'tiêu đề', '2']), 2);
  assert.throws(() => formulaContext.calculate('AVERAGE', ['tiêu đề', '']), /không chứa giá trị số/);
  const createCell = (text, row, column) => ({
    cellIndex: column,
    parentElement: row,
    textContent: text,
    formula: null,
    querySelector() { return this.formula; }
  });
  const createTable = rows => {
    const table = { rows, querySelectorAll: () => rows.flatMap(row => row.cells.map(cell => cell.formula).filter(Boolean)) };
    rows.forEach(row => row.cells.forEach(cell => { cell.table = table; }));
    return table;
  };
  const createFormula = (cell, formula, initialValue = '0') => {
    const element = {
      className: 'summary-study-table-formula',
      dataset: { summaryTableFormula: formula },
      textContent: initialValue,
      closest: selector => selector === 'table' ? cell.table : cell
    };
    cell.formula = element;
    return element;
  };
  const createEditor = () => ({
    undoManager: { transact: callback => callback() },
    nodeChanged() {},
    fire() {}
  });
  const existingFormulaCell = {
    cellIndex: 1,
    formula: { dataset: { summaryTableFormula: 'AVERAGE(A1:B3)' } },
    querySelector() { return this.formula; }
  };
  let formulaDialog;
  formulaContext.openDialog({ windowManager: { open: options => { formulaDialog = options; } } }, {}, existingFormulaCell);
  assert.deepEqual(
    JSON.parse(JSON.stringify(formulaDialog.initialData)),
    { functionName: 'AVERAGE', range: 'LEFT', customRange: 'A1:B3' }
  );
  assert.equal(formulaDialog.buttons[1].text, 'Cập nhật công thức');
  const removableCell = {
    ownerDocument: { createTextNode: textContent => ({ textContent }) },
    formula: { textContent: '15.5' },
    textContent: '15.5',
    querySelector() { return this.formula; },
    replaceChildren(value) {
      this.formula = null;
      this.textContent = value.textContent;
    }
  };
  assert.equal(formulaContext.remove(createEditor(), removableCell), true);
  assert.equal(removableCell.textContent, '15.5');
  assert.equal(removableCell.formula, null);
  assert.equal(formulaContext.remove(createEditor(), removableCell), false);
  const firstRow = { cells: [] };
  firstRow.cells = [createCell('2', firstRow, 0), createCell('', firstRow, 1)];
  const secondRow = { cells: [] };
  secondRow.cells = [createCell('', secondRow, 0)];
  const chainedTable = createTable([firstRow, secondRow]);
  createFormula(firstRow.cells[1], 'SUM(A1)');
  createFormula(secondRow.cells[0], 'SUM(B1)');
  const chainedResult = formulaContext.recalculate(createEditor(), chainedTable);
  assert.equal(chainedResult.total, 2);
  assert.equal(chainedResult.updated, 2);
  assert.equal(chainedResult.failures.length, 0);
  assert.equal(firstRow.cells[1].formula.textContent, '2');
  assert.equal(secondRow.cells[0].formula.textContent, '2');

  const cycleRow = { cells: [] };
  cycleRow.cells = [createCell('', cycleRow, 0), createCell('', cycleRow, 1)];
  const cycleTable = createTable([cycleRow]);
  createFormula(cycleRow.cells[0], 'SUM(B1)');
  createFormula(cycleRow.cells[1], 'SUM(A1)');
  const cycleResult = formulaContext.recalculate(createEditor(), cycleTable);
  assert.equal(cycleResult.updated, 0);
  assert.equal(cycleResult.failures.length, 2);
  assert.match(cycleResult.failures[0].message, /tham chiếu vòng/);
  assert.match(cycleResult.failures[1].message, /tham chiếu vòng/);
  assert.match(editorSource, /function recalculateSummaryTableFormulas\(editor, table\)/);
  assert.match(editorSource, /name === 'data-summary-table-formula'[\s\S]*?parseSummaryTableFormula\(value\)/);
  assert.match(editorSource, /result\.failures\.forEach/);
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  assert.match(docxSource, /async function inlineChildren\(node, style = \{\}\)[\s\S]*?for \(const child of element\.childNodes\) children\.push\(\.\.\.await inlineChildren\(child, runStyle\(element, style\)\)\);/);
  assert.match(editorSource, /'insert-formula'/);
  assert.match(editorSource, /'recalculate-formulas'/);
  assert.match(editorSource, /'remove-formula'/);
  assert.match(htmlSource, /data-summary-table-command="insert-formula"/);
  assert.match(htmlSource, /data-summary-table-command="recalculate-formulas"/);
  assert.match(htmlSource, /data-summary-table-command="remove-formula"/);
  assert.match(appSource, /richTextEditor\.js\?v=20260928-summary-study-ribbon-v35/);
  assert.match(htmlSource, /app\.js\?v=20260928-summary-study-ribbon-v38/);
});

test('text effects replace prior effects, require selected text, and remain undoable', () => {
  const effectStart = editorSource.indexOf('const SUMMARY_TEXT_EFFECTS = [');
  const effectEnd = editorSource.indexOf('\nconst SUMMARY_EQUATION_TEMPLATES', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  const effectContext = {};
  vm.createContext(effectContext);
  vm.runInContext(`function selectedEditorText(editor) { return editor.selection.getContent({ format: 'text' }).trim(); }\n${editorSource.slice(effectStart, effectEnd)}\nthis.effects = SUMMARY_TEXT_EFFECTS;\nthis.apply = applySummaryTextEffect;\nthis.open = openSummaryTextEffectsDialog;`, effectContext);

  const makeEditor = selectedText => {
    const calls = [];
    let dialog;
    const notifications = [];
    const editor = {
      calls,
      selection: {
        getBookmark: () => ({ id: 7 }),
        moveToBookmark: bookmark => calls.push(['bookmark', bookmark.id]),
        getContent: () => selectedText
      },
      windowManager: { open: options => { dialog = options; } },
      get dialog() { return dialog; },
      formatter: {
        remove: name => calls.push(['remove', name]),
        apply: name => calls.push(['apply', name]),
        register: () => {}
      },
      undoManager: { transact: callback => { calls.push(['transaction']); callback(); } },
      nodeChanged: () => calls.push(['nodeChanged']),
      fire: name => calls.push(['fire', name]),
      notificationManager: { open: notice => notifications.push(notice) },
      notifications
    };
    return editor;
  };

  const editor = makeEditor('selected words');
  effectContext.open(editor);
  assert.deepEqual(
    JSON.parse(JSON.stringify(editor.dialog.body.items[0].items.map(item => item.value))),
    [...effectContext.effects.map(effect => effect.name), 'remove']
  );
  editor.dialog.onSubmit({ getData: () => ({ effect: 'summaryTextGlow' }), close: () => editor.calls.push(['close']) });
  assert.equal(editor.calls.filter(([type]) => type === 'transaction').length, 1);
  assert.deepEqual(
    editor.calls.filter(([type]) => type === 'remove').map(([, name]) => name),
    JSON.parse(JSON.stringify(effectContext.effects.map(effect => effect.name)))
  );
  assert.deepEqual(editor.calls.filter(([type]) => type === 'apply'), [['apply', 'summaryTextGlow']]);
  assert.deepEqual(editor.calls.filter(([type]) => type === 'bookmark'), [['bookmark', 7]]);
  assert.equal(editor.calls.some(([type, name]) => type === 'fire' && name === 'change'), true);
  assert.equal(editor.calls.at(-1)[0], 'close');

  const removeEditor = makeEditor('selected words');
  assert.equal(effectContext.apply(removeEditor, 'remove'), true);
  assert.equal(removeEditor.calls.filter(([type]) => type === 'remove').length, effectContext.effects.length);
  assert.equal(removeEditor.calls.some(([type]) => type === 'apply'), false);

  const emptyEditor = makeEditor('   ');
  effectContext.open(emptyEditor);
  let closed = false;
  emptyEditor.dialog.onSubmit({ getData: () => ({ effect: 'summaryTextOutline' }), close: () => { closed = true; } });
  assert.equal(emptyEditor.calls.some(([type]) => type === 'apply'), false);
  assert.equal(emptyEditor.notifications[0].type, 'info');
  assert.equal(closed, false);
  assert.match(editorSource, /onAction: \(\) => applySummaryTextEffect\(editor, effect\.name/);
  assert.match(editorSource, /onAction: \(\) => applySummaryTextEffect\(editor, 'remove'/);
  assert.match(editorSource, /editor\.formatter\.register\(effect\.name,[\s\S]*?classes: effect\.classes/);
});

test('DOCX text effects use Office 2010 run properties and preserve all four effects', async () => {
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  const effectStart = docxSource.indexOf('const SUMMARY_DOCX_TEXT_EFFECTS = [');
  const effectEnd = docxSource.indexOf('\nasync function blockChildren', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart);
  assert.match(docxSource, /if \(element\.dataset\?\.summaryDocxEffectMarker\) style\.textEffectMarker = element\.dataset\.summaryDocxEffectMarker/);
  assert.match(docxSource, /text: style\.textEffectMarker \? `\$\{style\.textEffectMarker\}\$\{text\}` : text/);
  assert.match(docxSource, /const textEffectMarkers = markSummaryDocxTextEffects\(source\.body\)/);
  assert.match(docxSource, /preserveSummaryDocxTextEffects\(await Packer\.toBlob\(document\), textEffectMarkers\)/);

  const effectContext = { JSZip, TextRun };
  vm.createContext(effectContext);
  vm.runInContext(
    `${docxSource.slice(effectStart, effectEnd)}\nthis.mark = markSummaryDocxTextEffects;\nthis.runStyle = runStyle;\nthis.textRun = textRun;\nthis.preserve = preserveSummaryDocxTextEffects;`,
    effectContext
  );
  const effectNames = ['outline', 'shadow', 'reflection', 'glow'];
  const spans = effectNames.map(name => ({
    classList: { contains: className => className === `summary-study-text-effect--${name}` },
    dataset: {}
  }));
  const markers = effectContext.mark({ innerHTML: '', querySelectorAll: () => spans });
  const runs = spans.map((span, index) => effectContext.textRun(
    `${effectNames[index]} sample`,
    effectContext.runStyle(span, {})
  ));
  const sourceBlob = await Packer.toBlob(new Document({
    sections: [{
      children: [new Paragraph({ children: runs })],
      footers: {
        default: new Footer({
          children: [new Paragraph({ children: [new TextRun({ text: `${markers[0].marker}footer outline`, font: 'Arial' })] })]
        })
      }
    }]
  }));
  const exportedBlob = await effectContext.preserve(sourceBlob, markers);
  assert.equal(exportedBlob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

  const archive = await JSZip.loadAsync(exportedBlob);
  const documentXml = await archive.file('word/document.xml').async('string');
  for (const marker of markers) assert.equal(documentXml.includes(marker.marker), false);
  assert.match(documentXml, /<w14:glow\b[^>]*w14:rad="114300"/);
  assert.match(documentXml, /<w14:shadow\b[^>]*w14:blurRad="28575"/);
  assert.match(documentXml, /<w14:reflection\b[^>]*w14:sy="-100000"/);
  assert.match(documentXml, /<w14:textOutline\b[\s\S]*?<\/w14:textOutline><w14:textFill><w14:noFill\/><\/w14:textFill>/);
  assert.match(documentXml, /mc:Ignorable="[^"]*\bw14\b/);
  const footerXml = await archive.file('word/footer1.xml').async('string');
  assert.equal(footerXml.includes(markers[0].marker), false);
  assert.match(footerXml, /<w14:textOutline\b/);
  assert.match(footerXml, /mc:Ignorable="w14"/);
});

test('equation gallery and new equation builder create structured math, not linear text', () => {
  const equationStart = editorSource.indexOf('const SUMMARY_EQUATION_TEMPLATES');
  const equationEnd = editorSource.indexOf('\nfunction registerSummaryTextEffects', equationStart);
  assert.ok(equationStart >= 0 && equationEnd > equationStart);
  const equationContext = {};
  vm.createContext(equationContext);
  vm.runInContext(`${editorSource.slice(equationStart, equationEnd)}\nthis.templates = SUMMARY_EQUATION_TEMPLATES;\nthis.normalize = normalizeSummaryEquationModel;\nthis.render = renderSummaryEquationNodes;\nthis.accessibleText = summaryEquationAccessibleText;\nthis.builderData = summaryEquationBuilderData;\nthis.markup = summaryEquationMarkup;\nthis.openGallery = openSummaryEquationGallery;\nthis.openBuilder = openSummaryEquationBuilder;\nthis.openSymbol = openSummarySymbolDialog;`, equationContext);
  const circle = equationContext.normalize({ version: 1, nodes: equationContext.templates.circle.nodes });
  assert.equal(circle.version, 1);
  assert.match(equationContext.render(circle.nodes, value => value), /<sup>2<\/sup>/);
  const collectText = nodes => nodes.flatMap(node => [
    ...(node.type === 'text' ? [node.value] : []),
    ...Object.entries(node)
      .filter(([key, value]) => key !== 'type' && Array.isArray(value))
      .flatMap(([, children]) => collectText(children))
  ]);
  const linearPowerOrIndex = /[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱᵏ₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₒₓₙₖ\/\\^]/;
  for (const template of Object.values(equationContext.templates)) {
    assert.doesNotThrow(() => equationContext.normalize({ version: 1, nodes: template.nodes }));
    assert.doesNotMatch(collectText(template.nodes).join(''), linearPowerOrIndex);
  }
  const fraction = equationContext.normalize({
    version: 1,
    nodes: [{
      type: 'fraction',
      numerator: [{ type: 'text', value: 'a' }],
      denominator: [{ type: 'text', value: 'b' }]
    }]
  });
  assert.match(equationContext.render(fraction.nodes, value => value), /equation-numerator[\s\S]*equation-denominator/);
  assert.equal(equationContext.accessibleText(fraction.nodes), 'a trên b');
  const accessibleMarkup = equationContext.markup({
    dom: { encode: value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }
  }, fraction);
  assert.match(accessibleMarkup, /role="math" aria-label="a trên b"/);
  const escapedMarkup = equationContext.markup({
    dom: { encode: value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') }
  }, { version: 1, nodes: [{ type: 'text', value: '<script>alert(1)</script>' }] });
  assert.doesNotMatch(escapedMarkup, /<script>/);
  assert.match(escapedMarkup, /&lt;script&gt;/);
  assert.throws(() => equationContext.normalize({ version: 1, nodes: [{ type: 'fraction', numerator: [], denominator: [] }] }), /cần có nội dung/);
  assert.throws(() => equationContext.normalize({ version: 1, nodes: [{ type: 'text', value: '   ' }] }), /cần có nội dung/);
  assert.deepEqual(
    JSON.parse(JSON.stringify(equationContext.builderData({
      version: 1,
      nodes: [
        { type: 'text', value: 'y = ' },
        { type: 'fraction', numerator: [{ type: 'text', value: 'a' }], denominator: [{ type: 'text', value: 'b' }] }
      ]
    }))),
    { structure: 'fraction', before: 'y = ', base: 'a', upper: 'b', lower: '' }
  );
  assert.equal(equationContext.builderData({
    version: 1,
    nodes: [{ type: 'sqrt', children: [{ type: 'sup', base: [{ type: 'text', value: 'x' }], exponent: [{ type: 'text', value: '2' }] }] }]
  }), null);
  assert.throws(() => equationContext.normalize({ version: 2, nodes: [{ type: 'text', value: 'x' }] }), /Phiên bản/);
  assert.throws(() => equationContext.normalize({ version: 1, nodes: [{ type: 'unknown', value: 'x' }] }), /không được hỗ trợ/);
  assert.doesNotMatch(Object.values(equationContext.templates).map(template => template.label).join(' '), /\/|\^/);
  assert.equal(Object.keys(equationContext.templates).length >= 6, true);

  let equationDialog;
  const inserted = [];
  let bookmarkRestored = false;
  const editor = {
    selection: {
      getBookmark: () => ({ id: 1 }),
      getNode: () => ({}),
      moveToBookmark: () => { bookmarkRestored = true; }
    },
    windowManager: { open: options => { equationDialog = options; } },
    dom: { encode: value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') },
    undoManager: { transact: callback => callback() },
    insertContent: value => inserted.push(value),
    nodeChanged() {},
    fire() {},
    notificationManager: { open: options => { throw new Error(options.text); } }
  };
  equationContext.openGallery(editor);
  assert.deepEqual(
    JSON.parse(JSON.stringify(equationDialog.body.items[0].items.map(item => item.value))),
    Object.keys(equationContext.templates)
  );
  const equationApi = {
    getData: () => ({ template: 'quadratic' }),
    close() {}
  };
  equationDialog.onSubmit(equationApi);
  assert.equal(bookmarkRestored, true);
  const insertedModelAttribute = inserted[0].match(/data-summary-equation="([^"]+)"/)?.[1];
  const insertedModel = JSON.parse(insertedModelAttribute.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
  assert.equal(insertedModel.version, 1);
  assert.match(inserted[0], /summary-study-equation-fraction/);
  assert.match(inserted[0], /summary-study-equation-root/);
  assert.match(inserted[0], /<sup>2<\/sup>/);
  assert.doesNotMatch(inserted[0], /linear-v1|\^/);

  let builderDialog;
  const builderEditor = {
    ...editor,
    windowManager: { open: options => { builderDialog = options; } },
    selection: { getBookmark: () => ({ id: 4 }), getNode: () => ({}), moveToBookmark: () => { bookmarkRestored = true; } }
  };
  equationContext.openBuilder(builderEditor);
  const builderApi = {
    getData: () => ({ structure: 'fraction', before: 'x = ', base: '−b', upper: '2a', lower: '' }),
    close() {}
  };
  builderDialog.onSubmit(builderApi);
  const newEquation = inserted[1];
  assert.match(newEquation, /equation-fraction/);
  assert.match(newEquation, /equation-numerator/);
  assert.match(newEquation, /equation-denominator/);
  assert.doesNotMatch(newEquation, /\^/);
  const builderCases = [
    { structure: 'sup', base: 'x', upper: '2', modelType: 'sup' },
    { structure: 'sub', base: 'x', upper: 'i', modelType: 'sub' },
    { structure: 'sqrt', base: 'x + 1', modelType: 'sqrt' },
    { structure: 'root', base: 'x + 1', lower: '3', modelType: 'root' },
    { structure: 'sum', upper: 'n', lower: 'i = 1', modelType: 'sum' }
  ];
  for (const { modelType, ...data } of builderCases) {
    let caseDialog;
    equationContext.openBuilder({
      ...builderEditor,
      windowManager: { open: options => { caseDialog = options; } },
      insertContent: value => inserted.push(value)
    });
    caseDialog.onSubmit({ getData: () => data, close() {} });
    const caseModelAttribute = inserted.at(-1).match(/data-summary-equation="([^"]+)"/)?.[1];
    const caseModel = JSON.parse(caseModelAttribute.replaceAll('&quot;', '"').replaceAll('&amp;', '&'));
    assert.equal(caseModel.nodes.at(-1).type, modelType);
  }
  const incompleteBuilder = {
    ...builderApi,
    getData: () => ({ structure: 'fraction', before: '', base: '', upper: '', lower: '' })
  };
  assert.throws(() => builderDialog.onSubmit(incompleteBuilder), /cần có nội dung/);

  let symbolDialog;
  equationContext.openSymbol({
    ...editor,
    windowManager: { open: options => { symbolDialog = options; } },
    selection: { getBookmark: () => ({ id: 2 }), moveToBookmark: () => { bookmarkRestored = true; } }
  });
  const symbolApi = { getData: () => ({ symbol: 'α' }), close() {} };
  symbolDialog.onSubmit(symbolApi);
  assert.equal(inserted.at(-1), 'α');
  const invalidSymbolApi = { getData: () => ({ symbol: '<script>' }), close() {} };
  assert.throws(() => symbolDialog.onSubmit(invalidSymbolApi), /không hợp lệ/);

  assert.match(editorSource, /name === 'data-summary-equation'[\s\S]*?normalizeSummaryEquationModel\(JSON\.parse\(value\)\)/);
  assert.match(editorSource, /if \(equationModel\) \{\s*element\.setAttribute\('role', 'math'\);\s*element\.setAttribute\('aria-label', summaryEquationAccessibleText/);
  assert.match(editorSource, /'equation-insert': \(\) => openSummaryEquationGallery\(editor\)/);
  assert.match(editorSource, /'equation-new': \(\) => openSummaryEquationBuilder\(editor\)/);
  assert.match(editorSource, /'symbol-insert': \(\) => openSummarySymbolDialog\(editor\)/);
  assert.match(htmlSource, /data-editor-tool="equation-insert"/);
  assert.match(htmlSource, /data-editor-tool="equation-new"/);
  assert.match(htmlSource, /data-editor-tool="symbol-insert"/);
  assert.match(styleSource, /\.summary-study-equation-fraction/);
  assert.match(styleSource, /\.summary-study-equation-numerator/);
  assert.match(styleSource, /\.summary-study-equation-radical-symbol/);
});

test('DOCX table export preserves cell spans, shading, padding, borders, and width', async () => {
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  const helperStart = docxSource.indexOf('function parseHexColor(');
  const helperEnd = docxSource.indexOf('\nfunction imageTransform', helperStart);
  const measureStart = docxSource.indexOf('function cssMeasureToTwips(');
  const measureEnd = docxSource.indexOf('\nfunction paragraphFormatting', measureStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart && measureStart >= 0 && measureEnd > measureStart);
  const docxContext = {
    PAGE_WIDTH: 9000,
    WidthType: { DXA: 'dxa' },
    BorderStyle: { SINGLE: 'single', DASHED: 'dashed', DOTTED: 'dotted', DOUBLE: 'double', NONE: 'none' }
  };
  vm.createContext(docxContext);
  vm.runInContext(`${docxSource.slice(helperStart, helperEnd)}\n${docxSource.slice(measureStart, measureEnd)}\nthis.cellOptions = summaryDocxTableCellOptions;\nthis.tableWidth = summaryDocxTableWidth;`, docxContext);
  const cellOptions = docxContext.cellOptions({
    tagName: 'TH',
    colSpan: 2,
    rowSpan: 3,
    style: {
      backgroundColor: 'rgb(255, 204, 0)',
      padding: '12px',
      paddingLeft: '16px',
      verticalAlign: 'middle',
      border: '2px dashed #123456'
    }
  }, 4500);
  assert.equal(cellOptions.shading.fill, 'FFCC00');
  assert.equal(cellOptions.width.size, 4500);
  assert.equal(cellOptions.columnSpan, 2);
  assert.equal(cellOptions.rowSpan, 3);
  assert.equal(cellOptions.verticalAlign, 'center');
  assert.equal(cellOptions.margins.left, 240);
  assert.equal(cellOptions.margins.right, 180);
  assert.equal(cellOptions.borders.top.style, 'dashed');
  assert.equal(docxContext.tableWidth({ style: { width: '50%' } }), 4500);
  assert.equal(docxContext.tableWidth({ style: { width: '900px' } }), 9000);
  const borderlessCell = docxContext.cellOptions({
    tagName: 'TD',
    colSpan: 1,
    rowSpan: 1,
    style: { border: 'none', borderTop: 'none' }
  }, 9000);
  assert.equal(borderlessCell.borders.top.style, 'none');
  assert.match(docxSource, /tableHeader: row\.parentElement\?\.tagName === 'THEAD' \|\| \[\.\.\.row\.children\]\.some\(cell => cell\.tagName === 'TH'\)/);
  assert.match(docxSource, /new MathFraction\(\{\s*numerator:/);
  assert.match(docxSource, /new MathSuperScript\(\{/);
  assert.match(docxSource, /new MathRadical\(\{/);

  const equationMathStart = docxSource.indexOf('function summaryEquationMathChildren(');
  const equationMathEnd = docxSource.indexOf('\nfunction ', equationMathStart + 1);
  const inlineStart = docxSource.indexOf('async function inlineChildren(');
  const inlineEnd = docxSource.indexOf('\nfunction paragraphOptions', inlineStart);
  assert.ok(equationMathStart >= 0 && equationMathEnd > equationMathStart && inlineStart >= 0 && inlineEnd > inlineStart);
  class MockMathRun {
    constructor(text) { this.text = text; }
  }
  class MockMath {
    constructor(options) { this.options = options; }
  }
  class MockMathComponent {
    constructor(options) { this.options = options; }
  }
  const inlineContext = {
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    MathRun: MockMathRun,
    DocxMath: MockMath,
    MathFraction: MockMathComponent,
    MathRadical: MockMathComponent,
    MathSuperScript: MockMathComponent,
    MathSubScript: MockMathComponent,
    MathSum: MockMathComponent
  };
  vm.createContext(inlineContext);
  vm.runInContext(`${docxSource.slice(equationMathStart, equationMathEnd)}\n${docxSource.slice(inlineStart, inlineEnd)}\nthis.inlineChildren = inlineChildren;`, inlineContext);
  const formulaModel = JSON.stringify({
    version: 1,
    nodes: [{
      type: 'fraction',
      numerator: [{ type: 'text', value: 'a' }],
      denominator: [{ type: 'text', value: 'b' }]
    }]
  });
  const mathElements = await inlineContext.inlineChildren({
    nodeType: 1,
    tagName: 'SPAN',
    classList: { contains: name => name === 'summary-study-equation' },
    dataset: { summaryEquation: formulaModel },
    textContent: 'a over b'
  });
  assert.equal(mathElements.length, 1);
  assert.equal(mathElements[0] instanceof MockMath, true);
  assert.equal(mathElements[0].options.children[0] instanceof MockMathComponent, true);

  const realMathContext = {
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
    DocxMath,
    MathFraction,
    MathRadical,
    MathRun,
    MathSubScript,
    MathSum,
    MathSuperScript
  };
  vm.createContext(realMathContext);
  vm.runInContext(`${docxSource.slice(equationMathStart, equationMathEnd)}\n${docxSource.slice(inlineStart, inlineEnd)}\nthis.inlineChildren = inlineChildren;`, realMathContext);
  const completeModel = JSON.stringify({
    version: 1,
    nodes: [
      { type: 'fraction', numerator: [{ type: 'text', value: 'a' }], denominator: [{ type: 'text', value: 'b' }] },
      { type: 'sup', base: [{ type: 'text', value: 'x' }], exponent: [{ type: 'text', value: '2' }] },
      { type: 'sub', base: [{ type: 'text', value: 'x' }], index: [{ type: 'text', value: 'i' }] },
      { type: 'sqrt', children: [{ type: 'text', value: 'x' }] },
      { type: 'root', degree: [{ type: 'text', value: '3' }], children: [{ type: 'text', value: 'x + 1' }] },
      { type: 'sum', base: [{ type: 'text', value: 'Σ' }], lower: [{ type: 'text', value: 'i = 1' }], upper: [{ type: 'text', value: 'n' }] }
    ]
  });
  const exportedMath = await realMathContext.inlineChildren({
    nodeType: 1,
    tagName: 'SPAN',
    classList: { contains: name => name === 'summary-study-equation' },
    dataset: { summaryEquation: completeModel },
    textContent: 'structured equation'
  });
  const docxBuffer = await Packer.toBuffer(new Document({
    sections: [{ children: [new Paragraph({ children: exportedMath })] }]
  }));
  assert.ok(docxBuffer.byteLength > 1000);
});

test('basic shapes validate supported types, colors, and bounded labels', () => {
  const constantsStart = editorSource.indexOf('const SUMMARY_SHAPE_TYPES');
  const constantsEnd = editorSource.indexOf('const SAFE_TABLE_BORDER', constantsStart);
  const normalizeStart = editorSource.indexOf('function normalizeSummaryShapeOptions(');
  const normalizeEnd = editorSource.indexOf('\nfunction drawSummaryShapeLabel', normalizeStart);
  assert.ok(constantsStart >= 0 && constantsEnd > constantsStart && normalizeStart >= 0 && normalizeEnd > normalizeStart);
  const shapeContext = {};
  vm.createContext(shapeContext);
  vm.runInContext(`${editorSource.slice(constantsStart, constantsEnd)}\n${editorSource.slice(normalizeStart, normalizeEnd)}\nthis.normalize = normalizeSummaryShapeOptions;`, shapeContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(shapeContext.normalize({
      type: 'rounded-rectangle',
      fill: '#ddf4ee',
      outline: '#168c71',
      label: 'Giai đoạn 1'
    }))),
    { type: 'rounded-rectangle', fill: '#DDF4EE', outline: '#168C71', label: 'Giai đoạn 1' }
  );
  assert.throws(() => shapeContext.normalize({ type: 'svg', fill: '#DDF4EE', outline: '#168C71', label: '' }), /không được hỗ trợ/);
  assert.throws(() => shapeContext.normalize({ type: 'rectangle', fill: 'red', outline: '#168C71', label: '' }), /Màu hình dạng/);
  assert.throws(() => shapeContext.normalize({
    type: 'rectangle',
    fill: '#DDF4EE',
    outline: '#168C71',
    label: 'x'.repeat(81)
  }), /tối đa 80 ký tự/);
});

test('basic shapes retain safe edit metadata and use the shared image export path', () => {
  assert.match(editorSource, /data-summary-shape-type/);
  assert.match(editorSource, /data-summary-shape-fill/);
  assert.match(editorSource, /data-summary-shape-outline/);
  assert.match(editorSource, /data-summary-shape-label/);
  assert.match(editorSource, /function drawSummaryShape\(\{ type, fill, outline, label \}\)/);
  assert.match(editorSource, /function openSummaryShapeDialog\(editor, shape = null, overrides = \{\}\)/);
  assert.match(editorSource, /'shape-insert': \(\) => openSummaryShapeDialog\(editor\)/);
  assert.match(editorSource, /'shape-edit': \(\) => editSelectedSummaryShape\(editor\)/);
  assert.match(editorSource, /'shape-config': \(\) => setSelectedSummaryShapeOption\(editor, options\.setting, options\.value, options\.shape\)/);
  assert.match(htmlSource, /data-editor-tool="shape-insert"/);
  assert.match(htmlSource, /data-summary-shape-type/);
  assert.match(htmlSource, /data-summary-shape-fill/);
  assert.match(htmlSource, /data-summary-shape-outline/);
  assert.match(editorSource, /'shape-layout': \(\) => setSelectedSummaryShapeLayout\(editor, options\.layout, options\.shape\)/);
  assert.match(editorSource, /'shape-alt-text': \(\) => editSelectedSummaryShapeAltText\(editor, options\.shape\)/);
  const ribbonStart = htmlSource.indexOf('<section class="summary-study-ribbon"');
  const ribbonEnd = htmlSource.indexOf('</section>', ribbonStart);
  const shapePanelPosition = htmlSource.indexOf('id="summary-study-panel-shape-format"');
  assert.ok(ribbonStart >= 0 && shapePanelPosition > ribbonStart && shapePanelPosition < ribbonEnd);
  assert.match(appSource, /onShapeContextChange: \(isInsideShape, context\) => summaryStudySetShapeContext\(isInsideShape, context\)/);
  assert.match(appSource, /summary-study-shape img\{display:block;width:100%;max-width:640px;height:auto;margin:0 auto\}/);
  assert.match(styleSource, /\.summary-study-richtext \.summary-study-shape img/);
  assert.match(fs.readFileSync('modules/summaryDocx.js', 'utf8'), /if \(tag === 'figure'\)[\s\S]*?inlineChildren\(node\)/);
});

test('shape dimensions and rotations are bounded and preserve rotation state', () => {
  const sizeStart = editorSource.indexOf('function normalizeSummaryShapeSize(');
  const sizeEnd = editorSource.indexOf('\nfunction setSelectedSummaryShapeSize', sizeStart);
  const transformStart = editorSource.indexOf('function summaryShapeTransformValue(');
  const transformEnd = editorSource.indexOf('\nfunction setSelectedSummaryShapeTransform', transformStart);
  assert.ok(sizeStart >= 0 && sizeEnd > sizeStart && transformStart >= 0 && transformEnd > transformStart);
  const shapeContext = {};
  vm.createContext(shapeContext);
  vm.runInContext(`${editorSource.slice(sizeStart, sizeEnd)}\n${editorSource.slice(transformStart, transformEnd)}\nthis.size = normalizeSummaryShapeSize; this.transform = summaryShapeTransformValue;`, shapeContext);
  assert.equal(shapeContext.size('width', '640'), 640);
  assert.equal(shapeContext.size('height', 2400), 2400);
  assert.throws(() => shapeContext.size('width', 15), /16 đến 2400/);
  assert.throws(() => shapeContext.size('height', 2401), /16 đến 2400/);
  assert.throws(() => shapeContext.size('width', 20.5), /số nguyên/);
  assert.equal(shapeContext.transform('', 'rotate-right'), 'rotate(90deg)');
  assert.equal(shapeContext.transform('rotate(270deg) scaleX(-1)', 'rotate-right'), 'scaleX(-1)');
  assert.equal(shapeContext.transform('rotate(90deg) scaleY(-1)', 'rotate-left'), 'scaleY(-1)');
  assert.equal(shapeContext.transform('rotate(180deg)', 'reset'), '');
  assert.throws(() => shapeContext.transform('', 'flip'), /không hợp lệ/);
});

test('shape ribbon exposes direct size and rotation controls and DOCX honors shape dimensions', () => {
  assert.match(htmlSource, /data-summary-shape-size="width"/);
  assert.match(htmlSource, /data-summary-shape-size="height"/);
  assert.match(htmlSource, /data-summary-shape-transform="rotate-left"/);
  assert.match(htmlSource, /data-summary-shape-transform="rotate-right"/);
  assert.match(htmlSource, /data-summary-shape-transform="reset"/);
  assert.match(appSource, /data-summary-shape-size/);
  assert.match(editorSource, /'shape-size': \(\) => setSelectedSummaryShapeSize\(editor, options\.dimension, options\.value, options\.shape\)/);
  assert.match(editorSource, /'shape-rotate': \(\) => setSelectedSummaryShapeTransform\(editor, options\.operation, options\.shape\)/);
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  assert.match(docxSource, /function summaryShapeDimensions\(element, image\)/);
  assert.match(docxSource, /const dimensions = summaryShapeDimensions\(element, image\)/);
  assert.match(docxSource, /const displayWidth = rotated \? dimensions\.height : dimensions\.width/);
  const dimensionsStart = docxSource.indexOf('function summaryShapeDimensions(');
  const dimensionsEnd = docxSource.indexOf('\nfunction imageOutline', dimensionsStart);
  assert.ok(dimensionsStart >= 0 && dimensionsEnd > dimensionsStart);
  const dimensionContext = {};
  vm.createContext(dimensionContext);
  vm.runInContext(`${docxSource.slice(dimensionsStart, dimensionsEnd)}\nthis.dimensions = summaryShapeDimensions;`, dimensionContext);
  const shapeElement = { closest: () => true, style: { width: '480px', height: '280px' } };
  assert.deepEqual(
    JSON.parse(JSON.stringify(dimensionContext.dimensions(shapeElement, { width: 900, height: 520 }))),
    { width: 480, height: 280 }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(dimensionContext.dimensions({ closest: () => true, style: { width: '450px' } }, { width: 900, height: 520 }))),
    { width: 450, height: 260 }
  );
  assert.match(appSource, /richTextEditor\.js\?v=20260928-summary-study-ribbon-v35/);
  assert.match(appSource, /summaryDocx\.js\?v=20260928-insert-layout-v18/);
  assert.match(htmlSource, /style\.css\?v=20260928-summary-study-ribbon-v25/);
  assert.match(htmlSource, /app\.js\?v=20260928-summary-study-ribbon-v38/);
});

test('shape alignment is validated, selectable in the ribbon, and mapped to DOCX paragraphs', () => {
  assert.match(editorSource, /const SUMMARY_SHAPE_ALIGNMENTS = new Set\(\['left', 'center', 'right'\]\)/);
  assert.match(editorSource, /data-summary-shape-align/);
  assert.match(editorSource, /'shape-align': \(\) => setSelectedSummaryShapeAlignment\(editor, options\.alignment, options\.shape\)/);
  assert.match(editorSource, /function setSelectedSummaryShapeAlignment\(editor, alignment, selectedShape = null\)/);
  for (const align of ['left', 'center', 'right']) {
    assert.match(htmlSource, new RegExp(`data-summary-shape-align="${align}"`));
  }
  assert.match(appSource, /button\.setAttribute\('aria-pressed', String\(button\.dataset\.summaryShapeAlign === alignment\)\)/);
  assert.match(appSource, /summaryStudyRunShapeTool\('shape-align', \{\s*alignment: button\.dataset\.summaryShapeAlign/s);
  assert.match(styleSource, /\.summary-study-shape\[data-summary-shape-align="left"\] img/);
  assert.match(styleSource, /\.summary-study-shape\[data-summary-shape-align="right"\] img/);
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  assert.match(docxSource, /function summaryShapeAlignment\(element\)/);
  assert.match(docxSource, /child\.classList\.contains\('summary-study-shape'\)\s*\?\s*summaryShapeAlignment\(child\)/);
  const alignStart = docxSource.indexOf('function summaryShapeAlignment(');
  const alignEnd = docxSource.indexOf('\nfunction imageOutline', alignStart);
  assert.ok(alignStart >= 0 && alignEnd > alignStart);
  const alignContext = { AlignmentType: { LEFT: 'left', CENTER: 'center', RIGHT: 'right' } };
  vm.createContext(alignContext);
  vm.runInContext(`const AlignmentType = { LEFT: 'left', CENTER: 'center', RIGHT: 'right' };\n${docxSource.slice(alignStart, alignEnd)}\nthis.alignment = summaryShapeAlignment;`, alignContext);
  assert.equal(alignContext.alignment({ dataset: { summaryShapeAlign: 'left' } }), 'left');
  assert.equal(alignContext.alignment({ dataset: { summaryShapeAlign: 'right' } }), 'right');
  assert.equal(alignContext.alignment({ dataset: { summaryShapeAlign: 'invalid' } }), 'center');
});

test('shape placement and alternative text controls preserve accessible layout state', () => {
  assert.match(editorSource, /function setSelectedSummaryShapeLayout\(editor, layout, selectedShape = null\)/);
  assert.match(editorSource, /function editSelectedSummaryShapeAltText\(editor, selectedShape = null\)/);
  assert.match(editorSource, /Mô tả hình dạng tối đa 500 ký tự/);
  assert.match(editorSource, /context\.alt[\s\S]*?context\.layout/);
  assert.match(appSource, /data-summary-shape-layout/);
  assert.match(htmlSource, /value="inline">Cùng dòng/);
  assert.match(htmlSource, /value="float-left">Bên trái, chữ bao quanh/);
  assert.match(htmlSource, /value="float-right">Bên phải, chữ bao quanh/);
  assert.match(htmlSource, /data-editor-tool="shape-alt-text"/);
  assert.match(appSource, /summaryStudyRunShapeTool\('shape-layout'/);
  assert.match(appSource, /summary-study-shape\.summary-study-image-layout--float-left img/);
  assert.match(styleSource, /\.summary-study-shape\.summary-study-image-layout--float-left img/);
  assert.match(styleSource, /\.summary-study-shape\.summary-study-image-layout--float-right img/);
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  const alignStart = docxSource.indexOf('function summaryShapeAlignment(');
  const alignEnd = docxSource.indexOf('\nfunction imageOutline', alignStart);
  const alignContext = { AlignmentType: { LEFT: 'left', CENTER: 'center', RIGHT: 'right' } };
  vm.createContext(alignContext);
  vm.runInContext(`const AlignmentType = { LEFT: 'left', CENTER: 'center', RIGHT: 'right' };\n${docxSource.slice(alignStart, alignEnd)}\nthis.alignment = summaryShapeAlignment;`, alignContext);
  const classList = { contains: name => name === 'summary-study-image-layout--float-right' };
  assert.equal(alignContext.alignment({ dataset: { summaryShapeAlign: 'center' }, classList }), 'center');
  assert.equal(alignContext.alignment({ dataset: {}, classList }), 'right');
  assert.equal(alignContext.alignment({ dataset: {}, classList: { contains: name => name === 'summary-study-image-layout--float-left' } }), 'left');
});

test('rich-text sanitizer preserves semantic page headers and footers', () => {
  const allowedTags = editorSource.slice(
    editorSource.indexOf('const ALLOWED_TAGS = new Set(['),
    editorSource.indexOf(']);', editorSource.indexOf('const ALLOWED_TAGS = new Set(['))
  );
  assert.match(allowedTags, /'FOOTER'/);
  assert.match(allowedTags, /'HEADER'/);
});

test('editor configuration exposes working formatting, tables, links, and processed image uploads', () => {
  assert.match(editorSource, /plugins:\s*'lists link image table searchreplace code wordcount quickbars'/);
  assert.match(editorSource, /width:210mm;min-height:270mm;padding:21mm 20mm/);
  assert.match(editorSource, /toolbar:\s*\[[\s\S]*?undo redo searchreplace summarynavigation[\s\S]*?summarycoverpage summaryblankpage summarypagebreak[\s\S]*?summarypagesetup summarypagebreak[\s\S]*?summarytoc summaryfigurelist summarytablelist[\s\S]*?removeformat code/);
  assert.match(editorSource, /quickbars_selection_toolbar:\s*'bold italic underline \| forecolor backcolor \| blocks summarycommentbutton summaryreadaloudbutton'/);
  assert.match(editorSource, /contextmenu:\s*'summarycomment summaryreadaloud link table'/);
  assert.match(editorSource, /block_formats:.*Tiêu đề 6=h6/);
  assert.match(editorSource, /color_cols:\s*10/);
  assert.match(editorSource, /custom_colors:\s*true/);
  assert.match(editorSource, /color_map:\s*\[/);
  assert.match(editorSource, /function createSummaryNavigationPane\(editor\)/);
  assert.match(editorSource, /function openSummaryPageSetup\(editor\)/);
  assert.match(editorSource, /data-summary-page-orientation/);
  assert.match(editorSource, /data-summary-page-gutter/);
  assert.match(editorSource, /Lề đóng gáy \(mm, 0–50\)/);
  assert.match(editorSource, /function registerSummaryTableTools\(editor\)/);
  assert.match(editorSource, /function insertSummaryTable\(editor, rows/);
  assert.match(editorSource, /function convertSelectedTextToTable\(editor\)/);
  assert.match(editorSource, /function insertSummaryCitation\(editor\)/);
  assert.match(editorSource, /function refreshSummaryBibliography\(root\)/);
  assert.match(editorSource, /function insertSummaryIndexEntry\(editor, kind\)/);
  assert.match(editorSource, /function refreshSummaryIndex\(root, kind\)/);
  assert.match(editorSource, /function editSummaryPageFurniture\(editor, kind\)/);
  assert.match(editorSource, /function insertSummaryBookmark\(editor\)/);
  assert.match(editorSource, /function insertSummaryTextBox\(editor\)/);
  assert.match(editorSource, /function insertSummaryBlankPage\(editor\)/);
  assert.match(editorSource, /APA 7/);
  assert.match(editorSource, /Chicago Author-Date/);
  assert.match(editorSource, /function render\(\) \{\s*const body = editor\.getBody\(\);\s*if \(!body\) return;/);
  assert.match(editorSource, /navigationPane = createSummaryNavigationPane\(editor\);/);
  assert.match(editorSource, /editor\.setContent\(sanitizeRichTextHtml\(initialHtml\)\);\s*let lastContent = editor\.getContent\(\);\s*let lastTableContext = false;\s*let lastTableOptions = \[\];/);
  assert.match(editorSource, /editor\.on\('input change undo redo ExecCommand', \(\) => \{\s*const currentContent = editor\.getContent\(\);\s*if \(currentContent !== lastContent\)/);
  assert.match(editorSource, /data-navigation-tab="headings"/);
  assert.match(editorSource, /data-navigation-tab="pages"/);
  assert.match(editorSource, /data-navigation-tab="results"/);
  assert.match(editorSource, /SUMMARY_STYLE_STORAGE_KEY/);
  assert.match(editorSource, /function registerSummaryNamedStyles\(editor\)/);
  assert.match(editorSource, /function manageSummaryNamedStyles\(editor\)/);
  assert.match(editorSource, /paragraphSelection\(editor\)\.forEach\(target =>/);
  assert.match(editorSource, /Lưu định dạng đoạn hiện tại/);
  assert.match(editorSource, /function registerSummaryTextEffects\(editor\)/);
  assert.match(editorSource, /summary-study-text-effect--reflection/);
  assert.match(editorSource, /function openSummaryCommentDialog\(editor\)/);
  assert.match(editorSource, /function registerSummaryContextActions\(editor\)/);
  assert.match(editorSource, /speechSynthesis\.speak\(utterance\)/);
  assert.match(editorSource, /summary-study-editor-workspace/);
  assert.doesNotMatch(editorSource, /summarystyles|registerSummaryStyleMenu/);
  assert.match(editorSource, /addButton\('summaryparagraphformat'/);
  assert.match(editorSource, /addButton\('summarynavigation'/);
  assert.match(editorSource, /Giãn dòng \(ví dụ 1\.5\)/);
  assert.match(editorSource, /Giữ đoạn này cùng đoạn tiếp theo/);
  assert.match(editorSource, /Bắt đầu đoạn ở trang mới/);
  assert.match(editorSource, /data-summary-tabs/);
  assert.match(editorSource, /\['style', \.\.\.PARAGRAPH_DATA_ATTRIBUTES\]/);
  assert.match(editorSource, /addButton\('summarytoc'/);
  assert.match(editorSource, /addButton\('summaryfigurecaption'/);
  assert.match(editorSource, /addButton\('summarypagebreak'/);
  assert.match(editorSource, /addButton\('summaryfootnote'/);
  assert.match(editorSource, /addButton\('summaryendnote'/);
  assert.match(editorSource, /addButton\('summarycrossreference'/);
  assert.match(editorSource, /addButton\('summaryfigurelist'/);
  assert.match(editorSource, /addButton\('summarytablelist'/);
  assert.match(editorSource, /addMenuButton\('summaryimagelayout'/);
  assert.match(editorSource, /function setSelectedImageLayout\(editor, layout\)/);
  assert.match(editorSource, /registerImageLayoutMenu\(editor\)/);
  assert.match(editorSource, /Chữ ôm bên trái/);
  assert.match(editorSource, /Chữ ôm bên phải/);
  assert.match(editorSource, /summary-study-image-layout--float-left/);
  assert.match(editorSource, /summary-study-image-layout--float-right/);
  assert.match(editorSource, /function updateSummaryObjectList\(editor, kind\)/);
  assert.match(editorSource, /function makeSummaryObjectList\(editor, kind\)/);
  assert.match(editorSource, /summary-study-figure-list/);
  assert.match(editorSource, /summary-study-table-list/);
  assert.match(editorSource, /function getSummaryReferenceTargets\(root\)/);
  assert.match(editorSource, /function normalizeSummaryReferences\(root\)/);
  assert.match(editorSource, /function insertSummaryCrossReference\(editor\)/);
  assert.match(editorSource, /data-summary-reference="\$\{target\.type\}"/);
  assert.match(editorSource, /normalizeSummaryReferences\(editor\.getBody\(\)\)/);
  assert.match(editorSource, /summary-study-table-\$\{index \+ 1\}/);
  assert.match(editorSource, /function normalizeSummaryNotes\(root\)/);
  assert.match(editorSource, /function insertSummaryNote\(editor, kind, noteText\)/);
  assert.match(editorSource, /summary-study-\(\?:footnote\|footnote-ref\|endnote\|endnote-ref\|figure\|table\)/);
  assert.match(editorSource, /summary-study-\$\{kind\}-ref-\$\{number\}/);
  assert.match(editorSource, /summary-study-endnotes/);
  assert.match(editorSource, /normalizeSummaryNotes\(editor\.getBody\(\)\)/);
  assert.match(editorSource, /images_upload_handler:\s*blobInfo\s*=>\s*imageBlobToDataUrl/);
  assert.match(editorSource, /canvas\.toBlob\(resolve,\s*'image\/webp',\s*0\.78\)/);
  assert.match(editorSource, /ALLOWED_TAGS/);
  assert.match(editorSource, /DROP_CONTENT_TAGS/);
  assert.match(editorSource, /line-height:\$\{lineHeight\}/);
  assert.match(editorSource, /PARAGRAPH_DATA_ATTRIBUTES/);
  assert.match(editorSource, /data-summary-page-break/);
  assert.match(editorSource, /prepareRichTextDocument/);
  assert.match(editorSource, /element\.getAttribute\('href'\)\.startsWith\('#'\)/);
});

test('summary editor saves sanitized document HTML separately and supports recoverable editing controls', () => {
  assert.match(htmlSource, /style\.css\?v=20260928-summary-study-ribbon-v25/);
  assert.match(htmlSource, /app\.js\?v=20260928-summary-study-ribbon-v38/);
  assert.match(editorSource, /body\.style\.fontSize = '17px';\s*body\.style\.lineHeight = '1\.8';/);
  assert.match(appSource, /richTextEditor\.js\?v=20260928-summary-study-ribbon-v35/);
  assert.match(appSource, /prepareRichTextDocument\(editor\)/);
  assert.match(appSource, /localStorage\.setItem\(summaryStudyDocumentStorageKey\(title\)/);
  assert.match(appSource, /summaryStudyLegacyStorageKey\(title\)/);
  assert.match(appSource, /saveSummaryStudyEditorContent\(editor,\s*\{\s*close:\s*false\s*\}\)/);
  assert.match(appSource, /Không thể mở trình soạn thảo\. Bản tóm tắt hiện tại vẫn được giữ nguyên\./);
  assert.match(appSource, /data-summary-editor-action="cancel"/);
  assert.match(appSource, /undoManager\.undo\(\)/);
  assert.match(appSource, /restoreSummaryStudySnapshot/);
  assert.match(htmlSource, /data-summary-editor-action="save"/);
  assert.match(appSource, /<span>Hoàn tất chỉnh sửa<\/span>/);
  assert.match(htmlSource, /data-summary-action="redo"/);
});

test('summary editor exposes concise and accurate save states', () => {
  const start = appSource.indexOf('function summaryStudySetEditorStatus(');
  const end = appSource.indexOf('\nfunction summaryStudyUpdateWordCount(', start);
  assert.ok(start >= 0 && end > start);
  const elements = new Map([
    ['summary-study-editor-status', { textContent: '', dataset: {} }],
    ['summary-study-save-status', { textContent: '', title: '', innerHTML: '' }],
    ['summary-study-statusbar-save', { textContent: '', title: '' }]
  ]);
  const shell = { setAttribute(name, value) { this[name] = value; } };
  const statusContext = {
    document: {
      getElementById: id => elements.get(id),
      querySelector: () => shell
    }
  };
  vm.createContext(statusContext);
  vm.runInContext(`${appSource.slice(start, end)}\nthis.setStatus = summaryStudySetEditorStatus;`, statusContext);

  statusContext.setStatus('Có thay đổi chưa lưu', 'dirty');
  assert.equal(elements.get('summary-study-save-status').textContent, '● Đang soạn thảo...');
  assert.equal(elements.get('summary-study-statusbar-save').textContent, '● Đang soạn thảo');
  statusContext.setStatus('Đang lưu...', 'saving');
  assert.match(elements.get('summary-study-save-status').innerHTML, /fa-spinner/);
  assert.equal(elements.get('summary-study-statusbar-save').textContent, 'Đang lưu...');
  statusContext.setStatus('Đã lưu trên thiết bị lúc 14:39', 'saved');
  assert.equal(elements.get('summary-study-save-status').textContent, '✓ Đã lưu');
  assert.equal(elements.get('summary-study-save-status').title, 'Đã lưu trên thiết bị lúc 14:39');
  assert.equal(elements.get('summary-study-statusbar-save').textContent, '✓ 14:39');
});

test('Lumi is an opt-in overlay with a static avatar and multiple accessible toggles', () => {
  assert.match(appSource, /const SUMMARY_STUDY_LUMI_PANEL_KEY = 'lumi_panel_open'/);
  assert.match(appSource, /localStorage\.getItem\(SUMMARY_STUDY_LUMI_PANEL_KEY\) === 'true'/);
  assert.match(appSource, /localStorage\.setItem\(SUMMARY_STUDY_LUMI_PANEL_KEY, String\(isOpen\)\)/);
  assert.match(htmlSource, /id="lumi-fab"[^>]+data-summary-action="toggle-ai"[^>]+aria-expanded="false"/);
  assert.match(htmlSource, /class="summary-study-ai"[^>]+aria-hidden="true"/);
  assert.match(htmlSource, /class="summary-study-ai-close"[^>]+data-summary-action="toggle-ai"/);
  assert.match(htmlSource, /Lumi đang đồng hành cùng bạn/);
  assert.doesNotMatch(htmlSource, /summary-study-mascot-stage|summary-study-mascot-layer/);
  assert.match(styleSource, /\.summary-study-shell\.is-ai-visible \.summary-study-ai\s*\{[^}]*position:\s*fixed/s);
  assert.match(styleSource, /width:\s*min\(340px,\s*100vw\)/);
  assert.match(styleSource, /\.lumi-fab\s*\{[^}]*width:\s*52px/s);
});

test('empty saved-term panel defaults closed and keeps a persisted toggle', () => {
  assert.match(appSource, /const SUMMARY_STUDY_OUTLINE_PANEL_KEY = 'left_panel_open'/);
  assert.match(appSource, /return getSummaryStudySavedTerms\(\)\.length > 0/);
  assert.match(appSource, /localStorage\.setItem\(SUMMARY_STUDY_OUTLINE_PANEL_KEY, String\(isOpen\)\)/);
  assert.match(appSource, /if \(terms\.length === 0 \|\| existing < 0\) setSummaryStudyOutlinePanelOpen\(terms\.length > 0\)/);
  assert.match(htmlSource, /id="summary-study-outline-panel" class="summary-study-outline"/);
  assert.match(htmlSource, /data-summary-action="outline"[^>]+aria-expanded="false"/);
  assert.match(styleSource, /\.summary-study-shell\.is-outline-hidden \.summary-study-outline\s*\{\s*display:\s*none !important/);
  assert.match(styleSource, /\.summary-study-shell\.is-outline-hidden \.summary-study-workspace\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('selection toolbar is accessible and reuses document actions and speech synthesis', () => {
  assert.match(htmlSource, /id="selection-toolbar"[^>]+role="toolbar"/);
  for (const action of ['bold', 'italic', 'underline', 'highlight', 'read-aloud', 'note', 'ask-lumi']) {
    assert.match(htmlSource, new RegExp(`data-selection-action="${action}"`));
  }
  assert.match(appSource, /document\.addEventListener\('selectionchange', updateSummaryStudySelectionToolbar\)/);
  assert.match(appSource, /_summaryStudyRichTextEditor\.on\('SelectionChange', updateSummaryStudySelectionToolbar\)/);
  assert.match(appSource, /const hasOpenDialog = \[\.\.\.document\.querySelectorAll\([\s\S]*?style\.display !== 'none'[\s\S]*?rect\.width > 0 && rect\.height > 0/);
  assert.match(appSource, /document\.querySelector\(`\[data-summary-action="\$\{action\}"\]`\)\?\.click\(\)/);
  assert.match(appSource, /_summaryStudyPendingQuote = picked\.quote\.slice\(0, 500\)/);
  assert.match(appSource, /setSummaryStudyLumiPanelOpen\(true\)/);
  assert.match(styleSource, /\.summary-study-selection-toolbar\s*\{[^}]*position:\s*fixed/s);
  assert.match(editorSource, /export function readSummaryText\(text\)/);
  assert.match(editorSource, /utterance\.lang = 'vi-VN'/);
});

test('shared speech helper reads selected text in Vietnamese and reports unsupported input', () => {
  const start = editorSource.indexOf('export function readSummaryText(text)');
  const end = editorSource.indexOf('\nfunction readSummarySelectedText(', start);
  assert.ok(start >= 0 && end > start);
  const spoken = [];
  let cancelled = 0;
  const speechContext = {
    window: { speechSynthesis: { cancel() { cancelled += 1; }, speak(utterance) { spoken.push(utterance); } } },
    SpeechSynthesisUtterance: function SpeechSynthesisUtterance(text) { this.text = text; }
  };
  vm.createContext(speechContext);
  vm.runInContext(`${editorSource.slice(start, end).replace('export ', '')}\nthis.readText = readSummaryText;`, speechContext);
  assert.equal(speechContext.readText('  '), false);
  assert.equal(speechContext.readText('Đoạn được chọn'), true);
  assert.equal(cancelled, 1);
  assert.equal(spoken[0].text, 'Đoạn được chọn');
  assert.equal(spoken[0].lang, 'vi-VN');
});

test('summary study groups common and specialist editor tools into Word-style ribbon tabs', () => {
  for (const tab of ['home', 'insert', 'layout', 'references', 'review', 'view']) {
    assert.match(htmlSource, new RegExp(`data-summary-ribbon-tab="${tab}"`));
    assert.match(htmlSource, new RegExp(`data-summary-ribbon-panel="${tab}"`));
  }
  assert.match(htmlSource, /id="summary-study-doc-title"/);
  assert.match(htmlSource, /id="summary-study-statusbar-save"/);
  assert.match(htmlSource, /data-summary-action="advanced-tools"/);
  assert.match(htmlSource, /data-editor-command-select="FontName"/);
  assert.match(htmlSource, /data-editor-command-select="FontSize"/);
  assert.match(htmlSource, /data-editor-command-select="ForeColor"/);
  assert.match(htmlSource, /data-editor-command-select="HiliteColor"/);
  assert.match(htmlSource, /data-editor-insert="image"/);
  assert.match(htmlSource, /data-editor-command="JustifyFull"/);
  assert.match(htmlSource, /data-editor-tool="page-setup"/);
  assert.match(htmlSource, /data-editor-tool="paragraph-format"/);
  assert.match(htmlSource, /data-editor-tool="named-styles"/);
  assert.match(htmlSource, /data-editor-tool="save-named-style"/);
  assert.match(htmlSource, /data-editor-tool="manage-named-styles"/);
  assert.match(htmlSource, /data-editor-tool="text-effects"/);
  assert.match(htmlSource, /data-editor-tool="table-template"/);
  assert.match(htmlSource, /data-editor-tool="text-to-table"/);
  assert.match(htmlSource, /data-editor-tool="image-layout"/);
  assert.match(htmlSource, /data-editor-tool="citation"/);
  assert.match(htmlSource, /data-editor-tool="bibliography"/);
  assert.match(htmlSource, /data-editor-tool="index-mark"/);
  assert.match(htmlSource, /data-editor-tool="authorities"/);
  assert.match(htmlSource, /data-editor-tool="read-aloud"/);
  assert.match(htmlSource, /aria-controls="summary-study-panel-home"/);
  assert.match(htmlSource, /aria-labelledby="summary-study-tab-references"/);
  assert.match(htmlSource, /data-summary-table-menu-toggle/);
  assert.match(htmlSource, /data-summary-table-option="header-row"/);
  assert.match(htmlSource, /data-summary-table-option="banded-rows"/);
  assert.match(htmlSource, /data-summary-table-style="teal"/);
  assert.match(htmlSource, /data-summary-table-command="merge-cells"/);
  assert.match(htmlSource, /data-summary-table-command="column-after"/);
  assert.match(htmlSource, /data-summary-table-command="repeat-header"/);
  assert.match(htmlSource, /data-summary-table-command="sort-ascending"/);
  assert.match(htmlSource, /data-summary-table-command="sort-descending"/);
  assert.match(htmlSource, /data-summary-table-command="distribute-rows"/);
  assert.match(htmlSource, /data-summary-table-command="distribute-columns"/);
  assert.match(htmlSource, /data-summary-table-command="convert-to-text"/);
  assert.match(htmlSource, /data-summary-table-size="row-height"/);
  assert.match(htmlSource, /data-summary-table-size="column-width"/);
  assert.match(htmlSource, /data-summary-table-autofit/);
  assert.match(htmlSource, /data-summary-ribbon-tab="table-design" hidden/);
  assert.match(htmlSource, /data-summary-ribbon-tab="table-layout" hidden/);
  assert.match(htmlSource, /data-summary-ribbon-tab="picture-format" hidden/);
  assert.match(htmlSource, /data-summary-image-action="replace-image"/);
  assert.match(htmlSource, /data-summary-image-action="image-alt-text"/);
  assert.match(htmlSource, /data-summary-image-layout-select/);
  assert.match(htmlSource, /data-summary-image-size="width"/);
  assert.match(htmlSource, /data-summary-image-size="height"/);
  assert.match(htmlSource, /data-summary-image-action="rotate-left"/);
  assert.match(htmlSource, /data-summary-image-action="rotate-right"/);
  assert.match(htmlSource, /data-summary-image-action="crop-image"/);
  assert.match(htmlSource, /data-summary-image-action="flip-horizontal"/);
  assert.match(htmlSource, /data-summary-image-action="flip-vertical"/);
  assert.match(htmlSource, /data-summary-image-border/);
  assert.match(htmlSource, /data-editor-tool="chart-insert"/);
  assert.match(htmlSource, /data-summary-ribbon-tab="chart-design" hidden/);
  assert.match(htmlSource, /data-summary-chart-type/);
  assert.match(htmlSource, /data-summary-chart-palette/);
  const ribbonStart = htmlSource.indexOf('<section class="summary-study-ribbon"');
  const ribbonEnd = htmlSource.indexOf('</section>', ribbonStart);
  const chartPanelPosition = htmlSource.indexOf('id="summary-study-panel-chart-design"');
  assert.ok(ribbonStart >= 0 && chartPanelPosition > ribbonStart && chartPanelPosition < ribbonEnd);
  assert.match(htmlSource, /role="grid" aria-label="Chọn kích thước bảng, tối đa 10 cột và 8 hàng"/);
  assert.match(appSource, /for \(let row = 1; row <= 8; row \+= 1\)/);
  assert.match(appSource, /for \(let column = 1; column <= 10; column \+= 1\)/);
  assert.match(appSource, /data\.tableRows|dataset\.tableRows/);
  assert.match(appSource, /onTableContextChange: \(isInsideTable, context\)/);
  assert.match(appSource, /onImageContextChange: \(isInsideImage, context\)/);
  assert.match(appSource, /function summaryStudySetImageContext\(isInsideImage, context = \{\}\)/);
  assert.match(appSource, /function summaryStudySetChartContext\(isInsideChart, context = \{\}\)/);
  assert.match(appSource, /summary-study-figure,.summary-study-chart,.summary-study-diagram\{margin:18px auto;text-align:center;break-inside:avoid;page-break-inside:avoid\}/);
  assert.match(appSource, /onChartContextChange: \(isInsideChart, context\) => summaryStudySetChartContext\(isInsideChart, context\)/);
  assert.match(editorSource, /export function runSummaryEditorTableCommand\(editor, command, value\)/);
  assert.match(editorSource, /mceTableMergeCells/);
  assert.match(editorSource, /mceTableSplitCells/);
  assert.match(editorSource, /command === 'repeat-header'/);
  assert.match(editorSource, /command === 'distribute-rows'/);
  assert.match(editorSource, /command === 'distribute-columns'/);
  assert.match(editorSource, /command === 'sort-ascending' \|\| command === 'sort-descending'/);
  assert.match(editorSource, /command === 'convert-to-text'/);
  assert.match(editorSource, /selectedTableRows\(editor, table, row\)/);
  assert.match(editorSource, /selectedTableColumnIndexes\(editor, table, cell\)/);
  assert.match(editorSource, /data-summary-table-options/);
  assert.match(editorSource, /'table-layout'\]\)/);
  assert.match(fs.readFileSync('modules/summaryDocx.js', 'utf8'), /tableHeader: row\.parentElement\?\.tagName === 'THEAD'/);
  assert.match(editorSource, /function refreshSummaryTableDesign\(table, options\)/);
  assert.match(editorSource, /addStyle\([\s\S]*?summary-study-table-banded-rows tbody tr:nth-child\(even\)/);
  assert.match(styleSource, /\.summary-study-richtext \.summary-study-table-banded-rows tbody tr:nth-child\(even\)/);
  assert.match(editorSource, /'insert-table': \(\) => \{/);
  assert.match(editorSource, /'table-dialog': \(\) => openSummaryTableDialog\(editor\)/);
  assert.match(editorSource, /onTableContextChange\?\.\(insideTable, \{\s*options,\s*rowHeightCm:/);
  assert.match(editorSource, /onImageContextChange\?\.\(true, context\)/);
  assert.match(editorSource, /function editSelectedSummaryImageAlt\(editor\)/);
  assert.match(editorSource, /function replaceSelectedSummaryImage\(editor\)/);
  assert.match(editorSource, /function setSelectedSummaryImageSize\(editor, dimension, value\)/);
  assert.match(editorSource, /function setSelectedSummaryImageTransform\(editor, operation\)/);
  assert.match(editorSource, /function setSelectedSummaryImageBorder\(editor, value\)/);
  assert.match(editorSource, /function imageCropBounds\(width, height, crop\)/);
  assert.match(editorSource, /function openSummaryImageCropDialog\(editor\)/);
  assert.match(editorSource, /function cropSelectedSummaryImage\(editor, image, crop, api\)/);
  assert.match(editorSource, /function parseSummaryChartData\(value\)/);
  assert.match(editorSource, /function drawSummaryChart\(data, type, palette\)/);
  assert.match(editorSource, /function openSummaryChartDialog\(editor, chart = null, overrides = \{\}\)/);
  assert.match(editorSource, /data-summary-chart-data/);
  assert.match(editorSource, /SAFE_IMAGE_TRANSFORM/);
  assert.match(editorSource, /'image-alt-text': \(\) => editSelectedSummaryImageAlt\(editor\)/);
  assert.match(editorSource, /'replace-image': \(\) => replaceSelectedSummaryImage\(editor\)/);
  assert.match(editorSource, /'rotate-right': \(\) => setSelectedSummaryImageTransform\(editor, 'rotate-right'\)/);
  assert.match(editorSource, /'image-border': \(\) => setSelectedSummaryImageBorder\(editor, options\.value\)/);
  assert.match(editorSource, /'crop-image': \(\) => openSummaryImageCropDialog\(editor\)/);
  assert.match(editorSource, /'chart-insert': \(\) => openSummaryChartDialog\(editor\)/);
  assert.match(editorSource, /'chart-edit': \(\) => editSelectedSummaryChart\(editor\)/);
  assert.match(editorSource, /'chart-config': \(\) => setSelectedSummaryChartOption\(editor, options\.setting, options\.value\)/);

  assert.match(editorSource, /'set-image-layout': \(\) => setSelectedImageLayout\(editor, options\.layout\)/);
  assert.match(htmlSource, /summary-study-ribbon-group-caption/);
  assert.match(editorSource, /fontsize_formats: '10pt 11pt 12pt 14pt 16pt 18pt 20pt 24pt 28pt 36pt'/);
  assert.match(editorSource, /export function runSummaryEditorTool\(editor, tool, options = \{\}\)/);
  assert.match(editorSource, /'named-styles': \(\) => openSummaryNamedStyleDialog\(editor\)/);
  assert.match(editorSource, /'save-named-style': \(\) => saveSummaryNamedStyle\(editor\)/);
  assert.match(editorSource, /'manage-named-styles': \(\) => manageSummaryNamedStyles\(editor\)/);
  assert.match(editorSource, /'text-effects': \(\) => openSummaryTextEffectsDialog\(editor\)/);
  assert.match(editorSource, /'table-template': \(\) => openSummaryTableTemplateDialog\(editor\)/);
  assert.match(editorSource, /'text-to-table': \(\) => convertSelectedTextToTable\(editor\)/);
  assert.match(editorSource, /'image-layout': \(\) => openSummaryImageLayoutDialog\(editor\)/);
  assert.match(editorSource, /'read-aloud': \(\) => readSummarySelectedText\(editor\)/);
  assert.match(editorSource, /'index-mark': \(\) => insertSummaryIndexEntry\(editor, 'index'\)/);
  assert.match(editorSource, /'authority-mark': \(\) => insertSummaryIndexEntry\(editor, 'authority'\)/);
  assert.match(appSource, /runSummaryEditorTool\(editor, tool, options\)/);
  assert.match(appSource, /if \(!_summaryStudyEditing \|\| _summaryStudyRichTextEditor !== editor\) return;\s*saveSummaryStudyEditorContent\(editor, \{ close: false \}\);/);
  assert.match(appSource, /document\.querySelectorAll\('\[data-editor-tool\]'\)/);
  assert.match(appSource, /const previousContent = editor\.getContent\(\);\s*runSummaryEditorTool\(editor, tool, options\);\s*if \(editor\.getContent\(\) !== previousContent\)/);
  assert.match(appSource, /control\.addEventListener\('change', event => \{\s*const target = event\.currentTarget;\s*if \(target\.value\) summaryStudyRunEditorCommand\(target\.dataset\.editorCommandSelect, target\.value\);/);
  assert.match(appSource, /editor\.execCommand\('mceImage'\)/);
  assert.match(appSource, /function summaryStudyRunEditorCommand\(command, value\)/);
  assert.match(appSource, /moveToBookmark\(_summaryStudyRibbonBookmark\)/);
  assert.match(appSource, /event\.key === 'ArrowRight'/);
  assert.match(appSource, /event\.key === 'ArrowRight' \? 1 : -1/);
  assert.match(appSource, /item\.tabIndex = active \? 0 : -1/);
  assert.match(appSource, /summaryStudySetEditorStatus\(readOnly \? 'Chế độ chỉ đọc' : 'Bản lưu trên thiết bị'/);
});

test('DOCX import replaces content only after confirmation and sanitizes Mammoth HTML', () => {
  assert.match(htmlSource, /id="summary-study-docx-file" type="file" accept="\.docx/);
  assert.match(htmlSource, /data-summary-editor-action="import-docx"/);
  assert.match(appSource, /window\.mammoth\.convertToHtml/);
  assert.match(appSource, /sanitizeRichTextHtml\(result\.value\)/);
  assert.match(appSource, /file\.size > 20 \* 1024 \* 1024/);
  assert.match(appSource, /Nhập DOCX sẽ thay thế toàn bộ nội dung đang soạn/);
  assert.match(appSource, /undoManager\.transact\(\(\) => _summaryStudyRichTextEditor\.setContent\(html\)\)/);
  assert.match(appSource, /Không thể đọc tệp DOCX\. Nội dung hiện tại vẫn được giữ nguyên/);
});

test('DOCX export exposes the browser action and supports document structure and images', () => {
  assert.match(htmlSource, /data-summary-editor-action="export-docx"/);
  assert.match(appSource, /exportSummaryHtmlToDocx\(activeContent, title\)/);
  assert.match(appSource, /link\.download = .*\.docx/);
  assert.match(appSource, /vendor\/summaryDocx\.js/);
  const docxSource = fs.readFileSync('modules/summaryDocx.js', 'utf8');
  assert.match(docxSource, /function imageTransform\(element\)/);
  assert.match(docxSource, /function imageOutline\(element\)/);
  assert.match(docxSource, /rotation: transform\.rotation/);
  assert.match(docxSource, /flip: transform\.flip/);
  assert.match(docxSource, /outline: imageOutline\(element\)/);
  const imageFormatStart = docxSource.indexOf('function parseHexColor(');
  const imageFormatEnd = docxSource.indexOf('\nfunction runStyle', imageFormatStart);
  const imageFormatContext = {};
  vm.createContext(imageFormatContext);
  vm.runInContext(`${docxSource.slice(imageFormatStart, imageFormatEnd)}\nthis.imageTransform = imageTransform;\nthis.imageOutline = imageOutline;`, imageFormatContext);
  assert.deepEqual(
    JSON.parse(JSON.stringify(imageFormatContext.imageTransform({ style: { transform: 'rotate(90deg) scaleX(-1)' } }))),
    { rotation: 90, flip: { horizontal: true, vertical: false } }
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(imageFormatContext.imageOutline({ style: { border: '2px solid rgb(15, 118, 110)' } }))),
    { width: 19050, type: 'solidFill', solidFillType: 'rgb', value: '0F766E' }
  );
  assert.match(docxSource, /new ImageRun/);
  assert.match(docxSource, /tag === 'figure'[\s\S]*?figureContent\.push\(\.\.\.await inlineChildren\(node\)\)/);
  assert.match(docxSource, /new Table\(/);
  assert.match(docxSource, /default: new Footer/);
  assert.match(docxSource, /PageNumber\.CURRENT/);
  assert.match(docxSource, /PageNumber\.TOTAL_PAGES/);
  assert.match(docxSource, /for \(const child of root\.childNodes\)/);
  assert.match(docxSource, /blocks\.push\(\.\.\.await blockChildren\(child\)\)/);
  assert.match(docxSource, /before: before \?\?/);
  assert.match(docxSource, /line: Math\.round\(lineHeight \* 240\)/);
  assert.match(docxSource, /if \(!hasVisibleContent\(child\)\) continue/);
  assert.match(docxSource, /let inlineHasContent = false/);
  assert.match(docxSource, /function paragraphFormatting\(block\)/);
  assert.match(docxSource, /DOCX_PAGE_SIZES/);
  assert.match(docxSource, /column: \{ count: columnCount, space: columnSpace, equalWidth: true \}/);
  assert.match(docxSource, /margin: \{ top: margins\[0\], right: margins\[1\], bottom: margins\[2\], left: margins\[3\], gutter, footer: 567 \}/);
  assert.match(docxSource, /PageOrientation\.LANDSCAPE/);
  assert.match(docxSource, /new Header\(\{ children: headerChildren \}\)/);
  assert.match(docxSource, /summary-study-page-number/);
  assert.match(docxSource, /summary-study-text-box/);
  assert.match(docxSource, /shading: style\.shading \? \{ fill: style\.shading \} : undefined/);
  assert.match(docxSource, /function parseRgbColor\(value\)/);
  assert.match(docxSource, /tabStops: formatting\.tabStops/);
  assert.match(docxSource, /keepNext: formatting\.keepNext/);
  assert.match(docxSource, /pageBreakBefore: formatting\.pageBreakBefore/);
  assert.match(docxSource, /child\.matches\('\.summary-study-page-break,\[data-summary-page-break="true"\]'\)/);
  assert.match(docxSource, /summaryPageGutter/);
  assert.match(appSource, /pageMargins\[3\] \+ pageGutter/);
  assert.match(fs.readFileSync('package.json', 'utf8'), /modules\/summaryDocx\.js.*--outdir=vendor/);
});

test('shared summaries preserve edited HTML and sanitize it before rendering', () => {
  assert.match(appSource, /prepareRichTextDocument\(_summaryStudyRichTextEditor\)[\s\S]*?sanitizeRichTextHtml\(documentState\.editedHtml\)/);
  assert.match(appSource, /sanitizeRichTextHtml\(payload\.summary\.documentHtml\)/);
  assert.match(shareApiSource, /documentHtml: data\.documentHtml \|\| null/);
  assert.match(shareApiSource, /MAX_DOCUMENT_HTML_BYTES = 450_000/);
  assert.match(shareApiSource, /MAX_SHARE_BYTES = 850_000/);
  assert.match(shareApiSource, /documentHtml, createdAt/);
});

test('share API bounds optional edited-document HTML without breaking older share payloads', () => {
  assert.equal(shareContext.cleanDocumentHtml(undefined), null);
  assert.equal(shareContext.cleanDocumentHtml(null), null);
  assert.equal(shareContext.cleanDocumentHtml(''), null);
  assert.equal(shareContext.cleanDocumentHtml('<p>Edited</p>'), '<p>Edited</p>');
  assert.equal(shareContext.cleanDocumentHtml('<p>é</p>'.repeat(225_001)), null);
  assert.equal(shareContext.cleanDocumentHtml({ html: '<p>not a string</p>' }), null);
});

test('PDF export prints page breaks and numbered figure captions', () => {
  assert.match(appSource, /summary-study-page-break\{break-before:page;page-break-before:always/);
  assert.match(appSource, /summary-study-figure figcaption/);
  assert.match(appSource, /const activeContent = _summaryStudyRichTextEditor\s*\?\s*prepareRichTextDocument\(_summaryStudyRichTextEditor\)/);
  assert.match(editorSource, /Hình \$\{index \+ 1\}/);
  assert.match(editorSource, /href="#\$\{id\}"/);
  assert.match(appSource, /summary-study-footnote\{margin:4px 0 14px/);
  assert.match(appSource, /summary-study-endnotes\{margin-top:24px/);
  assert.match(appSource, /summary-study-image-layout--float-left\{float:left!important/);
  assert.match(appSource, /summary-study-image-layout--float-right\{float:right!important/);
  assert.match(appSource, /figure\.summary-study-image-layout--float-left,figure\.summary-study-image-layout--float-right/);
  assert.match(appSource, /textEffectStyles\.textContent = '[^']*summary-study-text-effect--outline/);
  assert.match(appSource, /summary-study-text-effect--reflection/);
  assert.match(appSource, /summary-study-text-effect--glow/);
});

test('summary annotations follow matching text and remain recoverable during autosave', () => {
  const state = {
    highlights: [{ id: 'highlight-1', start: 0, end: 5, quote: 'Topic' }],
    notes: [{ id: 'note-1', start: 0, end: 5, quote: 'Topic', text: 'Review' }]
  };
  const documentStub = {
    createTreeWalker() {
      const nodes = [{ nodeValue: 'Intro ' }, { nodeValue: 'Topic continued' }];
      let index = 0;
      return {
        nextNode() { return index < nodes.length ? nodes[index++] : null; },
        get currentNode() { return nodes[index - 1]; }
      };
    }
  };
  const anchorContext = {
    NodeFilter: { SHOW_TEXT: 4 },
    document: documentStub,
    getSummaryStudyState: () => state,
    saveSummaryStudyState: patch => Object.assign(state, patch)
  };
  vm.createContext(anchorContext);
  vm.runInContext(`${appSource.slice(anchorStart, anchorEnd)}\nthis.reanchor = reanchorSummaryStudyAnnotations;`, anchorContext);

  assert.equal(anchorContext.reanchor({}), 0);
  assert.equal(state.highlights[0].start, 6);
  assert.equal(state.notes[0].start, 6);

  documentStub.createTreeWalker = () => {
    const nodes = [{ nodeValue: 'No matching passage remains' }];
    let index = 0;
    return {
      nextNode() { return index < nodes.length ? nodes[index++] : null; },
      get currentNode() { return nodes[index - 1]; }
    };
  };
  assert.equal(anchorContext.reanchor({}, { removeMissing: false }), 2);
  assert.equal(state.highlights.length, 1);
  assert.equal(anchorContext.reanchor({}, { removeMissing: true }), 2);
  assert.equal(state.highlights.length, 0);
  assert.equal(state.notes.length, 0);
});

test('removing a partial highlight keeps the unselected text anchors and their colors', () => {
  const helperStart = appSource.indexOf('function splitSummaryStudyHighlights(');
  const helperEnd = appSource.indexOf('\nfunction summaryStudyUnwrapHighlights(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helperContext = {};
  vm.createContext(helperContext);
  vm.runInContext(`${appSource.slice(helperStart, helperEnd)}\nthis.split = splitSummaryStudyHighlights;`, helperContext);

  const anchors = [
    { id: 'first', start: 0, end: 10, quote: 'abcdefghij', color: '#fde68a' },
    { id: 'second', start: 12, end: 18, quote: 'ghijkl', color: '#bfdbfe' }
  ];
  const remaining = helperContext.split(anchors, 4, 14, (start, end) => `text-${start}-${end}`);
  assert.deepEqual(JSON.parse(JSON.stringify(remaining)), [
    { id: 'first-left-0-4', start: 0, end: 4, quote: 'text-0-4', color: '#fde68a' },
    { id: 'second-right-14-18', start: 14, end: 18, quote: 'text-14-18', color: '#bfdbfe' }
  ]);
});

test('summary highlight removal supports selection-preserving toolbar and context actions', () => {
  assert.match(appSource, /function removeSummaryStudyHighlight\(target = null, selectedRange = null\)/);
  assert.match(appSource, /range\.extractContents\(\)[\s\S]*?summaryStudyUnwrapHighlights\(extracted\)[\s\S]*?splitSummaryStudyHighlights/);
  assert.match(appSource, /saveSummaryStudyState\(\{ highlights, editedHtml: summaryStudyContentWithoutHighlights\(root\) \}\)/);
  assert.match(appSource, /picked\.range\.cloneRange\(\)/);
  assert.match(appSource, /removeSummaryStudyHighlight\(_summaryStudyContextHighlight, _summaryStudyContextSelection\)/);
  assert.match(appSource, /function restoreSummaryStudyHighlights\(\) \{\s*const root = document\.getElementById\('summary-study-document-body'\);\s*if \(!root\) return;\s*summaryStudyUnwrapHighlights\(root\);/);
  assert.match(appSource, /function summaryStudyTextOffset\(root, node, offset\) \{\s*if \(!root \|\| !node \|\| \(node !== root && !root\.contains\(node\)\)\) return -1;\s*try \{\s*const range = root\.ownerDocument\.createRange\(\);\s*range\.selectNodeContents\(root\);\s*range\.setEnd\(node, offset\);\s*return range\.toString\(\)\.length;/);
  assert.match(appSource, /data-summary-action="highlight"\], \[data-summary-action="remove-highlight"\]/);
  assert.match(htmlSource, /data-summary-context-action="remove-highlight"/);
});

test('summary color palette persists custom colors and contrast preference', () => {
  assert.match(htmlSource, /data-summary-color="#ff0000"/);
  assert.match(htmlSource, /data-summary-color-picker/);
  assert.match(htmlSource, /data-summary-high-contrast/);
  assert.match(htmlSource, /data-summary-contrast="true"/);
  assert.match(appSource, /localStorage\.setItem\(SUMMARY_STUDY_COLOR_KEY, color\)/);
  assert.match(appSource, /localStorage\.setItem\(SUMMARY_STUDY_HIGH_CONTRAST_KEY, String\(enabled\)\)/);
  assert.match(appSource, /colorMatched \|\|= isSelected/);
});

test('text-to-table parser handles quoted delimiters, escaped quotes, and uneven rows', () => {
  const helperStart = editorSource.indexOf('function parseDelimitedRows(');
  const helperEnd = editorSource.indexOf('\nfunction convertSelectedTextToTable(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart);
  const helperContext = {};
  vm.createContext(helperContext);
  vm.runInContext(`${editorSource.slice(helperStart, helperEnd)}\nthis.parse = parseDelimitedRows;`, helperContext);
  assert.deepEqual(JSON.parse(JSON.stringify(helperContext.parse('Name,Note\r\n"Smith, Jane","said ""hi"""\r\nLee', ','))), [
    ['Name', 'Note'],
    ['Smith, Jane', 'said "hi"'],
    ['Lee', '']
  ]);
  assert.throws(() => helperContext.parse('"open,cell', ','), /dấu ngoặc kép chưa đóng/);
});
