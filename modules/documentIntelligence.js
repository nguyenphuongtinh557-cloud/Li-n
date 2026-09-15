/**
 * documentIntelligence.js — Hierarchical Document Summarization Pipeline
 * 
 * Pipeline:
 * [0] Preprocess → clean text
 * [1] Structure Detection → detect chapters/lessons
 * [2] Smart Chunking → split by semantic units with overlap
 * [3] Auto Title Generation → create meaningful titles
 * [4] Lesson Summary → summarize each chunk
 * [5] Chapter Aggregation → aggregate by chapter
 * [6] Global Summary → overall insights
 */

import { AIPool } from './aiPool.js';

/**
 * [1] Structure Detection
 * Phát hiện cấu trúc CHƯƠNG/BÀI từ text
 * Return: { detected: true, chapters: [...] } hoặc { detected: false }
 */
export async function detectStructure(text) {
  // Regex patterns cho heading hierarchy
  const chapterPatterns = [
    /^(CHƯƠNG|Chương|PHẦN|Phần|CHAPTER|Chapter)\s+([IVX\d]+|[0-9]+)[:\s.-]*(.*?)$/gim,
    /^([IVX]+|[0-9]+)\.\s*(CHƯƠNG|Chương|PHẦN|Phần)[:\s.-]*(.*?)$/gim
  ];

  const lessonPatterns = [
    /^(BÀI|Bài|LESSON|Lesson)\s+([0-9]+\.?[0-9]*)[:\s.-]*(.*?)$/gim,
    /^([0-9]+\.[0-9]+)[:\s.-](.*?)$/gim
  ];

  const lines = text.split('\n');
  const structure = [];
  let currentChapter = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for chapter heading
    let isChapter = false;
    for (const pattern of chapterPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        // Save previous chapter
        if (currentChapter) {
          currentChapter.content = currentContent.join('\n').trim();
          structure.push(currentChapter);
        }
        currentChapter = {
          type: 'chapter',
          title: line,
          lessons: [],
          content: ''
        };
        currentContent = [];
        isChapter = true;
        break;
      }
    }

    if (isChapter) continue;

    // Check for lesson heading
    let isLesson = false;
    for (const pattern of lessonPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match && currentChapter) {
        currentChapter.lessons.push({
          type: 'lesson',
          title: line,
          content: []
        });
        isLesson = true;
        break;
      }
    }

    if (!isLesson) {
      currentContent.push(line);
      // Add to current lesson if exists
      if (currentChapter && currentChapter.lessons.length > 0) {
        currentChapter.lessons[currentChapter.lessons.length - 1].content.push(line);
      }
    }
  }

  // Save last chapter
  if (currentChapter) {
    currentChapter.content = currentContent.join('\n').trim();
    // Finalize lesson contents
    currentChapter.lessons.forEach(lesson => {
      lesson.content = lesson.content.join('\n').trim();
    });
    structure.push(currentChapter);
  }

  if (structure.length > 0) {
    return { detected: true, chapters: structure };
  }

  return { detected: false };
}

/**
 * [2] Smart Chunking với overlap
 * Chia text thành các đoạn 800-1200 tokens với overlap 10-15%
 */
export function smartChunk(text, minTokens = 800, maxTokens = 1200, overlapPercent = 12) {
  // Estimate tokens (rough: 1 token ≈ 4 chars for Vietnamese)
  const estimateTokens = (str) => Math.ceil(str.length / 4);
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    
    if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.join('\n\n'));
      
      // Create overlap
      const overlapSize = Math.floor(currentChunk.length * (overlapPercent / 100));
      currentChunk = overlapSize > 0 ? currentChunk.slice(-overlapSize) : [];
      currentTokens = estimateTokens(currentChunk.join('\n\n'));
    }
    
    currentChunk.push(para);
    currentTokens += paraTokens;
  }

  // Add last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks;
}

/**
 * [3] Auto Title Generation
 * Tạo tiêu đề ngắn gọn (≤10 từ) cho chunk
 */
export async function generateChunkTitle(content, chunkIndex) {
  const prompt = `Đọc đoạn văn sau và tạo tiêu đề NGẮN GỌN (tối đa 10 từ) mô tả nội dung chính:

${content.slice(0, 500)}...

Chỉ trả về tiêu đề, không giải thích.`;

  try {
    // Use Gemini for fast title generation
    const key = AIPool.getKey('gemini');
    if (!key) throw new Error('No Gemini key available');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 50 }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (title) return title;
    }
  } catch (err) {
    console.warn('[DocIntel] Auto title generation failed:', err);
  }

  return `Phần ${chunkIndex + 1}`;
}

/**
 * [4] Chapter Aggregation
 * Tổng hợp summaries của các lessons thành chapter summary
 */
export async function aggregateChapterSummary(lessonSummaries, chapterTitle) {
  const allPoints = lessonSummaries.flatMap(s => s.mainPoints || []);
  const allKeywords = [...new Set(lessonSummaries.flatMap(s => s.keywords || []))];
  
  const prompt = `Từ các ý chính sau đây của các bài học trong "${chapterTitle}", hãy rút ra 3–5 ý CỐT LÕI NHẤT của CHƯƠNG:

${allPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Yêu cầu:
- CHỈ giữ ý quan trọng, loại trùng lặp
- Mỗi ý ngắn gọn, rõ ràng
- KHÔNG thêm kiến thức ngoài

Trả về JSON:
{
  "chapterMainPoints": ["ý cốt lõi 1", "ý cốt lõi 2", ...],
  "chapterKeywords": ["từ khóa chương 1", ...]
}`;

  try {
    const key = AIPool.getKey('gemini');
    if (!key) throw new Error('No Gemini key available');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;
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
          mainPoints: parsed.chapterMainPoints || [],
          keywords: parsed.chapterKeywords || allKeywords.slice(0, 15)
        };
      }
    }
  } catch (err) {
    console.warn('[DocIntel] Chapter aggregation failed:', err);
  }

  // Fallback: simple deduplication
  const uniquePoints = [...new Set(allPoints)].slice(0, 5);
  return {
    mainPoints: uniquePoints,
    keywords: allKeywords.slice(0, 15)
  };
}

/**
 * [5] Global Summary
 * Tổng hợp insights từ tất cả chapters
 */
export async function generateGlobalSummary(chapterSummaries, documentTitle = 'Tài liệu') {
  const allChapterPoints = chapterSummaries.flatMap(cs => cs.mainPoints || []);
  const allKeywords = [...new Set(chapterSummaries.flatMap(cs => cs.keywords || []))];

  const prompt = `Từ các ý chính của tất cả các chương trong "${documentTitle}", hãy rút ra 5–7 INSIGHT QUAN TRỌNG NHẤT của toàn bộ tài liệu:

${chapterSummaries.map((cs, i) => {
  return `CHƯƠNG ${i + 1}: ${cs.chapterTitle}\n${(cs.mainPoints || []).map((p, j) => `  ${j + 1}. ${p}`).join('\n')}`;
}).join('\n\n')}

Yêu cầu:
- Tập trung vào insight "level cao" (big picture)
- Loại bỏ chi tiết nhỏ, chỉ giữ khái niệm cốt lõi
- KHÔNG lặp lại ý đã có ở các chương
- KHÔNG thêm kiến thức ngoài

Trả về JSON:
{
  "globalInsights": ["insight 1", "insight 2", ...],
  "coreKeywords": ["từ khóa cốt lõi 1", ...]
}`;

  try {
    const key = AIPool.getKey('gemini');
    if (!key) throw new Error('No Gemini key available');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
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
          insights: parsed.globalInsights || [],
          keywords: parsed.coreKeywords || allKeywords.slice(0, 20)
        };
      }
    }
  } catch (err) {
    console.warn('[DocIntel] Global summary failed:', err);
  }

  // Fallback
  return {
    insights: [...new Set(allChapterPoints)].slice(0, 7),
    keywords: allKeywords.slice(0, 20)
  };
}

/**
 * MAIN PIPELINE: processDocument
 * Entry point cho toàn bộ hierarchical summarization
 */
export async function processDocument({
  text,
  documentTitle = 'Tài liệu',
  mode = 'quick',
  onProgress = null
}) {
  const result = {
    documentTitle,
    mode,
    structure: null,
    chapters: [],
    globalSummary: null,
    processedAt: new Date().toISOString()
  };

  // Progress helper
  const reportProgress = (step, percent, message) => {
    if (onProgress) onProgress({ step, percent, message });
  };

  reportProgress('structure', 10, 'Phát hiện cấu trúc tài liệu...');

  // [1] Structure Detection
  const structureResult = await detectStructure(text);

  if (structureResult.detected) {
    // Có cấu trúc rõ ràng
    result.structure = 'hierarchical';
    reportProgress('chunking', 20, 'Đang xử lý các chương và bài...');

    // Process each chapter
    for (let chIdx = 0; chIdx < structureResult.chapters.length; chIdx++) {
      const chapter = structureResult.chapters[chIdx];
      const chapterData = {
        title: chapter.title,
        lessons: []
      };

      reportProgress('summarizing', 20 + (chIdx / structureResult.chapters.length) * 50, 
        `Đang tóm tắt ${chapter.title}...`);

      // Process lessons or chunk chapter content
      if (chapter.lessons.length > 0) {
        // Has lessons
        for (const lesson of chapter.lessons) {
          if (!lesson.content || lesson.content.length < 100) continue;
          
          try {
            const summary = await AIPool.generateLessonSummary({
              mode,
              chapterTitle: chapter.title,
              lessonTitle: lesson.title,
              source: lesson.content
            });
            chapterData.lessons.push({
              title: lesson.title,
              summary
            });
          } catch (err) {
            console.warn('[DocIntel] Lesson summary failed:', err);
          }
        }
      } else {
        // No lessons, chunk the chapter content
        const chunks = smartChunk(chapter.content);
        for (let i = 0; i < chunks.length; i++) {
          const chunkTitle = await generateChunkTitle(chunks[i], i);
          try {
            const summary = await AIPool.generateLessonSummary({
              mode,
              chapterTitle: chapter.title,
              lessonTitle: chunkTitle,
              source: chunks[i]
            });
            chapterData.lessons.push({
              title: chunkTitle,
              summary
            });
          } catch (err) {
            console.warn('[DocIntel] Chunk summary failed:', err);
          }
        }
      }

      // Aggregate chapter summary
      if (chapterData.lessons.length > 0) {
        chapterData.aggregatedSummary = await aggregateChapterSummary(
          chapterData.lessons.map(l => l.summary),
          chapter.title
        );
      }

      result.chapters.push(chapterData);
    }
  } else {
    // Không phát hiện được cấu trúc → fallback chunking
    result.structure = 'flat';
    reportProgress('chunking', 20, 'Chia tài liệu thành các phần...');

    const chunks = smartChunk(text);
    const flatChapter = {
      title: documentTitle,
      lessons: []
    };

    for (let i = 0; i < chunks.length; i++) {
      reportProgress('summarizing', 20 + (i / chunks.length) * 50, 
        `Đang xử lý phần ${i + 1}/${chunks.length}...`);

      const chunkTitle = await generateChunkTitle(chunks[i], i);
      try {
        const summary = await AIPool.generateLessonSummary({
          mode,
          chapterTitle: documentTitle,
          lessonTitle: chunkTitle,
          source: chunks[i]
        });
        flatChapter.lessons.push({
          title: chunkTitle,
          summary
        });
      } catch (err) {
        console.warn('[DocIntel] Chunk summary failed:', err);
      }
    }

    if (flatChapter.lessons.length > 0) {
      flatChapter.aggregatedSummary = await aggregateChapterSummary(
        flatChapter.lessons.map(l => l.summary),
        documentTitle
      );
    }

    result.chapters.push(flatChapter);
  }

  // [5] Generate Global Summary
  reportProgress('aggregating', 80, 'Tạo tóm tắt tổng thể...');
  
  const chapterSummaries = result.chapters.map(ch => ({
    chapterTitle: ch.title,
    mainPoints: ch.aggregatedSummary?.mainPoints || [],
    keywords: ch.aggregatedSummary?.keywords || []
  }));

  result.globalSummary = await generateGlobalSummary(chapterSummaries, documentTitle);

  reportProgress('complete', 100, 'Hoàn thành!');

  return result;
}
