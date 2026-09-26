import assert from 'node:assert/strict';
import { renderMarkdownTables } from './modules/markdownTables.js';

const table = renderMarkdownTables([
  '| Thành phần | Đường dẫn | Sản phẩm năng lượng |',
  '|:---|:---:|---:|',
  '| Glucose | Glycolysis | 2 ATP, 2 NADH |',
  '| Acetyl-CoA | Krebs cycle | 3 NADH, 1 FADH₂, 1 GTP |'
].join('\n'));

assert.match(table, /<table class="cs-markdown-table">/);
assert.match(table, /<thead><tr>/);
assert.match(table, /class="cs-markdown-table-cell-left">Thành phần/);
assert.match(table, /class="cs-markdown-table-cell-center">Đường dẫn/);
assert.match(table, /class="cs-markdown-table-cell-right">Sản phẩm năng lượng/);
assert.match(table, /<td class="cs-markdown-table-cell-left">Acetyl-CoA<\/td>/);
assert.equal((table.match(/<tr>/g) || []).length, 3, 'Should render header plus two data rows');

const escapedPipe = renderMarkdownTables([
  'Tên | Ghi chú',
  '--- | ---',
  'A | B\\|C'
].join('\n'));
assert.match(escapedPipe, /B\|C/);
assert.equal((escapedPipe.match(/<td\b/g) || []).length, 2);

const unevenRows = renderMarkdownTables([
  '| Mục | Mô tả |',
  '| --- | --- |',
  '| Chỉ có một ô |'
].join('\n'));
assert.match(unevenRows, /<td class="cs-markdown-table-cell-left"><\/td>/);

const notTable = 'Một câu có dấu | nhưng không có dòng phân cách.';
assert.equal(renderMarkdownTables(notTable), notTable);

const tableWithFollowingText = renderMarkdownTables([
  '| Cột một | Cột hai |',
  '| --- | --- |',
  '| Giá trị | Mô tả |',
  'Đoạn văn tiếp theo không thuộc bảng.'
].join('\n'));
assert.match(tableWithFollowingText, /<td class="cs-markdown-table-cell-left">Mô tả<\/td><\/tr><\/tbody><\/table><\/div>/);
assert.match(tableWithFollowingText, /Đoạn văn tiếp theo không thuộc bảng/);
assert.equal((tableWithFollowingText.match(/<tr>/g) || []).length, 2);

console.log('Summary Markdown table tests passed.');
