/**
 * mindmap.js — Mindmap Renderer (SVG Interactive Canvas)
 * Renders beautiful, colorful SVG mindmaps matching Screenshot 4.
 */

export function renderMindmap(container, data) {
  if (!container) return;
  
  const title = data?.title || 'Tài liệu học tập';
  const branches = Array.isArray(data?.branches) && data.branches.length > 0 ? data.branches : [
    { title: 'Khái niệm cơ bản', color: '#3b82f6', items: ['Định nghĩa chính', 'Phạm vi áp dụng'] },
    { title: 'Nội dung cốt lõi', color: '#10b981', items: ['Quy trình thực hiện', 'Tiêu chuẩn đánh giá'] },
    { title: 'Các yếu tố ảnh hưởng', color: '#f59e0b', items: ['Yếu tố khách quan', 'Yếu tố chủ quan'] },
    { title: 'Điểm cần lưu ý', color: '#8b5cf6', items: ['Lỗi thường gặp', 'Giải pháp khắc phục'] }
  ];

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  const svgWidth = 850;
  const svgHeight = 520;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  // Calculate layout for branches (2 on left, 2 on right)
  const leftBranches = [];
  const rightBranches = [];

  branches.forEach((b, idx) => {
    if (idx % 2 === 0) rightBranches.push({ ...b, color: b.color || colors[idx % colors.length] });
    else leftBranches.push({ ...b, color: b.color || colors[idx % colors.length] });
  });

  let svgHtml = `
    <div class="cs-mindmap-wrapper">
      <div class="cs-mindmap-controls">
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-in" title="Phóng to"><i class="fa-solid fa-plus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-out" title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-reset" title="Về giữa"><i class="fa-solid fa-house"></i></button>
      </div>
      <div class="cs-mindmap-canvas-viewport" id="cs-mm-viewport">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="cs-mindmap-svg" id="cs-mm-svg">
          <defs>
            <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.08"/>
            </filter>
            <radialGradient id="center-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#2563eb" />
              <stop offset="100%" stop-color="#1d4ed8" />
            </radialGradient>
          </defs>
          <g id="cs-mm-zoom-group">
  `;

  // Draw connecting curves & branch nodes for Right side
  const rightCount = rightBranches.length;
  rightBranches.forEach((branch, idx) => {
    const yOffset = (idx - (rightCount - 1) / 2) * 160;
    const branchX = centerX + 220;
    const branchY = centerY + yOffset;

    // Bezier Curve from Center Node to Branch Node
    const ctrlX1 = centerX + 90;
    const ctrlY1 = centerY;
    const ctrlX2 = branchX - 60;
    const ctrlY2 = branchY;

    svgHtml += `
      <path d="M ${centerX + 60} ${centerY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${branchX} ${branchY}"
            fill="none" stroke="${branch.color}" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />
    `;

    // Branch Card
    svgHtml += `
      <g transform="translate(${branchX}, ${branchY - 45})" filter="url(#node-shadow)">
        <rect x="0" y="0" width="200" height="90" rx="14" fill="#ffffff" stroke="${branch.color}" stroke-width="2.5"/>
        <rect x="0" y="0" width="200" height="32" rx="14" fill="${branch.color}" opacity="0.12"/>
        <text x="14" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="${branch.color}">${escapeSvgText(branch.title)}</text>
    `;

    // Items inside branch card
    (branch.items || []).slice(0, 3).forEach((item, itemIdx) => {
      svgHtml += `
        <circle cx="16" cy="${44 + itemIdx * 16}" r="3" fill="${branch.color}" />
        <text x="26" y="${48 + itemIdx * 16}" font-family="Inter, sans-serif" font-size="11" fill="#475569">${escapeSvgText(truncateText(item, 26))}</text>
      `;
    });

    svgHtml += `</g>`;
  });

  // Draw connecting curves & branch nodes for Left side
  const leftCount = leftBranches.length;
  leftBranches.forEach((branch, idx) => {
    const yOffset = (idx - (leftCount - 1) / 2) * 160;
    const branchX = centerX - 220;
    const branchY = centerY + yOffset;

    const ctrlX1 = centerX - 90;
    const ctrlY1 = centerY;
    const ctrlX2 = branchX + 60;
    const ctrlY2 = branchY;

    svgHtml += `
      <path d="M ${centerX - 60} ${centerY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${branchX} ${branchY}"
            fill="none" stroke="${branch.color}" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />
    `;

    svgHtml += `
      <g transform="translate(${branchX - 200}, ${branchY - 45})" filter="url(#node-shadow)">
        <rect x="0" y="0" width="200" height="90" rx="14" fill="#ffffff" stroke="${branch.color}" stroke-width="2.5"/>
        <rect x="0" y="0" width="200" height="32" rx="14" fill="${branch.color}" opacity="0.12"/>
        <text x="14" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="${branch.color}">${escapeSvgText(branch.title)}</text>
    `;

    (branch.items || []).slice(0, 3).forEach((item, itemIdx) => {
      svgHtml += `
        <circle cx="16" cy="${44 + itemIdx * 16}" r="3" fill="${branch.color}" />
        <text x="26" y="${48 + itemIdx * 16}" font-family="Inter, sans-serif" font-size="11" fill="#475569">${escapeSvgText(truncateText(item, 26))}</text>
      `;
    });

    svgHtml += `</g>`;
  });

  // Center Main Node
  svgHtml += `
    <g transform="translate(${centerX}, ${centerY})" filter="url(#node-shadow)">
      <rect x="-85" y="-36" width="170" height="72" rx="36" fill="url(#center-grad)" stroke="#ffffff" stroke-width="3"/>
      <text x="0" y="5" font-family="Inter, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeSvgText(truncateText(title, 20))}</text>
    </g>
  `;

  svgHtml += `
          </g>
        </svg>
      </div>
    </div>
  `;

  container.innerHTML = svgHtml;

  // Bind zoom & pan controls
  initMindmapControls(container);
}

function truncateText(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function escapeSvgText(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initMindmapControls(container) {
  const group = container.querySelector('#cs-mm-zoom-group');
  if (!group) return;

  let scale = 1;
  let pointX = 0;
  let pointY = 0;

  function updateTransform() {
    group.setAttribute('transform', `translate(${pointX}, ${pointY}) scale(${scale})`);
  }

  container.querySelector('#cs-mm-zoom-in')?.addEventListener('click', () => {
    scale = Math.min(scale + 0.15, 2.2);
    updateTransform();
  });

  container.querySelector('#cs-mm-zoom-out')?.addEventListener('click', () => {
    scale = Math.max(scale - 0.15, 0.5);
    updateTransform();
  });

  container.querySelector('#cs-mm-reset')?.addEventListener('click', () => {
    scale = 1;
    pointX = 0;
    pointY = 0;
    updateTransform();
  });
}
