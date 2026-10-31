/**
 * questionValidator.js — Question Validation & Deduplication
 * 
 * Kiểm định cấu trúc câu hỏi, loại trùng lặp trong batch và với database
 */

import { DB } from './db.js';

const MIN_QUESTION_LENGTH = 10;
const MIN_OPTION_LENGTH = 1;
const MAX_QUESTION_LENGTH = 1000;
const MAX_OPTION_LENGTH = 500;

/**
 * Hash câu hỏi để phát hiện trùng lặp
 */
function hashQuestion(questionText) {
  if (!questionText) return '';
  
  return questionText
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi, '') // Keep alphanumeric + Vietnamese
    .trim();
}

/**
 * Validate single question structure
 */
function validateQuestionStructure(q, index) {
  const errors = [];
  const warnings = [];
  
  // Check question text
  if (!q.q || typeof q.q !== 'string') {
    errors.push(`Câu ${index + 1}: Thiếu nội dung câu hỏi`);
  } else {
    const qText = q.q.trim();
    
    if (qText.length < MIN_QUESTION_LENGTH) {
      errors.push(`Câu ${index + 1}: Câu hỏi quá ngắn (${qText.length} ký tự, tối thiểu ${MIN_QUESTION_LENGTH})`);
    }
    
    if (qText.length > MAX_QUESTION_LENGTH) {
      warnings.push(`Câu ${index + 1}: Câu hỏi dài (${qText.length} ký tự, khuyến nghị dưới ${MAX_QUESTION_LENGTH})`);
    }
    
    // Check if question ends with question mark (optional warning)
    if (!qText.match(/[?？]/)) {
      warnings.push(`Câu ${index + 1}: Câu hỏi không có dấu chấm hỏi`);
    }
  }
  
  // Check options array
  if (!Array.isArray(q.options)) {
    errors.push(`Câu ${index + 1}: Thiếu mảng lựa chọn`);
  } else if (q.options.length !== 4) {
    errors.push(`Câu ${index + 1}: Phải có đúng 4 lựa chọn (hiện có ${q.options.length})`);
  } else {
    q.options.forEach((opt, optIdx) => {
      if (!opt || typeof opt !== 'string') {
        errors.push(`Câu ${index + 1}, Lựa chọn ${optIdx + 1}: Lựa chọn bị trống hoặc không hợp lệ`);
      } else {
        const optText = opt.trim();
        
        if (optText.length < MIN_OPTION_LENGTH) {
          errors.push(`Câu ${index + 1}, Lựa chọn ${optIdx + 1}: Lựa chọn quá ngắn`);
        }
        
        if (optText.length > MAX_OPTION_LENGTH) {
          warnings.push(`Câu ${index + 1}, Lựa chọn ${optIdx + 1}: Lựa chọn dài (${optText.length} ký tự)`);
        }
      }
    });
    
    // Check for duplicate options
    const optionHashes = q.options.map(opt => hashQuestion(opt));
    const uniqueHashes = new Set(optionHashes);
    if (uniqueHashes.size < 4) {
      warnings.push(`Câu ${index + 1}: Có lựa chọn trùng lặp hoặc rất giống nhau`);
    }
  }
  
  // Check correct answer index
  if (!Number.isInteger(q.correct)) {
    errors.push(`Câu ${index + 1}: Đáp án đúng phải là số nguyên`);
  } else if (q.correct < 0 || q.correct > 3) {
    errors.push(`Câu ${index + 1}: Đáp án đúng phải từ 0-3 (hiện là ${q.correct})`);
  }
  
  // Check difficulty
  if (!Number.isInteger(q.difficulty)) {
    warnings.push(`Câu ${index + 1}: Độ khó không hợp lệ, mặc định là 1 (dễ)`);
    q.difficulty = 1;
  } else if (q.difficulty < 1 || q.difficulty > 3) {
    warnings.push(`Câu ${index + 1}: Độ khó phải từ 1-3 (hiện là ${q.difficulty}), mặc định là 1`);
    q.difficulty = 1;
  }
  
  // Check chapter (optional, can be missing)
  if (q.chapter !== undefined && q.chapter !== null) {
    if (!Number.isInteger(q.chapter) || q.chapter < 1) {
      warnings.push(`Câu ${index + 1}: Chương phải là số nguyên dương (hiện là ${q.chapter})`);
    }
  }
  
  // Check explanation (optional but recommended)
  if (!q.exp || typeof q.exp !== 'string' || q.exp.trim().length === 0) {
    warnings.push(`Câu ${index + 1}: Thiếu giải thích đáp án`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Normalize question (clean up and fix common issues)
 */
function normalizeQuestion(q) {
  const normalized = { ...q };
  
  // Trim strings
  if (normalized.q) normalized.q = normalized.q.trim();
  if (normalized.exp) normalized.exp = normalized.exp.trim();
  if (Array.isArray(normalized.options)) {
    normalized.options = normalized.options.map(opt => 
      typeof opt === 'string' ? opt.trim() : opt
    );
  }
  
  // Ensure numeric fields
  normalized.correct = Number.isInteger(normalized.correct) ? normalized.correct : 0;
  normalized.difficulty = Number.isInteger(normalized.difficulty) ? normalized.difficulty : 1;
  
  // Clamp difficulty to valid range
  normalized.difficulty = Math.max(1, Math.min(3, normalized.difficulty));
  
  // Clamp correct to valid range
  normalized.correct = Math.max(0, Math.min(3, normalized.correct));
  
  // Set default chapter if missing
  if (!normalized.chapter) normalized.chapter = 1;
  
  return normalized;
}

export const QuestionValidator = {
  /**
   * Validate single question
   */
  validateQuestion(q, index = 0) {
    return validateQuestionStructure(q, index);
  },
  
  /**
   * Validate batch of questions
   */
  validateBatch(questions) {
    if (!Array.isArray(questions)) {
      return {
        valid: [],
        invalid: [],
        summary: {
          total: 0,
          validCount: 0,
          invalidCount: 0,
          totalErrors: 0,
          totalWarnings: 0
        }
      };
    }
    
    const valid = [];
    const invalid = [];
    let totalErrors = 0;
    let totalWarnings = 0;
    
    questions.forEach((q, idx) => {
      const result = validateQuestionStructure(q, idx);
      
      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;
      
      if (result.valid) {
        valid.push({
          question: normalizeQuestion(q),
          index: idx,
          warnings: result.warnings
        });
      } else {
        invalid.push({
          question: q,
          index: idx,
          errors: result.errors,
          warnings: result.warnings
        });
      }
    });
    
    return {
      valid,
      invalid,
      summary: {
        total: questions.length,
        validCount: valid.length,
        invalidCount: invalid.length,
        totalErrors,
        totalWarnings
      }
    };
  },
  
  /**
   * Find duplicates within batch
   */
  findDuplicatesInBatch(questions) {
    const seen = new Map(); // hash -> first index
    const duplicates = [];
    
    questions.forEach((q, idx) => {
      const hash = hashQuestion(q.q);
      
      if (!hash) return; // Skip empty
      
      if (seen.has(hash)) {
        duplicates.push({
          index: idx,
          duplicateOf: seen.get(hash),
          question: q.q,
          hash
        });
      } else {
        seen.set(hash, idx);
      }
    });
    
    return duplicates;
  },
  
  /**
   * Find duplicates with existing question bank
   */
  async findDuplicatesInBank(questions, subjectId) {
    try {
      // Get existing questions for this subject
      const bank = DB.getBank();
      const subjectQuestions = subjectId 
        ? bank.filter(q => q.subjectId === subjectId)
        : bank;
      
      // Build hash map of existing questions
      const bankHashes = new Map(); // hash -> question object
      subjectQuestions.forEach(q => {
        const hash = hashQuestion(q.q);
        if (hash) bankHashes.set(hash, q);
      });
      
      // Find matches
      const duplicates = [];
      questions.forEach((q, idx) => {
        const hash = hashQuestion(q.q);
        if (hash && bankHashes.has(hash)) {
          duplicates.push({
            index: idx,
            newQuestion: q.q,
            existingQuestion: bankHashes.get(hash).q,
            hash,
            subjectId: bankHashes.get(hash).subjectId
          });
        }
      });
      
      return duplicates;
    } catch (error) {
      console.error('[QuestionValidator] Error checking bank duplicates:', error);
      return [];
    }
  },
  
  /**
   * Remove duplicates from array
   */
  removeDuplicates(questions) {
    const seen = new Set();
    const unique = [];
    const removed = [];
    
    questions.forEach((q, idx) => {
      const hash = hashQuestion(q.q);
      
      if (!hash) {
        removed.push({ index: idx, reason: 'empty_question' });
        return;
      }
      
      if (seen.has(hash)) {
        removed.push({ index: idx, reason: 'duplicate', hash });
      } else {
        seen.add(hash);
        unique.push(q);
      }
    });
    
    return { unique, removed };
  },
  
  /**
   * Get validation summary for display
   */
  getValidationSummary(validationResult) {
    const { valid, invalid, summary } = validationResult;
    
    const messages = [];
    
    if (summary.validCount > 0) {
      messages.push(`✓ ${summary.validCount} câu hợp lệ`);
    }
    
    if (summary.invalidCount > 0) {
      messages.push(`✗ ${summary.invalidCount} câu không hợp lệ`);
    }
    
    if (summary.totalErrors > 0) {
      messages.push(`${summary.totalErrors} lỗi`);
    }
    
    if (summary.totalWarnings > 0) {
      messages.push(`${summary.totalWarnings} cảnh báo`);
    }
    
    return messages.join(' · ');
  },
  
  /**
   * Normalize question (exposed for external use)
   */
  normalizeQuestion,
  
  /**
   * Hash question (exposed for external use)
   */
  hashQuestion
};

export { hashQuestion, normalizeQuestion, validateQuestionStructure };
