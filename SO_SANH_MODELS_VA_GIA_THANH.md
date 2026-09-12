# 📊 SO SÁNH ĐẦY ĐỦ: MỨC ĐỘ THÔNG MINH, GIÁ THÀNH & QUOTA CỦA CÁC AI MODELS

**Ngày cập nhật:** 12/09/2026  
**Mục đích:** So sánh toàn bộ models đang sử dụng trong hệ thống QLCL & ATTP

---

## 🎯 TÓM TẮT NHANH

### Top Models Hiện Tại:

| Ranking | Model | Trí Thông Minh | Giá (Free) | Quota Free | Tốc Độ | Khuyến Nghị |
|---------|-------|----------------|------------|------------|--------|-------------|
| 🥇 | **Gemini 3.7 Flash** | ⭐⭐⭐⭐ | ✅ FREE | 1,000 RPD | ⚡⚡⚡⚡ | **DÙNG CHÍNH** |
| 🥈 | **Groq (GPT-OSS 120B)** | ⭐⭐⭐⭐ | ✅ FREE | Cao | ⚡⚡⚡⚡⚡ | **FALLBACK 1** |
| 🥉 | **Mistral Nemo 12B** | ⭐⭐⭐ | ✅ FREE | Vừa | ⚡⚡⚡⚡ | **FALLBACK 2** |
| 4 | **GPT-4o Mini** | ⭐⭐⭐⭐ | ✅ FREE* | Thấp | ⚡⚡⚡ | **FALLBACK 3** |
| 5 | **Llama 3.3 70B** | ⭐⭐⭐⭐ | ✅ FREE* | Thấp | ⚡⚡⚡ | **FALLBACK 4** |

*FREE qua OpenRouter (dù balance âm)

---

## 📋 CHI TIẾT TỪNG NHÓM MODEL

---

## 1️⃣ NHÓM IMAGE ANALYSIS (Phân tích hình ảnh / OCR / Giải toán)

### 🥇 Gemini 3.7 Flash (Google AI)

**Mức độ thông minh:** ⭐⭐⭐⭐⭐ (9/10)
- Multimodal native mạnh mẽ
- OCR tiếng Việt xuất sắc
- Phân tích hình ảnh chính xác cao
- Giải toán tốt (nhưng không bằng GPT-4o)

**Giá thành:**
- **Free Tier:** $0/tháng
  - Input: $0.075/1M tokens
  - Output: $0.30/1M tokens
  - **Thực tế FREE** với 1,000 requests/ngày
- **Paid Tier 1:** $0.75/1M input, $3.75/1M output

**Quota:**
- RPM: 15 requests/phút
- TPM: 250K tokens/phút  
- **RPD: 1,000 requests/ngày** ✅
- 3 keys → **3,000 requests/ngày**

**Tốc độ:** ⚡⚡⚡⚡ (4/5) - Nhanh

**Trạng thái:** ✅ **100% hoạt động** (3/3 keys)

**Use cases tốt nhất:**
- ✅ OCR PDF/ảnh tiếng Việt
- ✅ Phân tích biểu đồ, bảng biểu
- ✅ Giải thích hình ảnh học tập
- ✅ Vision tasks tổng quát

**Nhược điểm:**
- Giải toán phức tạp không bằng GPT-4o
- Tiếng Anh tự nhiên hơi kém hơn OpenAI

---

### 🥈 GPT-4o Mini (OpenAI qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐ (8/10)
- Vision tốt, nhưng không native như Gemini
- Giải toán tốt hơn Gemini
- Reasoning logic mạnh

**Giá thành:**
- **Free Tier qua OpenRouter:** 
  - ✅ **VẪN FREE** dù balance âm!
  - Thực tế: $0.15/1M input, $0.60/1M output
- **Direct OpenAI:** $0.15/1M input, $0.60/1M output

**Quota:**
- ✅ **Unlimited** qua OpenRouter (vì vẫn được dùng free)
- 1 key nhưng vẫn hoạt động

**Tốc độ:** ⚡⚡⚡ (3/5) - Trung bình

**Trạng thái:** ✅ **Hoạt động** (dù hết credits)

**Use cases tốt nhất:**
- ✅ Giải toán phức tạp
- ✅ Reasoning logic
- ✅ Vision + Text kết hợp

**Nhược điểm:**
- Không native multimodal như Gemini
- Tốc độ chậm hơn
- Quota có thể thay đổi bất cứ lúc nào

---

### 🥉 Qwen 2.5-VL 72B (Alibaba qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐ (8/10)
- Vision model mạnh của Alibaba
- Đa ngôn ngữ tốt (Trung, Việt, Anh)
- OCR tiếng Trung xuất sắc

**Giá thành:**
- **Qua OpenRouter:** $0.40/1M input, $1.60/1M output
- ❌ **HẾT CREDITS** - Không dùng được

**Quota:**
- Phụ thuộc vào OpenRouter credits
- Hiện tại: ❌ Không khả dụng

**Tốc độ:** ⚡⚡⚡ (3/5)

**Trạng thái:** ❌ **Hết credits**

---

### Pixtral 12B (Mistral AI)

**Mức độ thông minh:** ⭐⭐⭐ (7/10)
- Vision model của Mistral
- Đa ngôn ngữ tốt
- Nhỏ gọn (12B params)

**Giá thành:**
- **Direct Mistral:** $0.40/1M tokens
- ⚠️ **Rate Limited**

**Quota:**
- Bị rate limit thường xuyên
- Không ổn định

**Tốc độ:** ⚡⚡⚡⚡ (4/5)

**Trạng thái:** ⚠️ **Rate Limited**

**Nhận xét:** Không nên dùng vì rate limit

---

## 2️⃣ NHÓM QUESTION GENERATION (Tạo câu hỏi / Ra đề trắc nghiệm)

### 🥇 Groq - GPT-OSS 120B

**Mức độ thông minh:** ⭐⭐⭐⭐ (8.5/10)
- Model 120B parameters
- Tiếng Việt xuất sắc
- Tạo câu hỏi logic tốt
- JSON output ổn định

**Giá thành:**
- **100% FREE** (Groq sponsor)
- Không tính phí

**Quota:**
- RPM: **Cao** (30-50 requests/phút)
- RPD: **Rất cao** (không giới hạn rõ ràng)
- 3 keys → Quota x3

**Tốc độ:** ⚡⚡⚡⚡⚡ (5/5) - **Siêu nhanh** (Groq LPU™)

**Trạng thái:** ✅ **100% hoạt động** (3/3 keys)

**Use cases tốt nhất:**
- ✅ Tạo câu hỏi trắc nghiệm hàng loạt
- ✅ Multi-layer question generation
- ✅ Tiếng Việt chất lượng cao
- ✅ JSON structured output

**Ưu điểm:**
- ✅ **TỐC ĐỘ CỰC NHANH** (nhanh nhất trong tất cả)
- ✅ FREE hoàn toàn
- ✅ Quota rất cao
- ✅ 3 keys backup

**Nhược điểm:**
- Đôi khi hơi "sáng tạo quá" (cần prompt rõ ràng)

---

### 🥈 Gemini 3.7 Flash

**Mức độ thông minh:** ⭐⭐⭐⭐ (8/10)
- Tạo câu hỏi tốt
- Tiếng Việt tự nhiên
- Đa dạng dạng câu hỏi

**Giá thành:** (xem phần Image Analysis)

**Quota:** 
- 1,000 RPD × 3 keys = **3,000 requests/ngày**

**Tốc độ:** ⚡⚡⚡⚡ (4/5)

**Trạng thái:** ✅ **100% hoạt động**

**Use cases:**
- ✅ Fallback khi Groq quá tải
- ✅ Tạo câu hỏi yêu cầu "hiểu sâu"
- ✅ Đa dạng hóa câu hỏi

---

### 🥉 Mistral Nemo 12B

**Mức độ thông minh:** ⭐⭐⭐ (7/10)
- Model 12B nhỏ gọn
- Tiếng Việt khá tốt
- Tốc độ cao

**Giá thành:**
- **FREE** (có rate limit)
- Direct: $0.30/1M input, $0.90/1M output

**Quota:**
- RPM: 10-15
- **Model `open-mistral-nemo-2407` HOẠT ĐỘNG TỐT**
- Không bị rate limit như `mistral-small-latest`

**Tốc độ:** ⚡⚡⚡⚡ (4/5)

**Trạng thái:** ✅ **Hoạt động tốt**

**Use cases:**
- ✅ Fallback thứ 2 sau Gemini
- ✅ Câu hỏi đơn giản
- ✅ Tốc độ cao với model nhẹ

---

### Llama 3.3 70B (Meta qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐ (8/10)
- Model 70B mạnh mẽ
- Open source chất lượng cao
- Reasoning tốt

**Giá thành:**
- ✅ **FREE qua OpenRouter** (dù hết credits)
- Normal: $0.60/1M input, $0.60/1M output

**Quota:**
- Unlimited qua OpenRouter (hiện tại)
- Có thể thay đổi bất cứ lúc nào

**Tốc độ:** ⚡⚡⚡ (3/5)

**Trạng thái:** ✅ **Hoạt động** (sponsored)

**Use cases:**
- ✅ Fallback thứ 3
- ✅ Câu hỏi phức tạp hơn
- ✅ Backup khi Gemini/Groq hết quota

---

## 3️⃣ NHÓM PREMIUM ZONE (AI Cao Cấp)

### 🥇 DeepSeek R1 (qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐⭐ (9.5/10)
- **TƯ DUY LOGIC CỰC MẠNH**
- Reasoning như o1 của OpenAI
- Giải toán phức tạp xuất sắc
- Chain-of-thought tự nhiên

**Giá thành:**
- **Qua OpenRouter:** $0.55/1M input, $2.19/1M output
- ❌ **Hết credits**

**Quota:**
- Phụ thuộc OpenRouter balance

**Tốc độ:** ⚡⚡ (2/5) - Chậm (vì reasoning)

**Trạng thái:** ❌ **Hết credits**

**Use cases tốt nhất:**
- ✅ Giải toán phức tạp (Đại số, Hình học, Vi tích phân)
- ✅ Reasoning logic nhiều bước
- ✅ Phân tích sâu
- ✅ Suy luận khoa học

**Khi nào dùng:**
- Câu hỏi "Tư duy cao"
- Bài tập đòi hỏi nhiều bước suy luận
- Premium content

---

### 🥈 Claude 3.5 Sonnet (Anthropic qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐⭐ (9/10)
- **PHÂN TÍCH VĂN BẢN XUẤT SẮC**
- Hiểu ngữ cảnh sâu
- Viết tự nhiên nhất
- Safety cao

**Giá thành:**
- **Qua OpenRouter:** $3.00/1M input, $15.00/1M output
- ❌ **Hết credits**

**Quota:**
- Phụ thuộc OpenRouter balance

**Tốc độ:** ⚡⚡⚡ (3/5)

**Trạng thái:** ❌ **Hết credits**

**Use cases tốt nhất:**
- ✅ Phân tích văn học, lịch sử
- ✅ Viết content chất lượng cao
- ✅ Tóm tắt tài liệu phức tạp
- ✅ Trả lời câu hỏi mở

---

### 🥉 SambaNova Llama 3.3 70B

**Mức độ thông minh:** ⭐⭐⭐⭐ (8/10)
- Model 70B mạnh
- Tốc độ cực nhanh (SambaNova hardware)
- Đa năng tốt

**Giá thành:**
- **SambaNova API:** ~$0.10-0.30/1M tokens
- ❌ **Hết credits** (balance = 0)

**Quota:**
- Cần credits

**Tốc độ:** ⚡⚡⚡⚡⚡ (5/5) - **Siêu nhanh**

**Trạng thái:** ❌ **Hết credits**

---

### Mistral Large (Mistral AI)

**Mức độ thông minh:** ⭐⭐⭐⭐ (8.5/10)
- Model flagship của Mistral
- Đa ngôn ngữ cực tốt
- Chính xác cao
- Code generation tốt

**Giá thành:**
- **Direct Mistral:** $2.00/1M input, $6.00/1M output
- ⚠️ **Rate Limited**

**Quota:**
- Key valid nhưng bị rate limit

**Tốc độ:** ⚡⚡⚡⚡ (4/5)

**Trạng thái:** ⚠️ **Rate Limited**

---

### GPT-4o (OpenAI qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐⭐ (9/10)
- **ĐA NĂNG NHẤT**
- Vision + Text + Code tốt
- Reasoning mạnh
- Tiếng Việt tự nhiên

**Giá thành:**
- **Qua OpenRouter:** $2.50/1M input, $10.00/1M output
- ❌ **Hết credits**

**Quota:**
- Phụ thuộc OpenRouter balance

**Tốc độ:** ⚡⚡⚡ (3/5)

**Trạng thái:** ❌ **Hết credits**

**Use cases tốt nhất:**
- ✅ Câu hỏi đa dạng
- ✅ Vision + Text
- ✅ Code generation
- ✅ Đa năng cao cấp

---

### Gemini 2.0 Pro (Google qua OpenRouter)

**Mức độ thông minh:** ⭐⭐⭐⭐⭐ (9/10)
- **HÀN LÂM & ĐA NGÔN NGỮ**
- Model Pro lớn hơn Flash
- Hiểu sâu hơn
- Context window lớn (2M tokens)

**Giá thành:**
- **Qua OpenRouter:** $1.25/1M input, $5.00/1M output
- ❌ **Hết credits**

**Quota:**
- Phụ thuộc OpenRouter balance

**Tốc độ:** ⚡⚡ (2/5) - Chậm (model lớn)

**Trạng thái:** ❌ **Hết credits**

**Use cases tốt nhất:**
- ✅ Nội dung học thuật sâu
- ✅ Tài liệu dài (context 2M)
- ✅ Đa ngôn ngữ phức tạp
- ✅ Premium education content

---

## 📊 BẢNG SO SÁNH TỔNG HỢP

### Theo Giá (Rẻ → Đắt)

| Model | Giá (Input/Output per 1M tokens) | Free Tier | Trạng thái |
|-------|----------------------------------|-----------|------------|
| **Groq GPT-OSS 120B** | **$0 / $0** ✅ | Unlimited | ✅ Tốt nhất |
| **Gemini 3.7 Flash** | **$0.075 / $0.30** ✅ | 1,000 RPD | ✅ Tốt nhất |
| **Mistral Nemo 12B** | **$0.30 / $0.90** | Có | ✅ Tốt |
| **GPT-4o Mini** | **$0.15 / $0.60** | Via OR | ✅ Tốt |
| **Llama 3.3 70B** | **$0.60 / $0.60** | Via OR | ✅ Tốt |
| **Qwen 2.5-VL** | $0.40 / $1.60 | Via OR | ❌ Hết |
| **Pixtral 12B** | $0.40 / $0.40 | Có | ⚠️ Limited |
| **DeepSeek R1** | $0.55 / $2.19 | Via OR | ❌ Hết |
| **Gemini 2.0 Pro** | $1.25 / $5.00 | Via OR | ❌ Hết |
| **Mistral Large** | $2.00 / $6.00 | Không | ⚠️ Limited |
| **GPT-4o** | $2.50 / $10.00 | Via OR | ❌ Hết |
| **Claude 3.5 Sonnet** | $3.00 / $15.00 | Via OR | ❌ Hết |

---

### Theo Trí Thông Minh (Thông minh nhất → Thấp nhất)

| Ranking | Model | Score | Best For |
|---------|-------|-------|----------|
| 🥇 | **DeepSeek R1** | 9.5/10 | Reasoning, Math |
| 🥈 | **Claude 3.5 Sonnet** | 9/10 | Analysis, Writing |
| 🥈 | **GPT-4o** | 9/10 | All-around |
| 🥈 | **Gemini 2.0 Pro** | 9/10 | Academic, Multilingual |
| 🥉 | **Gemini 3.7 Flash** | 8.5/10 | Vision, OCR |
| 🥉 | **Groq GPT-OSS 120B** | 8.5/10 | Question Gen |
| 🥉 | **Mistral Large** | 8.5/10 | Multilingual |
| 4 | **Llama 3.3 70B** | 8/10 | Open source |
| 4 | **GPT-4o Mini** | 8/10 | Vision budget |
| 4 | **Qwen 2.5-VL** | 8/10 | Vision multilingual |
| 5 | **Mistral Nemo 12B** | 7/10 | Fast, lightweight |
| 6 | **Pixtral 12B** | 7/10 | Vision budget |

---

### Theo Tốc Độ (Nhanh nhất → Chậm nhất)

| Ranking | Model | Speed | Note |
|---------|-------|-------|------|
| 🚀 | **Groq GPT-OSS 120B** | ⚡⚡⚡⚡⚡ | Groq LPU™ |
| 🚀 | **SambaNova Llama 3.3** | ⚡⚡⚡⚡⚡ | SambaNova chip |
| ⚡ | **Gemini 3.7 Flash** | ⚡⚡⚡⚡ | Flash series |
| ⚡ | **Mistral Nemo 12B** | ⚡⚡⚡⚡ | Small model |
| ⚡ | **Mistral Large** | ⚡⚡⚡⚡ | Optimized |
| 🐢 | **GPT-4o** | ⚡⚡⚡ | Large model |
| 🐢 | **Llama 3.3 70B** | ⚡⚡⚡ | 70B params |
| 🐢 | **GPT-4o Mini** | ⚡⚡⚡ | Via OpenRouter |
| 🐢 | **Claude 3.5 Sonnet** | ⚡⚡⚡ | Large model |
| 🐌 | **Gemini 2.0 Pro** | ⚡⚡ | Pro model |
| 🐌 | **DeepSeek R1** | ⚡⚡ | Reasoning slow |

---

## 🎯 KHUYẾN NGHỊ SỬ DỤNG

### Cấu hình hiện tại (Dựa trên keys còn hoạt động):

```javascript
// IMAGE ANALYSIS
Priority 1: Gemini 3.7 Flash (3 keys, 100% uptime)
Priority 2: GPT-4o Mini (free via OpenRouter)
Priority 3: Không có fallback khác

// QUESTION GENERATION  
Priority 1: Groq GPT-OSS 120B (3 keys, siêu nhanh, 100% uptime)
Priority 2: Gemini 3.7 Flash (3 keys, 100% uptime)
Priority 3: Mistral Nemo 12B (1 key, hoạt động tốt)
Priority 4: Llama 3.3 70B (free via OpenRouter)
Priority 5: GPT-4o Mini (free via OpenRouter)

// PREMIUM ZONE
Hiện tại: ❌ TẤT CẢ HẾT CREDITS
Cần: Nạp thêm credits vào OpenRouter
```

---

### Chi phí ước tính nếu nạp credits:

**OpenRouter - $10:**
- DeepSeek R1: ~18M input tokens
- Claude 3.5: ~3M input tokens  
- GPT-4o: ~4M input tokens
- Gemini 2.0 Pro: ~8M input tokens

**Khuyến nghị nạp:** $10-20/tháng cho Premium Zone

---

## 💰 CHI PHÍ DỰ KIẾN THEO USE CASE

### Scenario 1: Chỉ dùng FREE models

**Models:**
- Groq (primary) - $0
- Gemini 3.7 (fallback) - $0 (dưới 1,000 RPD)
- Mistral Nemo (backup) - $0 (rate limit OK)

**Chi phí:** **$0/tháng** ✅

**Giới hạn:**
- Gemini: 3,000 requests/ngày (3 keys)
- Groq: Unlimited (thực tế)
- Mistral Nemo: ~500-1,000/ngày

**Phù hợp:**
- ✅ Tạo câu hỏi hàng loạt
- ✅ OCR documents
- ✅ Question bank generation
- ❌ Premium reasoning tasks

---

### Scenario 2: FREE + OpenRouter $10/tháng

**Models:**
- FREE models (như Scenario 1)
- DeepSeek R1 (occasional)
- Claude 3.5 (occasional)
- GPT-4o (occasional)

**Chi phí:** **$10/tháng**

**Phù hợp:**
- ✅ Tất cả use cases của Scenario 1
- ✅ 10-20 premium reasoning tasks/ngày
- ✅ Advanced math problems
- ✅ Deep analysis tasks

---

### Scenario 3: Production Scale

**Models:**
- FREE models (primary)
- OpenRouter $20-50/tháng (premium)
- Gemini Tier 1 (nếu vượt 1,000 RPD)

**Chi phí:** **$20-50/tháng**

**Phù hợp:**
- ✅ Large-scale question generation
- ✅ Daily premium content
- ✅ Full feature set
- ✅ No rate limits

---

## 📝 ACTION ITEMS

### Ngay lập tức:

1. ✅ **Đang dùng đúng models** (Gemini 3.7, Groq, Mistral Nemo)
2. ✅ **Không cần thay đổi** architecture hiện tại
3. ⏳ **Nạp $10-20** vào OpenRouter nếu cần Premium Zone

### Theo dõi:

- Monitor Gemini quota (3,000 RPD limit)
- Check Groq performance (should be stable)
- Watch OpenRouter credits (if recharged)

### Tối ưu hóa:

- Dùng Groq cho question generation (nhanh nhất, free)
- Dùng Gemini cho vision/OCR (chính xác nhất, free)
- Dùng Premium models khi thực sự cần (reasoning phức tạp)

---

## 🎓 KẾT LUẬN

### Models đang dùng TỐT NHẤT hiện tại:

1. **Gemini 3.7 Flash** - FREE, 1,000 RPD, 3 keys = **⭐⭐⭐⭐⭐**
2. **Groq GPT-OSS 120B** - FREE, unlimited, siêu nhanh = **⭐⭐⭐⭐⭐**
3. **Mistral Nemo 12B** - FREE, ổn định = **⭐⭐⭐⭐**

### Giá trị tốt nhất (Value for Money):

🥇 **Groq** - FREE + Nhanh nhất + Unlimited  
🥈 **Gemini 3.7** - FREE + Chất lượng cao + 3K RPD  
🥉 **Mistral Nemo** - FREE + Ổn định + Backup tốt

### Khi nào cần nạp tiền:

- ❌ **KHÔNG CẦN** cho 99% use cases hiện tại
- ✅ **CẦN** nếu muốn DeepSeek R1 cho math reasoning
- ✅ **CẦN** nếu muốn Claude 3.5 cho deep analysis
- ✅ **CẦN** nếu vượt quá 3,000 Gemini requests/ngày

### Chi phí tối ưu:

- **$0/tháng:** Đủ cho 95% use cases ✅
- **$10/tháng:** Thêm premium features ⭐
- **$20-50/tháng:** Full production scale 🚀

---

**Tóm lại:** Hệ thống hiện tại đã được tối ưu TỐT với FREE models. Chỉ cần nạp tiền khi thực sự cần Premium reasoning hoặc scale lớn!
