# Test Checklist - AI Generation UI Integration

## ✅ Đã Fix (Verified in Code)

### 1. renderSourceTab() error
**Status:** ✅ Fixed
**File:** `app.js` line 1443-1450
**Fix:** Added null checks for `source-bank-count` and `source-ai-count` elements

```javascript
const bankCountEl = document.getElementById('source-bank-count');
const aiCountEl = document.getElementById('source-ai-count');

if (bankCountEl) {
  bankCountEl.textContent = stats.total;
}
if (aiCountEl) {
  aiCountEl.textContent = DB.getBankBySubject(activeSubjectId)...
}
```

**Test:**
1. Navigate to "Tạo câu hỏi bằng AI" tab
2. Open browser console (F12)
3. ✅ Should see NO errors about `source-bank-count`
4. ✅ Page should render completely

---

### 2. Difficulty Selection
**Status:** ✅ Fixed (with debug logging)
**File:** `app.js` line 1495-1509
**Fix:** Reads `.ai-difficulty.active` buttons and maps to difficulty value

```javascript
const selectedDifficulties = Array.from(document.querySelectorAll('.ai-difficulty.active'))
  .map(btn => btn.dataset.level)
  .filter(Boolean);

let difficulty = 'mixed'; // default
if (selectedDifficulties.length === 1) {
  difficulty = selectedDifficulties[0]; // easy, medium, hard, or expert
}
// ... plus console.log for debugging
```

**Default Behavior:**
- HTML has 3 buttons active by default: Dễ (easy), Trung bình (medium), Khó (hard)
- Result: `difficulty = 'mixed'` ✅ CORRECT

**Test Steps:**
1. Open AI Generation page
2. Click to deselect "Trung bình" and "Khó" (only "Dễ" active)
3. Fill content and generate questions
4. Check console log: Should show `Selected difficulties: ['easy'] → Final difficulty: easy`
5. API call should include `difficulty: 'easy'`

**Expected Console Output:**
```
[AI Generation] Selected difficulties: ['easy', 'medium', 'hard'] → Final difficulty: mixed
```
OR (if only "Dễ" selected):
```
[AI Generation] Selected difficulties: ['easy'] → Final difficulty: easy
```

---

### 3. "Xem tất cả" History
**Status:** ✅ Fixed
**File:** `app.js` line 1888-1956
**Function:** `viewAllAIQuestionHistory()`
**Fix:** Loads 100 items instead of 10

```javascript
const result = await AIQuestionHistory.list({ limit: 100, forceRefresh: true });
```

**Test:**
1. Create > 10 history items (by generating questions multiple times)
2. Click "Xem tất cả" button
3. ✅ Should load up to 100 items
4. ✅ Toast should show: "Đã tải X lượt sinh từ lịch sử"

**Note:** Initial render shows only 10 items (recent), "Xem tất cả" expands to 100

---

### 4. Auth State Sync
**Status:** ✅ Fixed (with 500ms retry)
**File:** `app.js` line 1765-1778
**Fix:** Checks both `AuthModule.user` and `NavController.currentUser`, with retry

```javascript
let user = AuthModule.user || NavController?.currentUser;
if (!user || !user.email) {
  // Retry after 500ms in case auth is still loading
  await new Promise(resolve => setTimeout(resolve, 500));
  user = AuthModule.user || NavController?.currentUser;
}
```

**Test:**
1. Login with Google
2. Navigate to AI Generation tab immediately
3. ✅ Should NOT show "Đăng nhập để xem lịch sử" if already logged in
4. ✅ Avatar should be visible in top-right AND history should load

---

## 🧪 Manual Testing Steps

### Prerequisites
```powershell
# Make sure server is running
npm start

# Navigate to
http://localhost:3000
```

### Test 1: Check Console for Errors
1. Open browser DevTools (F12) → Console tab
2. Navigate to "Tạo câu hỏi bằng AI"
3. ✅ **PASS:** No errors about `source-bank-count`
4. ❌ **FAIL:** Errors in console → Check line numbers

### Test 2: Difficulty Selection
1. Go to AI Generation page
2. Current state: 3 buttons active (Dễ, TB, Khó)
3. **Test A:** Generate with default
   - ✅ Console should show: `difficulty: mixed`
4. **Test B:** Click to keep only "Dễ" active
   - Generate again
   - ✅ Console should show: `difficulty: easy`
5. **Test C:** Click to keep only "Khó" active
   - Generate again
   - ✅ Console should show: `difficulty: hard`

### Test 3: File Upload Display
1. Click "Tải lên" tab
2. Upload a PDF file
3. ✅ File should appear in list below upload zone
4. ✅ Should show: filename, file type, size, character count
5. ✅ Should have "X" button to remove

### Test 4: History Sync
1. Make sure you're logged in (avatar visible)
2. Go to AI Generation
3. Sidebar should show:
   - ✅ "Lịch sử tạo gần đây" (not "Đăng nhập...")
   - ✅ List of recent generations (if any exist)
   - ✅ "Xem tất cả" button

### Test 5: View All History
**Prerequisites:** Create at least 12 history items
1. Initial load shows 10 items
2. Click "Xem tất cả"
3. ✅ Should load all items (up to 100)
4. ✅ Toast: "Đã tải X lượt sinh từ lịch sử"

---

## 🐛 Known Limitations (Not Bugs)

1. **Only Multiple Choice Supported**
   - ✅ EXPECTED: Đúng/Sai, Kết hợp, Tự luận are `disabled`
   - These features are not implemented yet

2. **Default Difficulty is "mixed"**
   - ✅ EXPECTED: 3 buttons active by default → mixed
   - This is correct behavior

3. **No Pagination UI**
   - ✅ EXPECTED: Max 100 items, no "Load More" button
   - Future enhancement

4. **File Upload Accepts .doc**
   - ⚠️ LIMITATION: `.doc` uses DOCX parser, may fail
   - Only `.docx` is fully supported

5. **PDF Scan Detection**
   - ⚠️ LIMITATION: Detects scans but doesn't auto-OCR
   - Shows warning, user must use external OCR

---

## 📊 Test Results Summary

### Expected Results (All Fixes Applied)

| Test | Expected | Status |
|------|----------|--------|
| No console errors | ✅ Pass | Verify |
| Difficulty selection works | ✅ Pass | Verify |
| File upload shows in list | ✅ Pass | Verify |
| History loads when logged in | ✅ Pass | Verify |
| "Xem tất cả" loads 100 items | ✅ Pass | Verify |
| Tab switching works | ✅ Pass | Verify |
| Difficulty buttons toggle | ✅ Pass | Verify |

### To Verify
- [ ] Test with real API keys
- [ ] Test with > 10 history items
- [ ] Test auth sync on slow connection
- [ ] Test file upload with various file types

---

## 🔍 Debug Commands

### Check if elements exist
```javascript
// In browser console
console.log('source-bank-count:', document.getElementById('source-bank-count'));
console.log('source-ai-count:', document.getElementById('source-ai-count'));
console.log('ai-question-history-list:', document.getElementById('ai-question-history-list'));
```

### Check auth state
```javascript
console.log('AuthModule.user:', AuthModule.user);
console.log('NavController.currentUser:', NavController.currentUser);
```

### Check difficulty buttons
```javascript
const active = document.querySelectorAll('.ai-difficulty.active');
console.log('Active difficulty buttons:', Array.from(active).map(b => b.dataset.level));
```

### Trigger history refresh
```javascript
renderAIQuestionHistory();
```

---

## 📝 Notes

1. **Browser Cache:** Hard refresh (Ctrl+Shift+R) if changes don't appear
2. **Console Logging:** Debug log added for difficulty selection
3. **Auth Timing:** 500ms retry should handle most auth sync issues
4. **Element Existence:** All critical elements now have null checks

---

## ✅ Acceptance Criteria

**Definition of Done:**
- [ ] No JavaScript errors in console when loading AI Generation page
- [ ] Difficulty selection affects API call (verify in console log)
- [ ] File uploads display in compact list
- [ ] History shows correct auth state (logged in = show list, not logged in = show prompt)
- [ ] "Xem tất cả" button loads more items than initial view
- [ ] All UI interactions work smoothly (tabs, buttons, clicks)
