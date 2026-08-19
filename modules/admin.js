/**
 * admin.js — Hidden Admin Panel for editing questions and syncing
 */

import { DB } from './db.js';
import { pushToGitHub } from './sync.js';

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
  document.getElementById('admin-list-modal').classList.remove('hidden');
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

  document.getElementById('admin-edit-modal').classList.remove('hidden');
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

  // 1. Cập nhật vào Local DB
  DB.updateQuestion(id, updates);
  
  // 2. Giao diện mượt mà
  document.getElementById('admin-edit-modal').classList.add('hidden');
  renderAdminTable(document.getElementById('admin-search-input').value.toLowerCase());
  
  alert("Lưu thành công trên máy của bạn. Đang đồng bộ lên hệ thống chung...");
  
  // 3. Push thẳng lên GitHub
  try {
    const existingBank = DB.getBank();
    const userQuestions = existingBank.filter(q => !q._seed);
    await pushToGitHub(userQuestions, DB.getSources());
    alert("Đã đồng bộ thành công lên máy chủ! Mọi người dùng khác sẽ thấy câu hỏi mới ngay khi tải lại trang.");
  } catch (e) {
    alert("Có lỗi khi đồng bộ lên GitHub, nhưng dữ liệu đã được lưu trên máy bạn.");
  }
}
