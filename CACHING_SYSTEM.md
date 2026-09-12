# 📦 FILE HASH-BASED CACHING SYSTEM

## 🎯 MỤC ĐÍCH

Tránh xử lý lại tài liệu đã được tóm tắt → tiết kiệm:
- ⏱️ Thời gian user (từ 15-60s → <1s)
- 💰 API calls (0 calls khi hit cache)
- 🔋 Client resources (không re-process)

---

## 🏗️ KIẾN TRÚC

### Flow Diagram:
```
User upload file
      ↓
Calculate SHA-256 hash
      ↓
Check localStorage cache
      ↓
   [Cache exists?]
   /            \
YES             NO
 ↓               ↓
Return cached   Process document
result            ↓
               Store in cache
                 ↓
              Return result
```

---

## 🔑 CACHE KEY STRUCTURE

```javascript
Key format: doc_summary_cache_v1_{file_hash}_{mode}

Example:
doc_summary_cache_v1_a3f5c9d2...f8e1_quick
doc_summary_cache_v1_a3f5c9d2...f8e1_study
doc_summary_cache_v1_a3f5c9d2...f8e1_exam
```

**Components:**
- `doc_summary_cache` - Prefix
- `v1` - Cache version (để invalidate khi format thay đổi)
- `{file_hash}` - SHA-256 hash của file content
- `{mode}` - Summarization mode (quick/study/exam)

---

## 📊 CACHE DATA STRUCTURE

```javascript
{
  "hash": "a3f5c9d2...f8e1",
  "mode": "quick",
  "title": "Tài liệu học tập",
  "result": {
    // Hierarchical result
    "chapters": [...],
    "globalSummary": {...}
    
    // Or flat result
    "mainPoints": [...],
    "keywords": [...]
  },
  "timestamp": 1704067200000,
  "version": "v1"
}
```

---

## ⚙️ IMPLEMENTATION DETAILS

### 1. File Hashing (SHA-256)

```javascript
async function calculateFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
```

**Why SHA-256:**
- ✅ Collision-resistant (99.999...% unique)
- ✅ Browser native (Web Crypto API)
- ✅ Fast for files < 20MB
- ✅ Deterministic (same file = same hash)

**Performance:**
- 1MB file: ~10-20ms
- 5MB file: ~50-100ms
- 10MB file: ~100-200ms

---

### 2. Cache Retrieval

```javascript
function getCachedSummary(hash, mode) {
  const cacheKey = `doc_summary_cache_v1_${hash}_${mode}`;
  const cached = localStorage.getItem(cacheKey);
  
  if (!cached) return null;
  
  const data = JSON.parse(cached);
  const age = Date.now() - data.timestamp;
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  // Expire after 7 days
  if (age > maxAge) {
    localStorage.removeItem(cacheKey);
    return null;
  }
  
  return data;
}
```

**Cache TTL:** 7 days
- Lý do: Summary không thay đổi theo thời gian
- User có thể re-upload file → cùng hash → hit cache
- Sau 7 ngày: Auto-expire (cleanup)

---

### 3. Cache Storage

```javascript
function setCachedSummary(hash, mode, result, title) {
  const cacheKey = `doc_summary_cache_v1_${hash}_${mode}`;
  const data = {
    hash,
    mode,
    title,
    result,
    timestamp: Date.now(),
    version: 'v1'
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
}
```

**Storage Location:** `localStorage`
- Limit: ~5-10MB per domain
- Persistent across sessions
- Domain-isolated (secure)

---

### 4. Automatic Cleanup

```javascript
function clearOldCaches() {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('doc_summary_cache_')) {
      const data = JSON.parse(localStorage.getItem(key));
      if (now - data.timestamp > maxAge) {
        localStorage.removeItem(key);
      }
    }
  }
}

// Run on page load
clearOldCaches();
```

**Cleanup Strategy:**
- Chạy mỗi lần page load
- Xóa cache > 7 days
- Prevent localStorage bloat

---

## 📈 PERFORMANCE IMPACT

### Cache Hit (Best Case):
```
User upload file (1MB)
  ↓ Hash calculation: 20ms
  ↓ Cache lookup: 5ms
  ↓ Render: 50ms
───────────────────────
Total: ~75ms vs 15-60s
```

**Speedup: 200-800x faster** ⚡

### Cache Miss (Normal Case):
```
User upload file
  ↓ Hash calculation: 20ms
  ↓ Cache lookup: 5ms (miss)
  ↓ Process document: 15-60s
  ↓ Store cache: 10ms
  ↓ Render: 50ms
───────────────────────
Total: 15-60s + 85ms overhead
```

**Overhead: < 0.5%** (negligible)

---

## 💾 STORAGE ESTIMATION

### Average cache entry size:
```
Flat summary:
  mainPoints (10 items × 100 chars)   = 1KB
  keywords (20 items × 20 chars)      = 0.4KB
  pitfalls (5 items × 80 chars)       = 0.4KB
  metadata                            = 0.2KB
  ───────────────────────────────────────
  Total: ~2KB per entry

Hierarchical summary:
  5 chapters × 10 lessons             = 50 summaries
  50 summaries × 2KB                  = 100KB
  + metadata                          = 10KB
  ───────────────────────────────────────
  Total: ~110KB per entry
```

### localStorage capacity:
```
5MB limit / 110KB per entry = ~45 documents cached

For flat summaries:
5MB limit / 2KB per entry = ~2,500 documents cached
```

**Conclusion:** Storage không phải bottleneck

---

## 🔄 CACHE INVALIDATION

### Khi nào cache bị invalidate:

1. **File content thay đổi**
   - Hash khác → cache miss → re-process

2. **Mode thay đổi**
   - `quick` → `study` → cache miss (khác key)

3. **Cache version thay đổi**
   - Code upgrade → `v1` → `v2` → old cache invalid

4. **TTL expire (7 days)**
   - Tự động xóa

5. **Manual clear**
   - User clear browser data

### Không invalidate khi:
- ❌ Title thay đổi (hash vẫn giống)
- ❌ Re-upload cùng file (hash giống)
- ❌ Different browser (localStorage riêng)

---

## 🎯 USER EXPERIENCE

### Cache Hit Flow:
```
[User] Upload file.pdf
  ↓
[System] "Đang kiểm tra cache..."
  ↓
[System] "✓ Đã tải từ cache (tiết kiệm thời gian & API calls)"
  ↓
[Toast] "⚡ Tải từ cache thành công!"
  ↓
[Result] Hiển thị ngay lập tức
```

### Cache Miss Flow:
```
[User] Upload new_file.pdf
  ↓
[System] "Đang kiểm tra cache..."
  ↓
[System] "Đang gọi AI tóm tắt..."
  ↓
[System] Process...
  ↓
[System] "✓ Đã tóm tắt xong!"
  ↓
[Cache] Lưu vào cache
  ↓
[Result] Hiển thị
```

---

## 🐛 EDGE CASES

### 1. LocalStorage full
```javascript
try {
  localStorage.setItem(key, data);
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    // Clear oldest caches first
    clearOldestCaches();
    // Retry
    localStorage.setItem(key, data);
  }
}
```

### 2. Corrupted cache data
```javascript
try {
  const data = JSON.parse(cached);
  // Validate structure
  if (!data.result || !data.hash) {
    throw new Error('Invalid cache structure');
  }
  return data;
} catch (err) {
  // Remove corrupted cache
  localStorage.removeItem(cacheKey);
  return null;
}
```

### 3. Hash collision (theoretical)
```
Probability: 1 in 2^256 (~10^77)
More likely: Win lottery 10 times consecutively
Action: Ignore (won't happen in practice)
```

---

## 📊 METRICS TO TRACK

### Cache Performance:
```javascript
const cacheMetrics = {
  hits: 0,
  misses: 0,
  hitRate: 0,
  avgHitTime: 0,
  avgMissTime: 0,
  totalSaved: 0  // API calls saved
};
```

### Track in production:
- Cache hit rate (target: >40%)
- Average time saved per hit
- Storage usage
- Cleanup frequency

---

## 🚀 FUTURE IMPROVEMENTS

### Phase 2: Server-side cache
```
- Store in database/Redis
- Sync across devices
- Shared cache between users (same public docs)
```

### Phase 3: Smart prefetch
```
- Detect similar files → prefetch cache
- Background re-cache expiring entries
```

### Phase 4: Compression
```
- LZ-string compress before localStorage
- 3-5x storage efficiency
```

---

## ✅ BENEFITS SUMMARY

| Metric | Without Cache | With Cache | Improvement |
|--------|---------------|------------|-------------|
| **Time** | 15-60s | <1s | **15-60x faster** |
| **API Calls** | 4-12 | 0 | **100% saved** |
| **Cost** | $0.01-0.05 | $0 | **Free** |
| **UX** | Wait 15-60s | Instant | **Seamless** |

---

## 🔒 SECURITY CONSIDERATIONS

### Data Sensitivity:
- ✅ Summaries are derived (not source text)
- ✅ localStorage is domain-isolated
- ✅ No PII in cache keys (only hash)
- ⚠️ Source text NOT cached (privacy)

### Privacy:
- User's file never leaves device (unless API call)
- Hash is one-way (can't reverse to file)
- Cache cleared on browser clear

---

*Caching system implemented successfully. Zero-cost instant retrieval for repeated documents.* ✅
