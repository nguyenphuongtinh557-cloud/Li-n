/**
 * document-summary.js — API Endpoint cho Hierarchical Document Summarization
 * 
 * POST /api/document-summary
 * Body: {
 *   text: string (nội dung tài liệu),
 *   documentTitle?: string,
 *   mode?: 'quick' | 'study' (✅ XÓA 'exam')
 * }
 * 
 * Response: Full hierarchical summary structure
 */

// Inline Gemini Keys for serverless
const GEMINI_KEYS = [
  'AIzaSyB4rSYnaBvBl4QWPyefSc_rODRZQ6eTrk8',
  'AIzaSyA_YW64oHktvXQALBKurI67x1tdu3LNQ6M',
  'AIzaSyACGSiU_pf21ssY_gqymwGd-_jLqK6qtN8'
];

let keyIndex = 0;

async function callGeminiSummary({ mode, chapterTitle, lessonTitle, source }) {
  const prompts = {
    quick: `Bạn là trợ lý học tập chuyên tóm tắt nhanh. Nhiệm vụ: đọc tài liệu và trích xuất ĐÚNG 3–5 ý QUAN TRỌNG NHẤT, mỗi ý 1 câu ngắn gọn dưới 20 từ. KHÔNG giải thích dài dòng. KHÔNG thêm kiến thức ngoài tài liệu.

CHƯƠNG: ${chapterTitle}
BÀI: ${lessonTitle}

NGUỒN TÀI LIỆU:
${source.slice(0, 28000)}

Trả về JSON hợp lệ duy nhất:
{
  "mainPoints": ["ý chính 1", "ý chính 2", ...],
  "keywords": ["từ khóa 1", ...],
  "pitfalls": [],
  "quickQuestions": [],
  "source": "${chapterTitle} — ${lessonTitle}"
}`,
    study: `Bạn là gia sư học thuật chuyên phân tích tài liệu chuyên sâu. Nhiệm vụ: phân tích kỹ tài liệu và trình bày đầy đủ các khái niệm cốt lõi kèm ví dụ/ngữ cảnh cụ thể. Mỗi ý chính cần giải thích RÕ RÀNG tại sao quan trọng. KHÔNG bịa thêm thông tin ngoài tài liệu.

CHƯƠNG: ${chapterTitle}
BÀI: ${lessonTitle}

NGUỒN TÀI LIỆU:
${source.slice(0, 28000)}

Trả về JSON hợp lệ duy nhất:
{
  "mainPoints": ["[Khái niệm]: giải thích chi tiết kèm ví dụ", ...],
  "keywords": ["thuật ngữ 1", ...],
  "pitfalls": ["lỗi hay gặp 1", ...],
  "quickQuestions": ["câu hỏi 1?", ...],
  "source": "${chapterTitle} — ${lessonTitle}"
}`,
    exam: `Bạn là chuyên gia luyện thi. Nhiệm vụ: phân tích tài liệu theo góc độ ÔN THI — tập trung vào những gì HAY RA THI, điểm DỄ NHẦM, và câu hỏi kiểm tra kiến thức.

CHƯƠNG: ${chapterTitle}
BÀI: ${lessonTitle}

NGUỒN TÀI LIỆU:
${source.slice(0, 28000)}

Trả về JSON hợp lệ duy nhất:
{
  "mainPoints": ["điểm hay ra thi 1", ...],
  "keywords": ["từ khóa 1", ...],
  "pitfalls": ["⚠️ Dễ nhầm: ...", ...],
  "quickQuestions": ["Câu hỏi thi thử 1?", ...],
  "source": "${chapterTitle} — ${lessonTitle}"
}`
  };

  const prompt = prompts[mode] || prompts.quick;

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[(keyIndex++) % GEMINI_KEYS.length];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            mainPoints: Array.isArray(parsed.mainPoints) ? parsed.mainPoints.slice(0, 8) : [],
            keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 12) : [],
            pitfalls: Array.isArray(parsed.pitfalls) ? parsed.pitfalls.slice(0, 6) : [],
            quickQuestions: Array.isArray(parsed.quickQuestions) ? parsed.quickQuestions.slice(0, 3) : [],
            source: String(parsed.source || `${chapterTitle} — ${lessonTitle}`)
          };
        }
      }
    } catch (err) {
      console.warn(`[DocSummary] Gemini key ${i+1} failed:`, err);
    }
  }

  throw new Error('All Gemini keys failed');
}

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

// Rate limiting
const rateBuckets = new Map();

function allowedRequest(req) {
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous').split(',')[0].trim();
  const now = Date.now();
  const active = (rateBuckets.get(key) || []).filter(time => now - time < 300_000); // 5 min window
  if (active.length >= 3) return false; // Max 3 document summaries per 5 min
  active.push(now);
  rateBuckets.set(key, active);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// ORCHESTRATED BATCH REASONING ENGINE (3-Call Architecture)
// ═══════════════════════════════════════════════════════════════════

async function processDocumentOptimized({ text, documentTitle, mode }) {
  // ─── CALL 1: Structure Detection + Planning ───────────────────────
  const structureMap = await detectDocumentStructure(text, documentTitle);
  
  // ─── CALL 2: Batch Hierarchical Summarization ────────────────────
  const batchResult = await batchSummarizeDocument({
    text,
    documentTitle,
    mode,
    structureMap
  });

  return {
    documentTitle,
    mode,
    structure: structureMap.detected ? 'hierarchical' : 'flat',
    chapters: batchResult.chapters,
    globalSummary: batchResult.globalSummary,
    processedAt: new Date().toISOString()
  };
}

// ─── CALL 1: Structure Detection (REGEX FIRST, AI FALLBACK) ────────
async function detectDocumentStructure(text, title) {
  // ✅ REGEX TRƯỚC (zero API cost)
  const regexResult = detectStructureByRegex(text);
  
  if (regexResult.detected) {
    console.log('[Structure] ✅ Detected by regex (0 API calls)');
    return regexResult;
  }

  // ❌ AI FALLBACK chỉ khi regex fail
  console.log('[Structure] ⚠️ Regex failed, using AI fallback...');
  
  const prompt = `Phân tích cấu trúc tài liệu "${title}". Trả về JSON:
{
  "detected": true/false,
  "segments": [{"title":"...","startPos":0,"endPos":5000}]
}

Tài liệu mẫu (${text.length} chars):
${text.slice(0, 6000)}`;

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[(keyIndex++) % GEMINI_KEYS.length];
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
        if (result.segments?.length > 0) return result;
      }
    } catch (err) {
      console.warn(`[Structure AI] Key ${i+1} failed:`, err);
    }
  }

  return createFallbackStructure(text, title);
}

// ✅ HYBRID DETECTION: Rule Engine → Coverage Score → AI Validation
function detectStructureByRegex(text) {
  const lines = text.split('\n');
  const totalLines = lines.filter(l => l.trim().length > 10).length; // Substantive lines
  
  // Rule-based patterns (không có confidence, chỉ match)
  const patterns = {
    chapter: [
      /^(CHƯƠNG|Chương|PHẦN|Phần|CHAPTER)\s+([IVX\d]+|[0-9]+)[:\s.-]*(.*?)$/i,
      /^([IVX]+|[0-9]+)\.\s*(CHƯƠNG|Chương)[:\s.-]*(.*?)$/i
    ],
    lesson: [
      /^(BÀI|Bài|LESSON|Lesson)\s+([0-9]+\.?[0-9]*)[:\s.-]*(.*?)$/i,
      /^([0-9]+\.[0-9]+)[:\s.-](.*?)$/
    ],
    heading: [
      /^#{1,3}\s+(.+)$/,                    // Markdown
      /^([A-Z][A-Z\s]{10,})$/,              // ALL CAPS
      /^([IVXLCDM]+\.\s+.+)$/               // Roman numeral
    ]
  };

  const matches = [];
  let lastPos = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 5) continue;

    for (const type in patterns) {
      for (const regex of patterns[type]) {
        if (regex.test(line)) {
          matches.push({
            line,
            lineNum: i,
            type,
            pos: lastPos
          });
          break;
        }
      }
    }

    lastPos += line.length + 1;
  }

  // ✅ CALCULATE COVERAGE SCORE (not confidence)
  const coverageScore = matches.length / Math.max(totalLines * 0.05, 1); // Expect ~5% to be headings
  const structureScore = matches.length >= 2 ? 1.0 : 0.0;
  
  // ✅ CALCULATE AMBIGUITY SCORE
  const adjacentMatches = matches.filter((m, i) => {
    if (i === 0) return false;
    return m.lineNum - matches[i-1].lineNum < 3; // Too close = ambiguous
  }).length;
  const ambiguityScore = adjacentMatches / Math.max(matches.length, 1);

  // Build segments from matches
  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextMatch = matches[i + 1];
    
    segments.push({
      title: match.line,
      startPos: match.pos,
      endPos: nextMatch ? nextMatch.pos : text.length,
      type: match.type
    });
  }

  const quality = {
    coverage: Math.min(coverageScore, 1.0),     // How much of doc is structured
    structure: structureScore,                   // Has minimum structure
    ambiguity: ambiguityScore                    // How ambiguous the structure is
  };

  // ✅ DECISION: Use regex if coverage good AND low ambiguity
  const shouldUseRegex = (
    quality.coverage >= 0.3 &&        // At least 30% coverage
    quality.structure === 1.0 &&      // Has structure
    quality.ambiguity < 0.3           // Low ambiguity
  );

  if (shouldUseRegex) {
    console.log(`[Regex] ✅ Structure detected (coverage: ${(quality.coverage*100).toFixed(0)}%, ambiguity: ${(quality.ambiguity*100).toFixed(0)}%)`);
    return { 
      detected: true, 
      segments, 
      quality,
      source: 'regex',
      totalSegments: segments.length 
    };
  }

  // ⚠️ Need AI validation if:
  // - Low coverage (< 30%)
  // - High ambiguity (> 30%)
  // - Layout noise detected
  console.log(`[Regex] ⚠️ Low quality (coverage: ${(quality.coverage*100).toFixed(0)}%, ambiguity: ${(quality.ambiguity*100).toFixed(0)}%) → AI validation needed`);
  return { 
    detected: false, 
    segments: [], 
    quality,
    source: 'needs_ai_validation'
  };
}

// ✅ SMART CHUNKING V2 (BIGGEST ROI - giảm 30-40% hallucination)
function createFallbackStructure(text, title) {
  const maxChunkSize = 4500; // chars (~1125 tokens)
  const segments = [];
  
  // ✅ Multi-level splitting strategy
  // 1. Try heading-based split first
  const headingSplit = splitByHeadings(text);
  if (headingSplit.length > 1) {
    console.log('[SmartChunk] ✅ Using heading-based split');
    return formatSegments(headingSplit, title);
  }
  
  // 2. Fallback to paragraph + sentence boundary
  console.log('[SmartChunk] ⚠️ No headings, using paragraph split');
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  
  let currentSegment = {
    title: `${title} - Phần 1`,
    startPos: 0,
    endPos: 0,
    content: [],
    sentences: []
  };
  
  let currentSize = 0;
  let segmentNum = 1;
  let totalPos = 0;

  for (const para of paragraphs) {
    const paraSize = para.length;
    
    // ✅ Check if adding this para would break semantic boundary
    const wouldExceed = currentSize + paraSize > maxChunkSize;
    const hasMinimumContent = currentSegment.content.length >= 2; // At least 2 paragraphs
    
    if (wouldExceed && hasMinimumContent) {
      // ✅ Try to find natural break point (end of sentence in last para)
      const lastPara = currentSegment.content[currentSegment.content.length - 1];
      const sentences = lastPara.match(/[^.!?]+[.!?]+/g) || [lastPara];
      
      if (sentences.length > 1) {
        // Keep first N-1 sentences in current segment
        const keepSentences = sentences.slice(0, -1).join(' ');
        const moveSentence = sentences[sentences.length - 1];
        
        currentSegment.content[currentSegment.content.length - 1] = keepSentences;
        currentSegment.endPos = totalPos - moveSentence.length;
        segments.push(currentSegment);
        
        // Start new segment with moved sentence
        segmentNum++;
        currentSegment = {
          title: `${title} - Phần ${segmentNum}`,
          startPos: totalPos - moveSentence.length,
          endPos: 0,
          content: [moveSentence + ' ' + para],
          sentences: []
        };
        currentSize = moveSentence.length + paraSize;
      } else {
        // No good break point, just split here
        currentSegment.endPos = totalPos;
        segments.push(currentSegment);
        
        segmentNum++;
        currentSegment = {
          title: `${title} - Phần ${segmentNum}`,
          startPos: totalPos,
          endPos: 0,
          content: [para],
          sentences: []
        };
        currentSize = paraSize;
      }
    } else {
      currentSegment.content.push(para);
      currentSize += paraSize;
    }
    
    totalPos += paraSize + 2; // +2 for \n\n
    
    // Max 8 segments
    if (segmentNum >= 8) break;
  }

  // Add last segment
  if (currentSegment.content.length > 0) {
    currentSegment.endPos = text.length;
    segments.push(currentSegment);
  }

  console.log(`[SmartChunk] Created ${segments.length} segments with sentence-boundary awareness`);

  return {
    detected: false,
    segments: segments.map(seg => ({
      title: seg.title,
      startPos: seg.startPos,
      endPos: seg.endPos
    })),
    totalSegments: segments.length
  };
}

// Helper: Split by common heading patterns
function splitByHeadings(text) {
  const headingPatterns = [
    /^#{1,3}\s+(.+)$/gm,           // Markdown headings
    /^([A-Z][A-Z\s]{10,})$/gm,     // ALL CAPS headings
    /^(\d+\.\s+[A-Z].+)$/gm,       // 1. Numbered headings
    /^([IVXLCDM]+\.\s+.+)$/gm      // I. Roman numeral headings
  ];
  
  const matches = [];
  
  for (const pattern of headingPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        title: match[1] || match[0],
        index: match.index
      });
    }
  }
  
  // Sort by index and create segments
  matches.sort((a, b) => a.index - b.index);
  
  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length;
    segments.push({
      title: matches[i].title,
      startPos: start,
      endPos: end
    });
  }
  
  return segments;
}

function formatSegments(segments, title) {
  return {
    detected: true,
    segments: segments.map((seg, idx) => ({
      title: seg.title || `${title} - Phần ${idx + 1}`,
      startPos: seg.startPos,
      endPos: seg.endPos
    })),
    totalSegments: segments.length
  };
}

// ✅ ADAPTIVE BATCH SIZE (2-5 chunks based on complexity)
async function batchSummarizeDocument({ text, documentTitle, mode, structureMap }) {
  const modeInstructions = {
    quick: 'Tóm tắt NHANH: 3-5 ý chính, mỗi ý <20 từ',
    study: 'Tóm tắt CHI TIẾT: Phân tích khái niệm + ví dụ',
    exam: 'Tóm tắt ÔN THI: Điểm hay thi + dễ nhầm + câu hỏi'
  };

  const segments = structureMap.segments;
  const allLessons = [];
  
  // ✅ DYNAMIC BATCH SIZE (không rule cứng)
  function calculateDynamicBatchSize(segments, mode) {
    const MODEL_CONTEXT_LIMIT = 30000; // Gemini 3.7 Flash effective limit (~7500 tokens)
    const INSTRUCTION_OVERHEAD = {
      quick: 200,   // Simple instruction
      study: 400,   // Medium complexity
      exam: 500     // High complexity (nhiều yêu cầu)
    };
    
    // Calculate average chunk metrics
    const avgChunkSize = segments.reduce((sum, seg) => 
      sum + (seg.endPos - seg.startPos), 0) / segments.length;
    const avgTokens = Math.ceil(avgChunkSize / 4); // Vietnamese: ~4 chars/token
    
    // Language density factor (Vietnamese đặc)
    const VIETNAMESE_DENSITY = 1.3; // VN docs "nặng" hơn English
    const effectiveTokens = avgTokens * VIETNAMESE_DENSITY;
    
    // Instruction complexity
    const instructionCost = INSTRUCTION_OVERHEAD[mode] || 300;
    
    // Calculate optimal batch size dynamically
    let optimalBatchSize = 3; // Default
    const tokensPerChunk = effectiveTokens + (instructionCost / segments.length);
    
    // Dynamic calculation
    const maxChunksPerBatch = Math.floor(
      (MODEL_CONTEXT_LIMIT - instructionCost) / tokensPerChunk
    );
    
    optimalBatchSize = Math.max(2, Math.min(maxChunksPerBatch, 5));
    
    // Adjust for structure stability
    const hasStableStructure = structureMap.quality?.structure === 1.0;
    if (!hasStableStructure) {
      optimalBatchSize = Math.max(2, optimalBatchSize - 1); // More conservative
    }
    
    console.log(`[Dynamic] Calculated batch size: ${optimalBatchSize} (tokens/chunk: ${Math.round(tokensPerChunk)}, mode: ${mode}, stable: ${hasStableStructure})`);
    
    return optimalBatchSize;
  }

  const CHUNKS_PER_BATCH = calculateDynamicBatchSize(segments, mode);
  
  const batches = [];
  for (let i = 0; i < segments.length; i += CHUNKS_PER_BATCH) {
    batches.push(segments.slice(i, i + CHUNKS_PER_BATCH));
  }

  console.log(`[Batch] Processing ${segments.length} segments in ${batches.length} adaptive batches`);

  // Process each batch with INDEXED chunks
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    
    // ✅ CHUNK INDEXING (critical for output mapping)
    const indexedChunks = batch.map((seg, idx) => {
      const content = text.slice(seg.startPos, seg.endPos);
      return {
        id: batchIdx * CHUNKS_PER_BATCH + idx + 1,
        title: seg.title,
        content: content.slice(0, 3000),
        contentLength: content.length
      };
    });

    const prompt = `Bạn là AI tóm tắt chuyên nghiệp. Bạn sẽ nhận ${batch.length} đoạn tài liệu ĐÃ ĐƯỢC ĐÁNH SỐ.

NHIỆM VỤ:
- Tóm tắt TỪNG ĐOẠN riêng biệt theo đúng ID
- KHÔNG gộp nội dung giữa các đoạn
- Trả về JSON array với ID tương ứng
- ${modeInstructions[mode]}

${indexedChunks.map(chunk => `
═══ ĐOẠN ID=${chunk.id}: ${chunk.title} ═══
${chunk.content}
${chunk.contentLength > 3000 ? `\n...[còn ${chunk.contentLength - 3000} ký tự]` : ''}
`).join('\n')}

Trả về JSON array (${batch.length} phần tử, BẮT BUỘC có field "id"):
[
  {
    "id": ${indexedChunks[0].id},
    "title": "${indexedChunks[0].title}",
    "mainPoints": ["ý 1", "ý 2", ...],
    "keywords": ["từ khóa 1", ...],
    "pitfalls": ["lỗi dễ gặp 1", ...],
    "quickQuestions": ["câu hỏi 1?", ...]
  }
  ${indexedChunks.length > 1 ? ', ...' : ''}
]

QUY TẮC QUAN TRỌNG:
- PHẢI có field "id" để map chính xác
- CHỈ dùng thông tin từ văn bản nguồn
- KHÔNG thêm kiến thức ngoài
- Mỗi đoạn độc lập, không tham chiếu đoạn khác`;

    try {
      const batchResult = await callGeminiBatch(prompt);
      
      // ✅ VALIDATE with ID matching
      if (Array.isArray(batchResult) && batchResult.length === batch.length) {
        // Check if IDs match
        const idsMatch = batchResult.every((item, idx) => 
          item.id === indexedChunks[idx].id
        );
        
        if (!idsMatch) {
          console.warn(`[Batch ${batchIdx}] ID mismatch detected, re-mapping by index`);
        }

        batchResult.forEach((summary, idx) => {
          allLessons.push({
            id: indexedChunks[idx].id,
            title: indexedChunks[idx].title,
            summary: {
              mainPoints: Array.isArray(summary.mainPoints) ? summary.mainPoints.slice(0, 8) : [],
              keywords: Array.isArray(summary.keywords) ? summary.keywords.slice(0, 12) : [],
              pitfalls: Array.isArray(summary.pitfalls) ? summary.pitfalls.slice(0, 6) : [],
              quickQuestions: Array.isArray(summary.quickQuestions) ? summary.quickQuestions.slice(0, 3) : []
            }
          });
        });
      } else {
        console.warn(`[Batch ${batchIdx}] Invalid result length (expected ${batch.length}, got ${batchResult?.length})`);
      }
    } catch (err) {
      console.error(`[Batch ${batchIdx}] Failed:`, err);
    }
  }

  // ✅ CALL 3: GLOBAL + CHAPTER AGGREGATION (1 gọi duy nhất)
  const aggregationResult = await aggregateAllSummaries(allLessons, documentTitle, mode);

  return {
    chapters: [{
      title: documentTitle,
      lessons: allLessons,
      aggregatedSummary: aggregationResult.chapterSummary
    }],
    globalSummary: aggregationResult.globalSummary
  };
}

// Helper: Call Gemini for batch
async function callGeminiBatch(prompt) {
  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[(keyIndex++) % GEMINI_KEYS.length];
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json'
            }
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
    } catch (err) {
      console.warn(`[Batch API] Key ${i+1} failed:`, err);
    }
  }
  throw new Error('Batch API failed');
}

// ✅ CALL 3: Aggregate chapter + global (1 API thay vì 2)
async function aggregateAllSummaries(lessons, documentTitle, mode) {
  const allPoints = lessons.flatMap(l => l.summary?.mainPoints || []);
  const allKeywords = [...new Set(lessons.flatMap(l => l.summary?.keywords || []))];

  const prompt = `Từ ${lessons.length} phần tóm tắt của tài liệu "${documentTitle}", hãy tạo:

1. TÓM TẮT CHƯƠNG (5 ý cốt lõi)
2. TÓM TẮT TỔNG THỂ (7 insights cao nhất)

CÁC Ý CHÍNH TỪ CÁC PHẦN:
${allPoints.slice(0, 50).map((p, i) => `${i+1}. ${p}`).join('\n')}

Trả về JSON:
{
  "chapterSummary": {
    "mainPoints": ["ý cốt lõi 1", ...],
    "keywords": ["từ khóa chương", ...]
  },
  "globalSummary": {
    "insights": ["insight toàn tài liệu 1", ...],
    "keywords": ["từ khóa cốt lõi", ...]
  }
}

YÊU CẦU:
- Loại trùng lặp
- Chỉ giữ ý quan trọng nhất
- KHÔNG thêm kiến thức ngoài`;

  try {
    const result = await callGeminiBatch(prompt);
    return {
      chapterSummary: result.chapterSummary || { mainPoints: [], keywords: allKeywords.slice(0, 15) },
      globalSummary: result.globalSummary || { insights: [], keywords: allKeywords.slice(0, 20) }
    };
  } catch (err) {
    console.warn('[Aggregation] Failed, using fallback');
    return {
      chapterSummary: {
        mainPoints: [...new Set(allPoints)].slice(0, 5),
        keywords: allKeywords.slice(0, 15)
      },
      globalSummary: {
        insights: [...new Set(allPoints)].slice(0, 7),
        keywords: allKeywords.slice(0, 20)
      }
    };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  
  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, reason: 'method-not-allowed' });
  }

  if (!allowedRequest(req)) {
    return json(res, 429, { ok: false, reason: 'rate-limited', message: 'Tối đa 3 tài liệu mỗi 5 phút' });
  }

  const { text, documentTitle = 'Tài liệu', mode = 'quick' } = req.body || {};

  // Validation
  if (!text || typeof text !== 'string') {
    return json(res, 400, { ok: false, reason: 'missing-text' });
  }

  if (text.length < 500) {
    return json(res, 400, { ok: false, reason: 'text-too-short', message: 'Tài liệu phải dài ít nhất 500 ký tự' });
  }

  if (text.length > 200_000) {
    return json(res, 400, { ok: false, reason: 'text-too-long', message: 'Tài liệu quá dài (max 200,000 ký tự)' });
  }

  if (!['quick', 'study'].includes(mode)) { // ✅ XÓA 'exam'
    return json(res, 400, { ok: false, reason: 'invalid-mode' });
  }

  try {
    const result = await processDocumentOptimized({
      text,
      documentTitle,
      mode
    });

    return json(res, 200, {
      ok: true,
      result
    });
  } catch (error) {
    console.error('[Document Summary API] Error:', error);
    return json(res, 500, {
      ok: false,
      reason: 'processing-failed',
      message: error.message || 'Lỗi xử lý tài liệu'
    });
  }
};
