const fs = require('fs');

let code = fs.readFileSync('modules/docSummarizerEngine.js', 'utf8');

const startIndex = code.indexOf('// ── SYNTHESIS PROMPT ──────────────────────────────────────────────────────────');
const endIndex = code.indexOf('// ── Stage 6A: Deterministic Validation ────────────────────────────────────────');

if (startIndex === -1 || endIndex === -1) {
  console.error('Cannot find boundaries for replacement.');
  process.exit(1);
}

const replacement = `// ── KNOWLEDGE ORGANIZER PROMPT ───────────────────────────────────────────────
const KB_ORGANIZER_PROMPT = (bankPayloadStr, docTitle) =>
'Bạn là AI tổ chức kiến thức giáo dục. Nhiệm vụ: Xây dựng dàn bài (Knowledge Organizer) cho tài liệu "' + docTitle + '".\\n' +
'KNOWLEDGE BANK:\\n' + bankPayloadStr + '\\n\\n' +
'YÊU CẦU:\\n' +
'1. Dựa vào các sections và facts, hãy tạo các chapters hợp lý.\\n' +
'2. Mỗi chapter phải có "title" và danh sách các "fact_ids" sẽ được đưa vào chapter đó.\\n' +
'3. BAO PHỦ 100% FACTS: Mọi fact_id trong Bank phải được phân bổ vào ít nhất một chapter. KHÔNG ĐƯỢC BỎ SÓT.\\n\\n' +
'SCHEMA JSON:\\n' +
'{\\n' +
'  "chapters": [\\n' +
'    { "title": "Tên chương", "fact_ids": ["F001", "F002"] }\\n' +
'  ]\\n' +
'}';

// ── CHAPTER SYNTHESIS PROMPT ──────────────────────────────────────────────────
const KB_CHAPTER_PROMPT = (chapterTitle, chapterFactsStr, docTitle) =>
'Bạn là AI biên soạn giáo trình chuyên sâu. Viết nội dung cho Chương: "' + chapterTitle + '" (thuộc tài liệu: ' + docTitle + ').\\n\\n' +
'KIẾN THỨC CUNG CẤP (CHỈ DÙNG KIẾN THỨC NÀY):\\n' + chapterFactsStr + '\\n\\n' +
'YÊU CẦU "HỌC SÂU":\\n' +
'1. TRÌNH BÀY NHƯ MỘT BÀI GIẢNG ĐẦY ĐỦ: Giải thích bản chất → Thuộc tính → Số liệu → Cấu tạo → Chức năng → Điều kiện → Ví dụ.\\n' +
'2. Dùng Markdown (##, ###, in đậm, danh sách). KHÔNG TẠO DÀN Ý CỤT LỦN. Phải có văn bản giải thích mạch lạc giữa các ý.\\n' +
'3. SỐ LIỆU: Phải giữ nguyên 100% giá trị và đơn vị (ví dụ 1-10 µm KHÔNG đổi thành 1-10 mm).\\n' +
'4. KHÔNG thêm kiến thức ngoài.\\n\\n' +
'TRẢ VỀ JSON:\\n' +
'{\\n' +
'  "content": "Nội dung markdown hoàn chỉnh của chương này"\\n' +
'}';

// ── DICTIONARY SYNTHESIS PROMPT (Concepts, Comparisons, etc.) ──────────────
const KB_DICTIONARY_PROMPT = (bankPayloadStr, docTitle) =>
'Bạn là AI xây dựng từ điển tra cứu cho tài liệu "' + docTitle + '".\\n\\n' +
'KNOWLEDGE BANK:\\n' + bankPayloadStr + '\\n\\n' +
'YÊU CẦU:\\n' +
'1. Trích xuất Concepts (các định nghĩa, khái niệm) với đầy đủ attributes, conditions, numbers.\\n' +
'2. Xây dựng Bảng So Sánh (Comparisons) chi tiết dựa trên attributes có thật.\\n' +
'3. KHÔNG tự bịa fact.\\n\\n' +
'SCHEMA JSON:\\n' +
'{\\n' +
'  "overview": "Tổng quan 3-6 câu",\\n' +
'  "concepts": [{"name": "...", "tier": "A|B", "definition": "...", "attributes": ["..."], "conditions_exceptions": ["..."], "numbers": ["..."]}],\\n' +
'  "comparisons": [{"title": "...", "rows": [{"concept": "...", "essence": "...", "diff": "..."}]}],\\n' +
'  "domain_apps": [{"source_fact_id": "...", "expansion_type": "...", "content": "..."}],\\n' +
'  "key_points": ["..."],\\n' +
'  "pitfalls": ["..."],\\n' +
'  "questions": ["..."]\\n' +
'}';

// ── Extraction Execution ───────────────────────────────────────────────────────
async function extractChunkToBank({ chunkText, docTitle, chunkId, totalChunks, onProgress }) {
  const chunkLabel = 'Đoạn ' + (chunkId + 1) + '/' + totalChunks;
  onProgress?.('Đang trích xuất Knowledge Bank từ ' + chunkLabel + '...');

  const maxRetries = 2;
  let feedbackPrompt = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let prompt = KB_EXTRACTION_PROMPT(chunkText, docTitle, chunkLabel);
    if (feedbackPrompt) {
      prompt += '\\n\\n═══════════════════════════════\\nLỖI TỪ LẦN THỬ TRƯỚC (SỬA NGAY):\\n' + feedbackPrompt + '\\n═══════════════════════════════';
    }

    try {
      const result = await callGeminiJSON(prompt, DEEP_CALL_OPTS);
      if (result && typeof result === 'object') {
        const gate = validateRawExtraction(chunkText, result);
        if (gate.valid) {
          const factCount = (result.facts || []).length;
          console.log('[KB Extraction] ' + chunkLabel + ' (Lần ' + (attempt + 1) + '): ' + factCount + ' facts - PRE-SYNTHESIS GATE PASSED');
          return result;
        } else {
          console.warn('[KB Gate] ' + chunkLabel + ' Lần ' + (attempt + 1) + ' THẤT BẠI:', gate.issues.map(i => i.message).join('; '));
          feedbackPrompt = gate.issues.map(i => '- ' + i.message).join('\\n');
        }
      }
    } catch (err) {
      console.error('[KB Extraction] ' + chunkLabel + ' Lần ' + (attempt + 1) + ' thất bại:', err.message);
    }
  }

  console.error('[KB Extraction] ' + chunkLabel + ' thất bại sau ' + (maxRetries + 1) + ' lần. Marking EXTRACTION_FAILED.');
  return { success: false, status: 'EXTRACTION_FAILED', chunkId, facts: [], mechanisms: [], sections: [], domain_expansions: [] };
}

// ── Multi-Stage Synthesis ─────────────────────────────────────────────────────
async function organizeKnowledgeBank(bank, docTitle) {
  const bankPayloadStr = _buildSynthesisPayload(bank);
  try {
    const result = await callGeminiJSON(KB_ORGANIZER_PROMPT(bankPayloadStr, docTitle), DEEP_CALL_OPTS);
    if (result && Array.isArray(result.chapters)) return result.chapters;
  } catch (err) {
    console.error('[KB Organizer] Thất bại:', err.message);
  }
  // Fallback Organizer: mỗi section là một chapter
  return bank.sections.map(s => ({
    title: s.title,
    fact_ids: s.fact_ids || []
  }));
}

async function synthesizeChapter(chapterPlan, bank, docTitle, attempt = 1) {
  const chapterFacts = bank.facts.filter(f => chapterPlan.fact_ids.includes(f.fact_id));
  const chapterNumbers = bank.numbers.filter(n => chapterPlan.fact_ids.includes(n.fact_id));
  
  if (chapterFacts.length === 0) return { title: chapterPlan.title, content: 'Không có dữ liệu chi tiết.' };

  const chapterFactsStr = JSON.stringify({ facts: chapterFacts, numbers: chapterNumbers }, null, 2);
  
  try {
    const result = await callGeminiJSON(KB_CHAPTER_PROMPT(chapterPlan.title, chapterFactsStr, docTitle), DEEP_CALL_OPTS);
    if (result && result.content) {
      let content = result.content;
      
      // Strict Number Validation per Chapter
      let corrupted = false;
      let missingCount = 0;
      const unitConversions = {
        'µm': ['mm', 'cm', 'm'], 'nm': ['µm', 'mm', 'cm'],
        'mm': ['µm', 'nm', 'cm', 'm'], '°c': ['°f', 'k'], 'mg': ['g', 'kg']
      };
      
      const lowerContent = content.toLowerCase();
      for (const num of chapterNumbers) {
        if (!num.value || !num.unit) continue;
        const val = String(num.value).replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~]');
        const unitEsc = String(num.unit).replace(/[.*+?^\${}()|[\\]\\\\µ]/g, '\\\\$&');
        const exactRe = new RegExp(val + '\\\\s*' + unitEsc, 'i');
        
        if (!exactRe.test(lowerContent)) {
           missingCount++;
           for (const wu of (unitConversions[num.unit] || [])) {
             if (new RegExp(val + '\\\\s*' + wu, 'i').test(lowerContent)) {
               corrupted = true;
               console.error(\`[Chapter Synth] Hallucination detected: \${num.value}\${num.unit} -> \${wu} in chapter \${chapterPlan.title}\`);
               break;
             }
           }
        }
      }
      
      if ((corrupted || missingCount > Math.max(2, chapterNumbers.length * 0.3)) && attempt < 2) {
         console.warn(\`[Chapter Synth] Missing \${missingCount} numbers or corrupted. Retrying chapter \${chapterPlan.title}...\`);
         return synthesizeChapter(chapterPlan, bank, docTitle, attempt + 1);
      }
      
      return { title: chapterPlan.title, content };
    }
  } catch (err) {
    console.error(\`[Chapter Synth] Lỗi tại \${chapterPlan.title}:\`, err.message);
  }
  
  // Fallback content cho chapter này
  let content = '## ' + chapterPlan.title + '\\n\\n';
  for (const f of chapterFacts) {
    if (f.value && f.unit) content += '- **' + f.entity + '** (' + f.attribute + '): ' + f.value + ' ' + f.unit + '\\n';
    else if (f.content) content += '- ' + f.content + '\\n';
  }
  return { title: chapterPlan.title, content };
}

async function synthesizeDictionaries(bank, docTitle) {
  const bankPayloadStr = _buildSynthesisPayload(bank);
  try {
    const result = await callGeminiJSON(KB_DICTIONARY_PROMPT(bankPayloadStr, docTitle), DEEP_CALL_OPTS);
    if (result && typeof result === 'object') return result;
  } catch (err) {
    console.error('[KB Dictionary] Thất bại:', err.message);
  }
  return { overview: '', concepts: [], comparisons: [], domain_apps: [], key_points: [], pitfalls: [], questions: [] };
}

async function synthesizeFromKB(bank, docTitle, onProgress) {
  onProgress?.('Đang phân bổ kiến thức (Knowledge Organizer)...');
  const chaptersPlan = await organizeKnowledgeBank(bank, docTitle);
  
  const assignedFactIds = new Set(chaptersPlan.flatMap(c => c.fact_ids || []));
  const unassignedFacts = bank.facts.filter(f => !assignedFactIds.has(f.fact_id));
  if (unassignedFacts.length > 0) {
    chaptersPlan.push({ title: 'Các kiến thức bổ sung', fact_ids: unassignedFacts.map(f => f.fact_id) });
  }

  const chapters = [];
  for (let i = 0; i < chaptersPlan.length; i++) {
    onProgress?.(\`Đang viết chi tiết: \${chaptersPlan[i].title} (\${i + 1}/\${chaptersPlan.length})...\`);
    const chapResult = await synthesizeChapter(chaptersPlan[i], bank, docTitle);
    chapters.push(chapResult);
  }

  onProgress?.('Đang tổng hợp từ điển tra cứu (Concepts, Comparisons)...');
  const dicts = await synthesizeDictionaries(bank, docTitle);

  return {
    ...dicts,
    chapters
  };
}

`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('modules/docSummarizerEngine.js', code);
console.log('Successfully patched Multi-Stage Synthesis.');
