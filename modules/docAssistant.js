/**
 * docAssistant.js — Interactive AI Q&A Sidebar Widget matching Screenshot 4
 * Allows students to ask questions directly about the active document.
 */

import { AIPool } from './aiPool.js';

export function initDocAssistant({ container, getDocumentTitle, getDocumentText }) {
  if (!container) return;

  container.innerHTML = `
    <div class="cs-doc-assistant-card">
      <div class="cs-da-header">
        <div class="cs-da-avatar">
          <i class="fa-solid fa-robot"></i>
        </div>
        <div>
          <h4 class="cs-da-title">Hỏi AI về tài liệu</h4>
          <p class="cs-da-sub">Giải đáp tức thì dựa trên nội dung file</p>
        </div>
      </div>

      <div class="cs-da-body">
        <div class="cs-da-welcome-bubble">
          <div class="cs-da-bot-icon"><i class="fa-solid fa-face-smile-wink"></i></div>
          <p>Bạn có thể hỏi mình bất cứ điều gì về nội dung tài liệu này nhé!</p>
        </div>

        <div class="cs-da-suggestions">
          <button type="button" class="cs-da-chip" data-prompt="Giải thích các khái niệm chính trong tài liệu bằng ví dụ dễ hiểu.">
            <i class="fa-solid fa-comment-dots"></i> Giải thích khái niệm với ví dụ dễ hiểu.
          </button>
          <button type="button" class="cs-da-chip" data-prompt="Phân tích các yếu tố ảnh hưởng và mối quan hệ giữa chúng.">
            <i class="fa-solid fa-comment-dots"></i> Phân tích sự thay đổi và tác động chính.
          </button>
          <button type="button" class="cs-da-chip" data-prompt="Tóm tắt ngắn gọn 3 điểm quan trọng nhất cần ghi nhớ.">
            <i class="fa-solid fa-comment-dots"></i> Tóm tắt lại các điểm chính trong tài liệu.
          </button>
        </div>

        <div class="cs-da-messages" id="cs-da-messages"></div>
      </div>

      <div class="cs-da-footer">
        <div class="cs-da-input-group">
          <input type="text" id="cs-da-input" class="cs-da-input" placeholder="Đặt câu hỏi về tài liệu…" />
          <button type="button" id="cs-da-send-btn" class="cs-da-send-btn" title="Gửi câu hỏi">
            <i class="fa-solid fa-paper-plane"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  const inputEl = container.querySelector('#cs-da-input');
  const sendBtn = container.querySelector('#cs-da-send-btn');
  const messagesEl = container.querySelector('#cs-da-messages');

  async function handleSend(userQuery) {
    const query = userQuery || inputEl?.value.trim();
    if (!query) return;

    if (inputEl) inputEl.value = '';

    // Append User Message
    appendMessage(messagesEl, 'user', query);

    // Append Typing Indicator
    const typingId = 'cs-da-typing-' + Date.now();
    appendTyping(messagesEl, typingId);

    const docTitle = getDocumentTitle?.() || 'Tài liệu';
    const docText = (getDocumentText?.() || '').slice(0, 16000);

    try {
      const prompt = `Bạn là trợ lý học tập FTECA 24. CHỈ dựa trên nội dung TÀI LIỆU bên dưới để trả lời câu hỏi của sinh viên. Trả lời chính xác, ngắn gọn, đi thẳng vào vấn đề.\n\nTÊN TÀI LIỆU: ${docTitle}\n\nNỘI DUNG TÀI LIỆU:\n${docText}\n\nCÂU HỎI CỦA SINH VIÊN: ${query}`;
      
      const reply = await AIPool.callOpenRouter({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1000
      });

      removeTyping(messagesEl, typingId);
      appendMessage(messagesEl, 'bot', reply || 'Không thể lấy thông tin từ tài liệu.');
    } catch (err) {
      console.warn('[DocAssistant] Lỗi:', err);
      removeTyping(messagesEl, typingId);
      appendMessage(messagesEl, 'bot', 'Cảm ơn bạn! Đã có lỗi kết nối AI. Vui lòng thử lại sau giây lát.');
    }
  }

  sendBtn?.addEventListener('click', () => handleSend());
  inputEl?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  container.querySelectorAll('.cs-da-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      handleSend(chip.dataset.prompt);
    });
  });
}

function appendMessage(container, sender, text) {
  if (!container) return;
  const msgDiv = document.createElement('div');
  msgDiv.className = `cs-da-msg cs-da-msg-${sender}`;
  msgDiv.innerHTML = `
    <div class="cs-da-msg-bubble">
      ${escapeHtml(text).replace(/\n/g, '<br>')}
    </div>
  `;
  container.appendChild(msgDiv);
  container.scrollTop = container.scrollHeight;
}

function appendTyping(container, id) {
  if (!container) return;
  const typingDiv = document.createElement('div');
  typingDiv.id = id;
  typingDiv.className = 'cs-da-msg cs-da-msg-bot';
  typingDiv.innerHTML = `
    <div class="cs-da-msg-bubble cs-da-typing">
      <span></span><span></span><span></span>
    </div>
  `;
  container.appendChild(typingDiv);
  container.scrollTop = container.scrollHeight;
}

function removeTyping(container, id) {
  const el = container?.querySelector(`#${id}`);
  if (el) el.remove();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
