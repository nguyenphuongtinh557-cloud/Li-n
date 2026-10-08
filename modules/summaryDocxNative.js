import JSZip from 'jszip';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CHART_PALETTES = {
  teal: ['168C71', '0F766E', '70AD47', '14B8A6', '5EEAD4', 'A7F3D0'],
  blue: ['2563EB', '1D4ED8', '60A5FA', '3B82F6', '93C5FD', 'BFDBFE'],
  orange: ['EA580C', 'C2410C', 'F59E0B', 'F97316', 'FDBA74', 'FED7AA']
};

function xmlEscape(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;'
  })[character]);
}

function normalizeChart(chart) {
  if (!chart || !['bar', 'column', 'line', 'pie'].includes(chart.type)
    || !Object.hasOwn(CHART_PALETTES, chart.palette)) {
    throw new Error('Dữ liệu biểu đồ DOCX không hợp lệ.');
  }
  if (!Array.isArray(chart.data) || chart.data.length < 2 || chart.data.length > 12) {
    throw new Error('Biểu đồ DOCX cần từ 2 đến 12 mục dữ liệu.');
  }
  const data = chart.data.map(item => {
    const label = String(item?.label || '').trim();
    const value = Number(item?.value);
    if (!label || label.length > 80 || !Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
      throw new Error('Dữ liệu biểu đồ DOCX chứa nhãn hoặc giá trị không hợp lệ.');
    }
    return { label, value };
  });
  const title = String(chart.title || '').trim();
  if (!title || title.length > 120) throw new Error('Tên biểu đồ DOCX không hợp lệ.');
  return { type: chart.type, palette: chart.palette, title, data };
}

function worksheetXml(chart) {
  const rows = [
    `<row r="1"><c r="A1" t="inlineStr"><is><t>Nhãn</t></is></c><c r="B1" t="inlineStr"><is><t>${xmlEscape(chart.title)}</t></is></c></row>`,
    ...chart.data.map((item, index) => {
      const row = index + 2;
      return `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>${xmlEscape(item.label)}</t></is></c><c r="B${row}"><v>${item.value}</v></c></row>`;
    })
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
}

function workbookParts(chart) {
  return {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': worksheetXml(chart)
  };
}

function chartPointColors(data, colors) {
  return data.map((_, index) => `<c:dPt><c:idx val="${index}"/><c:spPr><a:solidFill><a:srgbClr val="${colors[index % colors.length]}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:dPt>`).join('');
}

function chartSeries(chart, chartIndex, colors) {
  const firstRow = 2;
  const lastRow = chart.data.length + 1;
  const categories = chart.data.map((item, index) => `<c:pt idx="${index}"><c:v>${xmlEscape(item.label)}</c:v></c:pt>`).join('');
  const values = chart.data.map((item, index) => `<c:pt idx="${index}"><c:v>${item.value}</c:v></c:pt>`).join('');
  const cache = `<c:cat><c:strRef><c:f>Sheet1!$A$${firstRow}:$A$${lastRow}</c:f><c:strCache><c:ptCount val="${chart.data.length}"/>${categories}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>Sheet1!$B$${firstRow}:$B$${lastRow}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${chart.data.length}"/>${values}</c:numCache></c:numRef></c:val>`;
  const seriesName = `<c:tx><c:strRef><c:f>Sheet1!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(chart.title)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
  if (chart.type === 'pie') {
    return `<c:ser><c:idx val="0"/><c:order val="0"/>${seriesName}${chartPointColors(chart.data, colors)}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showLeaderLines val="1"/></c:dLbls>${cache}<c:extLst/></c:ser>`;
  }
  if (chart.type === 'line') {
    return `<c:ser><c:idx val="0"/><c:order val="0"/>${seriesName}<c:spPr><a:ln w="28575"><a:solidFill><a:srgbClr val="${colors[0]}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="7"/><c:spPr><a:solidFill><a:srgbClr val="${colors[0]}"/></a:solidFill></c:spPr></c:marker>${cache}<c:smooth val="0"/></c:ser>`;
  }
  const direction = chart.type === 'bar' ? 'bar' : 'col';
  return `<c:ser><c:idx val="0"/><c:order val="0"/>${seriesName}${chartPointColors(chart.data, colors)}<c:invertIfNegative val="0"/><c:dLbls><c:showVal val="1"/></c:dLbls>${cache}</c:ser>`;
}

function chartXml(chart, chartIndex) {
  const colors = CHART_PALETTES[chart.palette];
  const series = chartSeries(chart, chartIndex, colors);
  const axes = chart.type === 'pie' ? '' : chart.type === 'line'
    ? `<c:catAx><c:axId val="${chartIndex * 2 + 1}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:tickLblPos val="nextTo"/><c:crossAx val="${chartIndex * 2 + 2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${chartIndex * 2 + 2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="${chartIndex * 2 + 1}"/><c:crosses val="autoZero"/><c:crossesAt val="0"/></c:valAx>`
    : `<c:catAx><c:axId val="${chartIndex * 2 + 1}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${chart.type === 'bar' ? 'l' : 'b'}"/><c:tickLblPos val="nextTo"/><c:crossAx val="${chartIndex * 2 + 2}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${chartIndex * 2 + 2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${chart.type === 'bar' ? 'b' : 'l'}"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="${chartIndex * 2 + 1}"/><c:crosses val="autoZero"/></c:valAx>`;
  const plot = chart.type === 'pie'
    ? `<c:pieChart><c:varyColors val="1"/>${series}<c:firstSliceAng val="0"/></c:pieChart>`
    : chart.type === 'line'
      ? `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:smooth val="0"/><c:axId val="${chartIndex * 2 + 1}"/><c:axId val="${chartIndex * 2 + 2}"/></c:lineChart>`
      : `<c:barChart><c:barDir val="${chart.type === 'bar' ? 'bar' : 'col'}"/><c:grouping val="clustered"/><c:varyColors val="1"/>${series}<c:gapWidth val="70"/><c:axId val="${chartIndex * 2 + 1}"/><c:axId val="${chartIndex * 2 + 2}"/></c:barChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>${plot}${axes}</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/><c:showDLblsOverMax val="0"/></c:chart><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

function chartDrawingXml(chart, chartIndex, relationshipId) {
  const name = xmlEscape(chart.title);
  const description = xmlEscape(`Biểu đồ ${chart.type}: ${chart.data.map(item => `${item.label} ${item.value}`).join(', ')}`);
  const docPropertiesId = chartIndex + 1000;
  const width = 5486400;
  const height = 3200400;
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${width}" cy="${height}"/><wp:effectExtent t="0" r="0" b="0" l="0"/><wp:docPr id="${docPropertiesId}" name="${name}" descr="${description}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relationshipId}"/></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

function appendRelationship(xml, relationship) {
  if (!xml || !xml.includes('</Relationships>')) throw new Error('Thiếu quan hệ trong gói DOCX.');
  return xml.replace('</Relationships>', `${relationship}</Relationships>`);
}

function ensureContentType(xml, partName, contentType) {
  if (xml.includes(`PartName="${partName}"`)) return xml;
  if (!xml.includes('</Types>')) throw new Error('Thiếu khai báo kiểu nội dung trong gói DOCX.');
  return xml.replace('</Types>', `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`);
}

function ensureDefaultContentType(xml, extension, contentType) {
  if (new RegExp(`<Default\\b[^>]*Extension="${extension}"`).test(xml)) return xml;
  if (!xml.includes('</Types>')) throw new Error('Thiếu khai báo kiểu nội dung trong gói DOCX.');
  return xml.replace('</Types>', `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`);
}

function replaceShapeGeometry(documentXml, shape) {
  const escapedTitle = xmlEscape(shape.marker);
  const drawingPattern = /<wp:inline\b[\s\S]*?<\/wp:inline>/g;
  let replaced = false;
  const xml = documentXml.replace(drawingPattern, drawing => {
    if (!drawing.includes(`title="${escapedTitle}"`)) return drawing;
    if (!drawing.includes('<a:prstGeom prst="rect">')) {
      throw new Error('Không thể chuyển hình sang đối tượng DOCX có thể chỉnh sửa.');
    }
    replaced = true;
    return drawing
      .replace('<a:prstGeom prst="rect">', `<a:prstGeom prst="${shape.preset}">`)
      .replace(`title="${escapedTitle}"`, `title="${xmlEscape(shape.title)}"`);
  });
  if (!replaced) throw new Error(`Không tìm thấy hình DOCX cần chuyển: ${shape.title}`);
  return xml;
}

export async function embedSummaryDocxNativeObjects(blob, { charts = [], shapes = [] } = {}) {
  if (!charts.length && !shapes.length) return blob;
  const archive = await JSZip.loadAsync(blob);
  const documentPart = archive.file('word/document.xml');
  const relationsPart = archive.file('word/_rels/document.xml.rels');
  const contentTypesPart = archive.file('[Content_Types].xml');
  if (!documentPart || !relationsPart || !contentTypesPart) {
    throw new Error('Tài liệu DOCX không có các thành phần cần thiết để chèn đối tượng.');
  }

  let documentXml = await documentPart.async('string');
  let relationsXml = await relationsPart.async('string');
  let contentTypesXml = await contentTypesPart.async('string');
  const usedRelationshipIds = [...relationsXml.matchAll(/\bId="rId(\d+)"/g)].map(match => Number(match[1]));
  let nextRelationshipId = Math.max(0, ...usedRelationshipIds) + 1;
  for (let index = 0; index < charts.length; index += 1) {
    const chart = normalizeChart(charts[index]);
    const marker = String(charts[index].marker || '');
    if (!/^FTECA_NATIVE_CHART_\d+$/.test(marker)) throw new Error('Dấu nhận diện biểu đồ DOCX không hợp lệ.');
    const markerText = `<w:t xml:space="preserve">${xmlEscape(marker)}</w:t>`;
    const runPattern = new RegExp(`<w:r(?:\\s[^>]*)?>[\\s\\S]*?${markerText}[\\s\\S]*?<\\/w:r>`);
    if (!runPattern.test(documentXml)) throw new Error(`Không tìm thấy biểu đồ DOCX cần chuyển: ${chart.title}`);
    const relationshipId = `rId${nextRelationshipId++}`;
    documentXml = documentXml.replace(runPattern, chartDrawingXml(chart, index, relationshipId));
    const chartPath = `word/charts/chart${index + 1}.xml`;
    const workbookPath = `word/embeddings/Microsoft_Excel_Worksheet${index + 1}.xlsx`;
    relationsXml = appendRelationship(
      relationsXml,
      `<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chart${index + 1}.xml"/>`
    );
    archive.file(chartPath, chartXml(chart, index + 1));
    const chartRelations = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Microsoft_Excel_Worksheet' + (index + 1) + '.xlsx"/></Relationships>';
    archive.file(`word/charts/_rels/chart${index + 1}.xml.rels`, chartRelations);
    const workbook = new JSZip();
    for (const [path, contents] of Object.entries(workbookParts(chart))) workbook.file(path, contents);
    archive.file(workbookPath, await workbook.generateAsync({ type: 'uint8array' }));
    contentTypesXml = ensureContentType(
      contentTypesXml,
      `/word/charts/chart${index + 1}.xml`,
      'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
    );
  }
  const chartMarkers = charts.map(chart => chart.marker);
  for (const marker of chartMarkers) {
    if (documentXml.includes(marker)) throw new Error('Không thể gỡ dấu nội bộ của biểu đồ DOCX.');
  }
  for (const shape of shapes) documentXml = replaceShapeGeometry(documentXml, shape);
  if (charts.length) {
    contentTypesXml = ensureDefaultContentType(
      contentTypesXml,
      'xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  }

  archive.file('word/document.xml', documentXml);
  archive.file('word/_rels/document.xml.rels', relationsXml);
  archive.file('[Content_Types].xml', contentTypesXml);
  return archive.generateAsync({ type: 'blob', mimeType: DOCX_MIME_TYPE });
}
