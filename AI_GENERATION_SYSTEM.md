# Hệ Thống Tạo Câu Hỏi Bằng AI - Thiết Kế Chi Tiết

## Tổng Quan

Tài liệu này mô tả kiến trúc cải tiến cho tính năng "Tạo câu hỏi bằng AI từ tài liệu" trong hệ thống FTECA 24.

### Mục Tiêu

1. **Thống nhất luồng**: Một logic xử lý duy nhất cho cả người dùng và quản trị viên
2. **Lịch sử cá nhân**: Mỗi lượt sinh được lưu riêng, gắn với tài khoản
3. **Bảo mật**: API keys được bảo vệ ở server-side
4. **Kiểm định**: Validation và loại trùng lặp trước khi lưu
5. **Truy vết nguồn**: Lưu thông tin tài liệu và đoạn văn bản nguồn

---

## Kiến Trúc Hệ Thống

### 1. Cấu Trúc Dữ Liệu

#### 1.1 AI Question Generation History (Firestore Collection: `aiQuestionHistory`)

```javascript
{
  id: string,                    // Auto-generated ID
  userId: string,                // Firebase UID hoặc email
  userEmail: string,             // Email người dùng
  
  // Metadata lượt sinh
  createdAt: string,             // ISO timestamp
  updatedAt: string,             // ISO timestamp
  status: 'draft' | 'reviewed' | 'saved_to_bank',
  
  // Thông tin tài liệu nguồn
  source: {
    type: 'text' | 'pdf' | 'docx' | 'url',
    title: string,
    fileName?: string,
    uploadedAt?: string,
    totalPages?: number,
    processedPages?: number,
    extractionMethod?: 'native' | 'ocr' | 'manual',
    contentPreview?: string      // First 200 chars
  },
  
  // Cấu hình sinh câu hỏi
  generationConfig: {
    targetCount: number,
    modelTier: 'standard' | 'deepseek-r1' | 'claude-3.5-sonnet',
    subjectId: string,
    subjectName: string,
    difficulty: 'mixed' | 'easy' | 'medium' | 'hard',
    chapters?: number[]
  },
  
  // Kết quả sinh
  questions: [
    {
      q: string,
      options: string[],         // Array of 4 options
      correct: number,           // 0-3
      difficulty: number,        // 1-3
      chapter: number,
      exp?: string,
      source?: string,           // Excerpt from document
      sourcePage?: number,
      sourceChunk?: number,
      editedBy?: string,         // Email người sửa
      editedAt?: string,
      bankQuestionId?: string    // Nếu đã lưu vào ngân hàng
    }
  ],
  
  // Thống kê
  stats: {
    totalGenerated: number,
    validQuestions: number,
    savedToBank: number,
    duplicatesFound: number,
    userEdits: number
  }
}
```

#### 1.2 LocalStorage Keys (Frontend Fallback)

```javascript
KEYS.AI_QUESTION_HISTORY = 'qlcl_ai_question_history_v1'
```

---

### 2. Module Architecture

```
modules/
├── documentExtractor.js         # NEW - Trích xuất PDF/Word
├── questionGeneratorCore.js     # REFACTOR từ generator.js
├── questionValidator.js         # NEW - Validation logic
├── aiQuestionHistory.js         # NEW - Frontend service
└── aiPool.js                    # EXISTING - Keep as is

api/
└── ai-question-history.js       # NEW - Backend endpoint
└── ai-proxy.js                  # NEW - Proxy for AI API calls
```

---

### 3. Luồng Xử Lý Chi Tiết

#### 3.1 Luồng Người Dùng (User Flow)

```
[1] Upload/Paste Document
     ↓
[2] Extract Content (documentExtractor)
     ↓ (show preview, page count, warnings)
[3] Configure Generation
     - Model tier, subject, count, difficulty
     ↓
[4] Generate Questions (questionGeneratorCore)
     ↓ (progress updates, chunk processing)
[5] Validate & Deduplicate (questionValidator)
     ↓ (check structure, remove duplicates)
[6] Save to History (aiQuestionHistory.create)
     ↓ (Firestore + localStorage fallback)
[7] Review Modal
     - Edit questions inline
     - Mark for deletion
     - Change difficulty/chapter
     ↓
[8] User Decision:
     A) Save to Personal History only → status='reviewed'
     B) Publish to Question Bank → status='saved_to_bank'
        - Copy to main question bank
        - Link bankQuestionId in history
        - Keep in personal history
```

#### 3.2 Luồng Quản Trị (Admin Flow)

```
[1] Admin Panel → Generate Questions
     ↓
[2-6] Same as User Flow (reuse core modules)
     ↓
[7] Admin Review UI (existing _renderBankReviewList)
     ↓
[8] Confirm Save → Direct to Question Bank
     - Also saved to admin's personal history
     - status='saved_to_bank'
```

---

### 4. API Endpoints

#### 4.1 `/api/ai-question-history.js` (NEW)

**Authentication**: Requires Firebase ID Token

**Methods**:

##### GET - List History
```http
GET /api/ai-question-history?userId={uid}&limit=20&offset=0
Authorization: Bearer {firebaseIdToken}

Response:
{
  ok: true,
  items: [/* history objects */],
  total: number,
  hasMore: boolean
}
```

##### GET - Get Detail
```http
GET /api/ai-question-history?id={historyId}
Authorization: Bearer {firebaseIdToken}

Response:
{
  ok: true,
  item: {/* full history object */}
}
```

##### POST - Create
```http
POST /api/ai-question-history
Authorization: Bearer {firebaseIdToken}
Content-Type: application/json

Body: {/* history object without id */}

Response:
{
  ok: true,
  id: string,
  item: {/* saved object */}
}
```

##### PUT - Update
```http
PUT /api/ai-question-history
Authorization: Bearer {firebaseIdToken}
Content-Type: application/json

Body: {
  id: string,
  updates: {/* partial object */}
}

Response:
{
  ok: true,
  item: {/* updated object */}
}
```

##### DELETE - Remove
```http
DELETE /api/ai-question-history?id={historyId}
Authorization: Bearer {firebaseIdToken}

Response:
{
  ok: true
}
```

**Security**:
- Verify Firebase token
- Check userId matches token.uid or token.email
- Admins can view all, users only their own
- Return 403 if ownership check fails

#### 4.2 `/api/ai-proxy.js` (NEW)

**Purpose**: Proxy AI API calls để bảo vệ keys

```http
POST /api/ai-proxy
Authorization: Bearer {firebaseIdToken}
Content-Type: application/json

Body: {
  provider: 'groq' | 'gemini' | 'mistral' | 'openrouter',
  model: string,
  messages: array,
  temperature?: number,
  maxTokens?: number
}

Response: {/* AI response */}
```

---

### 5. Frontend Modules

#### 5.1 `documentExtractor.js`

```javascript
export const DocumentExtractor = {
  // Extract from various sources
  async extractFromPDF(file) {
    // Uses pdf.js or similar
    // Detect if OCR needed
    // Return { text, pages, method, warnings }
  },
  
  async extractFromWord(file) {
    // Uses mammoth.js or similar
    // Return { text, sections }
  },
  
  async extractFromURL(url) {
    // Fetch and parse HTML
    // Return { text, source: url }
  },
  
  validateContent(text) {
    // Check minimum length, encoding issues
    // Return { valid, errors, warnings }
  }
}
```

#### 5.2 `questionGeneratorCore.js`

```javascript
export const QuestionGenerator = {
  // Main generation function
  async generate(content, config, onProgress) {
    // Split into chunks with overlap
    // Call AI models via API proxy
    // Parse and normalize responses
    // Track source chunks
    // Return questions with metadata
  },
  
  // Utilities
  splitIntoChunks(text, chunkSize, overlap),
  parseAIResponse(rawResponse),
  normalizeQuestion(rawQuestion)
}
```

#### 5.3 `questionValidator.js`

```javascript
export const QuestionValidator = {
  // Validate single question
  validateQuestion(q) {
    // Check structure, options, correct index
    // Return { valid, errors }
  },
  
  // Batch validation
  validateBatch(questions) {
    // Validate all, collect errors
    // Return { valid: [], invalid: [] }
  },
  
  // Find duplicates within batch
  findDuplicatesInBatch(questions) {
    // Hash-based comparison
    // Return duplicate indices
  },
  
  // Find duplicates with database
  async findDuplicatesInBank(questions, subjectId) {
    // Compare with existing questions
    // Return matches
  }
}
```

#### 5.4 `aiQuestionHistory.js`

```javascript
export const AIQuestionHistory = {
  // CRUD operations
  async create(historyData),
  async update(id, updates),
  async delete(id),
  async get(id),
  async list(options),
  
  // Utilities
  async saveToBank(historyId, questionIds),
  async getStats(userId),
  
  // Sync with localStorage
  syncToLocal(data),
  loadFromLocal()
}
```

---

### 6. UI Components

#### 6.1 Navigation Menu

Thêm mục mới vào sidebar:

```html
<nav-item icon="🤖" label="Câu Hỏi AI Của Tôi" href="#ai-questions" />
```

#### 6.2 History List View

```html
<div id="ai-question-history-screen">
  <header>
    <h1>Lịch Sử Tạo Câu Hỏi AI</h1>
    <button>Tạo mới</button>
  </header>
  
  <filters>
    <select subject />
    <select status />
    <input search />
  </filters>
  
  <list>
    <history-card *ngFor>
      <header>
        <title>{source.title}</title>
        <badge>{status}</badge>
        <date>{createdAt}</date>
      </header>
      <stats>
        {stats.totalGenerated} câu · {stats.savedToBank} đã lưu
      </stats>
      <actions>
        <button view />
        <button edit />
        <button delete />
      </actions>
    </history-card>
  </list>
</div>
```

#### 6.3 Detail/Edit Modal

```html
<modal id="ai-history-detail-modal">
  <header>
    <title editable />
    <close-btn />
  </header>
  
  <metadata-section>
    <!-- Source info, generation config -->
  </metadata-section>
  
  <questions-section>
    <!-- Reuse existing review question cards -->
    <!-- Add save-to-bank checkbox per question -->
  </questions-section>
  
  <footer>
    <button save-changes />
    <button save-selected-to-bank />
    <button delete-history />
  </footer>
</modal>
```

---

### 7. Bảo Mật API Keys

#### 7.1 Các Keys Cần Bảo Vệ

```
GROQ_API_KEY_1
GROQ_API_KEY_2
GROQ_API_KEY_3
GEMINI_API_KEY_1
GEMINI_API_KEY_2
MISTRAL_API_KEY
OPENROUTER_API_KEY_1
OPENROUTER_API_KEY_2
CLOUDFLARE_API_KEY
```

#### 7.2 Di Chuyển Sang Server

**Hiện tại (UNSAFE)**:
```javascript
// modules/aiPool.js
const GROQ_KEYS = ['sk-proj-...', 'sk-proj-...'];
```

**Sau khi sửa (SAFE)**:
```javascript
// api/ai-proxy.js (server-side)
const GROQ_KEYS = [
  process.env.GROQ_API_KEY_1,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3
];

// modules/aiPool.js (client-side)
async callGroq(messages) {
  const token = await getFirebaseToken();
  return fetch('/api/ai-proxy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'groq',
      messages
    })
  });
}
```

#### 7.3 Biến Môi Trường Cần Thiết

Cập nhật `.env` hoặc Vercel Environment Variables:

```bash
# AI API Keys
GROQ_API_KEY_1=sk-proj-...
GROQ_API_KEY_2=sk-proj-...
GROQ_API_KEY_3=sk-proj-...
GEMINI_API_KEY_1=AIza...
GEMINI_API_KEY_2=AIza...
MISTRAL_API_KEY=...
OPENROUTER_API_KEY_1=sk-or-...
OPENROUTER_API_KEY_2=sk-or-...
CLOUDFLARE_API_KEY=...

# Existing (keep)
FIREBASE_SERVICE_ACCOUNT_JSON=...
GITHUB_TOKEN=...
GITHUB_OWNER=...
GITHUB_REPO=...
ADMIN_EMAILS=...
```

---

### 8. Validation & Deduplication

#### 8.1 Question Structure Validation

```javascript
function validateQuestionStructure(q) {
  const errors = [];
  
  // Check question text
  if (!q.q || q.q.trim().length < 10) {
    errors.push('Câu hỏi quá ngắn (tối thiểu 10 ký tự)');
  }
  
  // Check options
  if (!Array.isArray(q.options) || q.options.length !== 4) {
    errors.push('Phải có đúng 4 lựa chọn');
  } else {
    q.options.forEach((opt, i) => {
      if (!opt || opt.trim().length === 0) {
        errors.push(`Lựa chọn ${i+1} bị trống`);
      }
    });
  }
  
  // Check correct answer
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) {
    errors.push('Đáp án đúng phải là 0, 1, 2, hoặc 3');
  }
  
  // Check difficulty
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 3) {
    errors.push('Độ khó phải là 1 (dễ), 2 (TB), hoặc 3 (khó)');
  }
  
  return { valid: errors.length === 0, errors };
}
```

#### 8.2 Duplicate Detection

```javascript
function hashQuestion(q) {
  // Normalize and hash question text
  return q.q
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\sàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi, '')
    .trim();
}

function findDuplicatesInBatch(questions) {
  const seen = new Map();
  const duplicates = [];
  
  questions.forEach((q, idx) => {
    const hash = hashQuestion(q);
    if (seen.has(hash)) {
      duplicates.push({ index: idx, duplicateOf: seen.get(hash) });
    } else {
      seen.set(hash, idx);
    }
  });
  
  return duplicates;
}

async function findDuplicatesInBank(questions, subjectId) {
  const bank = DB.getBank().filter(q => q.subjectId === subjectId);
  const bankHashes = new Set(bank.map(hashQuestion));
  
  return questions
    .map((q, idx) => ({ question: q, index: idx, hash: hashQuestion(q) }))
    .filter(({ hash }) => bankHashes.has(hash));
}
```

---

### 9. Sửa Lỗi Cụ Thể

#### 9.1 Dropdown Chương Bị Trùng

**Hiện tại**:
```html
<option value="2">Chương 3</option>
<option value="3">Chương 3</option>
```

**Sửa thành**:
```javascript
// Load from subject metadata if available
const chapters = getSubjectChapters(subjectId) || [
  { value: 1, label: 'Chương 1' },
  { value: 2, label: 'Chương 2' },
  { value: 3, label: 'Chương 3' },
  { value: 4, label: 'Chương 4' },
  { value: 5, label: 'Chương 5' }
];

select.innerHTML = chapters.map(ch => 
  `<option value="${ch.value}">${ch.label}</option>`
).join('');
```

#### 9.2 HTML Escaping

**Hiện tại**:
```javascript
container.innerHTML = `<div>${q.q}</div>`; // UNSAFE
```

**Sửa thành**:
```javascript
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

container.innerHTML = `<div>${escapeHtml(q.q)}</div>`; // SAFE
```

Hoặc sử dụng hàm `escapeHtml()` đã có sẵn trong app.js.

---

### 10. Testing

#### 10.1 Manual Test Cases

**Test 1: Upload PDF và Sinh Câu Hỏi**
```
1. Đăng nhập với tài khoản user
2. Vào "Tạo câu hỏi AI"
3. Upload file PDF
4. Xác nhận content được extract
5. Chọn môn học, số lượng 10 câu
6. Click "Sinh câu hỏi"
7. Kiểm tra progress bar
8. Xác nhận 10 câu được tạo
9. Review và edit một vài câu
10. Click "Lưu vào lịch sử"
11. Vào "Câu hỏi AI của tôi"
12. Xác nhận lượt sinh vừa tạo hiển thị
```

**Test 2: Lưu Vào Ngân Hàng**
```
1. Mở lượt sinh từ lịch sử
2. Chọn 5 câu để lưu vào ngân hàng
3. Click "Lưu vào ngân hàng"
4. Xác nhận 5 câu xuất hiện trong Ngân Hàng Câu Hỏi
5. Xác nhận lượt sinh vẫn còn trong lịch sử
6. Xác nhận status = 'saved_to_bank'
```

**Test 3: Duplicate Detection**
```
1. Tạo lượt sinh mới với tài liệu đã dùng
2. Xác nhận hệ thống phát hiện trùng
3. Xác nhận số câu trùng được hiển thị
4. Xác nhận câu trùng không được thêm vào ngân hàng
```

**Test 4: Security - Ownership**
```
1. User A tạo lượt sinh
2. Copy URL detail của lượt sinh đó
3. Đăng xuất, đăng nhập bằng User B
4. Truy cập URL đó
5. Xác nhận User B không thấy được (403)
```

---

### 11. Deployment Checklist

- [ ] Tạo Firestore collection `aiQuestionHistory`
- [ ] Tạo Firestore indexes nếu cần (userId, createdAt)
- [ ] Thêm API keys vào Vercel Environment Variables
- [ ] Deploy API endpoints `/api/ai-question-history.js` và `/api/ai-proxy.js`
- [ ] Xóa hardcoded API keys khỏi client code
- [ ] Test với real Firebase user
- [ ] Update README với instructions
- [ ] Thông báo users về tính năng mới

---

### 12. Giới Hạn & Cải Tiến Tương Lai

#### Giới Hạn Hiện Tại

1. **OCR**: Chưa hỗ trợ tự động OCR cho PDF scan
2. **Truy vết trang**: Không lưu chính xác số trang nguồn (chỉ chunk index)
3. **Collaborative editing**: Chưa hỗ trợ nhiều người cùng review một lượt sinh
4. **Version control**: Không có history của các lần edit câu hỏi

#### Cải Tiến Tương Lai

1. Tích hợp OCR service (Tesseract.js hoặc cloud OCR)
2. Lưu page mapping khi extract PDF
3. Real-time collaboration với Firestore listeners
4. Audit log cho mọi thay đổi câu hỏi
5. AI suggestion cho câu hỏi bị reject
6. Batch operations (xóa nhiều, export nhiều)
7. Analytics dashboard cho admin

---

## Tóm Tắt

Hệ thống mới sẽ:

✅ **Thống nhất** logic sinh câu hỏi cho user và admin  
✅ **Bảo vệ** API keys ở server-side  
✅ **Lưu trữ** mỗi lượt sinh với đầy đủ metadata  
✅ **Kiểm định** câu hỏi trước khi lưu  
✅ **Phân quyền** truy cập dựa trên Firebase Auth  
✅ **Truy vết** nguồn tài liệu và chunk  
✅ **Tách biệt** lịch sử cá nhân và ngân hàng chung  

Tất cả thay đổi backwards-compatible với dữ liệu hiện có.
