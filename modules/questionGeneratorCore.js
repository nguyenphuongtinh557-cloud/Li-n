/**
 * questionGeneratorCore.js — Core AI Question Generation Engine
 * 
 * Refactored from generator.js with improvements:
 * - API proxy support (for server-side key protection)
 * - Better chunk management with source tracking
 * - Integrated validation
 * - Unified for both user and admin flows
 */

import { QuestionValidator } from './questionValidator.js';

// System prompt base
const BASE_SYSTEM_PROMPT = `Bạn là chuyên gia giảng dạy môn Quản lý Chất lượng và An toàn Thực phẩm tại Việt Nam.
Nhiệm vụ: Tạo câu hỏi trắc nghiệm 4 đáp án (A, B, C, D) từ nội dung được cung cấp. Chỉ có duy nhất 1 đáp án đúng.
Trọng tâm: Vét sạch mọi khía cạnh có thể ra thi, sinh ra TẤT CẢ các câu hỏi có thể khai thác, tuyệt đối không lặp lại ý tưởng.

ĐỊNH DẠNG BẮT BUỘC (JSON Object chứa mảng 'questions'):
{
  "questions": [
    {
      "q": "Câu hỏi...",
      "options": ["A", "B", "C", "D"],
      "correct": 0,
      "difficulty": 1,
      "chapter": 1,
      "exp": "Giải thích ngắn gọn"
    }
  ]
}
Tuyệt đối chỉ trả về JSON hợp lệ, không có markdown hay bất kỳ chữ nào khác.`;

// Prompts theo Layer (cho multi-layer mode)
const LAYER_PROMPTS = {
  layer1: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG NHẬN BIẾT - LAYER 1):\n- Hỏi về định nghĩa, tiêu chuẩn cơ bản.\n- Thuộc tính difficulty luôn bằng 1.`,
  layer3: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG VẬN DỤNG - LAYER 3):\n- Tạo câu hỏi tình huống thực tế, xử lý sự cố tại nhà máy thực phẩm.\n- Thuộc tính difficulty luôn bằng 2.`,
  layer4: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐẶC BIỆT (TẦNG SUY LUẬN SÂU - LAYER 4):\n- Tạo câu hỏi cực khó mang tính tổng hợp, phân tích rủi ro (Risk Assessment). Đòi hỏi suy luận logic, có các bẫy (distractor) hợp lý.\n- Thuộc tính difficulty luôn bằng 3.`
};

// Prompts theo độ khó (cho single difficulty mode)
const DIFFICULTY_PROMPTS = {
  easy: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐỘ KHÓ (DỄ):\n- Câu hỏi nhận biết, nhớ lại định nghĩa, khái niệm cơ bản.\n- Đáp án rõ ràng, không có bẫy phức tạp.\n- Thuộc tính difficulty = 1.`,
  medium: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐỘ KHÓ (TRUNG BÌNH):\n- Câu hỏi hiểu và áp dụng kiến thức vào tình huống cụ thể.\n- Đòi hỏi suy luận nhẹ, phân biệt các khái niệm liên quan.\n- Thuộc tính difficulty = 2.`,
  hard: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐỘ KHÓ (KHÓ):\n- Câu hỏi phân tích, tổng hợp, đánh giá tình huống phức tạp.\n- Có distractor (đáp án nhiễu) hợp lý đòi hỏi suy luận kỹ.\n- Thuộc tính difficulty = 3.`,
  mixed: `${BASE_SYSTEM_PROMPT}\n\nYÊU CẦU ĐỘ KHÓ (HỖN HỢP):\n- Sinh câu hỏi ở nhiều mức độ: 40% dễ (nhận biết), 40% trung bình (hiểu & áp dụng), 20% khó (phân tích).\n- Phân bố thuộc tính difficulty: 1 (dễ), 2 (TB), 3 (khó) tương ứng.`
};

const PREMIUM_MODELS = {
  'sambanova-llama': { provider: 'sambanova', model: 'Meta-Llama-3.3-70B-Instruct' },
  'mistral-large': { provider: 'mistral', model: 'mistral-large-latest' },
  'deepseek-r1': { provider: 'openrouter', model: 'deepseek/deepseek-r1' },
  'claude-3-5': { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' },
  'gpt-4o': { provider: 'openrouter', model: 'openai/gpt-4o' }
};

/**
 * Parse JSON response from AI
 */
function parseJSONResponse(rawText) {
  try {
    // Remove markdown code blocks
    let clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    
    // Try to extract JSON array or object
    const jsonMatch = clean.match(/\{[\s\S]*"questions"[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      clean = jsonMatch[0];
    }
    
    const parsed = JSON.parse(clean);
    
    // Handle both array and object with questions property
    if (Array.isArray(parsed)) {
      return parsed;
    } else if (parsed.questions && Array.isArray(parsed.questions)) {
      return parsed.questions;
    }
    
    return [];
  } catch (error) {
    console.error('[QuestionGenerator] JSON parse error:', error);
    console.error('[QuestionGenerator] Raw text:', rawText);
    return [];
  }
}

/**
 * Split text into overlapping chunks
 */
function splitIntoChunks(text, chunkSize = 2500, overlap = 200) {
  if (text.length <= chunkSize) {
    return [{ text, index: 0, start: 0, end: text.length }];
  }
  
  const chunks = [];
  let index = 0;
  let position = 0;
  
  while (position < text.length) {
    let end = Math.min(position + chunkSize, text.length);
    
    // Try to break at sentence boundary
    if (end < text.length) {
      const sentenceBreak = text.lastIndexOf('. ', end);
      const paragraphBreak = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(sentenceBreak, paragraphBreak);
      
      if (breakPoint > position + chunkSize / 2) {
        end = breakPoint + 1;
      }
    }
    
    chunks.push({
      text: text.slice(position, end).trim(),
      index,
      start: position,
      end
    });

    // Stop after adding the final chunk. Otherwise `end - overlap` can become
    // `text.length - overlap`, causing the last short chunk to repeat forever.
    if (end >= text.length) break;
    
    position = end - overlap; // Overlap for context continuity
    index++;
  }
  
  return chunks;
}

/**
 * Call AI API (supports both direct and proxy modes)
 */
async function callAI(config) {
  const {
    provider,
    model,
    systemPrompt,
    userMessage,
    temperature = 0.7,
    apiKey,
    useProxy = false,
    firebaseToken
  } = config;
  
  if (useProxy) {
    // Call through API proxy (server-side)
    const response = await fetch('/api/ai-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify({
        provider,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API proxy error: ${response.status}`);
    }
    
    return await response.json();
  } else {
    // Direct API call (legacy mode, keys in client)
    return await callAIDirect(provider, model, systemPrompt, userMessage, temperature, apiKey);
  }
}

/**
 * Direct API calls (legacy, will be deprecated)
 */
async function callAIDirect(provider, model, systemPrompt, userMessage, temperature, apiKey) {
  const urls = {
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    gemini: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    openrouter: 'https://openrouter.ai/api/v1/chat/completions'
  };
  
  const url = urls[provider];
  if (!url) throw new Error(`Unknown provider: ${provider}`);
  
  if (provider === 'gemini') {
    // Gemini has different request format
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    
    if (!response.ok) throw new Error(`Gemini error: ${response.status}`);
    
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return { content: text };
  } else {
    // OpenAI-compatible format (Groq, Mistral, OpenRouter)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!response.ok) throw new Error(`${provider} error: ${response.status}`);
    
    const data = await response.json();
    return { content: data.choices[0].message.content };
  }
}

export const QuestionGenerator = {
  /**
   * Main generation function
   */
  async generate(content, config, onProgress) {
    const {
      targetCount = 10,
      mode = 'standard', // 'standard' | 'multi-layer' | 'premium'
      premiumModel = 'deepseek-r1',
      subjectId,
      subjectName,
      difficulty = 'mixed',
      chapters = [],
      useProxy = false,
      firebaseToken,
      getAPIKey // Legacy: function to get API keys
    } = config;
    
    // Split content into chunks
    const chunkSize = 2500;
    const chunks = splitIntoChunks(content, chunkSize, 200);
    
    onProgress?.({
      stage: 'chunking',
      message: `Đã chia tài liệu thành ${chunks.length} đoạn`,
      current: 0,
      total: chunks.length
    });
    
    // P0 Fix #1: Allocate question count to ALL chunks before processing
    // This ensures full document coverage, not just early chunks
    const allocations = this._allocateQuestionCount(targetCount, chunks.length);
    
    // P0 Fix V2: For multi-layer mode, allocate questions to levels FIRST,
    // then distribute level quotas to chunks
    let chunkPlan = null; // Array of {chunkIndex, level, count}
    if (mode === 'multi-layer') {
      const allocation = this._allocateDifficultyAndChunks(targetCount, chunks.length, difficulty);
      chunkPlan = allocation.plan;
    }
    
    const allQuestions = [];
    const chunkResults = []; // Track each chunk's result for error reporting
    
    // Process ALL chunks (don't stop early)
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // P0 Fix V2: Get allocation from plan (multi-layer) or fallback to old allocation
      let countForThisChunk, chunkDifficulty;
      if (mode === 'multi-layer' && chunkPlan) {
        // Find this chunk in the plan
        const planItem = chunkPlan.find(p => p.chunkIndex === i);
        if (!planItem) {
          countForThisChunk = 0;
          chunkDifficulty = null;
        } else if (planItem.levels) {
          // Multi-level item (1 chunk with all levels)
          countForThisChunk = planItem.count;
          chunkDifficulty = planItem.levels; // Array of levels
        } else {
          // Single-level item
          countForThisChunk = planItem.count;
          chunkDifficulty = planItem.level; // String
        }
      } else {
        countForThisChunk = allocations[i];
        chunkDifficulty = difficulty;
      }
      
      // P0 Fix: Skip chunks with 0 allocation (when chunks > targetCount)
      if (countForThisChunk === 0) {
        onProgress?.({
          stage: 'skipping',
          message: `Bỏ qua đoạn ${i + 1}/${chunks.length} (không cần sinh câu từ đoạn này)`,
          current: i,
          total: chunks.length,
          percentage: Math.round((i / chunks.length) * 80)
        });
        
        chunkResults.push({
          chunkIndex: i,
          ok: true,
          skipped: true,
          questionsGenerated: 0,
          requested: 0
        });
        
        continue;
      }
      
      const modeText = mode === 'premium' ? `Premium (${premiumModel})` : 
                       mode === 'multi-layer' ? `Đa tầng (${chunkDifficulty || 'mixed'})` : 
                       'Chuẩn (Gemini)';
      
      onProgress?.({
        stage: 'generating',
        message: `Đang xử lý đoạn ${i + 1}/${chunks.length} với ${modeText}... (cần ${countForThisChunk} câu)`,
        current: i,
        total: chunks.length,
        percentage: Math.round((i / chunks.length) * 80)
      });
      
      try {
        let result;
        
        if (mode === 'premium') {
          result = await this.generatePremium(chunk.text, countForThisChunk, difficulty, premiumModel, {
            useProxy,
            firebaseToken,
            getAPIKey,
            chunkIndex: i
          });
        } else if (mode === 'multi-layer') {
          // P0 Fix V2: Use pre-allocated difficulty and count from plan
          const planItem = chunkPlan.find(p => p.chunkIndex === i);
          const callOptions = {
            useProxy,
            firebaseToken,
            getAPIKey,
            chunkIndex: i
          };
          
          // If plan item has countsPerLevel, pass it along
          if (planItem?.countsPerLevel) {
            callOptions.countsPerLevel = planItem.countsPerLevel;
          }
          
          result = await this.generateMultiLayer(chunk.text, countForThisChunk, chunkDifficulty, callOptions);
        } else {
          result = await this.generateStandard(chunk.text, countForThisChunk, difficulty, {
            useProxy,
            firebaseToken,
            getAPIKey,
            chunkIndex: i
          });
        }
        
        // P0 Fix #3: Structured result tracking
        chunkResults.push({
          chunkIndex: i,
          ok: true,
          questionsGenerated: result.questions?.length || 0,
          requested: countForThisChunk,
          providers: result.providers || [],
          models: result.models || [],
          layerResults: result.layerResults || null,
          layerErrors: result.layerErrors || []
        });
        
        // Add source metadata
        const questions = (result.questions || []).map(q => ({
          ...q,
          sourceChunk: i,
          sourceStart: chunk.start,
          sourceEnd: chunk.end,
          sourceText: chunk.text.slice(0, 200), // Preview
          // P0 Fix #4: Use per-question metadata if available, else use chunk-level
          generatedBy: q._layerProvider || result.provider || result.providers?.[0] || 'unknown',
          modelUsed: q._layerModel || result.model || result.models?.[0] || 'unknown'
        }));
        
        allQuestions.push(...questions);
        
      } catch (error) {
        console.error(`[QuestionGenerator] Error processing chunk ${i}:`, error);
        
        // P0 Fix #3: Track errors but continue processing other chunks
        chunkResults.push({
          chunkIndex: i,
          ok: false,
          error: error.message,
          errorCode: error.code || 'unknown-error',
          requested: countForThisChunk,
          questionsGenerated: 0
        });
        
        onProgress?.({
          stage: 'error',
          message: `Lỗi đoạn ${i + 1}: ${error.message}`,
          current: i,
          total: chunks.length
        });
      }
    }
    
    // Validation and deduplication
    onProgress?.({
      stage: 'validating',
      message: 'Đang kiểm tra và chuẩn hóa câu hỏi...',
      percentage: 85
    });
    
    const validation = QuestionValidator.validateBatch(allQuestions);
    let validQuestions = validation.valid.map(v => v.question);
    
    onProgress?.({
      stage: 'deduplicating',
      message: 'Đang loại trùng lặp...',
      percentage: 90
    });
    
    const dedup = QuestionValidator.removeDuplicates(validQuestions);
    validQuestions = dedup.unique;
    
    // Shuffle
    for (let i = validQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [validQuestions[i], validQuestions[j]] = [validQuestions[j], validQuestions[i]];
    }
    
    // P0 Fix #1: Don't over-generate; limit to target but warn if under
    const finalQuestions = validQuestions.slice(0, targetCount);
    const isPartialResult = finalQuestions.length < targetCount;
    
    onProgress?.({
      stage: 'complete',
      message: isPartialResult 
        ? `Hoàn thành một phần: ${finalQuestions.length}/${targetCount} câu hợp lệ`
        : `Hoàn thành! Tạo được ${finalQuestions.length}/${targetCount} câu hỏi`,
      percentage: 100
    });
    
    // P0 Fix #3 & #4: Include detailed stats and error reporting
    const failedChunks = chunkResults.filter(r => !r.ok);
    
    return {
      questions: finalQuestions,
      success: !isPartialResult || finalQuestions.length > 0,
      isPartialResult,
      stats: {
        requested: targetCount,
        totalGenerated: allQuestions.length,
        validQuestions: validation.valid.length,
        invalidQuestions: validation.invalid.length,
        duplicatesRemoved: dedup.removed.length,
        finalCount: finalQuestions.length,
        chunks: chunks.length,
        chunksProcessed: chunkResults.length,
        chunksFailed: failedChunks.length,
        shortfall: isPartialResult ? targetCount - finalQuestions.length : 0
      },
      chunkResults, // P0 Fix #3: Detailed per-chunk results
      failedChunks: failedChunks.map(c => ({
        chunkIndex: c.chunkIndex,
        error: c.error,
        errorCode: c.errorCode
      })),
      validation
    };
  },
  
  /**
   * P0 Fix #1: Allocate question count across all chunks
   * Ensures full document coverage without over-generating
   * Handles case where chunks > targetCount by selecting representative chunks
   */
  _allocateQuestionCount(targetCount, numChunks) {
    if (numChunks === 0) return [];
    if (numChunks === 1) return [targetCount];
    
    // P0 Fix V2: If more chunks than questions, ensure BOTH first AND last chunks are included
    if (numChunks > targetCount) {
      const allocations = new Array(numChunks).fill(0);
      
      if (targetCount === 1) {
        // Special case: only 1 question, use first chunk
        allocations[0] = 1;
        return allocations;
      }
      
      // Select chunks evenly spaced INCLUDING first (0) and last (numChunks-1)
      // Strategy: divide the range [0, numChunks-1] into (targetCount-1) equal segments
      const step = (numChunks - 1) / (targetCount - 1);
      
      for (let i = 0; i < targetCount; i++) {
        const chunkIndex = Math.round(i * step);
        allocations[chunkIndex]++;
      }
      
      return allocations;
    }
    
    // Normal case: distribute evenly, with any remainder going to first chunks
    const baseCount = Math.floor(targetCount / numChunks);
    const remainder = targetCount % numChunks;
    
    const allocations = [];
    for (let i = 0; i < numChunks; i++) {
      allocations.push(baseCount + (i < remainder ? 1 : 0));
    }
    
    return allocations;
  },
  
  /**
   * P0 Fix V2: Allocate difficulty levels AND question counts properly
   * Strategy: Allocate questions to levels first, then distribute to chunks
   * @param {number} targetCount - Total questions to generate
   * @param {number} numChunks - Total number of chunks available
   * @param {string|string[]} difficulty - Selected difficulty levels
   * @returns {Object} - { plan: Array<{chunkIndex, level, count}>, totalAllocated }
   */
  _allocateDifficultyAndChunks(targetCount, numChunks, difficulty) {
    // Determine selected levels
    const selectedLevels = Array.isArray(difficulty) ? difficulty : 
                          difficulty === 'mixed' ? ['easy', 'medium', 'hard'] :
                          [difficulty];
    
    if (selectedLevels.length === 1) {
      // Single level: allocate all questions to it, distribute across chunks
      const chunkAllocations = this._allocateQuestionCount(targetCount, numChunks);
      const plan = chunkAllocations.map((count, idx) => ({
        chunkIndex: idx,
        level: selectedLevels[0],
        count
      }));
      return { plan, totalAllocated: targetCount };
    }
    
    // When there are fewer chunks than selected levels, let each chunk call
    // multiple levels. Assigning one level per chunk would drop the remaining
    // levels (and their question quotas) entirely.
    if (numChunks < selectedLevels.length) {
      const countPerLevel = this._allocateQuestionCount(targetCount, selectedLevels.length);
      const plan = [];
      const allocatedPerLevel = Object.fromEntries(selectedLevels.map(level => [level, 0]));

      for (let levelIdx = 0; levelIdx < selectedLevels.length; levelIdx++) {
        const level = selectedLevels[levelIdx];
        const levelCount = countPerLevel[levelIdx];
        if (levelCount === 0) continue;

        // Spread this level's quota across all chunks, including both ends
        // when the quota is smaller than the chunk count.
        const perChunk = this._allocateQuestionCount(levelCount, numChunks);
        perChunk.forEach((count, chunkIndex) => {
          if (count === 0) return;

          let item = plan.find(entry => entry.chunkIndex === chunkIndex);
          if (!item) {
            item = {
              chunkIndex,
              levels: selectedLevels,
              countsPerLevel: Object.fromEntries(selectedLevels.map(selectedLevel => [selectedLevel, 0])),
              count: 0
            };
            plan.push(item);
          }

          item.countsPerLevel[level] += count;
          item.count += count;
          allocatedPerLevel[level] += count;
        });
      }

      plan.sort((a, b) => a.chunkIndex - b.chunkIndex);
      return {
        plan,
        totalAllocated: plan.reduce((sum, item) => sum + item.count, 0),
        allocatedPerLevel
      };
    }
    
    // Multiple chunks: Step 1 - Allocate questions to each difficulty level
    const countPerLevel = this._allocateQuestionCount(targetCount, selectedLevels.length);
    
    // Step 2: Allocate chunks to each difficulty level (round-robin)
    const chunksPerLevel = {};
    for (let i = 0; i < selectedLevels.length; i++) {
      chunksPerLevel[selectedLevels[i]] = [];
    }
    
    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      const levelIdx = chunkIdx % selectedLevels.length;
      const level = selectedLevels[levelIdx];
      chunksPerLevel[level].push(chunkIdx);
    }
    
    // Step 3: Distribute each level's question count across its assigned chunks
    const plan = [];
    let totalAllocated = 0;
    
    for (let levelIdx = 0; levelIdx < selectedLevels.length; levelIdx++) {
      const level = selectedLevels[levelIdx];
      const questionCount = countPerLevel[levelIdx];
      const assignedChunks = chunksPerLevel[level];
      
      if (assignedChunks.length === 0 || questionCount === 0) continue;
      
      // Distribute this level's questions across its chunks
      const chunkQuestionCounts = this._allocateQuestionCount(questionCount, assignedChunks.length);
      
      for (let i = 0; i < assignedChunks.length; i++) {
        const chunkIdx = assignedChunks[i];
        const count = chunkQuestionCounts[i];
        if (count > 0) {
          plan.push({ chunkIndex: chunkIdx, level, count });
          totalAllocated += count;
        }
      }
    }
    
    // Sort by chunkIndex for easier processing
    plan.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    return { plan, totalAllocated };
  },
  
  /**
   * P0 Fix #2: Allocate difficulty levels across ALL chunks for multi-layer mode
   * This prevents each chunk from independently splitting 1 question into 3 layers
   * @deprecated Use _allocateDifficultyAndChunks for correct question-per-level allocation
   * 
   * @param {number} targetCount - Total questions to generate
   * @param {number[]} allocations - Per-chunk question allocations
   * @param {string|string[]} difficulty - Selected difficulty levels
   * @returns {(string|string[])[]} - Per-chunk difficulty assignment
   */
  _allocateDifficultyLevels(targetCount, allocations, difficulty) {
    // Determine selected levels
    const selectedLevels = Array.isArray(difficulty) ? difficulty : 
                          difficulty === 'mixed' ? ['easy', 'medium', 'hard'] :
                          [difficulty];
    
    if (selectedLevels.length === 1) {
      // Single level: all chunks use same level
      return allocations.map(() => selectedLevels[0]);
    }
    
    // Multiple levels: distribute across active chunks
    const activeChunks = allocations.map((count, idx) => ({ idx, count }))
                                   .filter(c => c.count > 0);
    
    if (activeChunks.length === 0) return [];
    
    // Allocate levels to chunks in round-robin
    const plan = new Array(allocations.length).fill(null);
    
    for (let i = 0; i < activeChunks.length; i++) {
      const chunkIdx = activeChunks[i].idx;
      const levelIdx = i % selectedLevels.length;
      plan[chunkIdx] = selectedLevels[levelIdx];
    }
    
    return plan;
  },
  
  /**
   * Standard generation (single model)
   */
  async generateStandard(content, count, difficulty, options) {
    const { useProxy, firebaseToken, getAPIKey, chunkIndex = 0 } = options;
    
    // P0 Fix #2: Select prompt based on difficulty
    const systemPrompt = DIFFICULTY_PROMPTS[difficulty] || DIFFICULTY_PROMPTS.mixed;
    
    const userMessage = `Nội dung tài liệu:\n${content}\n\nHãy sinh ĐÚNG ${count} câu hỏi trắc nghiệm theo cấu trúc JSON object { "questions": [...] }. Trả về ĐÚNG chuẩn JSON.`;
    
    try {
      const result = await callAI({
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        systemPrompt,
        userMessage,
        apiKey: getAPIKey?.('gemini'),
        useProxy,
        firebaseToken
      });
      
      const questions = parseJSONResponse(result.content);
      
      // P0 Fix #2: Limit to exact count to prevent over-generation
      const limitedQuestions = questions.slice(0, count);
      
      // P0 Fix #4: Return provider/model info
      return {
        questions: limitedQuestions,
        provider: result.provider || 'gemini',
        model: result.model || 'gemini-3.5-flash-lite',
        providers: [result.provider || 'gemini'],
        models: [result.model || 'gemini-3.5-flash-lite'],
        requested: count,
        generated: questions.length,
        used: limitedQuestions.length
      };
    } catch (error) {
      console.error('[QuestionGenerator] Standard generation error:', error);
      // P0 Fix #3: Re-throw with structured info instead of silent empty array
      throw Object.assign(error, {
        chunkIndex,
        provider: 'gemini',
        code: error.code || 'generation-failed'
      });
    }
  },
  
  /**
   * Multi-layer generation (parallel calls)
   */
  async generateMultiLayer(content, count, difficulty, options) {
    const { useProxy, firebaseToken, getAPIKey, chunkIndex = 0, countsPerLevel } = options;
    
    // P0 Fix V2: Handle difficulty selection properly
    // difficulty can be:
    // - Single string: 'easy', 'medium', 'hard' (from pre-allocation)
    // - Array: ['easy', 'medium'] (user selected 2 levels)
    // - 'mixed': all 3 levels
    // If countsPerLevel provided, use explicit counts per level (for single chunk case)
    
    const selectedLevels = Array.isArray(difficulty) ? difficulty : 
                          difficulty === 'mixed' ? ['easy', 'medium', 'hard'] :
                          [difficulty];
    
    // P0 Fix: If single level pre-allocated, call only that layer
    if (selectedLevels.length === 1 && !countsPerLevel) {
      try {
        return await this.generateSingleLayer(content, count, selectedLevels[0], {
          useProxy,
          firebaseToken,
          getAPIKey,
          chunkIndex
        });
      } catch (error) {
        // Track error in layerErrors format
        const layerConfigs = {
          easy: { provider: 'groq', model: 'openai/gpt-oss-120b' },
          medium: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
          hard: { provider: 'mistral', model: 'ministral-8b-latest' }
        };
        const config = layerConfigs[selectedLevels[0]];
        
        return {
          questions: [],
          provider: config?.provider || 'unknown',
          model: config?.model || 'unknown',
          providers: [],
          models: [],
          requested: count,
          generated: 0,
          used: 0,
          layerResults: [],
          layerErrors: [{
            level: selectedLevels[0],
            provider: config?.provider || 'unknown',
            model: config?.model || 'unknown',
            error: error.message
          }]
        };
      }
    }
    
    const userMessage = (layerPrompt, countForLayer) => 
      `Nội dung tài liệu:\n${content}\n\nHãy sinh ĐÚNG ${countForLayer} câu hỏi theo cấu trúc JSON object { "questions": [...] }. Trả về ĐÚNG chuẩn JSON.`;
    
    const results = [];
    const errors = [];
    
    try {
      // Map difficulty levels to layer configs
      const layerConfigs = {
        easy: { prompt: LAYER_PROMPTS.layer1, provider: 'groq', model: 'openai/gpt-oss-120b', name: 'layer1' },
        medium: { prompt: LAYER_PROMPTS.layer3, provider: 'gemini', model: 'gemini-3.5-flash-lite', name: 'layer3' },
        hard: { prompt: LAYER_PROMPTS.layer4, provider: 'mistral', model: 'ministral-8b-latest', name: 'layer4' }
      };
      
      // Only call selected layers
      const layersToCall = selectedLevels.map(level => ({
        level,
        config: layerConfigs[level]
      })).filter(l => l.config);
      
      if (layersToCall.length === 0) {
        // Fallback to mixed if no valid selection
        layersToCall.push(
          { level: 'easy', config: layerConfigs.easy },
          { level: 'medium', config: layerConfigs.medium },
          { level: 'hard', config: layerConfigs.hard }
        );
      }
      
      // P0 Fix V2: Allocate count precisely
      // If countsPerLevel provided (single chunk case), use explicit counts
      // Otherwise split count evenly across layers
      const allocations = countsPerLevel 
        ? layersToCall.map(({ level }) => countsPerLevel[level] || 0)
        : this._allocateQuestionCount(count, layersToCall.length);
      
      // Call all selected layers in parallel
      const promises = layersToCall.map(async ({ level, config }, index) => {
        const countForLayer = allocations[index];
        
        if (countForLayer === 0) {
          return {
            ok: true,
            level,
            provider: config.provider,
            model: config.model,
            questions: [],
            skipped: true
          };
        }
        
        try {
          const result = await callAI({
            provider: config.provider,
            model: config.model,
            systemPrompt: config.prompt,
            userMessage: userMessage(config.prompt, countForLayer),
            apiKey: getAPIKey?.(config.provider),
            useProxy,
            firebaseToken
          });
          
          const questions = parseJSONResponse(result.content);
          
          // P0 Fix #2: Limit to exact count requested to maintain ratio
          const limitedQuestions = questions.slice(0, countForLayer);
          
          // P0 Fix #4: Tag each question with its actual provider/model
          const taggedQuestions = limitedQuestions.map(q => ({
            ...q,
            _layerProvider: result.provider || config.provider,
            _layerModel: result.model || config.model,
            _layerLevel: level
          }));
          
          return {
            ok: true,
            level,
            provider: result.provider || config.provider,
            model: result.model || config.model,
            questions: taggedQuestions,
            requested: countForLayer,
            generated: questions.length,
            used: limitedQuestions.length
          };
        } catch (error) {
          console.error(`[QuestionGenerator] Layer ${config.name} error:`, error);
          // P0 Fix #3: Track errors but don't fail entire operation
          errors.push({
            level,
            provider: config.provider,
            model: config.model,
            error: error.message,
            errorCode: error.code || 'layer-failed',
            requested: countForLayer
          });
          return {
            ok: false,
            level,
            provider: config.provider,
            model: config.model,
            questions: [],
            requested: countForLayer
          };
        }
      });
      
      const layerResults = await Promise.all(promises);
      
      // Collect all questions
      const allQuestions = [];
      const providers = [];
      const models = [];
      
      for (const result of layerResults) {
        if (result.ok && result.questions.length > 0) {
          allQuestions.push(...result.questions);
          providers.push(result.provider);
          models.push(result.model);
        }
      }
      
      // P0 Fix #3: If all layers failed, throw error with details
      if (allQuestions.length === 0 && errors.length > 0) {
        const error = new Error(`All layers failed: ${errors.map(e => `${e.level}(${e.error})`).join('; ')}`);
        error.chunkIndex = chunkIndex;
        error.code = 'all-layers-failed';
        error.layerErrors = errors;
        throw error;
      }
      
      // P0 Fix #4: Return provider/model info
      return {
        questions: allQuestions,
        providers,
        models,
        layerResults: layerResults.map(r => ({
          level: r.level,
          provider: r.provider,
          model: r.model,
          ok: r.ok,
          requested: r.requested || 0,
          generated: r.generated || 0,
          used: r.used || 0,
          skipped: r.skipped || false
        })),
        layerErrors: errors
      };
      
    } catch (error) {
      console.error('[QuestionGenerator] Multi-layer generation error:', error);
      // P0 Fix #3: Re-throw with structured info
      throw Object.assign(error, {
        chunkIndex,
        code: error.code || 'multi-layer-failed'
      });
    }
  },
  
  /**
   * Generate from single layer (helper for pre-allocated difficulty)
   */
  async generateSingleLayer(content, count, level, options) {
    const { useProxy, firebaseToken, getAPIKey, chunkIndex = 0 } = options;
    
    const layerConfigs = {
      easy: { prompt: LAYER_PROMPTS.layer1, provider: 'groq', model: 'openai/gpt-oss-120b', name: 'layer1' },
      medium: { prompt: LAYER_PROMPTS.layer3, provider: 'gemini', model: 'gemini-3.5-flash-lite', name: 'layer3' },
      hard: { prompt: LAYER_PROMPTS.layer4, provider: 'mistral', model: 'ministral-8b-latest', name: 'layer4' }
    };
    
    const config = layerConfigs[level];
    if (!config) {
      throw new Error(`Unknown difficulty level: ${level}`);
    }
    
    const userMessage = `Nội dung tài liệu:\n${content}\n\nHãy sinh ĐÚNG ${count} câu hỏi theo cấu trúc JSON object { "questions": [...] }. Trả về ĐÚNG chuẩn JSON.`;
    
    try {
      const result = await callAI({
        provider: config.provider,
        model: config.model,
        systemPrompt: config.prompt,
        userMessage,
        apiKey: getAPIKey?.(config.provider),
        useProxy,
        firebaseToken
      });
      
      const questions = parseJSONResponse(result.content);
      const limitedQuestions = questions.slice(0, count);
      
      // Tag each question
      const taggedQuestions = limitedQuestions.map(q => ({
        ...q,
        _layerProvider: result.provider || config.provider,
        _layerModel: result.model || config.model,
        _layerLevel: level
      }));
      
      return {
        questions: taggedQuestions,
        provider: result.provider || config.provider,
        model: result.model || config.model,
        providers: [result.provider || config.provider],
        models: [result.model || config.model],
        requested: count,
        generated: questions.length,
        used: limitedQuestions.length,
        layerResults: [{
          level,
          provider: result.provider || config.provider,
          model: result.model || config.model,
          ok: true,
          requested: count,
          generated: questions.length,
          used: limitedQuestions.length
        }],
        layerErrors: []
      };
    } catch (error) {
      console.error(`[QuestionGenerator] Single layer ${level} error:`, error);
      throw Object.assign(error, {
        chunkIndex,
        provider: config.provider,
        level,
        code: 'layer-failed'
      });
    }
  },
  
  /**
   * Premium generation (OpenRouter models)
   */
  async generatePremium(content, count, difficulty, model, options) {
    const { useProxy, firebaseToken, getAPIKey, chunkIndex = 0 } = options;
    const selectedModel = PREMIUM_MODELS[model] || { provider: 'openrouter', model};
    
    // P0 Fix #2: Select prompt based on difficulty
    const systemPrompt = DIFFICULTY_PROMPTS[difficulty] || DIFFICULTY_PROMPTS.mixed;
    
    const userMessage = `Nội dung tài liệu:\n${content}\n\nHãy sinh ĐÚNG ${count} câu hỏi trắc nghiệm theo cấu trúc JSON object { "questions": [...] }. Trả về ĐÚNG chuẩn JSON.`;
    
    try {
      const result = await callAI({
        provider: selectedModel.provider,
        model: selectedModel.model,
        systemPrompt,
        userMessage,
        apiKey: getAPIKey?.('openrouter'),
        useProxy,
        firebaseToken
      });
      
      const questions = parseJSONResponse(result.content);
      
      // P0 Fix #2: Limit to exact count to prevent over-generation
      const limitedQuestions = questions.slice(0, count);
      
      // P0 Fix #4: Return provider/model info
      return {
        questions: limitedQuestions,
        provider: result.provider || selectedModel.provider,
        model: result.model || selectedModel.model,
        providers: [result.provider || selectedModel.provider],
        models: [result.model || selectedModel.model],
        requested: count,
        generated: questions.length,
        used: limitedQuestions.length
      };
    } catch (error) {
      console.error('[QuestionGenerator] Premium generation error:', error);
      // P0 Fix #3: Re-throw with structured info
      throw Object.assign(error, {
        chunkIndex,
        provider: selectedModel.provider,
        model: selectedModel.model,
        code: error.code || 'generation-failed'
      });
    }
  },
  
  /**
   * Utilities
   */
  splitIntoChunks,
  parseJSONResponse
};

// Legacy export for backward compatibility
export const Generator = {
  async fromText(text, targetCount, onProgress, options = {}) {
    const result = await QuestionGenerator.generate(text, {
      targetCount,
      mode: options.isPremium ? 'premium' : 'multi-layer',
      premiumModel: options.premiumModelId,
      getAPIKey: (provider) => {
        // This is a placeholder - in real use, should get from AIPool or similar
        console.warn('[Generator] Legacy mode: API keys should be provided via config');
        return null;
      }
    }, onProgress);
    
    return result.questions;
  }
};
