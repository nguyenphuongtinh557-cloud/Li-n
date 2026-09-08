# 📊 Gemini API Quota & Rate Limits

**Ngày cập nhật:** 08/09/2026  
**Nguồn:** Google AI for Developers Documentation

---

## 🎯 Cách Tính Quota

### Gemini API tính quota theo **3 chiều**:

1. **RPM** (Requests Per Minute) - Số lần gọi/phút
2. **TPM** (Tokens Per Minute) - Số tokens input/phút
3. **RPD** (Requests Per Day) - Số lần gọi/ngày

### ⚠️ Quy Tắc Quan Trọng:

- **Vượt BẤT KỲ giới hạn nào** → Bị chặn (429 error)
- Quota **tính theo PROJECT**, không phải API key
- RPD reset lúc **midnight Pacific time**
- Mỗi model có limit riêng

---

## 🆓 Free Tier Limits (Hiện Tại)

### Bạn đang ở: **FREE TIER**

| Metric | Limit | Note |
|--------|-------|------|
| **RPM** | 5-15 | Tùy model |
| **TPM** | 250,000 | Input tokens |
| **RPD** | 100-1,000 | Tùy model |

### Chi tiết theo model:

**Gemini 3.8 Flash (đang dùng):**
- RPM: ~15 requests/phút
- TPM: 250,000 tokens/phút
- RPD: 1,000 requests/ngày

**Gemini 2.5 Flash:**
- RPM: ~10 requests/phút
- TPM: 250,000 tokens/phút
- RPD: 1,000 requests/ngày

---

## 💳 Spend-Based Rate Limits

### Ngoài RPM/TPM/RPD, còn có giới hạn chi tiêu:

| Tier | Spend Limit (per 10 minutes) |
|------|------------------------------|
| Free | N/A (không giới hạn) |
| Tier 1 | $10 |
| Tier 2 | $50 |
| Tier 3 | $200 |

**Lưu ý:** Bạn đang dùng **Free tier** nên không có spend limit!

---

## 📈 Usage Tiers

### Tier System:

| Tier | Requirement | Billing Cap |
|------|-------------|-------------|
| **Free** | Active project or free trial | N/A |
| **Tier 1** | Set up billing account | $250 |
| **Tier 2** | Paid $100 + 3 days | $2,000 |
| **Tier 3** | Paid $1,000 + 30 days | $20K-$100K+ |

### Khi nào nên upgrade?

**Upgrade sang Tier 1** khi:
- ❌ Thường xuyên bị 429 (rate limit)
- ❌ Cần >15 RPM
- ❌ Cần >1,000 RPD
- ✅ **Tier 1 limits**: 150-300 RPM, 1M+ TPM

---

## 🔍 Bạn Đang Dùng Bao Nhiêu Keys?

### Current Setup:
```javascript
gemini: [
  'AIzaSy...',  // Key 1
  'AIzaSy...',  // Key 2  
  'AIzaSy...'   // Key 3
]
```

### Chiến lược Key Rotation:

✅ **Lợi ích:**
- 3 keys × 15 RPM = **45 RPM tổng cộng**
- 3 keys × 1,000 RPD = **3,000 RPD tổng cộng**
- **Không bị rate limit** do xoay vòng keys

❌ **Nhược điểm:**
- Quota vẫn tính **PER PROJECT** (không phải per key)
- Nếu 3 keys cùng project → **limit vẫn là 15 RPM**
- Nếu 3 keys khác project → **limit được nhân 3**

---

## 🚨 Kiểm Tra Project của Keys

### Để biết 3 keys có cùng project không:

Bạn có 2 trường hợp:

### ✅ Trường hợp 1: 3 keys KHÁC project
- **RPM tổng**: 15 × 3 = **45 RPM**
- **TPM tổng**: 250K × 3 = **750K TPM**
- **RPD tổng**: 1,000 × 3 = **3,000 RPD**
- **Key rotation có hiệu quả!**

### ❌ Trường hợp 2: 3 keys CÙNG project
- **RPM tổng**: **15 RPM** (không tăng)
- **TPM tổng**: **250K TPM** (không tăng)
- **RPD tổng**: **1,000 RPD** (không tăng)
- **Key rotation VÔ DỤNG!** (chỉ tốn công xoay)

---

## 🔬 Test Để Biết Thực Tế

### Cách kiểm tra:

1. **Test nhanh:** Gọi 20 requests liên tục (trong 1 phút)
   - Nếu pass → 3 keys khác project (limit × 3)
   - Nếu 429 → 3 keys cùng project (limit giữ nguyên)

2. **Check AI Studio:**
   - Vào https://aistudio.google.com/apikey
   - Xem mỗi key thuộc project nào
   - Nếu khác project → rotation có ích
   - Nếu cùng project → rotation vô dụng

---

## 💡 Khuyến Nghị

### Với hệ thống hiện tại:

**Scenario A: Keys khác project** (lý tưởng)
- ✅ Giữ nguyên 3 keys
- ✅ Key rotation hoạt động tốt
- ✅ Có thể xử lý 45 RPM

**Scenario B: Keys cùng project** (cần tối ưu)
- ⚠️ Xóa 2 keys thừa (vì vô dụng)
- ⚠️ Hoặc tạo keys từ projects khác
- ⚠️ Hoặc upgrade lên Tier 1 ($250 cap, 300 RPM)

### Load hiện tại của bạn:

Với thiết kế **Multi-Layer Generator**:
- Mỗi chunk: 3 calls song song (Groq + Gemini + Mistral)
- Gemini chỉ gọi **1 lần/chunk** (layer 3)
- Nếu 10 chunks → 10 Gemini calls
- **Kết luận:** 15 RPM là đủ (không cần lo)

---

## 📊 So Sánh Với Các Provider Khác

| Provider | Free RPM | Free TPM | Free RPD |
|----------|----------|----------|----------|
| **Gemini** | 15 | 250K | 1,000 |
| **Groq** | 30 | 20K | 14,400 |
| **Mistral** | 1 | N/A | 7,200 |
| **OpenRouter** | Varies | Varies | Varies |

**Nhận xét:**
- Gemini: RPM thấp, TPM cao (tốt cho long context)
- Groq: RPM cao, TPM thấp (tốt cho short & fast)
- Strategy hiện tại (Groq + Gemini + Mistral) **cực kỳ hợp lý**

---

## 🎯 Kết Luận

### Gemini quota tính theo:
1. ✅ **Số lần gọi** (RPM, RPD)
2. ✅ **Số tokens** (TPM)
3. ✅ **Per project** (không phải per key)

### Hệ thống hiện tại:
- ✅ **3 Gemini keys** đang rotation
- ⚠️ **Cần verify** keys có khác project không
- ✅ **Load thấp** (1 call/chunk) → 15 RPM đủ dùng
- ✅ **Có fallback** (Groq, Mistral, OpenRouter)

### Action items:
1. 🔍 **Check AI Studio** xem 3 keys cùng project hay khác
2. ✅ **Nếu khác project:** Perfect, giữ nguyên
3. ⚠️ **Nếu cùng project:** Tạo keys từ projects khác
4. 📊 **Monitor usage** để biết có cần upgrade Tier 1 không

---

## 📚 Tham Khảo

- **Rate Limits Doc:** https://ai.google.dev/gemini-api/docs/rate-limits
- **AI Studio (Check Keys):** https://aistudio.google.com/apikey
- **Pricing:** https://ai.google.dev/pricing
- **Projects Page:** https://console.cloud.google.com/welcome
