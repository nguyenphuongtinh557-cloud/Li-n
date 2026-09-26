function splitTableRow(line) {
  const cells = [];
  let cell = '';
  let hasDelimiter = false;

  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '\\' && line[index + 1] === '|') {
      cell += '|';
      index++;
    } else if (character === '|') {
      hasDelimiter = true;
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());

  if (line.trimStart().startsWith('|')) cells.shift();
  const trimmedEnd = line.trimEnd();
  let precedingSlashes = 0;
  for (let index = trimmedEnd.length - 2; index >= 0 && trimmedEnd[index] === '\\'; index--) precedingSlashes++;
  if (trimmedEnd.endsWith('|') && precedingSlashes % 2 === 0) {
    hasDelimiter = true;
    cells.pop();
  }
  return hasDelimiter && cells.length ? cells : null;
}

function getAlignment(separatorCell) {
  const left = separatorCell.startsWith(':');
  const right = separatorCell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return 'left';
}

function normalizeCells(cells, columnCount) {
  const normalized = cells.slice(0, columnCount);
  if (cells.length > columnCount && columnCount > 0) {
    normalized[columnCount - 1] = [normalized[columnCount - 1], ...cells.slice(columnCount)].filter(Boolean).join(' | ');
  }
  while (normalized.length < columnCount) normalized.push('');
  return normalized;
}

function renderCell(tagName, content, alignment) {
  return `<${tagName} class="cs-markdown-table-cell-${alignment}">${content}</${tagName}>`;
}

function renderTable(header, alignments, rows) {
  const headerCells = header.map((cell, index) => renderCell('th', cell, alignments[index]));
  const bodyRows = rows.map(row => {
    const cells = normalizeCells(row, header.length);
    return `<tr>${cells.map((cell, index) => renderCell('td', cell, alignments[index])).join('')}</tr>`;
  });
  return `<div class="cs-markdown-table-wrap"><table class="cs-markdown-table"><thead><tr>${headerCells.join('')}</tr></thead><tbody>${bodyRows.join('')}</tbody></table></div>`;
}

export function renderMarkdownTables(markdownHtml) {
  const lines = String(markdownHtml || '').split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index++) {
    const header = splitTableRow(lines[index]);
    const separator = index + 1 < lines.length ? splitTableRow(lines[index + 1]) : null;
    if (!header || header.length < 2 || !separator || separator.length !== header.length
      || !separator.every(cell => /^:?-{3,}:?$/.test(cell))) {
      output.push(lines[index]);
      continue;
    }

    const alignments = separator.map(getAlignment);
    const rows = [];
    index += 2;
    while (index < lines.length) {
      const row = splitTableRow(lines[index]);
      if (!row) break;
      rows.push(row);
      index++;
    }
    index--;
    output.push('', renderTable(header, alignments, rows), '');
  }

  return output.join('\n');
}
