# ✅ Sửa lỗi cache không reset khi upload file mới

## Vấn đề
Khi người dùng upload file mới:
- Tab "Tóm tắt nhanh" hiển thị đúng (file mới)
- Tab "Sơ đồ tư duy" và "Câu hỏi liên quan" vẫn hiển thị nội dung của file cũ (từ cache)

## Nguyên nhân
1. Cache chỉ kiểm tra theo `mode` (quick/study/exam) và file hash
2. Khi upload file mới, nếu file cũ đã được cache, code vẫn load cache của file cũ
3. `_csCurrentResult` và `_csCurrentSourceText` không được reset khi chọn file mới
4. Cache không lưu `sourceText` nên tab "Nguồn tài liệu" bị trống

## Giải pháp đã áp dụng

### 1. Tracking file hash để phát hiện file mới
```javascript
// Trong generateCurriculumSummary()
const isNewFile = !window._csLastFileHash || window._csLastFileHash !== fileHash;
window._csLastFileHash = fileHash;

if (!isNewFile) {
  // Chỉ dùng cache nếu KHÔNG phải file mới
  const cached = getCachedSummary(fileHash, _csMode);
  if (cached) {
    // Load từ cache
  }
} else {
  // File mới → xóa kết quả cũ
  _csCurrentResult = null;
  _csCurrentSourceText = '';
}
```

### 2. Lưu sourceText trong cache
```javascript
function setCachedSummary(hash, mode, result, title, sourceText = '') {
  const data = {
    hash,
    mode,
    title,
    result,
    sourceText, // ✅ Lưu cả source text
    timestamp: Date.now(),
    version: CACHE_VERSION
  };
  localStorage.setItem(cacheKey, JSON.stringify(data));
}
```

### 3. Reset tracking khi chọn/xóa file
```javascript
function csHandleFileSelect(file) {
  _csCurrentFile = file;
  
  // ✅ Reset tracking
  window._csLastFileHash = null;
  _csCurrentResult = null;
  _csCurrentSourceText = '';
  
  // ... rest of code
}
```

## Kết quả
- ✅ Khi upload file mới, tất cả các tab đều hiển thị nội dung đúng của file mới
- ✅ Tab "Nguồn tài liệu" có đầy đủ nội dung
- ✅ Cache vẫn hoạt động bình thường cho cùng một file
- ✅ Không còn tình trạng hiển thị sai nội dung giữa các tab

## Test cases
1. ✅ Upload file A → tóm tắt → tất cả tab đúng
2. ✅ Upload file B → tóm tắt → tất cả tab đúng (không còn cache file A)
3. ✅ Upload lại file A → tóm tắt → load từ cache (nếu còn trong 7 ngày)
4. ✅ Xóa file → upload file C → tóm tắt → tất cả tab đúng
