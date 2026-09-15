const fs = require('fs');
let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');

const target = `  const concepts = (synthesized?.concepts || []).map(c => ({
    name           : String(c?.name || ''),
    tier           : String(c?.tier || 'B'),
    definition     : String(c?.definition || ''),
    key_facts      : _strArr(c?.key_facts),
    numbers        : _strArr(c?.numbers),
    comparisons    : Array.isArray(c?.comparisons)
      ? c.comparisons.map(cp => ({ vs: String(cp?.vs || ''), diff: String(cp?.diff || '') }))
      : [],
    citations      : Array.isArray(c?.citations)
      ? c.citations.map(ct => ({ text_span: String(ct?.text_span || ''), fact_ids: _strArr(ct?.fact_ids) }))
      : []
  }));`;

const replacement = `  const concepts = (synthesized?.concepts || []).map(c => ({
    name                 : String(c?.name || ''),
    tier                 : String(c?.tier || 'B'),
    definition           : String(c?.definition || ''),
    attributes           : _strArr(c?.attributes),
    conditions_exceptions: _strArr(c?.conditions_exceptions),
    key_facts            : _strArr(c?.key_facts),
    numbers              : _strArr(c?.numbers),
    comparisons          : Array.isArray(c?.comparisons)
      ? c.comparisons.map(cp => ({ vs: String(cp?.vs || ''), diff: String(cp?.diff || '') }))
      : [],
    citations            : Array.isArray(c?.citations)
      ? c.citations.map(ct => ({ text_span: String(ct?.text_span || ''), fact_ids: _strArr(ct?.fact_ids) }))
      : []
  }));`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('modules/docSummarizerEngine.js', code);
  console.log('Patched _buildFinalDeepOutput successfully!');
} else {
  // try regex for CRLF differences
  const targetRegex = /const concepts = \(synthesized\?\.concepts \|\| \[\]\)\.map\(c => \(\{\r?\n\s+name\s*: String\(c\?\.name \|\| ''\),\r?\n\s+tier\s*: String\(c\?\.tier \|\| 'B'\),\r?\n\s+definition\s*: String\(c\?\.definition \|\| ''\),\r?\n\s+key_facts\s*: _strArr\(c\?\.key_facts\),\r?\n\s+numbers\s*: _strArr\(c\?\.numbers\),\r?\n\s+comparisons\s*: Array\.isArray\(c\?\.comparisons\)\r?\n\s+\? c\.comparisons\.map\(cp => \(\{ vs: String\(cp\?\.vs \|\| ''\), diff: String\(cp\?\.diff \|\| ''\) \}\)\)\r?\n\s+: \[\],\r?\n\s+citations\s*: Array\.isArray\(c\?\.citations\)\r?\n\s+\? c\.citations\.map\(ct => \(\{ text_span: String\(ct\?\.text_span \|\| ''\), fact_ids: _strArr\(ct\?\.fact_ids\) \}\)\)\r?\n\s+: \[\]\r?\n\s+\}\)\);/m;
  if (targetRegex.test(code)) {
    code = code.replace(targetRegex, replacement);
    fs.writeFileSync('modules/docSummarizerEngine.js', code);
    console.log('Patched _buildFinalDeepOutput successfully via Regex!');
  } else {
    console.error('Target not found in docSummarizerEngine.js');
  }
}
