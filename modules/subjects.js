/**
 * subjects.js — Master Curriculum Framework Registry
 * Quản lý Toàn bộ Học phần thuộc Chương trình đào tạo Ngành Công nghệ Thực phẩm
 */

export const KNOWLEDGE_BLOCKS = {
  GDQP: { id: 'GDQP', name: 'Giáo dục quốc phòng & An ninh', icon: '🎖️' },
  DC_CHUNG: { id: 'DC_CHUNG', name: 'Đại cương chung (Bắt buộc)', icon: '📚' },
  DC_TUCHON: { id: 'DC_TUCHON', name: 'Đại cương chung (Tự chọn)', icon: '💡' },
  CS_NGANH: { id: 'CS_NGANH', name: 'Kiến thức cơ sở ngành (CNTP)', icon: '🧪' }
};

export const SUBJECTS_REGISTRY = [
  // ─── 1. GIÁO DỤC QUỐC PHÒNG & AN NINH ────────────────────────────────────────
  { id: 'GE4150', code: 'GE4150', name: 'Công tác quốc phòng, an ninh', credits: 2, blockId: 'GDQP', semester: 3 },
  { id: 'GE4165', code: 'GE4165', name: 'Đường lối quốc phòng và an ninh của Đảng Cộng sản Việt Nam', credits: 3, blockId: 'GDQP', semester: 3 },
  { id: 'GE4166', code: 'GE4166', name: 'Quân sự chung', credits: 2, blockId: 'GDQP', semester: 3 },
  { id: 'GE4167', code: 'GE4167', name: 'Kỹ thuật chiến đấu bộ binh và chiến thuật', credits: 4, blockId: 'GDQP', semester: 5 },

  // ─── 2. ĐẠI CƯƠNG CHUNG BẮT BUỘC ──────────────────────────────────────────────
  { id: 'FT4058', code: 'FT4058', name: 'Vật lý đại cương - CNTP', credits: 2, blockId: 'DC_CHUNG', semester: 1 },
  { id: 'FT4450', code: 'FT4450', name: 'Nhập môn Công nghệ thực phẩm', credits: 1, blockId: 'DC_CHUNG', semester: 1 },
  { id: 'FT4452', code: 'FT4452', name: 'Sinh học đại cương - CNTP', credits: 3, blockId: 'DC_CHUNG', semester: 1 },
  { id: 'FT4453', code: 'FT4453', name: 'Kỹ năng phòng thí nghiệm - CNTP', credits: 2, blockId: 'DC_CHUNG', semester: 1 },
  { id: 'GE4091', code: 'GE4091', name: 'Triết học Mác - Lênin', credits: 3, blockId: 'DC_CHUNG', semester: 1 },
  { id: 'FT4451', code: 'FT4451', name: 'Hóa học đại cương - CNTP', credits: 3, blockId: 'DC_CHUNG', semester: 2 },
  { id: 'GE4039', code: 'GE4039', name: 'Pháp luật Việt Nam đại cương', credits: 2, blockId: 'DC_CHUNG', semester: 2 },
  { id: 'GE4092', code: 'GE4092', name: 'Kinh tế chính trị Mác - Lênin', credits: 2, blockId: 'DC_CHUNG', semester: 2 },
  { id: 'FT4598', code: 'FT4598', name: 'Xác suất thống kê - CNTP', credits: 2, blockId: 'DC_CHUNG', semester: 4 },
  { id: 'GE4056', code: 'GE4056', name: 'Tư tưởng Hồ Chí Minh', credits: 2, blockId: 'DC_CHUNG', semester: 4 },
  { id: 'GE4093', code: 'GE4093', name: 'Chủ nghĩa xã hội khoa học', credits: 2, blockId: 'DC_CHUNG', semester: 4 },
  { id: 'GE4094', code: 'GE4094', name: 'Lịch sử Đảng Cộng sản Việt Nam', credits: 2, blockId: 'DC_CHUNG', semester: 5 },

  // ─── 3. ĐẠI CƯƠNG CHUNG TỰ CHỌN ──────────────────────────────────────────────
  { id: 'FT4443', code: 'FT4443', name: 'Hình thành và phát triển kỹ năng mềm - CNTP', credits: 2, blockId: 'DC_TUCHON', semester: 2 },
  { id: 'GE4023', code: 'GE4023', name: 'Kinh tế học đại cương', credits: 2, blockId: 'DC_TUCHON', semester: 2 },
  { id: 'GE4049', code: 'GE4049', name: 'Tiếng Việt thực hành', credits: 2, blockId: 'DC_TUCHON', semester: 2 },

  // ─── 4. KIẾN THỨC CƠ SỞ NGÀNH (CNTP) ─────────────────────────────────────────
  { id: 'FT4454', code: 'FT4454', name: 'Vi sinh học đại cương - CNTP', credits: 2, blockId: 'CS_NGANH', semester: 2 },
  { id: 'FT4456', code: 'FT4456', name: 'Nhiệt kỹ thuật thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 2 },
  { id: 'FT4463', code: 'FT4463', name: 'Vẽ kỹ thuật', credits: 2, blockId: 'CS_NGANH', semester: 2 },
  { id: 'FT4467', code: 'FT4467', name: 'Nguyên lý các quá trình và thiết bị trong chế biến TP', credits: 2, blockId: 'CS_NGANH', semester: 2 },
  { id: 'FT4470', code: 'FT4470', name: 'Nước trong CNTP', credits: 2, blockId: 'CS_NGANH', semester: 2 },
  { id: 'FT4458', code: 'FT4458', name: 'Vi sinh thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 4 },
  { id: 'FT4464', code: 'FT4464', name: 'An toàn và ô nhiễm trong sản xuất TP', credits: 2, blockId: 'CS_NGANH', semester: 4 },
  { id: 'FT4465', code: 'FT4465', name: 'Thực tập nghề nghiệp - ngoài trường', credits: 2, blockId: 'CS_NGANH', semester: 4 },
  { id: 'FT4469', code: 'FT4469', name: 'Kỹ thuật lạnh', credits: 2, blockId: 'CS_NGANH', semester: 5 },
  { id: 'FT4455', code: 'FT4455', name: 'Hóa keo - CNTP', credits: 2, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4459', code: 'FT4459', name: 'Các quá trình hóa lý trong CNTP', credits: 2, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4460', code: 'FT4460', name: 'Kỹ thuật thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4468', code: 'FT4468', name: 'Quản lý chất lượng và luật thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4457', code: 'FT4457', name: 'Hóa học thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 7 },
  { id: 'FT4462', code: 'FT4462', name: 'Thực tập Kỹ thuật thực phẩm (PTN)', credits: 2, blockId: 'CS_NGANH', semester: 7 },
  { id: 'FT4466', code: 'FT4466', name: 'Nguyên lý bảo quản và chế biến thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 7 },
  { id: 'FT4461', code: 'FT4461', name: 'Hóa sinh học thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 8 },

  // ─── 5. MÔN CHUYÊN NGÀNH THỰC PHẨM ───────────────────────────────────────────
  { id: 'FT4480', code: 'FT4480', name: 'Thiết kế thí nghiệm và xử lý số liệu - CNTP', credits: 3, blockId: 'CS_NGANH', semester: 5 },
  { id: 'FT4484', code: 'FT4484', name: 'Đánh giá cảm quan thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4485', code: 'FT4485', name: 'Bao bì thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4592', code: 'FT4592', name: 'Dinh dưỡng và sức khỏe', credits: 3, blockId: 'CS_NGANH', semester: 6 },
  { id: 'FT4481', code: 'FT4481', name: 'Phương pháp nghiên cứu khoa học - CNTP', credits: 3, blockId: 'CS_NGANH', semester: 7 },
  { id: 'FT4486', code: 'FT4486', name: 'Phụ gia thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 7 },
  { id: 'FT4482', code: 'FT4482', name: 'Seminar chuyên ngành - CNTP', credits: 3, blockId: 'CS_NGANH', semester: 8 },
  { id: 'FT4483', code: 'FT4483', name: 'Anh văn chuyên ngành - CNTP', credits: 3, blockId: 'CS_NGANH', semester: 8 },
  { id: 'FT4487', code: 'FT4487', name: 'Phát triển sản phẩm mới', credits: 3, blockId: 'CS_NGANH', semester: 8 },
  { id: 'FT4479', code: 'FT4479', name: 'Phân tích thực phẩm', credits: 3, blockId: 'CS_NGANH', semester: 9 },
  { id: 'FT4488', code: 'FT4488', name: 'Công nghệ sau TH và chế biến SP thực vật', credits: 4, blockId: 'CS_NGANH', semester: 9 },
  { id: 'FT4489', code: 'FT4489', name: 'Công nghệ sau TH và chế biến SP động vật', credits: 4, blockId: 'CS_NGANH', semester: 11 },
  { id: 'FT4490', code: 'FT4490', name: 'TT. Công nghệ thực phẩm (PTN)', credits: 2, blockId: 'CS_NGANH', semester: 11 },
  { id: 'FT4591', code: 'FT4591', name: 'Thực tập Kỹ thuật công nghệ thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 12 },

  // ─── 6. MÔN TỰ CHỌN CHUYÊN NGÀNH ─────────────────────────────────────────────
  { id: 'FT4492', code: 'FT4492', name: 'Công nghệ sản xuất đường, sữa và chất béo', credits: 4, blockId: 'CS_NGANH', semester: 10 },
  { id: 'FT4496', code: 'FT4496', name: 'Độc tố học thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 10 },
  { id: 'FT4497', code: 'FT4497', name: 'Xử lý tận dụng phế và phụ phẩm thực phẩm', credits: 2, blockId: 'CS_NGANH', semester: 10 },
  { id: 'FT4493', code: 'FT4493', name: 'Công nghệ sản xuất SP truyền thống VN và CN', credits: 4, blockId: 'CS_NGANH', semester: 11 },
  { id: 'FT4494', code: 'FT4494', name: 'Thực phẩm chức năng', credits: 2, blockId: 'CS_NGANH', semester: 11 },
  { id: 'FT4495', code: 'FT4495', name: 'Công nghệ enzyme', credits: 2, blockId: 'CS_NGANH', semester: 11 },

  // ─── 7. MÔN BỔ SUNG KHÁC ──────────────────────────────────────────────────────
  { id: 'EE4001', code: 'EE4001', name: 'Kỹ thuật điện', credits: 3, blockId: 'CS_NGANH', semester: 3 }
];

export const DEFAULT_SUBJECT_ID = 'FT4468';

function getCustomSubjectsFromStorage() {
  try {
    return JSON.parse(localStorage.getItem('qlcl_custom_subjects') || '[]');
  } catch {
    return [];
  }
}

export function getAllSubjects() {
  const custom = getCustomSubjectsFromStorage();
  return [...SUBJECTS_REGISTRY, ...custom];
}

export function getSubjectById(id) {
  const all = getAllSubjects();
  return all.find(s => s.id === id || s.code === id) || all.find(s => s.id === DEFAULT_SUBJECT_ID);
}

export function getSubjectsByBlock(blockId) {
  const all = getAllSubjects();
  if (!blockId || blockId === 'ALL') return all;
  return all.filter(s => s.blockId === blockId);
}
