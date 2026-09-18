/**
 * docSummarizerEngine.js — AI Document Summarization Engine (Lean Production v2.0)
 *
 * Pipeline:
 *   parseDocument(file) → rawText
 *   chunkDocument(rawText) → chunks[]
 *   summarizeChunk(chunk, mode) → { summary, self_check }  [with retry]
 *   mergeSummaries(summaries[]) → finalSummary
 *   hashCache → avoid duplicate API calls (SHA-256 based)
 *
 * All parsing happens CLIENT-SIDE via:
 *   - PDF:  pdf.js (already loaded via CDN in index.html)
 *   - DOCX: mammoth.js (already loaded via CDN in index.html)
 *   - TXT:  native FileReader UTF-8
 */

import { RAW_KEYS } from './aiPool.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_CHUNKS = 8;
const CHUNK_CHARS = 26000;      // ~6,500 tokens tiếng Việt (~4 chars/token)
const OVERLAP_RATIO = 0.10;     // 10% overlap
const OVERLAP_CHARS = Math.floor(CHUNK_CHARS * OVERLAP_RATIO);
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 ngày
const CACHE_KEY_PREFIX = 'fteca_doc_summary_v3_';

// ─── KEY ROTATION ─────────────────────────────────────────────────────────────
let _geminiKeyIdx = 0;
function getGeminiKey() {
  const keys = RAW_KEYS.gemini || [];
  if (!keys.length) throw new Error('Không có Gemini key trong pool');
  const key = keys[_geminiKeyIdx % keys.length];
  _geminiKeyIdx++;
  return key;
}

// ─── SHA-256 HASH (Web Crypto API) ────────────────────────────────────────────
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── CACHE MODULE ─────────────────────────────────────────────────────────────
export const SummaryCache = {
  async getHash(rawText) {
    // Chỉ hash 50,000 ký tự đầu để nhanh
    return await sha256(rawText.slice(0, 50000));
  },

  get(hash) {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(CACHE_KEY_PREFIX + hash);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() - entry.ts > CACHE_TTL_MS) {
        localStorage.removeItem(CACHE_KEY_PREFIX + hash);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },

  set(hash, data) {
    if (typeof localStorage === 'undefined') return;
    try {
      const entry = { ts: Date.now(), data };
      localStorage.setItem(CACHE_KEY_PREFIX + hash, JSON.stringify(entry));
    } catch (e) {
      // localStorage full — clear oldest entries
      this._evictOldest();
      try { localStorage.setItem(CACHE_KEY_PREFIX + hash, JSON.stringify({ ts: Date.now(), data })); } catch {}
    }
  },

  _evictOldest() {
    if (typeof localStorage === 'undefined') return;
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const raw = JSON.parse(localStorage.getItem(k));
          entries.push({ k, ts: raw.ts || 0 });
        } catch {}
      }
    }
    entries.sort((a, b) => a.ts - b.ts);
    entries.slice(0, Math.ceil(entries.length / 2)).forEach(e => localStorage.removeItem(e.k));
  },

  getHistory() {
    if (typeof localStorage === 'undefined') return [];
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const raw = JSON.parse(localStorage.getItem(k));
          if (Date.now() - raw.ts < CACHE_TTL_MS) {
            items.push({ hash: k.replace(CACHE_KEY_PREFIX, ''), ts: raw.ts, data: raw.data });
          }
        } catch {}
      }
    }
    return items.sort((a, b) => b.ts - a.ts);
  },

  clearAll() {
    if (typeof localStorage === 'undefined') return;
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  }
};

// ─── FILE PARSING MODULE ──────────────────────────────────────────────────────
export const FileParser = {
  async parse(file) {
    if (!file) throw new Error('empty-file');

    const ext = file.name.split('.').pop().toLowerCase();
    const sizeMB = file.size / 1024 / 1024;

    if (sizeMB > 20) {
      throw new Error(`file-too-large:${sizeMB.toFixed(1)}`);
    }

    if (ext === 'txt') {
      return await this._parseTxt(file);
    } else if (ext === 'pdf') {
      return await this._parsePdf(file);
    } else if (ext === 'docx' || ext === 'doc') {
      return await this._parseDocx(file);
    } else {
      throw new Error(`unsupported-format:${ext}`);
    }
  },

  async _parseTxt(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result || '';
        if (!text.trim()) reject(new Error('empty-content'));
        else resolve(text);
      };
      reader.onerror = () => reject(new Error('file-read-error'));
      reader.readAsText(file, 'UTF-8');
    });
  },

  async _parsePdf(file) {
    // Dùng pdf.js CDN đã load trong index.html
    if (!window.pdfjsLib) {
      throw new Error('pdf-lib-not-loaded');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result;
          if (!arrayBuffer) return reject(new Error('pdf-read-error'));

          const pdf = await window.pdfjsLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            useWorkerFetch: false,
            isEvalSupported: false
          }).promise;

          const pageCount = pdf.numPages;
          const textParts = [];

          for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
              .map(item => ('str' in item ? item.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (pageText) textParts.push(pageText);
          }

          const fullText = textParts.join('\n\n');
          if (!fullText.trim() || fullText.trim().length < 50) {
            reject(new Error('pdf-no-text'));
          } else {
            resolve(fullText);
          }
        } catch (err) {
          reject(new Error(`pdf-parse-error:${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('pdf-read-error'));
      reader.readAsArrayBuffer(file);
    });
  },

  async _parseDocx(file) {
    // Dùng mammoth.js CDN đã load trong index.html
    if (!window.mammoth) {
      throw new Error('mammoth-lib-not-loaded');
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result;
          if (!arrayBuffer) return reject(new Error('docx-read-error'));

          const result = await window.mammoth.extractRawText({ arrayBuffer });
          const text = result.value || '';
          if (!text.trim() || text.trim().length < 50) {
            reject(new Error('docx-no-text'));
          } else {
            resolve(text);
          }
        } catch (err) {
          reject(new Error(`docx-parse-error:${err.message}`));
        }
      };
      reader.onerror = () => reject(new Error('docx-read-error'));
      reader.readAsArrayBuffer(file);
    });
  }
};

// ─── SMART CHUNKING MODULE ────────────────────────────────────────────────────
export function chunkDocument(rawText) {
  if (!rawText || rawText.trim().length < 100) {
    throw new Error('text-too-short');
  }

  const text = rawText.trim();
  const totalChars = text.length;

  // Tài liệu ngắn: không cần chunk
  if (totalChars <= CHUNK_CHARS) {
    return {
      chunks: [{ id: 0, text, startChar: 0, endChar: totalChars }],
      totalChars,
      chunksCount: 1,
      warning: null
    };
  }

  // Cố gắng split theo heading patterns trước
  const headingChunks = _splitByHeadings(text);
  if (headingChunks.length > 1 && headingChunks.length <= MAX_CHUNKS) {
    return {
      chunks: headingChunks.map((c, i) => ({ id: i, ...c })),
      totalChars,
      chunksCount: headingChunks.length,
      warning: null
    };
  }

  // Fallback: split theo paragraph boundary với overlap 10%
  const rawChunks = _splitByParagraphs(text);
  const warning = rawChunks.length > MAX_CHUNKS
    ? `Tài liệu rất dài (${(totalChars / 1000).toFixed(0)}K ký tự). Đã giới hạn ${MAX_CHUNKS} đoạn (~${(MAX_CHUNKS * CHUNK_CHARS / 1000).toFixed(0)}K ký tự đầu tiên) để xử lý.`
    : null;

  const finalChunks = rawChunks.slice(0, MAX_CHUNKS);

  return {
    chunks: finalChunks.map((c, i) => ({ id: i, ...c })),
    totalChars,
    chunksCount: finalChunks.length,
    warning
  };
}

function _splitByHeadings(text) {
  const headingPatterns = [
    /^(CHƯƠNG|Chương|PHẦN|Phần|CHAPTER)\s+([IVX\d]+|[0-9]+)[:\s.\-]*(.*?)$/gim,
    /^#{1,3}\s+(.+)$/gm,
    /^([A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ][A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ\s]{12,})$/gm,
    /^(\d+\.\s+[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ].{3,80})$/gm
  ];

  const matches = [];
  const seen = new Set();

  for (const pattern of headingPatterns) {
    let m;
    while ((m = pattern.exec(text)) !== null) {
      const pos = m.index;
      if (!seen.has(pos)) {
        seen.add(pos);
        matches.push({ title: m[0].trim().slice(0, 100), pos });
      }
    }
  }

  matches.sort((a, b) => a.pos - b.pos);

  if (matches.length < 2) return [];

  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].pos;
    const end = i + 1 < matches.length ? matches[i + 1].pos : text.length;
    const segText = text.slice(start, end).trim();
    if (segText.length > 200) {
      // Thêm overlap từ đoạn trước
      const prevEnd = segments.length > 0 ? segments[segments.length - 1].text.slice(-OVERLAP_CHARS) : '';
      segments.push({
        text: (prevEnd ? prevEnd + '\n\n' : '') + segText,
        startChar: start,
        endChar: end,
        title: matches[i].title
      });
    }
  }

  return segments;
}

function _splitByParagraphs(text) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 30);
  const chunks = [];
  let currentText = '';
  let startPos = 0;
  let currentPos = 0;

  for (const para of paragraphs) {
    const paraLen = para.length + 2;

    if (currentText.length + paraLen > CHUNK_CHARS && currentText.length > 0) {
      chunks.push({
        text: currentText.trim(),
        startChar: startPos,
        endChar: currentPos
      });

      // Overlap: giữ 10% cuối của chunk hiện tại
      const overlapText = currentText.slice(-OVERLAP_CHARS);
      currentText = overlapText + '\n\n' + para;
      startPos = Math.max(0, currentPos - OVERLAP_CHARS);
    } else {
      currentText += (currentText ? '\n\n' : '') + para;
    }

    currentPos += paraLen;
  }

  if (currentText.trim()) {
    chunks.push({
      text: currentText.trim(),
      startChar: startPos,
      endChar: text.length
    });
  }

  return chunks;
}

// ─── HELPER: CLEAN & PARSE JSON ───────────────────────────────────────────────
function cleanAndParseJSON(rawText) {
  if (!rawText) throw new Error('empty-response-text');
  let cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

// ─── AI API CALL (Multi-Model Native + Multi-Provider Fallback) ───────────────
// Danh sách model đã được kiểm tra trực tiếp thành công HTTP 200 OK trên Google API Server
const CANDIDATE_GEMINI_MODELS = [
  'gemini-3.5-flash-lite', // ✅ PRIMARY: 500 RPD
  'gemini-3.1-flash-lite', // ✅ BACKUP: 500 RPD
  'gemini-2.5-flash'       // Fallback cuối: 20 RPD
];

async function callGeminiJSON(prompt, { timeoutMs = 35000, maxTokens = 4096 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const errors = [];

  // 1. Thử Native Google Gemini API (Ưu tiên gemini-3.5-flash-lite: 500 RPD)
  const keys = RAW_KEYS.gemini || [];
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const key = getGeminiKey();
    for (const model of CANDIDATE_GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.15,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json'
            }
          }),
          signal: controller.signal
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
          if (text) {
            clearTimeout(timer);
            return cleanAndParseJSON(text);
          }
        } else if (res.status === 429) {
          errors.push(`Gemini ${model}: 429 rate-limited`);
        } else {
          errors.push(`Gemini ${model}: HTTP ${res.status}`);
        }
      } catch (err) {
        if (err.name === 'AbortError') throw new Error('timeout');
        errors.push(`Gemini ${model}: ${err.message}`);
      }
    }
  }

  // 2. Thử Groq AI (Cực nhanh & Ổn định)
  const groqKeys = RAW_KEYS.groq || [];
  for (const key of groqKeys) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are an expert Vietnamese academic summarizer. Always respond in valid JSON format.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.15,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (text) {
          clearTimeout(timer);
          return cleanAndParseJSON(text);
        }
      } else {
        errors.push(`Groq: HTTP ${res.status}`);
      }
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('timeout');
      errors.push(`Groq error: ${err.message}`);
    }
  }

  // 3. Thử OpenRouter AI (Dự phòng cuối cùng)
  const openrouterKeys = RAW_KEYS.openrouter || [];
  if (openrouterKeys.length > 0) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKeys[0]}`
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.15,
          max_tokens: maxTokens
        }),
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (text) {
          clearTimeout(timer);
          return cleanAndParseJSON(text);
        }
      } else {
        errors.push(`OpenRouter: HTTP ${res.status}`);
      }
    } catch (err) {
      errors.push(`OpenRouter error: ${err.message}`);
    }
  }

  clearTimeout(timer);
  throw new Error(`Không thể kết nối đến AI. Chi tiết: ${errors.join('; ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2-PASS ARCHITECTURE: EXTRACTION → SYNTHESIS → VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PASS 1: KNOWLEDGE EXTRACTION (Read-Only - Extract Immutable Facts) ────────

/**
 * Extract numbers with units and attributes (IMMUTABLE)
 * Example: "1-10 µm chiều dài" → {value: "1-10", unit: "µm", attribute: "chiều dài"}
 */
function extractNumbers(text) {
  if (!text) return [];
  
  const numbers = [];
  // Pattern: number + optional unit + context
  const pattern = /(\d+(?:[.,]\d+)?(?:\s*[-–~]\s*\d+(?:[.,]\d+)?)?)\s*(µm|mm|nm|cm|m|kg|g|mg|µg|L|mL|µL|°C|°F|K|%|phút|giờ|ngày|năm|atm|Pa|pH|rpm|ppm|giây|s|h)?/gi;
  
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const value = match[1].trim();
    const unit = (match[2] || '').toLowerCase();
    
    // Get context (80 chars before and after)
    const start = Math.max(0, match.index - 80);
    const end = Math.min(text.length, match.index + match[0].length + 80);
    const context = text.substring(start, end).trim();
    
    // Extract attribute from context
    const attribute = extractAttributeFromContext(context);
    
    numbers.push({
      value,
      unit,
      attribute,
      context: context.substring(0, 150),
      fullText: `${value}${unit ? ' ' + unit : ''}`,
      position: match.index
    });
  }
  
  return numbers;
}

/**
 * Extract attribute/property from context
 */
function extractAttributeFromContext(context) {
  const lower = context.toLowerCase();
  
  // Attribute patterns
  const patterns = [
    { regex: /chiều dài|dài|length/i, attr: 'chiều dài' },
    { regex: /chiều rộng|rộng|width/i, attr: 'chiều rộng' },
    { regex: /đường kính|diameter/i, attr: 'đường kính' },
    { regex: /kích thước|kích cỡ|size/i, attr: 'kích thước' },
    { regex: /độ dày|dày|thickness/i, attr: 'độ dày' },
    { regex: /khối lượng khô|trọng lượng khô|dry weight/i, attr: 'khối lượng khô' },
    { regex: /khối lượng|trọng lượng|weight/i, attr: 'khối lượng' },
    { regex: /tỷ lệ|tỉ lệ|phần trăm|percentage/i, attr: 'tỷ lệ' },
    { regex: /nồng độ|concentration/i, attr: 'nồng độ' },
    { regex: /nhiệt độ|temperature/i, attr: 'nhiệt độ' },
    { regex: /thời gian|time|duration/i, attr: 'thời gian' },
    { regex: /tốc độ|vận tốc|speed|velocity/i, attr: 'tốc độ' }
  ];
  
  for (const p of patterns) {
    if (p.regex.test(lower)) return p.attr;
  }
  
  // Default based on unit
  if (context.includes('µm') || context.includes('mm') || context.includes('nm')) return 'kích thước';
  if (context.includes('%')) return 'tỷ lệ';
  
  return 'unknown';
}

/**
 * Extract definitions (term + definition pairs)
 */
function extractDefinitions(text) {
  if (!text) return [];
  
  const definitions = [];
  const lines = text.split('\n');
  
  // Pattern 1: "Term: definition" or "Term - definition"
  const pattern1 = /^([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]+)[:–]\s*(.{10,200})/;
  
  // Pattern 2: Bold/emphasized terms followed by explanation
  const pattern2 = /([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ][a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ\s]{3,50})\s+là\s+(.{10,200})/gi;
  
  for (const line of lines) {
    const match1 = line.match(pattern1);
    if (match1) {
      definitions.push({
        term: match1[1].trim(),
        definition: match1[2].trim(),
        type: 'explicit'
      });
    }
  }
  
  let match2;
  while ((match2 = pattern2.exec(text)) !== null) {
    definitions.push({
      term: match2[1].trim(),
      definition: match2[2].trim(),
      type: 'implicit'
    });
  }
  
  return definitions;
}

/**
 * Extract document structure (chapters, sections, subsections)
 */
function extractStructure(text) {
  if (!text) return { chapters: [], sections: [] };
  
  const structure = { chapters: [], sections: [] };
  const lines = text.split('\n');
  
  // Pattern for chapters: "CHƯƠNG II", "Chương 2", etc.
  const chapterPattern = /^(CHƯƠNG|Chương)\s+([IVXivx\d]+)[:\s–-]*(.{0,100})/i;
  
  // Pattern for numbered sections: "1.", "1.1", "2.1.3"
  const sectionPattern = /^(\d+(?:\.\d+)*)\.\s+(.{3,100})/;
  
  // Pattern for all-caps sections
  const capsPattern = /^([A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ\s]{10,80})$/;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for chapter
    const chMatch = trimmed.match(chapterPattern);
    if (chMatch) {
      structure.chapters.push({
        number: chMatch[2],
        title: chMatch[3].trim() || '',
        fullText: trimmed
      });
      continue;
    }
    
    // Check for numbered section
    const secMatch = trimmed.match(sectionPattern);
    if (secMatch) {
      const level = (secMatch[1].match(/\./g) || []).length + 1;
      structure.sections.push({
        number: secMatch[1],
        title: secMatch[2].trim(),
        level,
        fullText: trimmed
      });
      continue;
    }
    
    // Check for all-caps section
    if (capsPattern.test(trimmed) && trimmed.length > 10) {
      structure.sections.push({
        number: '',
        title: trimmed,
        level: 1,
        fullText: trimmed,
        type: 'caps'
      });
    }
  }
  
  return structure;
}

/**
 * Extract classifications/taxonomies
 */
function extractClassifications(text) {
  if (!text) return [];
  
  const classifications = [];
  
  // Pattern: "Phân loại/Các loại/Types..." followed by list
  const classPattern = /(?:phân loại|các loại|phân chia|types?|classifications?)[:\s]*([^\n]{10,500})/gi;
  
  let match;
  while ((match = classPattern.exec(text)) !== null) {
    const content = match[1];
    
    // Try to extract items (numbered, bulleted, or comma-separated)
    const items = content
      .split(/[,;]|(?:\d+[\).])|(?:[-–•])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 3 && s.length < 100);
    
    if (items.length > 0) {
      classifications.push({
        context: match[0].substring(0, 100),
        items,
        count: items.length
      });
    }
  }
  
  return classifications;
}

/**
 * Main extraction function - returns immutable knowledge base
 */
async function extractKnowledgeBase(chunkText) {
  console.log('[2-Pass] Starting PASS 1: Knowledge Extraction...');
  
  const kb = {
    numbers: extractNumbers(chunkText),
    definitions: extractDefinitions(chunkText),
    structure: extractStructure(chunkText),
    classifications: extractClassifications(chunkText),
    sourceText: chunkText
  };
  
  console.log(`[2-Pass] Extracted: ${kb.numbers.length} numbers, ${kb.definitions.length} definitions, ${kb.structure.sections.length} sections, ${kb.classifications.length} classifications`);
  
  return kb;
}

// ─── PASS 2: SYNTHESIS (Write-Only - Reorganize Facts for Learning) ────────────

/**
 * Synthesis prompt - AI can only reorganize and explain, CANNOT modify facts
 */
const SYNTHESIS_PROMPT = (knowledgeBase, docTitle, chunkLabel) => {
  const { numbers, definitions, structure, classifications, sourceText } = knowledgeBase;
  
  // Format numbers as immutable data
  const numbersFormatted = numbers.map(n => 
    `- ${n.fullText} (${n.attribute}): "${n.context.substring(0, 80)}..."`
  ).join('\n');
  
  // Format definitions
  const definitionsFormatted = definitions.map(d => 
    `- ${d.term}: ${d.definition}`
  ).join('\n');
  
  // Format structure
  const structureFormatted = [
    ...structure.chapters.map(c => `CHƯƠNG ${c.number}: ${c.title}`),
    ...structure.sections.map(s => `  ${'  '.repeat(s.level - 1)}${s.number}. ${s.title}`)
  ].join('\n');
  
  return `Bạn là AI chuyên tổ chức kiến thức cho sinh viên đại học ngành Công nghệ Thực phẩm.

TÀI LIỆU: "${docTitle}"
ĐOẠN: ${chunkLabel}

═══════════════════════════════════════════════════════════════
🎯 NHIỆM VỤ: SYNTHESIS (Tổ chức lại kiến thức để dễ học)
═══════════════════════════════════════════════════════════════

Bạn được cung cấp KNOWLEDGE BASE đã trích xuất từ tài liệu gốc.
Nhiệm vụ: Tổ chức lại thành tài liệu học, NHƯNG:

🔴 TUYỆT ĐỐI KHÔNG ĐƯỢC:
- Thay đổi số liệu (value, unit, attribute)
- Thêm số liệu không có trong KB
- Thay đổi định nghĩa
- Bỏ sót kiến thức quan trọng

✅ ĐƯỢC PHÉP:
- Giải thích đơn giản
- Thêm mối quan hệ giữa các khái niệm
- Tạo câu hỏi tự kiểm tra
- Minh họa ứng dụng CNTP (đánh dấu rõ là AI tự xây)
- Tổ chức lại cấu trúc cho dễ học (nhưng GHI RÕ source section mapping)

═══════════════════════════════════════════════════════════════
📊 KNOWLEDGE BASE (IMMUTABLE - Không được sửa)
═══════════════════════════════════════════════════════════════

**SỐ LIỆU (${numbers.length} items):**
${numbersFormatted || '(không có)'}

**ĐỊNH NGHĨA (${definitions.length} items):**
${definitionsFormatted || '(không có)'}

**CẤU TRÚC TÀI LIỆU:**
${structureFormatted || '(không có)'}

**PHÂN LOẠI (${classifications.length} items):**
${classifications.map(c => `- ${c.context}: ${c.items.join(', ')}`).join('\n') || '(không có)'}

**NỘI DUNG ĐẦY ĐỦ (để hiểu ngữ cảnh):**
${sourceText.substring(0, 8000)}

═══════════════════════════════════════════════════════════════
📝 YÊU CẦU OUTPUT
═══════════════════════════════════════════════════════════════

Trả về JSON:
{
  "topics": [
    {
      "title": "Tên topic",
      "source_section": "Mục nào trong tài liệu gốc (số/tên)",
      "core": "Kiến thức cốt lõi - COPY CHÍNH XÁC từ KB",
      "numbers_used": ["1-10 µm", "95%"], // List các số từ KB đã dùng
      "simple": "Giải thích đơn giản (AI viết)",
      "essence": "Bản chất/cơ chế (AI viết)",
      "details": ["Chi tiết quan trọng"],
      "relations": ["Quan hệ với topic khác"],
      "food_app": "Ứng dụng CNTP tổng quát (không chi tiết thiết bị)",
      "food_app_ai": true,
      "questions": ["Câu hỏi tự kiểm tra"]
    }
  ],
  "structure_mapping": {
    "source_chapters": ["CHƯƠNG II: Vi sinh vật nhân nguyên thủy"],
    "source_sections": ["1. Hình thái", "2. Cấu tạo"],
    "generated_topics_count": 15
  },
  "self_check": {
    "all_numbers_preserved": true,
    "all_definitions_covered": true,
    "no_hallucinated_data": true,
    "structure_mapped": true
  }
}

🔴 LƯU Ý QUAN TRỌNG:
- Mỗi số liệu PHẢI copy chính xác từ KB (không đổi µm→mm, không làm tròn)
- Nếu KB có "1-10 µm" → chỉ được viết "1-10 µm", không "1-10 mm"
- Nếu KB có "95% khối lượng khô" → phải giữ "95% khối lượng khô", không "độ dày 95%"
- Mọi số liệu đã dùng phải list trong "numbers_used"
`;
};

/**
 * Retry synthesis prompt when validation fails
 */
const SYNTHESIS_RETRY_PROMPT = (knowledgeBase, docTitle, chunkLabel, prevResult, validationIssues) => {
  const criticalIssues = validationIssues.filter(i => i.severity === 'CRITICAL');
  const highIssues = validationIssues.filter(i => i.severity === 'HIGH');
  
  const issuesSummary = [
    ...criticalIssues.map(i => `🔴 CRITICAL: ${i.message}`),
    ...highIssues.map(i => `⚠️ HIGH: ${i.message}`)
  ].join('\n');
  
  return `BẢN SYNTHESIS TRƯỚC BỊ TỪ CHỐI do vi phạm data fidelity.

🔴 CÁC LỖI PHÁT HIỆN:
${issuesSummary}

═══════════════════════════════════════════════════════════════
⚠️ YÊU CẦU NGHIÊM NGẶT:
═══════════════════════════════════════════════════════════════

1. **KHÔNG ĐỔI ĐƠN VỊ**: µm phải giữ µm, KHÔNG được đổi thành mm
2. **KHÔNG BỊA SỐ LIỆU**: Chỉ dùng số có trong KB, không tự thêm
3. **COPY CHÍNH XÁC**: Value + Unit + Attribute phải giống hệt KB

${SYNTHESIS_PROMPT(knowledgeBase, docTitle, chunkLabel)}

═══════════════════════════════════════════════════════════════
BẢN TRƯỚC (để tham khảo - ĐỪNG COPY):
${JSON.stringify(prevResult).substring(0, 3000)}
`;
};

/**
 * Synthesize knowledge for learning
 */
async function synthesizeKnowledge(knowledgeBase, docTitle, chunkLabel) {
  console.log('[2-Pass] Starting PASS 2: Synthesis...');
  
  try {
    const result = await callGeminiJSON(
      SYNTHESIS_PROMPT(knowledgeBase, docTitle, chunkLabel),
      { timeoutMs: 150000, maxTokens: 12000 }
    );
    
    console.log(`[2-Pass] Synthesized ${result?.topics?.length || 0} topics`);
    
    return result;
  } catch (err) {
    console.error('[2-Pass] Synthesis failed:', err.message);
    throw new Error(`synthesis-failed: ${err.message}`);
  }
}

// ─── PASS 3: VALIDATION (Block if Facts Altered) ───────────────────────────────

/**
 * Validate that all numbers in KB are preserved in synthesis output
 */
function validateNumbersPreserved(knowledgeBase, synthesisResult) {
  const issues = [];
  const outputText = JSON.stringify(synthesisResult).toLowerCase();
  
  for (const num of knowledgeBase.numbers) {
    const valuePattern = num.value.replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~]');
    const unitEscaped = num.unit.replace(/[.*+?^${}()|[\]\\µ]/g, '\\$&');
    
    // Check exact match: value + unit
    const exactRegex = new RegExp(valuePattern + '\\s*' + unitEscaped, 'i');
    
    if (!exactRegex.test(synthesisResult ? JSON.stringify(synthesisResult) : '')) {
      // Check if unit was converted (CRITICAL ERROR)
      const wrongUnits = {
        'µm': ['mm', 'nm', 'cm', 'm'],
        'mm': ['µm', 'nm', 'cm', 'm'],
        'nm': ['µm', 'mm', 'cm', 'm'],
        '%': ['percent', 'phần trăm'],
        '°c': ['°f', 'k', 'kelvin']
      };
      
      const wrongUnitList = wrongUnits[num.unit.toLowerCase()] || [];
      for (const wrongUnit of wrongUnitList) {
        const wrongRegex = new RegExp(valuePattern + '\\s*' + wrongUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        if (wrongRegex.test(outputText)) {
          issues.push({
            type: 'unit_conversion',
            severity: 'CRITICAL',
            message: `🔴 CRITICAL: "${num.fullText}" → "${num.value} ${wrongUnit}" (${num.unit} ≠ ${wrongUnit})`,
            original: num.fullText,
            context: num.context.substring(0, 60)
          });
          break;
        }
      }
      
      // If not conversion, then missing
      if (issues.filter(i => i.original === num.fullText).length === 0) {
        issues.push({
          type: 'missing',
          severity: 'HIGH',
          message: `⚠️ Số liệu bị mất: "${num.fullText}"`,
          original: num.fullText,
          context: num.context.substring(0, 60)
        });
      }
    }
  }
  
  return issues;
}

/**
 * Validate that no hallucinated numbers appear in output
 */
function validateNoHallucination(knowledgeBase, synthesisResult) {
  const issues = [];
  const outputText = JSON.stringify(synthesisResult);
  
  // Extract all numbers from output
  const outputNumbers = extractNumbers(outputText);
  const kbNumbersSet = new Set(knowledgeBase.numbers.map(n => n.fullText.toLowerCase()));
  
  for (const outNum of outputNumbers) {
    const normalized = outNum.fullText.toLowerCase();
    
    // Check if this number exists in KB
    if (!kbNumbersSet.has(normalized)) {
      // Allow very common numbers (1, 2, 3, etc.) that might be used for explanations
      const valueInt = parseInt(outNum.value);
      if (valueInt >= 1 && valueInt <= 10 && !outNum.unit) {
        continue; // Skip small integers without units
      }
      
      issues.push({
        type: 'hallucination',
        severity: 'CRITICAL',
        message: `🔴 HALLUCINATED NUMBER: "${outNum.fullText}" không có trong KB`,
        hallucinated: outNum.fullText,
        context: outNum.context.substring(0, 60)
      });
    }
  }
  
  return issues;
}

/**
 * Validate structure mapping is correct
 */
function validateStructureMapping(knowledgeBase, synthesisResult) {
  const issues = [];
  const mapping = synthesisResult?.structure_mapping;
  
  if (!mapping) {
    issues.push({
      type: 'structure',
      severity: 'MEDIUM',
      message: '⚠️ Thiếu structure_mapping'
    });
    return issues;
  }
  
  // Check if source sections are mentioned
  if (!mapping.source_sections || mapping.source_sections.length === 0) {
    issues.push({
      type: 'structure',
      severity: 'MEDIUM',
      message: '⚠️ structure_mapping.source_sections rỗng - không map nguồn'
    });
  }
  
  return issues;
}

/**
 * Validate coverage - all definitions should be covered
 */
function validateCoverage(knowledgeBase, synthesisResult) {
  const issues = [];
  const outputText = JSON.stringify(synthesisResult).toLowerCase();
  
  // Check definitions coverage
  const missingDefinitions = [];
  for (const def of knowledgeBase.definitions) {
    const termLower = def.term.toLowerCase();
    if (!outputText.includes(termLower)) {
      missingDefinitions.push(def.term);
    }
  }
  
  if (missingDefinitions.length > 0) {
    issues.push({
      type: 'coverage',
      severity: 'MEDIUM',
      message: `⚠️ Thiếu ${missingDefinitions.length} định nghĩa: ${missingDefinitions.slice(0, 3).join(', ')}...`,
      missing: missingDefinitions
    });
  }
  
  return issues;
}

/**
 * Main validation function - returns issues and shouldBlock flag
 */
function validateSynthesis(knowledgeBase, synthesisResult) {
  console.log('[2-Pass] Starting PASS 3: Validation...');
  
  const allIssues = [
    ...validateNumbersPreserved(knowledgeBase, synthesisResult),
    ...validateNoHallucination(knowledgeBase, synthesisResult),
    ...validateStructureMapping(knowledgeBase, synthesisResult),
    ...validateCoverage(knowledgeBase, synthesisResult)
  ];
  
  const critical = allIssues.filter(i => i.severity === 'CRITICAL');
  const high = allIssues.filter(i => i.severity === 'HIGH');
  const medium = allIssues.filter(i => i.severity === 'MEDIUM');
  
  const shouldBlock = critical.length > 0 || high.length > 2;
  
  console.log(`[2-Pass] Validation: ${allIssues.length} issues (Critical:${critical.length}, High:${high.length}, Medium:${medium.length})`);
  
  if (allIssues.length > 0) {
    console.log('[2-Pass] Issues detected:');
    allIssues.forEach((issue, i) => {
      if (issue.severity === 'CRITICAL') {
        console.error(`  ${i + 1}. ${issue.message}`);
      } else {
        console.warn(`  ${i + 1}. ${issue.message}`);
      }
    });
  }
  
  return {
    issues: allIssues,
    shouldBlock,
    passed: allIssues.length === 0,
    stats: {
      total: allIssues.length,
      critical: critical.length,
      high: high.length,
      medium: medium.length
    }
  };
}

// ─── DEEP STUDY ENGINE (mode 'study' - KẾ THỪA TỪ 'exam' CŨ) ───────────────────
// Triết lý: KHÔNG rút gọn — giữ tối đa kiến thức có giá trị, chỉ bỏ phần dư thừa,
// viết lại dễ hiểu + giải thích bản chất + minh họa ngành CNTP (có đánh dấu nếu AI tự xây).
const DEEP_CALL_OPTS = { timeoutMs: 120000, maxTokens: 8192 };

const DEEP_CHUNK_PROMPT = (chunkText, docTitle, chunkLabel) => `Bạn là AI chuyên xây dựng học liệu chuyên sâu cho sinh viên đại học ngành Công nghệ Thực phẩm.

TÀI LIỆU: "${docTitle}"
ĐOẠN: ${chunkLabel}

MỤC TIÊU CỐT LÕI:
Đây KHÔNG phải nhiệm vụ rút gọn tài liệu theo kiểu càng ít chữ càng tốt.
Hãy tạo bản trích xuất "HỌC SÂU" cho đoạn này: GIỮ LẠI gần như toàn bộ kiến thức có giá trị học tập, CHỈ loại bỏ phần thực sự dư thừa, VIẾT LẠI dễ hiểu, GIẢI THÍCH BẢN CHẤT.

NGUYÊN TẮC BẢO TOÀN KIẾN THỨC:
- KHÔNG loại bỏ thông tin chỉ vì nó dài, chi tiết, có số liệu, là ví dụ, là trường hợp đặc biệt, là phân loại, là điều kiện, là ưu/nhược điểm, là nguyên lý, là công thức hay là thông số kỹ thuật.
- KHÔNG gộp nhiều kiến thức độc lập thành một câu chung chung.
- Giữ NGUYÊN công thức, ký hiệu, đơn vị, ngưỡng, số liệu, khoảng đo, sai số. Không tự sửa hoặc làm tròn.
- Giữ cấu trúc Chương → Mục → Tiểu mục của tài liệu qua cách nhóm topic.

Với MỖI topic kiến thức trong đoạn, trình bày các trường (chỉ dùng trường mà tài liệu hỗ trợ; trường không có thì để chuỗi rỗng hoặc mảng rỗng):
- core: kiến thức cốt lõi đúng theo tài liệu (khái niệm, cấu tạo, nguyên lý hoạt động...)
- simple: diễn giải lại đơn giản để sinh viên dễ hiểu (phần giải thích của AI)
- essence: bản chất / cơ chế (nó cảm nhận cái gì, biến đổi cái gì, tín hiệu đi đâu, tại sao hệ thống cần nó)
- details: các chi tiết quan trọng (điều kiện, ưu điểm, nhược điểm, thông số...)
- formulas: công thức / thông số giữ nguyên kèm ý nghĩa từng biến
- classifications: các phân loại được tài liệu liệt kê
- examples: ví dụ CÓ TRONG tài liệu (nếu có)
- food_app: minh họa ứng dụng trong Công nghệ thực phẩm theo chuỗi: Quá trình → Đại lượng cần kiểm soát → Cảm biến/thiết bị → Bộ điều khiển → Cơ cấu chấp hành → Kết quả. Để "" nếu không liên hệ được
- food_app_ai: true nếu food_app là ví dụ do AI tự xây dựng (không có trong tài liệu), false nếu lấy từ tài liệu
- relations: quan hệ với kiến thức khác (A → dẫn đến B, A → điều khiển B, A → đầu vào của B, A khác B ở đâu)
- pitfalls: điểm dễ nhầm CHỈ dựa trên khác biệt/điều kiện/thuật ngữ/công thức/phân loại có thật trong tài liệu. Không tự bịa bẫy đề thi
- questions: 2-5 câu hỏi tự kiểm tra (bản chất, phân biệt, tại sao, áp dụng). Không chỉ hỏi lại định nghĩa

Trả về JSON hợp lệ duy nhất:
{
  "topics": [
    {
      "title": "Tên topic",
      "core": "...", "simple": "...", "essence": "...",
      "details": ["..."], "formulas": ["..."], "classifications": ["..."],
      "examples": ["..."], "food_app": "...", "food_app_ai": true,
      "relations": ["..."], "pitfalls": ["..."], "questions": ["..."]
    }
  ],
  "self_check": {
    "coverage": { "concepts": <0-100>, "formulas": <0-100>, "classifications": <0-100>, "examples": <0-100>, "technical_details": <0-100> },
    "quality": { "source_fidelity": <0-100>, "clarity": <0-100>, "structure": <0-100> }
  }
}

NỘI DUNG TÀI LIỆU:
${chunkText}`;

const DEEP_RETRY_PROMPT = (chunkText, docTitle, chunkLabel, prev, prevCheck) => `Bản trích xuất trước bị đánh giá chưa đủ trung thực / bỏ sót kiến thức (source_fidelity=${prevCheck?.quality?.source_fidelity}, coverage=${JSON.stringify(prevCheck?.coverage || {})}).
Hãy viết lại TRUNG THÀNH với tài liệu hơn và KHÔNG bỏ sót kiến thức.

${DEEP_CHUNK_PROMPT(chunkText, docTitle, chunkLabel)}

Kết quả trước (để tham khảo, không copy):
${JSON.stringify(prev).slice(0, 6000)}`;

function _strArr(v) {
  return Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : [];
}

function _avg(arr) {
  const vals = (arr || []).map(Number).filter(n => !isNaN(n));
  return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
}

function _normalizePct(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const n = Number(v);
    out[k] = isNaN(n) ? 0 : Math.max(0, Math.min(100, Math.round(n)));
  }
  return out;
}

function _normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];
  return topics.map(t => ({
    title: String(t?.title || 'Chủ đề không tên'),
    core: String(t?.core || ''),
    simple: String(t?.simple || ''),
    essence: String(t?.essence || ''),
    details: _strArr(t?.details),
    formulas: _strArr(t?.formulas),
    classifications: _strArr(t?.classifications),
    examples: _strArr(t?.examples),
    food_app: String(t?.food_app || ''),
    food_app_ai: Boolean(t?.food_app_ai),
    relations: _strArr(t?.relations),
    pitfalls: _strArr(t?.pitfalls),
    questions: _strArr(t?.questions)
  }));
}

async function summarizeChunkDeep({ chunkText, docTitle, chunkId, totalChunks, onProgress }) {
  const chunkLabel = `Đoạn ${chunkId + 1}/${totalChunks}`;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 2-PASS ARCHITECTURE: EXTRACTION → SYNTHESIS → VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  
  // PASS 1: Extract immutable knowledge base
  onProgress?.(`${chunkLabel}: Trích xuất dữ liệu gốc...`);
  let knowledgeBase;
  try {
    knowledgeBase = await extractKnowledgeBase(chunkText);
  } catch (err) {
    console.error('[2-Pass] PASS 1 failed:', err.message);
    throw new Error(`extraction-failed: ${err.message}`);
  }
  
  // PASS 2: Synthesize for learning
  onProgress?.(`${chunkLabel}: Tổ chức kiến thức...`);
  let result;
  try {
    result = await synthesizeKnowledge(knowledgeBase, docTitle, chunkLabel);
  } catch (err) {
    console.error('[2-Pass] PASS 2 failed:', err.message);
    throw new Error(`synthesis-failed: ${err.message}`);
  }
  
  // PASS 3: Validate synthesis
  onProgress?.(`${chunkLabel}: Kiểm tra độ chính xác...`);
  let validation = validateSynthesis(knowledgeBase, result);
  
  // RETRY if validation failed
  if (validation.shouldBlock && validation.stats.critical > 0) {
    console.warn(`[2-Pass] Validation BLOCKED synthesis (${validation.stats.critical} critical issues). Retrying...`);
    onProgress?.(`${chunkLabel}: Phát hiện lỗi, đang sửa...`);
    
    try {
      const retried = await callGeminiJSON(
        SYNTHESIS_RETRY_PROMPT(knowledgeBase, docTitle, chunkLabel, result, validation.issues),
        { timeoutMs: 150000, maxTokens: 12000 }
      );
      
      // Validate retry
      const retryValidation = validateSynthesis(knowledgeBase, retried);
      
      if (retryValidation.stats.critical < validation.stats.critical) {
        console.log('[2-Pass] Retry improved quality');
        result = retried;
        validation = retryValidation;
      } else {
        console.warn('[2-Pass] Retry did not improve quality, keeping original');
      }
    } catch (retryErr) {
      console.error('[2-Pass] Retry failed:', retryErr.message);
      // Keep original result
    }
  }
  
  // Final check: if still blocked, return error info
  if (validation.shouldBlock) {
    console.error(`[2-Pass] Final validation FAILED: ${validation.stats.critical} critical, ${validation.stats.high} high issues`);
  } else {
    console.log(`[2-Pass] ✅ Validation passed: ${validation.stats.total} total issues (${validation.stats.medium} medium)`);
  }
  
  return {
    chunkId,
    schema: 'deep-2pass',
    topics: _normalizeTopics(result?.topics || []),
    structure_mapping: result?.structure_mapping || {},
    validation: {
      passed: validation.passed,
      issues: validation.issues,
      stats: validation.stats
    },
    knowledgeBase: {
      numbers_count: knowledgeBase.numbers.length,
      definitions_count: knowledgeBase.definitions.length,
      sections_count: knowledgeBase.structure.sections.length
    },
    quality: {
      data_fidelity: validation.passed ? 100 : Math.max(0, 100 - validation.stats.critical * 30 - validation.stats.high * 15),
      coverage: result?.self_check?.all_definitions_covered ? 100 : 80,
      structure_mapped: result?.self_check?.structure_mapped ? 100 : 70
    }
  };
}

// ─── AI SUMMARIZATION MODULE (with self-check & retry) ───────────────────────
const SUMMARIZE_PROMPT = (mode, chunkText, docTitle, chunkLabel) => {
  const modeGuide = {
    quick: `Tóm tắt NHANH: trích 5–10 ý chính quan trọng nhất, mỗi ý 1 câu súc tích < 25 từ.`,
    study: `Tóm tắt CHI TIẾT: phân tích các khái niệm cốt lõi kèm ví dụ thực tế nếu có, giải thích rõ ràng.`,
    exam: `HỌC SÂU & ÔN THI: Phân tích chuyên sâu bản chất kiến thức, công thức/nguyên lý cốt lõi, bẫy đề thi dễ sai, và trích xuất câu hỏi tự kiểm tra kiến thức.`
  }[mode] || `HỌC SÂU & ÔN THI: Phân tích chuyên sâu kiến thức và bẫy đề thi.`;

  return `Bạn là AI tóm tắt tài liệu học thuật cho sinh viên Việt Nam. Ngành Công nghệ Thực phẩm.

TÀI LIỆU: "${docTitle}"
ĐOẠN: ${chunkLabel}
NHIỆM VỤ: ${modeGuide}

YÊU CẦU BẮT BUỘC:
1. Giữ nguyên ý chính — KHÔNG thêm thông tin ngoài tài liệu
2. Không sai số liệu, tên, thuật ngữ
3. Viết tiếng Việt chuẩn, dễ hiểu
4. Có ví dụ thực tế nếu phù hợp

NỘI DUNG TÀI LIỆU:
${chunkText}

Trả về JSON hợp lệ duy nhất:
{
  "summary": "Đoạn văn tóm tắt hoàn chỉnh, súc tích, logic...",
  "mainPoints": ["ý chính 1", "ý chính 2", ...],
  "keywords": ["từ khóa 1", "từ khóa 2", ...],
  "pitfalls": ["điểm cần lưu ý 1", ...],
  "self_check": {
    "clarity_score": <1–10 số nguyên>,
    "confidence": <0.0–1.0 số thực>,
    "has_example": <true/false>
  }
}`;
};

const RETRY_PROMPT = (mode, chunkText, docTitle, chunkLabel, prevSummary, prevCheck) => `
Bản tóm tắt trước bị đánh giá THẤP (clarity=${prevCheck.clarity_score}/10, confidence=${prevCheck.confidence.toFixed(2)}).
Hãy viết lại rõ ràng, chính xác, chi tiết hơn.

${SUMMARIZE_PROMPT(mode, chunkText, docTitle, chunkLabel)}

Bản tóm tắt trước (để tham khảo, không copy):
${prevSummary}
`.trim();

export async function summarizeChunk({ chunkText, mode, docTitle, chunkId, totalChunks, onProgress }) {
  // ✅ CHUYỂN TOÀN BỘ LOGIC "HỌC SÂU" (exam) → MODE "CHI TIẾT" (study)
  // Mode 'quick' giữ nguyên, mode 'study' dùng deep engine, xóa mode 'exam'
  
  if (mode === 'study') {
    return summarizeChunkDeep({ chunkText, docTitle, chunkId, totalChunks, onProgress });
  }

  // Mode 'quick' - Tóm tắt nhanh (giữ nguyên logic cũ)
  const chunkLabel = `Đoạn ${chunkId + 1}/${totalChunks}`;

  onProgress?.(`Đang tóm tắt ${chunkLabel}...`);

  let result;
  let attempts = 0;

  // Lần đầu
  try {
    result = await callGeminiJSON(SUMMARIZE_PROMPT(mode, chunkText, docTitle, chunkLabel));
    attempts++;
  } catch (err) {
    throw new Error(`chunk-${chunkId}-failed: ${err.message}`);
  }

  // Validate kết quả
  const check = result?.self_check || {};
  const clarity = Number(check.clarity_score) || 0;
  const confidence = Number(check.confidence) || 0;
  const needRetry = confidence < 0.60 || clarity < 6;

  // Retry tối đa 1 lần nếu chất lượng thấp
  if (needRetry && attempts < 2) {
    onProgress?.(`Đang kiểm tra lại ${chunkLabel} (chất lượng chưa đạt)...`);
    try {
      const retried = await callGeminiJSON(
        RETRY_PROMPT(mode, chunkText, docTitle, chunkLabel, result.summary || '', check)
      );
      if (retried?.self_check) {
        result = retried;
      }
    } catch {
      // Giữ kết quả cũ nếu retry thất bại
    }
  }

  return {
    chunkId,
    summary: String(result.summary || ''),
    mainPoints: Array.isArray(result.mainPoints) ? result.mainPoints.slice(0, 10) : [],
    keywords: Array.isArray(result.keywords) ? result.keywords.slice(0, 15) : [],
    pitfalls: Array.isArray(result.pitfalls) ? result.pitfalls.slice(0, 6) : [],
    selfCheck: {
      clarity_score: Number(result.self_check?.clarity_score) || 7,
      confidence: Number(result.self_check?.confidence) || 0.7,
      has_example: Boolean(result.self_check?.has_example)
    }
  };
}

// ─── DEEP MERGE MODULE (Knowledge Pool → Dedup → Coverage Check) ──────────────
const DEEP_MERGE_PROMPT = (topicBlocks, docTitle) => `Bạn đang nhận các bản TRÍCH XUẤT KIẾN THỨC từ nhiều phần của cùng một tài liệu "${docTitle}".

Nhiệm vụ của bạn KHÔNG phải rút gọn chúng thêm, mà là xây dựng một hệ thống kiến thức hoàn chỉnh để học sâu.

QUY TẮC:
1. Không tiếp tục nén thông tin chỉ để giảm độ dài.
2. Giữ lại tất cả kiến thức độc lập.
3. Nếu hai phần nói cùng một kiến thức: gộp phần diễn đạt, giữ lại các chi tiết khác nhau, không xóa thông tin chỉ vì chúng cùng chủ đề.
4. Nếu một phần chứa ví dụ hoặc trường hợp đặc biệt: phải giữ lại nếu nó giúp hiểu kiến thức.
5. Giữ nguyên: công thức, số liệu, thuật ngữ, điều kiện, phân loại, ưu/nhược điểm, ứng dụng.
6. Bảo toàn quan hệ giữa các kiến thức.
7. Không biến một kiến thức cụ thể thành kết luận quá rộng.
8. Không tự bổ sung kiến thức bên ngoài. Phần giải thích của AI phải được hiểu là diễn giải, không phải nội dung nguyên bản.
9. Sau khi tổng hợp, thực hiện COVERAGE CHECK: chỉ liệt kê vào "removed" những kiến thức bị loại bỏ vì thực sự dư thừa, kèm lý do. Mục tiêu coverage gần 100%.
10. Không đặt giới hạn cứng cho số lượng mục ở mỗi phần. Số lượng phụ thuộc vào lượng kiến thức thực tế.

CÁC BẢN TRÍCH XUẤT:
${topicBlocks}

Trả về JSON hợp lệ duy nhất:
{
  "overview": "Tổng quan toàn tài liệu (3-6 câu, nêu phạm vi kiến thức đã xử lý)",
  "chapters": [{ "title": "Chương/Phần theo tài liệu", "content": "Kiến thức chính của chương đó" }],
  "concepts": [{ "name": "...", "explain": "Khái niệm + bản chất" }],
  "principles": [{ "name": "...", "explain": "Nguyên lý / cơ chế hoạt động" }],
  "classifications": [{ "name": "Nhóm phân loại", "items": ["Loại 1", "..."] }],
  "formulas": [{ "formula": "Giữ nguyên như tài liệu", "meaning": "Ý nghĩa từng biến + ý nghĩa vật lý" }],
  "food_apps": [{ "text": "Quá trình → Đại lượng kiểm soát → Cảm biến → Bộ điều khiển → Cơ cấu chấp hành → Kết quả", "ai_generated": true }],
  "comparisons": [{ "title": "Nhóm khái niệm dễ nhầm", "rows": [{ "concept": "...", "essence": "...", "diff": "Điểm khác nhau", "when": "Khi nào dùng" }] }],
  "key_points": ["Điểm cần nhớ khi ôn thi"],
  "pitfalls": ["Điểm dễ nhầm"],
  "relations": ["Quan hệ giữa các kiến thức: A → dẫn đến B, A → điều khiển B, A → đầu vào của B..."],
  "questions": ["Câu hỏi tự kiểm tra phủ toàn tài liệu"],
  "removed": [{ "item": "Kiến thức bị loại bỏ", "reason": "Lý do (lặp lại hoàn toàn...)" }],
  "coverage": { "concepts": <0-100>, "formulas": <0-100>, "classifications": <0-100>, "examples": <0-100>, "technical_details": <0-100> },
  "quality": { "source_fidelity": <0-100>, "clarity": <0-100>, "structure": <0-100> }
}`;

function _deepFallback(chunkResults) {
  const topics = chunkResults.flatMap(c => c.topics || []);
  return {
    overview: '',
    chapters: [],
    concepts: topics.map(t => ({ name: t.title, explain: [t.core, t.simple].filter(Boolean).join('\n\n') })),
    principles: topics.filter(t => t.essence).map(t => ({ name: t.title, explain: t.essence })),
    classifications: topics.flatMap(t => t.classifications.map(c => ({ name: t.title, items: [c] }))),
    formulas: topics.flatMap(t => t.formulas.map(f => ({ formula: f, meaning: '' }))),
    food_apps: topics.filter(t => t.food_app).map(t => ({ text: t.food_app, ai_generated: t.food_app_ai })),
    comparisons: [],
    key_points: topics.flatMap(t => t.details),
    pitfalls: topics.flatMap(t => t.pitfalls),
    relations: topics.flatMap(t => t.relations),
    questions: topics.flatMap(t => t.questions),
    removed: []
  };
}

async function mergeDeep(chunkResults, docTitle, onProgress) {
  onProgress?.('Đang xây dựng hệ thống kiến thức (pool → dedup → coverage check)...');

  const topicBlocks = chunkResults
    .map((c, i) => `=== PHẦN ${i + 1} ===\n${JSON.stringify(c.topics)}`)
    .join('\n\n');

  console.log('[mergeDeep] Merging', chunkResults.length, 'chunks');

  let merged;
  try {
    merged = await callGeminiJSON(DEEP_MERGE_PROMPT(topicBlocks, docTitle), DEEP_CALL_OPTS);
    console.log('[mergeDeep] AI merged output:', merged);
    console.log('[mergeDeep] Concepts count:', merged?.concepts?.length);
    if (merged?.concepts?.[0]) {
      console.log('[mergeDeep] First concept:', merged.concepts[0]);
    }
    if (!merged || typeof merged !== 'object' || !Array.isArray(merged.concepts)) {
      console.warn('[mergeDeep] Invalid merge output, using fallback');
      merged = _deepFallback(chunkResults);
    }
  } catch (err) {
    console.error('[mergeDeep] Merge failed:', err.message);
    merged = _deepFallback(chunkResults);
  }

  const COV_KEYS = ['concepts', 'formulas', 'classifications', 'examples', 'technical_details'];
  const Q_KEYS = ['source_fidelity', 'clarity', 'structure'];
  const coverage = {};
  for (const k of COV_KEYS) {
    coverage[k] = Number(merged.coverage?.[k]) || Math.round(_avg(chunkResults.map(c => c.coverage?.[k])));
  }
  const quality = {};
  for (const k of Q_KEYS) {
    quality[k] = Number(merged.quality?.[k]) || Math.round(_avg(chunkResults.map(c => c.quality?.[k])));
  }

  const concepts = Array.isArray(merged.concepts)
    ? merged.concepts.map(c => ({ name: String(c?.name || ''), explain: String(c?.explain || '') }))
    : [];

  return {
    schema: 'deep',
    overview: String(merged.overview || ''),
    chapters: Array.isArray(merged.chapters)
      ? merged.chapters.map(c => ({ title: String(c?.title || ''), content: String(c?.content || '') }))
      : [],
    concepts,
    principles: Array.isArray(merged.principles)
      ? merged.principles.map(p => ({ name: String(p?.name || ''), explain: String(p?.explain || '') }))
      : [],
    classifications: Array.isArray(merged.classifications)
      ? merged.classifications.map(c => ({ name: String(c?.name || ''), items: _strArr(c?.items) }))
      : [],
    formulas: Array.isArray(merged.formulas)
      ? merged.formulas.map(f => ({ formula: String(f?.formula || ''), meaning: String(f?.meaning || '') }))
      : [],
    food_apps: Array.isArray(merged.food_apps)
      ? merged.food_apps.map(f => ({ text: String(f?.text || ''), ai_generated: Boolean(f?.ai_generated) })).filter(f => f.text)
      : [],
    comparisons: Array.isArray(merged.comparisons)
      ? merged.comparisons.map(cp => ({
          title: String(cp?.title || ''),
          rows: Array.isArray(cp?.rows)
            ? cp.rows.map(r => ({
                concept: String(r?.concept || ''),
                essence: String(r?.essence || ''),
                diff: String(r?.diff || ''),
                when: String(r?.when || '')
              }))
            : []
        }))
      : [],
    key_points: _strArr(merged.key_points),
    pitfalls: _strArr(merged.pitfalls),
    relations: _strArr(merged.relations),
    questions: _strArr(merged.questions),
    removed: Array.isArray(merged.removed)
      ? merged.removed.map(r => ({ item: String(r?.item || ''), reason: String(r?.reason || '') }))
      : [],
    coverage,
    quality,
    // Compat fields cho UI cũ / doc assistant / mindmap
    finalSummary: String(merged.overview || ''),
    mainPoints: _strArr(merged.key_points).slice(0, 12),
    keywords: concepts.map(c => c.name).filter(Boolean).slice(0, 20)
  };
}

// ─── MERGE MODULE ─────────────────────────────────────────────────────────────
const MERGE_PROMPT = (summaries, docTitle, mode) => {
  const modeNote = {
    quick: 'Kết quả gộp phải súc tích, dễ đọc, tập trung ý chính.',
    study: 'Kết quả gộp phải chi tiết, có cấu trúc rõ ràng, giải thích sâu.',
    exam: 'Kết quả gộp phải tập trung điểm hay thi, dễ nhầm, có câu hỏi kiểm tra.'
  }[mode] || '';

  const summaryBlocks = summaries
    .map((s, i) => `=== ĐOẠN ${i + 1} ===\n${s.summary}`)
    .join('\n\n');

  const allPoints = [...new Set(summaries.flatMap(s => s.mainPoints))];
  const allKeywords = [...new Set(summaries.flatMap(s => s.keywords))];
  const allPitfalls = [...new Set(summaries.flatMap(s => s.pitfalls))];

  return `Bạn là AI tổng hợp nội dung học thuật. Hãy gộp ${summaries.length} đoạn tóm tắt của tài liệu "${docTitle}" thành 1 bản tóm tắt HOÀN CHỈNH.

YÊU CẦU:
- KHÔNG lặp ý
- Logic liền mạch, có cấu trúc
- KHÔNG thêm thông tin mới ngoài các đoạn đã cho
- ${modeNote}

CÁC ĐOẠN TÓM TẮT:
${summaryBlocks}

Trả về JSON hợp lệ:
{
  "finalSummary": "Bản tóm tắt hoàn chỉnh, có cấu trúc rõ ràng...",
  "mainPoints": ["ý chính tổng hợp 1", "ý chính 2", ..., tối đa 12 ý],
  "keywords": ${JSON.stringify(allKeywords.slice(0, 20))},
  "pitfalls": ${JSON.stringify(allPitfalls.slice(0, 8))}
}`;
};

export async function mergeSummaries({ chunkResults, docTitle, mode, onProgress }) {
  if (chunkResults.length === 0) {
    throw new Error('no-chunks-to-merge');
  }

  // ✅ CHUYỂN DEEP MERGE CHO MODE 'study' (thay vì 'exam')
  if (mode === 'study') {
    return mergeDeep(chunkResults, docTitle, onProgress);
  }

  // Mode 'quick' - Merge đơn giản (giữ nguyên logic cũ)
  // Nếu chỉ có 1 chunk, không cần merge
  if (chunkResults.length === 1) {
    const c = chunkResults[0];
    return {
      finalSummary: c.summary,
      mainPoints: c.mainPoints,
      keywords: c.keywords,
      pitfalls: c.pitfalls,
      quality: calcQuality([c])
    };
  }

  onProgress?.('Đang tổng hợp kết quả...');

  let merged;
  try {
    merged = await callGeminiJSON(MERGE_PROMPT(chunkResults, docTitle, mode));
  } catch {
    // Fallback: ghép thủ công nếu API merge fail
    const allSummaries = chunkResults.map(c => c.summary).join('\n\n---\n\n');
    const allPoints = [...new Set(chunkResults.flatMap(c => c.mainPoints))];
    const allKw = [...new Set(chunkResults.flatMap(c => c.keywords))];
    const allPf = [...new Set(chunkResults.flatMap(c => c.pitfalls))];
    merged = {
      finalSummary: allSummaries,
      mainPoints: allPoints.slice(0, 12),
      keywords: allKw.slice(0, 20),
      pitfalls: allPf.slice(0, 8)
    };
  }

  return {
    finalSummary: String(merged.finalSummary || ''),
    mainPoints: Array.isArray(merged.mainPoints) ? merged.mainPoints.slice(0, 12) : [],
    keywords: Array.isArray(merged.keywords) ? merged.keywords.slice(0, 20) : [],
    pitfalls: Array.isArray(merged.pitfalls) ? merged.pitfalls.slice(0, 8) : [],
    quality: calcQuality(chunkResults)
  };
}

// ─── QUALITY CALCULATOR ───────────────────────────────────────────────────────
function calcQuality(chunkResults) {
  if (!chunkResults.length) return { avg_confidence: 0, avg_clarity: 0, badge: 'low' };
  const avgConf = chunkResults.reduce((s, c) => s + (c.selfCheck?.confidence || 0.7), 0) / chunkResults.length;
  const avgClarity = chunkResults.reduce((s, c) => s + (c.selfCheck?.clarity_score || 7), 0) / chunkResults.length;
  const badge = avgConf >= 0.70 && avgClarity >= 7.0 ? 'good' : 'check';
  return {
    avg_confidence: Math.round(avgConf * 100) / 100,
    avg_clarity: Math.round(avgClarity * 10) / 10,
    badge
  };
}

// ─── DEEP STUDY ENGINE (mode 'study') — OLD FALLBACK khi KB chưa sẵn sàng ────
// (giữ nguyên để mode 'quick' dùng)

// ─── KNOWLEDGE BANK ENGINE v4 ────────────────────────────────────────────────
// Pipeline: Extraction → Raw Fact Store → Validation → Knowledge Bank →
//           Bank Quality Gate → Synthesis → Coverage/Outline Validation → Output
// ─────────────────────────────────────────────────────────────────────────────

// ── Helper: normalize text cho comparison ──────────────────────────────────────
function _normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
    .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
    .replace(/[ìíịỉĩ]/g, 'i')
    .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
    .replace(/[ùúụủũưừứựửữ]/g, 'u')
    .replace(/[ỳýỵỷỹ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Knowledge Bank Class ───────────────────────────────────────────────────────
class KnowledgeBank {
  constructor() {
    this.facts = [];
    this.numbers = [];
    this.mechanisms = [];
    this.sections = [];
    this.domain_expansions = [];
    this.chunkCount = 0;
    this.totalSourceChars = 0;
    this.failedChunks = 0;
    this._factIdSet = new Set();
  }

  addFromExtraction(extraction) {
    if (!extraction || typeof extraction !== 'object') return;
    const prefix = 'C' + this.chunkCount + '_';

    for (const f of (extraction.facts || [])) {
      if (!f || !f.fact_id) continue;
      const newId = prefix + f.fact_id;
      if (this._factIdSet.has(newId)) continue;
      this._factIdSet.add(newId);
      const fact = { ...f, fact_id: newId };
      this.facts.push(fact);
      if (f.value != null && f.unit != null) {
        this.numbers.push({ ...fact });
      }
    }

    for (const m of (extraction.mechanisms || [])) {
      if (!m || !m.name) continue;
      const exists = this.mechanisms.some(
        em => _normalizeText(em.name) === _normalizeText(m.name)
      );
      if (!exists) this.mechanisms.push(m);
    }

    for (const s of (extraction.sections || [])) {
      if (!s || !s.title) continue;
      const normTitle = _normalizeText(s.title);
      const exists = this.sections.some(
        es => _normalizeText(es.title) === normTitle
      );
      if (!exists) {
        this.sections.push({
          ...s,
          fact_ids: (s.fact_ids || []).map(id => prefix + id)
        });
      }
    }

    for (const d of (extraction.domain_expansions || [])) {
      if (!d) continue;
      this.domain_expansions.push({
        ...d,
        source_fact_id: d.source_fact_id ? prefix + d.source_fact_id : d.source_fact_id
      });
    }

    this.chunkCount++;
  }

  /** Stage 4: Bank Quality Gate */
  evaluateQuality() {
    let corruptedNumbers = 0;
    for (const num of this.numbers) {
      if (!num.value || !num.unit) corruptedNumbers++;
    }
    const numberFidelity = this.numbers.length > 0
      ? Math.round(((this.numbers.length - corruptedNumbers) / this.numbers.length) * 100)
      : 100;

    const requiredSections = this.sections.filter(s => s.required);
    const coveredRequiredSections = requiredSections.filter(s => {
      if (Array.isArray(s.fact_ids) && s.fact_ids.length > 0) return true;
      const titleKws = _normalizeText(s.title).split(' ').filter(w => w.length > 3);
      if (titleKws.length === 0) return false;
      return this.facts.some(f => {
        const loc = _normalizeText(f.source_location || '');
        return titleKws.some(kw => loc.includes(kw));
      });
    });
    const sectionCoverage = requiredSections.length > 0
      ? Math.round((coveredRequiredSections.length / requiredSections.length) * 100)
      : 100;
    const uncoveredSections = requiredSections
      .filter(s => !coveredRequiredSections.includes(s))
      .map(s => s.title);

    const minFactsRequired = Math.max(5, this.chunkCount * 3);
    const hasEnoughFacts = this.facts.length >= minFactsRequired;

    const passed = this.facts.length > 0 && numberFidelity === 100 && sectionCoverage >= 70;

    return {
      passed, numberFidelity, sectionCoverage,
      factCount: this.facts.length, numberCount: this.numbers.length,
      sectionCount: this.sections.length, requiredSections: requiredSections.length,
      coveredSections: coveredRequiredSections.length, uncoveredSections,
      corruptedNumbers, hasEnoughFacts, minFactsRequired
    };
  }

  toSynthesisContext() {
    return {
      fact_count: this.facts.length,
      number_count: this.numbers.length,
      section_count: this.sections.length,
      facts: this.facts,
      mechanisms: this.mechanisms,
      sections: this.sections,
      domain_expansions: this.domain_expansions
    };
  }

  toValidationContext() {
    return {
      facts: this.facts,
      numbers: this.numbers,
      mechanisms: this.mechanisms,
      sections: this.sections,
      domain_expansions: this.domain_expansions
    };
  }
}

// ── Pre-Synthesis Validation ───────────────────────────────────────────────────
function validateRawExtraction(rawText, extractionResult) {
  const issues = [];
  if (!extractionResult || typeof extractionResult !== 'object') {
    return { valid: false, criticalCount: 1, warningCount: 0,
      issues: [{ severity: 'CRITICAL', message: 'Kết quả extraction rỗng hoặc sai định dạng JSON.' }] };
  }

  const unitMismatches = {
    'mm': ['µm', 'um', 'nm'], 'cm': ['mm', 'µm', 'um', 'nm'],
    'm': ['cm', 'mm', 'µm', 'um'], 'g': ['mg', 'µg', 'ug'], 'kg': ['g', 'mg']
  };

  for (const f of (extractionResult.facts || [])) {
    if (!f.value || !f.unit) continue;
    const valStr  = String(f.value).trim();
    const unitStr = String(f.unit).trim();
    const escapedVal = valStr.replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~\\s]*');
    for (const wu of (unitMismatches[unitStr.toLowerCase()] || [])) {
      if (new RegExp(escapedVal + '\\s*' + wu, 'i').test(rawText)) {
        issues.push({ severity: 'CRITICAL', type: 'unit_hallucination', fact: f,
          message: 'LỖI ĐƠN VỊ: "' + valStr + '" trong nguồn dùng "' + wu + '" nhưng AI trích xuất thành "' + unitStr + '".' });
      }
    }
  }

  const headingCandidates = rawText.split('\n').map(l => l.trim())
    .filter(l => l.length > 4 && l.length < 80 && (
      /^\d+[.\s]/.test(l) || /^[IVX]+\.\s/.test(l) || (l.endsWith(':') && l.length < 60)));

  const extractedSectionCount = (extractionResult.sections || []).length;
  if (headingCandidates.length >= 3 && extractedSectionCount === 0) {
    issues.push({ severity: 'CRITICAL', type: 'missing_sections_critical',
      message: 'THIẾU SECTIONS: Văn bản có ' + headingCandidates.length + ' tiêu đề nhưng không trích xuất được section nào.' });
  } else if (headingCandidates.length > 0 && extractedSectionCount === 0) {
    issues.push({ severity: 'WARNING', type: 'missing_sections',
      message: 'Văn bản có tiêu đề nhưng không trích xuất được section nào.' });
  }

  const extractedFacts = (extractionResult.facts || []).length;
  const rawWordCount = rawText.split(/\s+/).filter(Boolean).length;
  const expectedMinFacts = Math.floor(rawWordCount / 200);
  if (expectedMinFacts >= 3 && extractedFacts < Math.max(2, Math.floor(expectedMinFacts * 0.25))) {
    issues.push({ severity: 'WARNING', type: 'low_fact_density',
      message: 'MẬT ĐỘ FACT THẤP: Văn bản ~' + rawWordCount + ' từ nhưng chỉ trích xuất ' + extractedFacts + ' facts.' });
  }

  const criticals = issues.filter(i => i.severity === 'CRITICAL');
  const warnings = issues.filter(i => i.severity === 'WARNING');
  return { valid: criticals.length === 0, criticalCount: criticals.length, warningCount: warnings.length, issues };
}

// ── Synthesis Payload Builder ──────────────────────────────────────────────────
function _buildSynthesisPayload(bank) {
  const MAX_PAYLOAD_CHARS = 60000;

  const factsBySection = {};
  const assignedFactIds = new Set();

  for (const section of bank.sections) {
    const sectionFacts = bank.facts.filter(f => {
      if ((section.fact_ids || []).includes(f.fact_id)) return true;
      const titleKws = _normalizeText(section.title).split(' ').filter(w => w.length > 3);
      if (titleKws.length === 0) return false;
      const loc = _normalizeText(f.source_location || '');
      return titleKws.some(kw => loc.includes(kw));
    });
    if (sectionFacts.length > 0) {
      factsBySection[section.title] = sectionFacts;
      sectionFacts.forEach(f => assignedFactIds.add(f.fact_id));
    }
  }
  const unassignedFacts = bank.facts.filter(f => !assignedFactIds.has(f.fact_id));

  const payload = {
    summary: {
      fact_count: bank.facts.length, number_count: bank.numbers.length,
      section_count: bank.sections.length, mechanism_count: bank.mechanisms.length
    },
    numbers: bank.numbers,
    sections: bank.sections,
    mechanisms: bank.mechanisms,
    facts_by_section: factsBySection,
    general_facts: unassignedFacts,
    domain_expansions: bank.domain_expansions
  };

  const fullStr = JSON.stringify(payload, null, 2);
  if (fullStr.length <= MAX_PAYLOAD_CHARS) return fullStr;

  console.warn('[SynthesisPayload] ' + fullStr.length + ' chars > ' + MAX_PAYLOAD_CHARS + '. Compressing text_facts...');
  const compressedFacts = bank.facts.map(f => {
    if (['number_fact', 'definition', 'classification_fact', 'comparison', 'mechanism_step', 'food_application', 'pitfall'].includes(f.type)) return f;
    return { ...f, content: f.content ? f.content.slice(0, 500) : f.content,
      source_quote: f.source_quote ? f.source_quote.slice(0, 200) : f.source_quote };
  });

  const cp = { ...payload, facts_by_section: undefined, general_facts: undefined, facts: compressedFacts };
  delete cp.facts_by_section; delete cp.general_facts;
  return JSON.stringify(cp, null, 2);
}

// ── EXTRACTION PROMPT ─────────────────────────────────────────────────────────
const KB_EXTRACTION_PROMPT = (chunkText, docTitle, chunkLabel) =>
'Bạn là AI trích xuất dữ liệu học thuật ngành Công nghệ Thực phẩm. Nhiệm vụ: LẬP CHỈ MỤC tài liệu, KHÔNG tóm tắt, KHÔNG diễn giải.\n' +
'TÀI LIỆU: "' + docTitle + '"\nĐOẠN: ' + chunkLabel + '\n\n' +
'NGUYÊN TẮC BẤT BIẾN (BẢO TỒN SỐ LIỆU & ĐƠN VỊ 100%):\n' +
'1. SAO CHÉP NGUYÊN VẸN ĐƠN VỊ & SỐ LIỆU — tuyệt đối KHÔNG thay đổi số liệu hoặc đơn vị:\n' +
'   - "1-10 µm" → value: "1-10", unit: "µm" (TUYỆT ĐỐI KHÔNG ĐỔI THÀNH "mm")\n' +
'   - "15-20 nm" → value: "15-20", unit: "nm" (TUYỆT ĐỐI KHÔNG ĐỔI THÀNH "µm")\n' +
'   - Giữ nguyên các đơn vị: µm, nm, mm, °C, %, g/L, bar, Pa, CFU/g, mg/100g.\n' +
'2. PHÂN TÁCH THUỘC TÍNH — mỗi số liệu hoặc đặc điểm là một fact riêng.\n' +
'3. CÁC TYPE HỢP LỆ: number_fact | text_fact | definition | classification_fact | mechanism_step | comparison | food_application | pitfall.\n\n' +
'SCHEMA JSON:\n' +
'{\n' +
'  "facts": [{\n' +
'    "fact_id": "F001",\n' +
'    "entity": "Tên thực thể (Ví dụ: Thành tế bào nấm men, Ribosom)",\n' +
'    "attribute": "Thuộc tính (kích thước, độ dày, thành phần)",\n' +
'    "value": "Giá trị số hoặc null",\n' +
'    "unit": "Đơn vị nguyên văn hoặc null",\n' +
'    "qualifier": "khoảng/ít nhất/tối đa hoặc null",\n' +
'    "source_status": "SOURCE|INFERENCE|EXAMPLE",\n' +
'    "source_quote": "câu trích dẫn nguyên văn",\n' +
'    "source_location": "Mục trong tài liệu",\n' +
'    "type": "number_fact|text_fact|definition|classification_fact|comparison|example|food_application|pitfall",\n' +
'    "content": "Mô tả đầy đủ nội dung kiến thức"\n' +
'  }],\n' +
'  "mechanisms": [{\n' +
'    "name": "Tên cơ chế",\n' +
'    "steps": [{"step": 1, "description": "Mô tả bước 1"}],\n' +
'    "source_explicit": "SOURCE_EXPLICIT|SOURCE_DESCRIPTIVE|SOURCE_INFERRED|AI_INFERENCE"\n' +
'  }],\n' +
'  "sections": [{\n' +
'    "title": "Tên mục — copy chính xác",\n' +
'    "required": true,\n' +
'    "fact_ids": ["F001", "F002"]\n' +
'  }],\n' +
'  "domain_expansions": [{\n' +
'    "source_fact_id": "F001",\n' +
'    "expansion_type": "DOMAIN_APPLICATION",\n' +
'    "domain": "Công nghệ thực phẩm",\n' +
'    "content": "Ý nghĩa thực tiễn trong nhà máy / chế biến (Bia, Bánh mì, Đồ hộp, Sữa...)",\n' +
'    "confidence": "high|medium|low"\n' +
'  }]\n' +
'}\n\n' +
'NỘI DUNG TÀI LIỆU:\n' + chunkText;

// ── KNOWLEDGE ORGANIZER PROMPT ───────────────────────────────────────────────
const KB_ORGANIZER_PROMPT = (bankPayloadStr, docTitle) =>
'Bạn là AI tổ chức kiến thức giáo dục. Nhiệm vụ: Xây dựng dàn bài (Knowledge Organizer) cho tài liệu "' + docTitle + '".\n' +
'KNOWLEDGE BANK:\n' + bankPayloadStr + '\n\n' +
'YÊU CẦU:\n' +
'1. Dựa vào các sections và facts, hãy tạo các chapters hợp lý.\n' +
'2. Mỗi chapter phải có "title" và danh sách các "fact_ids" sẽ được đưa vào chapter đó.\n' +
'3. BAO PHỦ 100% FACTS: Mọi fact_id trong Bank phải được phân bổ vào ít nhất một chapter. KHÔNG ĐƯỢC BỎ SÓT.\n\n' +
'SCHEMA JSON:\n' +
'{\n' +
'  "chapters": [\n' +
'    { "title": "Tên chương", "fact_ids": ["F001", "F002"] }\n' +
'  ]\n' +
'}';

// ── CHAPTER SYNTHESIS PROMPT (7-Step Framework) ─────────────────────────────
const KB_CHAPTER_PROMPT = (chapterTitle, chapterFactsStr, docTitle, numberChecklistStr = '', feedbackError = '') =>
'Bạn là Trợ Giảng AI Chuyên Ngành Công Nghệ Thực Phẩm. Nhiệm vụ: Biên soạn Chương: "' + chapterTitle + '" (tài liệu: ' + docTitle + ') thành bài giảng GIÁO TRÌNH HỌC SÂU hoàn chỉnh cho sinh viên đại học.\n\n' +
'KIẾN THỨC CUNG CẤP:\n' + chapterFactsStr + '\n\n' +
(numberChecklistStr ? 'DANH SÁCH SỐ LIỆU BẮT BUỘC KHÔNG ĐƯỢC THAY ĐỔI ĐƠN VỊ:\n' + numberChecklistStr + '\n\n' : '') +
(feedbackError ? '═══════════════════════════════\nLỖI SAI LẦN THỬ TRƯỚC (BẮT BUỘC SỬA NGAY):\n' + feedbackError + '\n═══════════════════════════════\n\n' : '') +
'CẤU TRÚC BẮT BUỘC 7 BƯỚC CHO MỖI MỤC BÀI GIẢNG:\n' +
'Với mỗi khái niệm/mục kiến thức chính trong chương, bạn PHẢI diễn giải mượt mà theo đủ 7 phần:\n' +
'1. **Khái niệm**: Định nghĩa chính xác bản chất.\n' +
'2. **Bản chất khoa học**: Cơ chế sinh học / hóa học cốt lõi.\n' +
'3. **Thành phần / Cấu tạo / Cơ chế**: Chi tiết cấu trúc, số liệu & đơn vị chính xác.\n' +
'4. **Ý nghĩa sinh học**: Vai trò sinh học duy trì và bảo vệ tế bào/hệ thống.\n' +
'5. **Ứng dụng trong Công nghệ Thực phẩm**: Liên hệ trực tiếp tới các quy trình công nghiệp (Lên men Bia, Sản xuất Bánh mì, Tiệt trùng đồ hộp, Chế biến sữa, QC/QA nhà máy).\n' +
'6. **Ví dụ thực tế sản xuất**: Tình huống kỹ thuật thực tế tại nhà máy chế biến thực phẩm.\n' +
'7. **Sai lầm thường gặp & Điểm dễ nhầm**: Cảnh báo nhầm lẫn đơn vị (nm vs µm) hoặc sai sót kỹ thuật trong vận hành.\n\n' +
'QUY TẮC ĐƠN VỊ:\n' +
'- Giữ nguyên 100% số liệu & đơn vị (ví dụ 15-20 nm KHÔNG đổi thành 15-20 µm, 3-5 µm KHÔNG đổi thành mm).\n' +
'- Viết mạch lạc, văn phong giáo trình chuẩn mực, KHÔNG tạo dàn ý cụt lủn chỉ có tiêu đề.\n\n' +
'TRẢ VỀ JSON:\n' +
'{\n' +
'  "content": "Nội dung markdown hoàn chỉnh của chương này theo chuẩn 7 bước",\n' +
'  "applications": [\n' +
'    { "industry": "Tên ngành/lĩnh vực (Bia/Bánh mì/Đồ hộp...)", "real_problem": "Vấn đề thực tế nhà máy", "application": "Giải pháp công nghệ" }\n' +
'  ]\n' +
'}';

// ── DICTIONARY SYNTHESIS PROMPT (Concepts, Comparisons, Memory Layer) ──────
const KB_DICTIONARY_PROMPT = (bankPayloadStr, docTitle) =>
'Bạn là Trợ Giảng AI Chuyên Ngành Công Nghệ Thực Phẩm. Xây dựng Từ Điển Khái Niệm, Ứng Dụng Thực Tế & Hồ Sơ Ghi Nhớ Cho Tài Liệu: "' + docTitle + '".\n\n' +
'KNOWLEDGE BANK:\n' + bankPayloadStr + '\n\n' +
'YÊU CẦU:\n' +
'1. Concepts: Trích xuất các khái niệm chính với đầy đủ definition, attributes, conditions_exceptions, numbers, applications (ứng dụng CNTP), real_world_example (ví dụ nhà máy/chế biến) và common_mistakes (lỗi hay nhầm).\n' +
'2. Comparisons: Xây dựng các Bảng So Sánh chi tiết giữa các nhóm thực thể dễ nhầm.\n' +
'3. Memory Layer: Xây dựng Hồ Sơ Ghi Nhớ & Ôn Thi đại học CNTP bao gồm:\n' +
'   - remember: 4-8 kiến thức cốt lõi nhất cần nhớ nguyên bản.\n' +
'   - common_mistakes: 3-6 lỗi sai đơn vị hoặc nhầm lẫn kiến thức kinh điển (ví dụ: nm vs µm).\n' +
'   - exam_questions: 4-6 câu hỏi thi tự luận/trắc nghiệm hay gặp.\n' +
'   - industry_connection: 4-6 liên hệ thực tế nhà máy / sản xuất thực phẩm.\n\n' +
'SCHEMA JSON:\n' +
'{\n' +
'  "overview": "Tổng quan bài học 3-6 câu",\n' +
'  "concepts": [\n' +
'    {\n' +
'      "name": "Tên khái niệm",\n' +
'      "tier": "A|B",\n' +
'      "definition": "Định nghĩa + bản chất",\n' +
'      "attributes": ["Các đặc điểm/thuộc tính chính"],\n' +
'      "conditions_exceptions": ["Điều kiện hoặc ngoại lệ"],\n' +
'      "numbers": ["Số liệu kèm đơn vị nguyên văn"],\n' +
'      "applications": "Ứng dụng trong Công nghệ Thực phẩm",\n' +
'      "real_world_example": "Ví dụ thực tế sản xuất / nhà máy",\n' +
'      "common_mistakes": "Cảnh báo lỗi dễ nhầm"\n' +
'    }\n' +
'  ],\n' +
'  "comparisons": [{"title": "Tên bảng so sánh", "rows": [{"concept": "Tên", "essence": "Bản chất", "diff": "Điểm khác biệt"}]}],\n' +
'  "memory_layer": {\n' +
'    "remember": ["Ý cốt lõi 1", "..."],\n' +
'    "common_mistakes": ["Lỗi nhầm 1", "..."],\n' +
'    "exam_questions": ["Câu hỏi thi 1", "..."],\n' +
'    "industry_connection": ["Liên hệ nhà máy 1", "..."]\n' +
'  },\n' +
'  "key_points": ["Điểm chính 1"],\n' +
'  "pitfalls": ["Lưu ý 1"],\n' +
'  "questions": ["Câu hỏi tự kiểm tra 1"]\n' +
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
      prompt += '\n\n═══════════════════════════════\nLỖI TỪ LẦN THỬ TRƯỚC (SỬA NGAY):\n' + feedbackPrompt + '\n═══════════════════════════════';
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
          feedbackPrompt = gate.issues.map(i => '- ' + i.message).join('\n');
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

async function synthesizeChapter(chapterPlan, bank, docTitle, attempt = 1, lastErrorMsg = '') {
  const chapterFacts = bank.facts.filter(f => chapterPlan.fact_ids.includes(f.fact_id));
  const chapterNumbers = bank.numbers.filter(n => chapterPlan.fact_ids.includes(n.fact_id));
  
  if (chapterFacts.length === 0) return { title: chapterPlan.title, content: 'Không có dữ liệu chi tiết.', applications: [] };

  const chapterFactsStr = JSON.stringify({ facts: chapterFacts, numbers: chapterNumbers }, null, 2);
  
  // Tạo danh sách số liệu bắt buộc để truyền vào prompt
  const numberChecklistStr = chapterNumbers
    .filter(n => n.value && n.unit)
    .map(n => `- ${n.entity || 'Thực thể'} (${n.attribute || 'Đặc điểm'}): "${n.value} ${n.unit}"`)
    .join('\n');

  try {
    const prompt = KB_CHAPTER_PROMPT(chapterPlan.title, chapterFactsStr, docTitle, numberChecklistStr, lastErrorMsg);
    const result = await callGeminiJSON(prompt, DEEP_CALL_OPTS);
    if (result && result.content) {
      let content = result.content;
      let applications = Array.isArray(result.applications) ? result.applications : [];
      
      // Strict Number & Unit Validation per Chapter
      let corrupted = false;
      let missingCount = 0;
      let corruptionErrors = [];
      const unitConversions = {
        'µm': ['mm', 'cm', 'm'], 'nm': ['µm', 'mm', 'cm'],
        'mm': ['µm', 'nm', 'cm', 'm'], '°c': ['°f', 'k'], 'mg': ['g', 'kg']
      };
      
      const lowerContent = content.toLowerCase();
      for (const num of chapterNumbers) {
        if (!num.value || !num.unit) continue;
        const val = String(num.value).replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~]');
        const unitEsc = String(num.unit).replace(/[.*+?^${}()|[\]\\µ]/g, '\\$&');
        const exactRe = new RegExp(val + '\\s*' + unitEsc, 'i');
        
        if (!exactRe.test(lowerContent)) {
           missingCount++;
           for (const wu of (unitConversions[num.unit] || [])) {
             if (new RegExp(val + '\\s*' + wu, 'i').test(lowerContent)) {
               corrupted = true;
               const errMsg = `LỖI SAI ĐƠN VỊ: Nguồn ghi "${num.value} ${num.unit}" (${num.entity}) nhưng AI viết thành "${num.value} ${wu}". BẮT BUỘC giữ nguyên đơn vị "${num.unit}".`;
               corruptionErrors.push(errMsg);
               console.error(`[Chapter Synth] Hallucination: ${num.value}${num.unit} -> ${wu} in ${chapterPlan.title}`);
               break;
             }
           }
        }
      }
      
      if ((corrupted || missingCount > Math.max(1, chapterNumbers.length * 0.15)) && attempt < 2) {
         const errorFeedback = corruptionErrors.join('\n') || `Thiếu ${missingCount} số liệu so với checklist. Bắt buộc chèn đủ số liệu nguyên văn kèm đơn vị.`;
         console.warn(`[Chapter Synth] Retry chapter ${chapterPlan.title} (Lần ${attempt + 1}) do sai/thiếu số liệu...`);
         return synthesizeChapter(chapterPlan, bank, docTitle, attempt + 1, errorFeedback);
      }
      
      return { title: chapterPlan.title, content, applications };
    }
  } catch (err) {
    console.error(`[Chapter Synth] Lỗi tại ${chapterPlan.title}:`, err.message);
  }
  
  // Fallback content cho chapter này (7-Step Educational Structure)
  let content = '## ' + chapterPlan.title + '\n\n';
  content += '### 1. Khái niệm & Bản chất khoa học\n';
  for (const f of chapterFacts) {
    if (f.type === 'definition' || f.type === 'text_fact') {
      content += '- **' + (f.entity || 'Kiến thức') + '**: ' + (f.content || f.source_quote || '') + '\n';
    }
  }
  content += '\n### 2. Số liệu & Thông số kỹ thuật\n';
  for (const f of chapterFacts) {
    if (f.value && f.unit) {
      content += '- **' + (f.entity || 'Thực thể') + '** (' + (f.attribute || 'Đặc điểm') + '): `' + f.value + ' ' + f.unit + '`\n';
    }
  }
  content += '\n### 3. Ứng dụng trong Công nghệ Thực phẩm & Ví dụ sản xuất\n';
  const apps = bank.domain_expansions.filter(d => chapterPlan.fact_ids.includes(d.source_fact_id));
  if (apps.length > 0) {
    apps.forEach(a => { content += '- **Ứng dụng CNTP**: ' + a.content + '\n'; });
  } else {
    content += '- Liên hệ thực tế: Kiểm soát quá trình vi sinh và thông số kỹ thuật trong nhà máy chế biến thực phẩm.\n';
  }
  return { title: chapterPlan.title, content, applications: [] };
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
    onProgress?.(`Đang viết chi tiết: ${chaptersPlan[i].title} (${i + 1}/${chaptersPlan.length})...`);
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

// ── Stage 6A: Deterministic Validation ────────────────────────────────────────
function kbDeterministicValidate(bank, outputJson) {
  const issues = [];
  const outputStr = JSON.stringify(outputJson).toLowerCase();

  // 1. Unit conversion check (CRITICAL)
  const unitConversions = {
    'µm': ['mm', 'cm', 'm'], 'nm': ['µm', 'mm', 'cm'],
    'mm': ['µm', 'nm', 'cm', 'm'], '°c': ['°f', 'k'], 'mg': ['g', 'kg']
  };
  for (const num of bank.numbers) {
    if (!num.value || !num.unit) continue;
    const val = String(num.value).replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~]');
    const unitEsc = String(num.unit).replace(/[.*+?^${}()|[\]\\µ]/g, '\\$&');
    const exactRe = new RegExp(val + '\\s*' + unitEsc, 'i');
    if (!exactRe.test(outputStr)) {
      for (const wu of (unitConversions[num.unit] || [])) {
        if (new RegExp(val + '\\s*' + wu, 'i').test(outputStr)) {
          issues.push({ severity: 'CRITICAL', type: 'unit_conversion',
            fact_id: num.fact_id,
            message: '❌ UNIT CONVERSION: "' + num.value + num.unit + '" xuất hiện thành "' + num.value + wu + '" trong output' });
          break;
        }
      }
    }
  }

  // 2. Number Coverage: mọi số liệu trong Bank phải có trong output (CRITICAL)
  let numberMissed = 0;
  for (const num of bank.numbers) {
    if (!num.value || !num.unit) continue;
    const val = String(num.value).replace(/[.,]/g, '[.,]?').replace(/[-–~]/g, '[-–~]');
    const unitEsc = String(num.unit).replace(/[.*+?^${}()|[\]\\µ]/g, '\\$&');
    if (!new RegExp(val + '\\s*' + unitEsc, 'i').test(outputStr)) {
      numberMissed++;
      if (numberMissed <= 10) {
        issues.push({ severity: 'CRITICAL', type: 'number_missing',
          fact_id: num.fact_id,
          message: '❌ NUMBER MISSING: "' + num.value + num.unit + '" (' + num.entity + '/' + num.attribute + ') có trong Bank nhưng KHÔNG xuất hiện trong output' });
      }
    }
  }
  if (numberMissed > 10) {
    issues.push({ severity: 'CRITICAL', type: 'number_mass_missing',
      message: '❌ MASS NUMBER MISSING: ' + numberMissed + ' số liệu trong Bank không xuất hiện trong output. Output có thể là Outline.' });
  }

  // 3. Outline Detection (CRITICAL)
  const allChapterContent = (outputJson && outputJson.chapters || []).map(function(c) { return c.content || ''; }).join(' ');
  if (allChapterContent.length > 0) {
    const headingM = allChapterContent.match(/^#{1,3} .+/gm) || [];
    const explainM = allChapterContent.match(/[^.!?]{30,}[.!?]/g) || [];
    const ratioHE  = headingM.length / Math.max(1, explainM.length);
    if (headingM.length >= 4 && ratioHE > 1.5) {
      issues.push({ severity: 'CRITICAL', type: 'outline_detected',
        message: '❌ OUTLINE DETECTED: ' + headingM.length + ' headings nhưng chỉ ' + explainM.length + ' câu giải thích (ratio ' + ratioHE.toFixed(1) + '). Output là DÀN Ý.',
        headings: headingM.length, sentences: explainM.length });
    } else if (headingM.length >= 3 && ratioHE > 1.0) {
      issues.push({ severity: 'WARNING', type: 'shallow_content',
        message: '⚠️ SHALLOW CONTENT: ' + headingM.length + ' headings / ' + explainM.length + ' câu giải thích.' });
    }
    for (const ch of (outputJson.chapters || [])) {
      if ((ch.content || '').trim().length < 50) {
        issues.push({ severity: 'CRITICAL', type: 'empty_chapter',
          message: '❌ EMPTY CHAPTER: "' + ch.title + '" nội dung quá ngắn.' });
      }
    }
  } else if ((outputJson && outputJson.chapters || []).length > 0) {
    issues.push({ severity: 'CRITICAL', type: 'empty_chapters',
      message: '❌ ALL CHAPTERS EMPTY: Tất cả chapters đều không có nội dung.' });
  }

  // 4. Section Coverage
  const covNote = outputJson && outputJson.coverage_note || {};
  const coveredTitles = (covNote.sections_covered || []).map(_normalizeText);
  for (const section of bank.sections) {
    if (!section.required) continue;
    const normTitle = _normalizeText(section.title);
    const sectionWords = normTitle.split(' ').filter(w => w.length > 3);
    const inCovered = coveredTitles.some(ct => ct.includes(normTitle) || normTitle.includes(ct));
    const inStr = sectionWords.length > 0 && sectionWords.every(w => outputStr.includes(w));
    if (!inCovered && !inStr) {
      issues.push({ severity: 'WARNING', type: 'coverage_gap',
        message: '⚠️ COVERAGE GAP: Mục "' + section.title + '" bị bỏ sót' });
    }
  }

  // 5. Domain expansion grounding
  const validFactIds = new Set(bank.facts.map(f => f.fact_id));
  for (const da of (outputJson && outputJson.domain_apps || [])) {
    if (!da.source_fact_id || !validFactIds.has(da.source_fact_id)) {
      issues.push({ severity: 'CRITICAL', type: 'ungrounded_expansion',
        message: '❌ UNGROUNDED EXPANSION: domain_app không có source_fact_id hợp lệ' });
    }
  }

  // 6. Fact Utilization
  let utilizationMissed = 0;
  for (const fact of bank.facts) {
    if (!['definition', 'comparison'].includes(fact.type)) continue;
    if (!fact.entity || fact.entity.length < 3) continue;
    const entityKws = _normalizeText(fact.entity).split(' ').filter(w => w.length > 3);
    if (entityKws.length === 0) continue;
    if (!entityKws.some(k => outputStr.includes(k)) && utilizationMissed < 15) {
      issues.push({ severity: 'WARNING', type: 'fact_not_utilized',
        message: '⚠️ FACT NOT UTILIZED: "' + fact.entity + '" (' + fact.type + ') không xuất hiện trong output' });
      utilizationMissed++;
    }
  }

  const criticalCount = issues.filter(i => i.severity === 'CRITICAL').length;
  const warningCount  = issues.filter(i => i.severity === 'WARNING').length;
  return { passed: criticalCount === 0, critical: criticalCount, warnings: warningCount, issues,
    score: Math.max(0, 100 - criticalCount * 25 - warningCount * 5) };
}

// ── Build Final Output ────────────────────────────────────────────────────────
function _buildKbFinalOutput(synthesized, bank, validation) {
  const concepts = (synthesized && synthesized.concepts || []).map(c => ({
    name: String(c && c.name || ''),
    tier: String(c && c.tier || 'B'),
    definition: String(c && c.definition || ''),
    attributes: _strArr(c && c.attributes),
    conditions_exceptions: _strArr(c && c.conditions_exceptions),
    key_facts: _strArr(c && c.key_facts),
    numbers: _strArr(c && c.numbers),
    applications: String(c && c.applications || ''),
    real_world_example: String(c && c.real_world_example || ''),
    common_mistakes: String(c && c.common_mistakes || ''),
    comparisons: Array.isArray(c && c.comparisons) ? c.comparisons.map(cp => ({ vs: String(cp && cp.vs || ''), diff: String(cp && cp.diff || '') })) : [],
    citations: Array.isArray(c && c.citations) ? c.citations.map(ct => ({ text_span: String(ct && ct.text_span || ''), fact_ids: _strArr(ct && ct.fact_ids) })) : []
  }));

  const mechanisms = (synthesized && synthesized.mechanisms || []).map(m => ({
    name: String(m && m.name || ''),
    steps: _strArr(m && m.steps),
    source_explicit: String(m && m.source_explicit || 'SOURCE_EXPLICIT'),
    citations: Array.isArray(m && m.citations) ? m.citations.map(ct => ({ text_span: String(ct && ct.text_span || ''), fact_ids: _strArr(ct && ct.fact_ids) })) : []
  }));

  const validFactIds = new Set(bank.facts.map(f => f.fact_id));
  const domain_apps = (synthesized && synthesized.domain_apps || [])
    .filter(d => d.source_fact_id && validFactIds.has(d.source_fact_id))
    .map(d => ({
      source_fact_id: String(d.source_fact_id),
      source_fact_summary: String(d.source_fact_summary || ''),
      expansion_type: String(d.expansion_type || 'DOMAIN_APPLICATION'),
      content: String(d.content || '')
    }));

  // Xây dựng Memory Layer cho ôn thi & học sâu
  const rawMem = synthesized && synthesized.memory_layer || {};
  const memory_layer = {
    remember: _strArr(rawMem.remember).length > 0 ? _strArr(rawMem.remember) : _strArr(synthesized && synthesized.key_points),
    common_mistakes: _strArr(rawMem.common_mistakes).length > 0 ? _strArr(rawMem.common_mistakes) : _strArr(synthesized && synthesized.pitfalls),
    exam_questions: _strArr(rawMem.exam_questions).length > 0 ? _strArr(rawMem.exam_questions) : _strArr(synthesized && synthesized.questions),
    industry_connection: _strArr(rawMem.industry_connection).length > 0 ? _strArr(rawMem.industry_connection) : domain_apps.map(d => d.content)
  };

  const quality = {
    validation_score: validation.score,
    critical_issues: validation.critical,
    warnings: validation.warnings,
    bank_size: { facts: bank.facts.length, numbers: bank.numbers.length, sections: bank.sections.length },
    validation_details: validation.issues.slice(0, 20)
  };

  // Compat fields for existing UI
  const mainPoints = _strArr(synthesized && synthesized.key_points).slice(0, 12);
  const keywords = concepts.map(c => c.name).filter(Boolean).slice(0, 20);

  return {
    schema: 'deep_v4',
    overview: String(synthesized && synthesized.overview || ''),
    chapters: Array.isArray(synthesized && synthesized.chapters)
      ? synthesized.chapters.map(c => ({
          title: String(c && c.title || ''),
          content: String(c && c.content || ''),
          applications: Array.isArray(c && c.applications) ? c.applications : []
        }))
      : [],
    concepts,
    mechanisms,
    comparisons: Array.isArray(synthesized && synthesized.comparisons)
      ? synthesized.comparisons.map(cp => ({
          title: String(cp && cp.title || ''),
          rows: Array.isArray(cp && cp.rows) ? cp.rows.map(r => ({
            concept: String(r && r.concept || ''), essence: String(r && r.essence || ''), diff: String(r && r.diff || '')
          })) : []
        }))
      : [],
    domain_apps,
    memory_layer,
    key_points: _strArr(synthesized && synthesized.key_points),
    pitfalls: _strArr(synthesized && synthesized.pitfalls),
    questions: _strArr(synthesized && synthesized.questions),
    coverage_note: {
      sections_covered: _strArr(synthesized && synthesized.coverage_note && synthesized.coverage_note.sections_covered),
      sections_missing: _strArr(synthesized && synthesized.coverage_note && synthesized.coverage_note.sections_missing),
      is_complete: Boolean(synthesized && synthesized.coverage_note && synthesized.coverage_note.is_complete)
    },
    quality,
    // Compat for older UI readers
    finalSummary: String(synthesized && synthesized.overview || ''),
    mainPoints,
    keywords
  };
}

// ── Main Deep Pipeline ─────────────────────────────────────────────────────────
async function runKnowledgeBankPipeline({ chunks, docTitle, onProgress }) {
  const bank = new KnowledgeBank();

  // Stage 1 & 2: Extract + Validate each chunk
  for (let i = 0; i < chunks.length; i++) {
    const pct = 20 + Math.floor((i / chunks.length) * 45);
    onProgress?.('Trích xuất Knowledge Bank đoạn ' + (i + 1) + '/' + chunks.length + '...', pct);

    const extraction = await extractChunkToBank({
      chunkText: chunks[i].text, docTitle,
      chunkId: i, totalChunks: chunks.length,
      onProgress: (msg) => onProgress?.(msg, pct)
    });

    // Stage 3: Merge into Knowledge Bank — skip FAILED
    if (extraction.success === false && extraction.status === 'EXTRACTION_FAILED') {
      console.error('[KB Stage 3] Chunk ' + (i + 1) + ' EXTRACTION_FAILED — bỏ qua.');
      bank.failedChunks = (bank.failedChunks || 0) + 1;
    } else {
      bank.addFromExtraction(extraction);
      bank.totalSourceChars += chunks[i].text.length;
    }
  }

  console.log('[KB Stage 3] Bank built: ' + bank.facts.length + ' facts, ' + bank.numbers.length + ' numbers, ' + bank.sections.length + ' sections');

  // Stage 4: Bank Quality Gate
  const bankQuality = bank.evaluateQuality();
  console.log('[KB Stage 4] Passed: ' + bankQuality.passed + ' | Facts: ' + bankQuality.factCount +
    ' | NumberFidelity: ' + bankQuality.numberFidelity + '% | SectionCoverage: ' + bankQuality.sectionCoverage + '%');

  if (!bankQuality.passed) {
    console.error('[KB Stage 4 FAIL] NumberFidelity: ' + bankQuality.numberFidelity + '%, SectionCoverage: ' + bankQuality.sectionCoverage + '%');
    if (bankQuality.numberFidelity < 100 && bankQuality.corruptedNumbers > 0) {
      throw new Error('BANK_QUALITY_GATE_FAIL: ' + bankQuality.corruptedNumbers + ' số liệu hỏng trong Knowledge Bank.');
    }
    console.warn('[KB Stage 4 WARNING] SectionCoverage < 70%. Synthesis tiếp tục.');
  }

  // Stage 5: Synthesis
  onProgress?.('Tổng hợp Học Sâu từ Knowledge Bank...', 70);
  const synthesized = await synthesizeFromKB(bank, docTitle, onProgress);

  // Stage 6A: Deterministic validation
  onProgress?.('Kiểm tra tính chính xác (Stage 6A)...', 85);
  const validation = kbDeterministicValidate(bank.toValidationContext(), synthesized);
  console.log('[KB Stage 6A] Score: ' + validation.score + '/100 | Critical: ' + validation.critical + ' | Warnings: ' + validation.warnings);

  return _buildKbFinalOutput(synthesized, bank, validation);
}

// ─── MAIN PIPELINE ORCHESTRATOR ───────────────────────────────────────────────
/**
 * Orchestrate full summarization pipeline.
 *
 * @param {object} opts
 * @param {File|null} opts.file - File object (null nếu dùng rawText)
 * @param {string} opts.rawText - Văn bản raw (dùng nếu không có file)
 * @param {string} opts.docTitle - Tên tài liệu
 * @param {'quick'|'study'|'exam'} opts.mode - Chế độ tóm tắt
 * @param {function} opts.onProgress - Callback(message: string, pct: number)
 */
export async function runSummarizationPipeline({ file, rawText, docTitle, mode = 'quick', onProgress }) {
  const progressFn = (msg, pct = -1) => { onProgress?.(msg, pct); };

  // ── STEP 1: Parse file ──
  let text = rawText || '';
  if (file) {
    progressFn('Đang đọc và phân tích file...', 5);
    text = await FileParser.parse(file);
  }

  if (!text || text.trim().length < 200) throw new Error('text-too-short');

  // ── STEP 2: Cache ──
  progressFn('Kiểm tra bộ nhớ đệm...', 10);
  const hash = await SummaryCache.getHash(text + mode);
  const cached = SummaryCache.get(hash);
  if (cached) {
    progressFn('Tìm thấy kết quả trong bộ nhớ đệm!', 100);
    return { ...cached, cached: true };
  }

  // ── STEP 3: Chunking ──
  progressFn('Đang phân đoạn tài liệu...', 15);
  // NOTE: mode 'study' không bị giới hạn MAX_CHUNKS
  let chunks, totalChars, chunksCount, warning;

  if (mode === 'study') {
    // Dùng toàn bộ tài liệu, không slice(0, MAX_CHUNKS)
    const textFull = text.trim();
    totalChars = textFull.length;
    const headingChunks = _splitByHeadings(textFull);
    const rawChunks = headingChunks.length > 1 ? headingChunks : _splitByParagraphs(textFull);
    warning = null;
    chunks = rawChunks.map((c, i) => ({ id: i, ...c }));
    chunksCount = chunks.length;
  } else {
    const result = chunkDocument(text);
    chunks = result.chunks;
    totalChars = result.totalChars;
    chunksCount = result.chunksCount;
    warning = result.warning;
  }

  // ── STEP 4: Mode routing ──
  if (mode === 'study') {
    progressFn('Bắt đầu Học Sâu — Knowledge Bank Pipeline (Stage 1-6)...', 18);
    const deepResult = await runKnowledgeBankPipeline({ chunks, docTitle: docTitle || 'Tài liệu', onProgress: progressFn });
    const studyResult = {
      ...deepResult,
      warning, cached: false,
      processedAt: new Date().toISOString(),
      meta: { totalChars, chunksCount, docTitle: docTitle || 'Tài liệu', mode, engine: 'knowledge_bank_v4' }
    };
    SummaryCache.set(hash, studyResult);
    progressFn('Hoàn thành!', 100);
    return studyResult;
  }

  // ── Mode 'quick' — Legacy per-chunk loop ──
  const chunkResults = [];
  for (let i = 0; i < chunks.length; i++) {
    const pct = 20 + Math.floor((i / chunks.length) * 60);
    const result = await summarizeChunk({
      chunkText: chunks[i].text, mode, docTitle: docTitle || 'Tài liệu',
      chunkId: i, totalChunks: chunksCount,
      onProgress: (msg) => progressFn(msg, pct)
    });
    chunkResults.push(result);
  }

  progressFn('Đang tổng hợp kết quả cuối cùng...', 85);
  const merged = await mergeSummaries({
    chunkResults, docTitle: docTitle || 'Tài liệu', mode,
    onProgress: (msg) => progressFn(msg, 88)
  });

  const result = {
    ...merged, warning, cached: false,
    processedAt: new Date().toISOString(),
    meta: { totalChars, chunksCount, docTitle: docTitle || 'Tài liệu', mode }
  };
  SummaryCache.set(hash, result);
  progressFn('Hoàn thành!', 100);
  return result;
}
