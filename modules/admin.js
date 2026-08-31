/**
 * admin.js — Hidden Admin Panel for editing questions and syncing
 */

import { DB } from './db.js';
import { pushAdminEdits, pullAdminEdits } from './sync.js?v=20260831';

let adminClickCount = 0;
let adminClickTimeout = null;

/**
 * Khởi tạo ẩn: Lắng nghe sự kiện click vào phần tử trigger
 * @param {string} triggerId - ID của element (ví dụ 'header-brand')
 */
export function initAdminAuth() {
  const trigger = document.querySelector('.header-brand');
  if (!trigger) return;

  trigger.addEventListener('click', (e) => {
    // Để không phá vỡ chức năng cũ, ta vẫn gọi switchTab('exam-tab') ở app.js
    // Admin trigger chỉ tính số lần click
    adminClickCount++;
    
    if (adminClickCount >= 5) {
      adminClickCount = 0; // reset
      clearTimeout(adminClickTimeout);
      
      const pwd = prompt("Nhập mã Admin để vào chế độ chỉnh sửa:");
      if (pwd === "13052008") {
        openAdminPanel();
      } else if (pwd !== null) {
        alert("Sai mã Admin!");
      }
    }

    clearTimeout(adminClickTimeout);
    adminClickTimeout = setTimeout(() => {
      adminClickCount = 0; // reset nếu dừng click quá lâu
    }, 1500);
  });

  // Gắn hàm lưu toàn cục để HTML onclick gọi được
  window.adminSaveQuestion = adminSaveQuestion;
}

function openAdminPanel() {
  document.getElementById('admin-list-modal').classList.add('open');
  renderAdminTable();

  // Search logic
  const searchInput = document.getElementById('admin-search-input');
  searchInput.removeEventListener('input', handleAdminSearch); // clear cũ
  searchInput.addEventListener('input', handleAdminSearch);
}

function handleAdminSearch(e) {
  const term = e.target.value.toLowerCase();
  renderAdminTable(term);
}

function renderAdminTable(filterTerm = '') {
  const tbody = document.getElementById('admin-questions-tbody');
  tbody.innerHTML = '';
  
  const bank = DB.getBank();
  
  const filtered = bank.filter(q => {
    if (!filterTerm) return true;
    return q.id.toString().includes(filterTerm) || q.q.toLowerCase().includes(filterTerm);
  });

  // Chỉ render 100 câu đầu để không lag nếu không filter
  const toRender = filtered.slice(0, 100);

  toRender.forEach(q => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${q.id}</td>
      <td style="text-align: left; max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${q.q}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openAdminEdit(${q.id})">
          <i class="fa-solid fa-pen"></i> Sửa
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  
  if (filtered.length > 100) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="3" style="text-align:center; color:gray;">Còn ${filtered.length - 100} câu nữa. Hãy tìm kiếm để thấy.</td>`;
    tbody.appendChild(tr);
  }
}

// Hàm global để mở form sửa
window.openAdminEdit = function(id) {
  const bank = DB.getBank();
  const q = bank.find(item => item.id === id);
  if (!q) return;

  document.getElementById('admin-edit-id').value = q.id;
  document.getElementById('admin-edit-q').value = q.q;
  document.getElementById('admin-edit-opt0').value = q.options[0] || '';
  document.getElementById('admin-edit-opt1').value = q.options[1] || '';
  document.getElementById('admin-edit-opt2').value = q.options[2] || '';
  document.getElementById('admin-edit-opt3').value = q.options[3] || '';
  document.getElementById('admin-edit-correct').value = q.correct;
  document.getElementById('admin-edit-exp').value = q.exp || '';

  document.getElementById('admin-edit-modal').classList.add('open');
};

export async function adminSaveQuestion() {
  const id = parseInt(document.getElementById('admin-edit-id').value);
  if (!id) return;

  const newQ = document.getElementById('admin-edit-q').value.trim();
  const opt0 = document.getElementById('admin-edit-opt0').value.trim();
  const opt1 = document.getElementById('admin-edit-opt1').value.trim();
  const opt2 = document.getElementById('admin-edit-opt2').value.trim();
  const opt3 = document.getElementById('admin-edit-opt3').value.trim();
  const correct = parseInt(document.getElementById('admin-edit-correct').value);
  const exp = document.getElementById('admin-edit-exp').value.trim();

  if (!newQ || !opt0 || !opt1) {
    alert("Câu hỏi và ít nhất 2 đáp án không được để trống!");
    return;
  }

  const updates = {
    q: newQ,
    options: [opt0, opt1, opt2, opt3].filter(Boolean),
    correct: correct,
    exp: exp,
    // Xoá cờ _seed để câu này được tính là câu user sửa và push lên GitHub
    _seed: false
  };

  // 1. Cập nhật Local DB của Admin
  DB.updateQuestion(id, updates);

  // 2. Đóng modal và refresh bảng
  document.getElementById('admin-edit-modal').classList.remove('open');
  renderAdminTable(document.getElementById('admin-search-input').value.toLowerCase());

  const btn = document.querySelector('#admin-edit-modal .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu...'; }

  try {
    // 3. Kéo bản edits hiện có trên GitHub về
    let existingEdits = [];
    try { existingEdits = await pullAdminEdits(); } catch {}

    // 4. Merge: giữ các câu khác, đè lên câu có cùng ID
    const mergedEdits = existingEdits.filter(e => e.id !== id);
    mergedEdits.push({ id, ...updates, _adminEdit: true });

    // 5. Push merged edits lên GitHub
    const ok = await pushAdminEdits(mergedEdits);

    if (ok) {
      alert(`✅ Đã lưu và đồng bộ câu hỏi #${id} lên máy chủ! Mọi người dùng khác sẽ thấy khi tải lại trang.`);
    } else {
      alert('⚠️ Không thể kết nối GitHub. Dữ liệu đã lưu trên máy bạn nhưng chưa đồng bộ được.');
    }
  } catch (e) {
    alert('⚠️ Lỗi không mong đợi: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '💾 Lưu & Đồng Bộ Lên Mạng'; }
  }
}
