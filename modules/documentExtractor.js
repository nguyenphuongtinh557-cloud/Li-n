/**
 * documentExtractor.js — Unified Document Content Extraction
 * 
 * Trích xuất văn bản từ PDF, Word, Text files với:
 * - Phát hiện PDF scan cần OCR
 * - Lưu metadata (pages, extraction method)
 * - Validation và warnings
 * - Consistent error handling
 */

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MIN_TEXT_LENGTH = 50;
const MIN_TEXT_DENSITY = 10; // chars per page để phát hiện scan

/**
 * Load external libraries dynamically
 */
async function ensurePdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  
  return new Promise((resolve, reject) => {
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('pdf-lib-not-loaded'));
      }
    };
    script.onerror = () => reject(new Error('pdf-lib-not-loaded'));
    document.head.appendChild(script);
  });
}

async function ensureMammoth() {
  if (window.mammoth) return window.mammoth;
  
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';
  
  return new Promise((resolve, reject) => {
    script.onload = () => {
      if (window.mammoth) {
        resolve(window.mammoth);
      } else {
        reject(new Error('mammoth-lib-not-loaded'));
      }
    };
    script.onerror = () => reject(new Error('mammoth-lib-not-loaded'));
    document.head.appendChild(script);
  });
}

/**
 * Main extraction interface
 */
export const DocumentExtractor = {
  /**
   * Extract from file with automatic type detection
   */
  async extractFromFile(file, options = {}) {
    if (!file) {
      throw new Error('Không có file được chọn');
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Giới hạn 20MB.`);
    }
    
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.pdf')) {
      return await this.extractFromPDF(file, options);
    } else if (fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      return await this.extractFromWord(file, options);
    } else if (fileName.endsWith('.txt')) {
      return await this.extractFromText(file, options);
    } else {
      throw new Error('Định dạng file không được hỗ trợ. Vui lòng chọn PDF, DOCX hoặc TXT.');
    }
  },
  
  /**
   * Extract from PDF with scan detection
   */
  async extractFromPDF(file, options = {}) {
    const { onProgress, maxPages = 100 } = options;
    
    try {
      const pdfjsLib = await ensurePdfJs();
      onProgress?.({ stage: 'loading', message: 'Đang tải PDF...' });
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      const totalPages = pdf.numPages;
      const pagesToProcess = Math.min(totalPages, maxPages);
      
      let text = '';
      const pageTexts = [];
      
      onProgress?.({ 
        stage: 'extracting', 
        message: `Đang trích xuất ${pagesToProcess}/${totalPages} trang...`,
        current: 0,
        total: pagesToProcess
      });
      
      // Extract text from each page
      for (let i = 1; i <= pagesToProcess; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        
        pageTexts.push({
          pageNumber: i,
          text: pageText,
          charCount: pageText.length
        });
        
        text += pageText + '\n\n';
        
        onProgress?.({ 
          stage: 'extracting', 
          message: `Đang trích xuất trang ${i}/${pagesToProcess}...`,
          current: i,
          total: pagesToProcess
        });
      }
      
      text = text.trim();
      
      // Detect if PDF is scanned (no text extracted)
      const avgCharsPerPage = text.length / pagesToProcess;
      const isScan = avgCharsPerPage < MIN_TEXT_DENSITY;
      const warnings = [];
      
      if (isScan) {
        warnings.push({
          type: 'scan_detected',
          message: 'PDF này có thể là bản scan (ít văn bản trích xuất được). Cần OCR để đọc chính xác.',
          severity: 'error'
        });
      }
      
      if (text.length < MIN_TEXT_LENGTH) {
        warnings.push({
          type: 'insufficient_text',
          message: `Chỉ trích xuất được ${text.length} ký tự. Cần ít nhất ${MIN_TEXT_LENGTH} ký tự.`,
          severity: 'error'
        });
      }
      
      if (totalPages > maxPages) {
        warnings.push({
          type: 'pages_limited',
          message: `File có ${totalPages} trang nhưng chỉ xử lý ${maxPages} trang đầu tiên.`,
          severity: 'warning'
        });
      }
      
      return {
        success: true,
        text,
        metadata: {
          type: 'pdf',
          fileName: file.name,
          fileSize: file.size,
          totalPages,
          processedPages: pagesToProcess,
          extractionMethod: isScan ? 'failed_scan' : 'native',
          avgCharsPerPage: Math.round(avgCharsPerPage),
          uploadedAt: new Date().toISOString()
        },
        pageTexts,
        warnings,
        contentPreview: text.slice(0, 200)
      };
      
    } catch (error) {
      console.error('[DocumentExtractor] PDF extraction error:', error);
      throw new Error(`Lỗi đọc PDF: ${error.message}`);
    }
  },
  
  /**
   * Extract from Word document
   */
  async extractFromWord(file, options = {}) {
    const { onProgress } = options;
    
    try {
      const mammoth = await ensureMammoth();
      onProgress?.({ stage: 'loading', message: 'Đang tải DOCX...' });
      
      const arrayBuffer = await file.arrayBuffer();
      
      onProgress?.({ stage: 'extracting', message: 'Đang trích xuất văn bản...' });
      
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = result.value.trim();
      const warnings = [];
      
      if (text.length < MIN_TEXT_LENGTH) {
        warnings.push({
          type: 'insufficient_text',
          message: `Chỉ trích xuất được ${text.length} ký tự. Cần ít nhất ${MIN_TEXT_LENGTH} ký tự.`,
          severity: 'error'
        });
      }
      
      if (result.messages && result.messages.length > 0) {
        warnings.push({
          type: 'conversion_warnings',
          message: `Mammoth báo ${result.messages.length} nội dung không chuyển đổi được.`,
          severity: 'warning',
          details: result.messages
        });
      }
      
      return {
        success: true,
        text,
        metadata: {
          type: 'docx',
          fileName: file.name,
          fileSize: file.size,
          extractionMethod: 'mammoth',
          uploadedAt: new Date().toISOString()
        },
        warnings,
        contentPreview: text.slice(0, 200)
      };
      
    } catch (error) {
      console.error('[DocumentExtractor] Word extraction error:', error);
      throw new Error(`Lỗi đọc DOCX: ${error.message}`);
    }
  },
  
  /**
   * Extract from plain text file
   */
  async extractFromText(file, options = {}) {
    const { onProgress } = options;
    
    try {
      onProgress?.({ stage: 'loading', message: 'Đang đọc file văn bản...' });
      
      const text = await file.text();
      const warnings = [];
      
      if (text.length < MIN_TEXT_LENGTH) {
        warnings.push({
          type: 'insufficient_text',
          message: `Chỉ có ${text.length} ký tự. Cần ít nhất ${MIN_TEXT_LENGTH} ký tự.`,
          severity: 'error'
        });
      }
      
      return {
        success: true,
        text: text.trim(),
        metadata: {
          type: 'text',
          fileName: file.name,
          fileSize: file.size,
          extractionMethod: 'native',
          uploadedAt: new Date().toISOString()
        },
        warnings,
        contentPreview: text.slice(0, 200)
      };
      
    } catch (error) {
      console.error('[DocumentExtractor] Text extraction error:', error);
      throw new Error(`Lỗi đọc file văn bản: ${error.message}`);
    }
  },
  
  /**
   * Extract from URL (fetch and parse HTML)
   */
  async extractFromURL(url, options = {}) {
    const { onProgress } = options;
    
    try {
      onProgress?.({ stage: 'loading', message: 'Đang tải nội dung từ URL...' });
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      
      // Simple HTML to text conversion (strips tags)
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove scripts, styles, and other non-content elements
      ['script', 'style', 'nav', 'header', 'footer', 'aside'].forEach(tag => {
        doc.querySelectorAll(tag).forEach(el => el.remove());
      });
      
      const text = doc.body.textContent
        .replace(/\s+/g, ' ')
        .trim();
      
      const warnings = [];
      
      if (text.length < MIN_TEXT_LENGTH) {
        warnings.push({
          type: 'insufficient_text',
          message: `Chỉ trích xuất được ${text.length} ký tự từ URL. Cần ít nhất ${MIN_TEXT_LENGTH} ký tự.`,
          severity: 'error'
        });
      }
      
      return {
        success: true,
        text,
        metadata: {
          type: 'url',
          source: url,
          extractionMethod: 'html_parse',
          fetchedAt: new Date().toISOString()
        },
        warnings,
        contentPreview: text.slice(0, 200)
      };
      
    } catch (error) {
      console.error('[DocumentExtractor] URL extraction error:', error);
      throw new Error(`Lỗi tải URL: ${error.message}`);
    }
  },
  
  /**
   * Validate extracted content
   */
  validateContent(extractionResult) {
    if (!extractionResult || !extractionResult.text) {
      return {
        valid: false,
        errors: ['Không có nội dung được trích xuất']
      };
    }
    
    const { text, warnings = [] } = extractionResult;
    const errors = [];
    
    // Check minimum length
    if (text.length < MIN_TEXT_LENGTH) {
      errors.push(`Nội dung quá ngắn (${text.length} ký tự). Cần ít nhất ${MIN_TEXT_LENGTH} ký tự để sinh câu hỏi.`);
    }
    
    // Check for scan detection
    const scanWarning = warnings.find(w => w.type === 'scan_detected');
    if (scanWarning) {
      errors.push('PDF này là bản scan không có văn bản. Vui lòng dùng công cụ OCR hoặc nhập văn bản thủ công.');
    }
    
    // Check encoding issues (too many replacement characters)
    const replacementChars = (text.match(/�/g) || []).length;
    if (replacementChars > text.length * 0.05) {
      errors.push('File có vấn đề encoding (nhiều ký tự không đọc được). Hãy chuyển đổi sang UTF-8.');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings: warnings.filter(w => w.severity === 'warning')
    };
  },
  
  /**
   * Get user-friendly error message
   */
  getErrorMessage(error) {
    const msg = error.message || String(error);
    
    if (msg.includes('pdf-lib-not-loaded')) {
      return 'Không thể tải thư viện đọc PDF. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    if (msg.includes('mammoth-lib-not-loaded')) {
      return 'Không thể tải thư viện đọc DOCX. Vui lòng kiểm tra kết nối mạng và thử lại.';
    }
    if (msg.includes('File quá lớn')) {
      return msg;
    }
    if (msg.includes('Định dạng file không được hỗ trợ')) {
      return msg;
    }
    
    return `Lỗi trích xuất tài liệu: ${msg}`;
  }
};

// Export for backward compatibility
export async function extractFromPDF(file, onProgress) {
  const result = await DocumentExtractor.extractFromPDF(file, { onProgress });
  return result.text;
}

export async function extractFromWord(file, onProgress) {
  const result = await DocumentExtractor.extractFromWord(file, { onProgress });
  return result.text;
}
