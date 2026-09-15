import { readFileSync } from 'fs';

const code = readFileSync('./modules/docSummarizerEngine.js', 'utf8');

const checks = [
  ['KnowledgeBank class', /class KnowledgeBank \{/],
  ['EXTRACTION_PROMPT', /const EXTRACTION_PROMPT = /],
  ['SYNTHESIS_PROMPT', /const SYNTHESIS_PROMPT = /],
  ['deterministicValidate', /function deterministicValidate\(/],
  ['SEMANTIC_VALIDATION_PROMPT', /const SEMANTIC_VALIDATION_PROMPT = /],
  ['extractChunkToBank', /async function extractChunkToBank\(/],
  ['synthesizeFromBank', /async function synthesizeFromBank\(/],
  ['_buildFinalDeepOutput', /function _buildFinalDeepOutput\(/],
  ['KnowledgeBank.addFromExtraction', /addFromExtraction\(extractionResult\)/],
  ['KnowledgeBank.toSynthesisContext', /toSynthesisContext\(\)/],
  ['KnowledgeBank.toValidationContext', /toValidationContext\(\)/],
  ['anchor block: no source_fact_id', /if \(!d\.source_fact_id\) continue/],
  ['unit_conversion detection in 3A', /unit_conversion/],
  ['coverage_gap in 3A', /coverage_gap/],
  ['forbidden_content in 3A', /forbidden_content/],
  ['schema: deep_v3 in output', /schema.*:.*deep_v3/],
  ['Extraction: value copy rule in prompt', /SAO CHÉP NGUYÊN VẸN/],
  ['Synthesis: GROUND TRUTH in prompt', /GROUND TRUTH/],
  ['3A-1 Numerical', /3A-1: Numerical Fidelity/],
  ['3A-2 Attribute', /3A-2: Attribute Fidelity/],
  ['3A-3 Coverage', /3A-3: Coverage Audit/],
  ['3A-4 Grounding', /3A-4: Domain Expansion Grounding/],
  ['3A-5 Forbidden terms', /3A-5: Forbidden technical terms/],
  ['3B: AI semantic only on CRITICAL', /3B.*AI.*khi|semantic.*critical/i],
  ['No old DEEP_CHUNK_PROMPT', code => !code.includes('const DEEP_CHUNK_PROMPT = ')],
  ['No old summarizeChunkDeep', code => !code.includes('async function summarizeChunkDeep(')],
  ['No old mergeDeep function', code => !code.includes('async function mergeDeep(')],
  ['No old _normalizeTopics', code => !code.includes('function _normalizeTopics(')],
  ['No duplicate _strArr', code => (code.match(/^function _strArr/gm) || []).length <= 1],
];

let passed = 0;
let failed = 0;

for (const [name, check] of checks) {
  const result = typeof check === 'function' ? check(code) : check.test(code);
  if (result) { console.log('  OK  ' + name); passed++; }
  else { console.error('  FAIL ' + name); failed++; }
}

console.log('');
console.log('Result: ' + passed + '/' + (passed + failed) + ' passed');
if (failed === 0) console.log('ALL CHECKS PASSED');
else console.log('FAILED: ' + failed + ' checks');
