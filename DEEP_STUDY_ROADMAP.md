# Deep Study Enhancement Roadmap

## 🎯 Mục tiêu: 7.0 → 9.0/10

**Vấn đề cốt lõi:** "Học Sâu" không phải là văn phong, mà là **quy trình xử lý tri thức**.

Hiện tại: Đang cố nhồi 12 kỹ thuật vào 1 prompt → AI overload → "nói hay nhưng sai giáo trình".

**Giải pháp:** Chia thành **7-step pipeline**, mỗi bước có mục tiêu rõ ràng + validation.

---

## 📊 12 Kỹ Thuật Lõi (Gom thành 4 Tầng)

### TẦNG 1 — BẢO TOÀN (Không được sai/mất)

#### 1. **Source Fidelity** (Trung thành nguồn)
- **Mục tiêu:** Mỗi câu phải thuộc 1 trong 3 loại: [SOURCE], [INFERENCE], [EXPANSION]
- **Implementation:** Tách `from_source` vs `ai_extended`
- **Validation:** `added_content_in_source = []`, `mislabeled_as_source = []`
- **Status:** ✅ Done (v4)

#### 2. **Knowledge Preservation** (Bảo toàn tri thức)
- **Mục tiêu:** Không xóa kiến thức chỉ vì "dài"
- **Luật:** Xóa sự lặp lại, không xóa tri thức
- **Checklist:**
  - □ Tất cả khái niệm có định nghĩa/chức năng riêng?
  - □ Plasmid, mesosome, ribosome có đầy đủ?
  - □ Quá trình có đủ TẤT CẢ bước?
- **Status:** 🔄 Partial (cần EXTRACTION step riêng)

#### 3. **Numerical Fidelity** (Bảo toàn số liệu)
- **Mục tiêu:** Số liệu = dữ liệu bất biến
- **Quy trình:**
  1. Trích TẤT CẢ số từ GT: `[{value, unit, context}]`
  2. Sau khi viết xong → SO SÁNH ngược lại
  3. `number_alterations` PHẢI = 0
- **Cấm:**
  - µm → mm
  - 95% → >50%
  - "15-30 phút" → "30 phút"
- **Status:** 🔄 Partial (cần validation riêng)

#### 4. **Knowledge Tiering** (Phân tầng giá trị)
- **Mục tiêu:** Phân từng concept vào A/B/C/D
- **Tier A (Core):** Giữ 100% ý + đầy đủ
- **Tier B (Support):** Giữ nhưng nén
- **Tier C (Example):** Giữ nếu có giá trị nhận diện
- **Tier D (Detail):** Nén mạnh / tham khảo
- **Status:** ❌ Not implemented

---

### TẦNG 2 — NÉN (Giảm chữ, không giảm kiến thức)

#### 5. **Lossless Semantic Compression** (Nén không mất ý)
- **Mục tiêu:** Giảm số chữ nhưng giữ số lượng ý nghĩa
- **VD:**
  - Input: "Ribosome có kích thước 15-20nm. Ribosome được cấu tạo bởi RNA và protein. Ribosome có nhiệm vụ tổng hợp protein..."
  - Output: "Ribosome: 15-20nm, gồm RNA + protein → tổng hợp protein; E. coli có ~10,000 ribosome"
- **Status:** ❌ Not implemented

#### 6. **Redundancy Removal** (Loại bỏ lặp lại)
- **Mục tiêu:** Gộp các câu diễn giải cùng một ý
- **Status:** ❌ Not implemented

---

### TẦNG 3 — HỌC SÂU (Biến giáo trình thành kiến trúc dễ hiểu)

#### 7. **Knowledge Re-structuring** (Tái cấu trúc)
- **Mục tiêu:** Đổi cấu trúc, KHÔNG đổi nội dung
- **Công thức:** Khái niệm → Đặc điểm → Cấu tạo → Chức năng → Cơ chế → Ví dụ → Phân biệt
- **VD:** Chuyển Gram+/Gram− từ 2 đoạn văn → Bảng so sánh
- **Status:** 🔄 Partial (đang làm thủ công trong prompt)

#### 8. **Mechanism Reconstruction** (Giải thích cơ chế)
- **Mục tiêu:** Điều kiện → tác động → biến đổi → kết quả
- **VD Nha bào:**
  ```
  Thiếu dinh dưỡng
  ↓
  Phân chia không đối xứng
  ↓
  Hình thành tiền bào tử
  ↓ (8 bước)
  Nha bào trưởng thành
  ```
- **Status:** ❌ Not implemented

#### 9. **Relational Encoding** (Chuyển văn thành quan hệ)
- **Mục tiêu:** Tìm A→B, A≠B, A phụ thuộc B
- **VD:**
  ```
  Không có thành tế bào
  ↓
  Không chịu áp suất thẩm thấu
  ↓
  Hình thái dễ biến đổi
  ↓
  Mycoplasma có hình thái đa dạng
  ```
- **Status:** ❌ Not implemented

#### 10. **Contrastive Learning** (Phân biệt dễ nhầm)
- **Mục tiêu:** Tìm cặp A vs B → Điểm giống → Điểm khác → Dấu hiệu nhận diện
- **VD:** Gram+ ↔ Gram−, Flagella ↔ Pili, Bacillus ↔ Clostridium
- **Status:** 🔄 Partial (có bảng so sánh nhưng chưa có "dễ nhầm")

---

### TẦNG 4 — NGÀNH & KIỂM ĐỊNH

#### 11. **Domain Grounding** (Liên hệ CNTP)
- **Mục tiêu:** Kiến thức → Ý nghĩa → Ứng dụng TỔNG QUÁT
- **Quy tắc:** KHÔNG chi tiết thiết bị (PLC, PID, PEF...) nếu GT không có
- **VD OK:** "Có thể ứng dụng kiểm soát nhiệt độ lên men" ✅
- **VD SAI:** "Dùng PLC + PID + Pt100..." ❌
- **Status:** 🔄 Partial (đang tự bổ sung sai)

#### 12. **Knowledge Loss Audit** (Kiểm tra mất mát)
- **Mục tiêu:** AI tự hỏi "Tôi đã làm mất kiến thức nào?"
- **Checklist:**
  - □ Tất cả mục lớn đã xuất hiện?
  - □ Plasmid, mesosome, ribosom đã có?
  - □ Quá trình có đủ bước?
  - □ Số liệu còn chính xác?
- **Status:** ❌ Not implemented

#### 13. **Unsupported Claim Audit** (Kiểm tra Hallucination)
- **Mục tiêu:** Quét ngược: "Câu nào không tìm thấy căn cứ trong nguồn?"
- **VD phát hiện:**
  - "Nha bào tồn tại hàng nghìn năm" ❌
  - "Pilus 100-400 sợi" ❌ (nếu GT không có)
  - "LPS gây phá hủy hồng cầu" ❌ (nếu GT không hỗ trợ)
- **Status:** ❌ Not implemented

---

## 🏗️ Architecture: 7-Step Pipeline

```
GIÁO TRÌNH
    ↓
┌─────────────────────────────────────┐
│ STEP 1: EXTRACTION (Bóc tách)      │
│ Goal: Liệt kê TẤT CẢ concepts      │
│ Output: {concepts: [...], numbers: [...]}│
│ Validation: Không bỏ sót           │
│ Techniques: #2 Knowledge Preservation│
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 2: CLASSIFICATION (Phân tầng)│
│ Goal: A=Core, B=Support, C=Example│
│ Output: {tier_a: [...], tier_b: [...]}│
│ Validation: Mỗi concept có tier    │
│ Techniques: #4 Knowledge Tiering   │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 3: COMPRESSION (Nén không mất)│
│ Goal: Giảm chữ, giữ ý              │
│ Output: {compressed: {...}}        │
│ Validation: So sánh với Step 1    │
│ Techniques: #5 Lossless Compression│
│             #6 Redundancy Removal  │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 4: RESTRUCTURE (Tái cấu trúc)│
│ Goal: Khái niệm→Cơ chế→Ví dụ→So sánh│
│ Output: {restructured: {...}}      │
│ Validation: Không đổi nội dung    │
│ Techniques: #7 Re-structuring      │
│             #10 Contrastive Learning│
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 5: RELATIONS (Quan hệ & cơ chế)│
│ Goal: A→B, A≠B, Cơ chế từng bước   │
│ Output: {relations: [...]}         │
│ Validation: Chỉ từ Step 1-4       │
│ Techniques: #8 Mechanism           │
│             #9 Relational Encoding │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 6: DOMAIN (Liên hệ CNTP)     │
│ Goal: Ứng dụng TỔNG QUÁT           │
│ Output: {domain_apps: [...]}       │
│ Note: Tách riêng, ghi rõ [AI]    │
│ Techniques: #11 Domain Grounding   │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│ STEP 7: AUDIT (Kiểm tra)          │
│ Goal: So sánh Step 1 vs Step 6    │
│ - Concepts missing?                │
│ - Numbers altered?                 │
│ - Unsupported claims?              │
│ Output: {audit: {pass: bool, issues: [...]}}│
│ Techniques: #3 Numerical Fidelity  │
│             #12 Loss Audit         │
│             #13 Hallucination Audit│
└─────────┬───────────────────────────┘
          ↓
      HỌC SÂU
```

---

## 📅 Implementation Plan

### Phase 1: Foundation (Week 1)
**Priority: TẦNG 1 - Không được sai/mất**

- [x] #1 Source Fidelity (Done - v4)
- [ ] #2 Knowledge Preservation → Thêm EXTRACTION step
- [ ] #3 Numerical Fidelity → Validation riêng
- [ ] #4 Knowledge Tiering → Phân A/B/C/D

**Target:** 7.0 → 7.5 (giảm lỗi sai số liệu, giảm mất khái niệm)

### Phase 2: Compression (Week 2)
**Priority: TẦNG 2 - Nén thông minh**

- [ ] #5 Lossless Compression
- [ ] #6 Redundancy Removal

**Target:** 7.5 → 8.0 (ngắn gọn hơn nhưng đầy đủ hơn)

### Phase 3: Deep Learning (Week 3-4)
**Priority: TẦNG 3 - Tái cấu trúc**

- [ ] #7 Re-structuring
- [ ] #8 Mechanism Reconstruction
- [ ] #9 Relational Encoding
- [ ] #10 Contrastive Learning

**Target:** 8.0 → 8.5 (dễ học, hiểu bản chất)

### Phase 4: Domain & Audit (Week 5)
**Priority: TẦNG 4 - Liên hệ & kiểm định**

- [ ] #11 Domain Grounding (sửa lại - không tự bổ sung PLC/PID)
- [ ] #12 Knowledge Loss Audit
- [ ] #13 Unsupported Claim Audit

**Target:** 8.5 → 9.0 (chuẩn xác, ứng dụng đúng, tự kiểm tra)

---

## 🔍 Current Issues (v4 - Score: 7.0/10)

### ❌ Lỗi nghiêm trọng:
1. **Gắn sai nhãn:** "[TRÍCH TỪ GT]" cho kiến thức AI tự bổ sung (PLC, PID, PEF...)
2. **Biến dạng số liệu:** "PG 95%" → ">50%"
3. **Tự bổ sung:** "Nội độc tố" → "gây sốt, tiêu chảy, phá hủy hồng cầu"

### ⚠️ Vấn đề cần sửa:
- Mycoplasma: "nảy chồi" (thiếu "hoặc phân mảnh")
- Nha bào: "Chịu nhiệt và hóa chất cực cao" (thiếu số liệu cụ thể: 121°C/15-30', 165-170°C/2h)
- Mesosome: Khẳng định quá chắc (GT chỉ mô tả vai trò)
- Xạ khuẩn: Thiếu chi tiết (enzyme, bệnh Actinomycosis)
- Rickettsia: Quá sơ sài (thiếu kích thước, hình dạng, nhuộm Giemsa...)

### ✅ Điểm tốt:
- Đã có đủ 4 phần lớn
- Đã có plasmid, mesosome, ribosome
- Đã có bảng so sánh
- Đã bắt đầu có quan hệ/cơ chế

---

## 💡 Key Insights

> **"Học Sâu" ≠ "Tóm tắt ngắn + AI tự giải thích"**
> 
> **"Học Sâu" = BẢO TOÀN + NÉN + TÁI CẤU TRÚC + QUAN HỆ + KIỂM ĐỊNH**

> **Ưu tiên thứ tự:** Source Fidelity → Knowledge Preservation → Numerical Fidelity → Compression → Restructuring → Mechanism → Relations → Domain → Audit

> **Nếu 4 cái đầu không chắc, càng thêm "giải thích sâu", AI càng dễ "nói hay nhưng sai giáo trình"**

---

## 📚 References

- User feedback #1: 6.2/10 - Thiếu coverage
- User feedback #2: 7.4/10 - Tiến bộ nhưng vẫn thiếu
- User feedback #3: 7.2/10 - Có chiều sâu nhưng tự suy diễn
- User feedback #4: 7.0/10 - "AI nói hay nhưng sai GT" - Gắn sai nhãn, biến dạng số liệu

---

*Last updated: 2026-09-12*
*Next action: Implement Phase 1 - Foundation*
