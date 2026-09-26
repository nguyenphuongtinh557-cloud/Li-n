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

  const svgWidth = 1200;
  const svgHeight = 720;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const cardWidth = 270;
  const cardHeight = 116;

  // Calculate layout for branches (2 on left, 2 on right)
  const leftBranches = [];
  const rightBranches = [];

  branches.forEach((b, idx) => {
    const target = b.side === 'left' || b.side === 'right'
      ? (b.side === 'left' ? leftBranches : rightBranches)
      : (idx % 2 === 0 ? rightBranches : leftBranches);
    target.push({ ...b, color: b.color || colors[idx % colors.length] });
  });

  let svgHtml = `
    <div class="cs-mindmap-wrapper">
      <div class="cs-mindmap-controls">
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-in" title="Phóng to"><i class="fa-solid fa-plus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-out" title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-reset" title="Về giữa"><i class="fa-solid fa-house"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-fullscreen" title="Mở toàn màn hình" aria-label="Mở sơ đồ toàn màn hình"><i class="fa-solid fa-expand"></i></button>
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
    const yOffset = (idx - (rightCount - 1) / 2) * 156;
    const branchX = centerX + 340;
    const branchY = centerY + yOffset;

    // Bezier Curve from Center Node to Branch Node
    const ctrlX1 = centerX + 90;
    const ctrlY1 = centerY;
    const ctrlX2 = branchX - 80;
    const ctrlY2 = branchY;

    svgHtml += `
      <path d="M ${centerX + 120} ${centerY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${branchX} ${branchY}"
            fill="none" stroke="${branch.color}" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />
    `;

    // Branch Card
    svgHtml += `
      <g transform="translate(${branchX}, ${branchY - cardHeight / 2})" filter="url(#node-shadow)">
        <rect class="cs-mm-card-rect" x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#ffffff" stroke="${branch.color}" stroke-width="2.5"/>
        <rect x="0" y="0" width="${cardWidth}" height="34" rx="14" fill="${branch.color}" opacity="0.12"/>
        <text x="14" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="${branch.color}">${escapeSvgText(branch.title)}</text>
    `;

    // Items inside branch card
    (branch.items || []).slice(0, 4).forEach((item, itemIdx) => {
      svgHtml += `
        <circle cx="16" cy="${47 + itemIdx * 17}" r="3" fill="${branch.color}" />
        <text class="cs-mm-item-text" x="26" y="${51 + itemIdx * 17}" font-family="Inter, sans-serif" font-size="11" fill="#475569">${escapeSvgText(truncateText(item, 34))}</text>
      `;
    });

    svgHtml += `</g>`;
  });

  // Draw connecting curves & branch nodes for Left side
  const leftCount = leftBranches.length;
  leftBranches.forEach((branch, idx) => {
    const yOffset = (idx - (leftCount - 1) / 2) * 156;
    const branchX = centerX - 340;
    const branchY = centerY + yOffset;

    const ctrlX1 = centerX - 90;
    const ctrlY1 = centerY;
    const ctrlX2 = branchX + 80;
    const ctrlY2 = branchY;

    svgHtml += `
      <path d="M ${centerX - 120} ${centerY} C ${ctrlX1} ${ctrlY1}, ${ctrlX2} ${ctrlY2}, ${branchX} ${branchY}"
            fill="none" stroke="${branch.color}" stroke-width="3.5" stroke-linecap="round" opacity="0.75" />
    `;

    svgHtml += `
      <g transform="translate(${branchX - cardWidth}, ${branchY - cardHeight / 2})" filter="url(#node-shadow)">
        <rect class="cs-mm-card-rect" x="0" y="0" width="${cardWidth}" height="${cardHeight}" rx="14" fill="#ffffff" stroke="${branch.color}" stroke-width="2.5"/>
        <rect x="0" y="0" width="${cardWidth}" height="34" rx="14" fill="${branch.color}" opacity="0.12"/>
        <text x="14" y="22" font-family="Inter, sans-serif" font-size="13" font-weight="700" fill="${branch.color}">${escapeSvgText(branch.title)}</text>
    `;

    (branch.items || []).slice(0, 4).forEach((item, itemIdx) => {
      svgHtml += `
        <circle cx="16" cy="${47 + itemIdx * 17}" r="3" fill="${branch.color}" />
        <text class="cs-mm-item-text" x="26" y="${51 + itemIdx * 17}" font-family="Inter, sans-serif" font-size="11" fill="#475569">${escapeSvgText(truncateText(item, 34))}</text>
      `;
    });

    svgHtml += `</g>`;
  });

  // Center Main Node
  svgHtml += `
    <g transform="translate(${centerX}, ${centerY})" filter="url(#node-shadow)">
      <rect x="-120" y="-42" width="240" height="84" rx="42" fill="url(#center-grad)" stroke="#ffffff" stroke-width="3"/>
      <text x="0" y="5" font-family="Inter, sans-serif" font-size="15" font-weight="800" fill="#ffffff" text-anchor="middle">${escapeSvgText(truncateText(title, 30))}</text>
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

export function renderStructuredMindmap(container, data) {
  if (!container) return;
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  if (!sections.length) {
    renderMindmap(container, data);
    return;
  }

  const width = 1500;
  const flow = Array.isArray(data?.flow) ? data.flow : [];
  const flowGap = 18;
  const flowWidth = 220;
  const flowHeight = 96;
  const flowY = 56;
  const sectionWidth = 700;
  const sectionGap = 44;
  const sectionRowHeight = 230;
  const sectionStartY = flow.length ? 205 : 50;
  const sectionRows = Math.ceil(sections.length / 2);
  const height = Math.max(680, sectionStartY + sectionRows * sectionRowHeight + 36);

  let svg = `
    <div class="cs-mindmap-wrapper cs-structured-mindmap">
      <div class="cs-mindmap-controls">
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-in" title="Phóng to"><i class="fa-solid fa-plus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-zoom-out" title="Thu nhỏ"><i class="fa-solid fa-minus"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-reset" title="Về giữa"><i class="fa-solid fa-house"></i></button>
        <button type="button" class="cs-mm-btn" id="cs-mm-fullscreen" title="Mở toàn màn hình" aria-label="Mở sơ đồ toàn màn hình"><i class="fa-solid fa-expand"></i></button>
      </div>
      <div class="cs-mindmap-canvas-viewport" id="cs-mm-viewport">
        <svg viewBox="0 0 ${width} ${height}" class="cs-mindmap-svg" id="cs-mm-svg">
          <defs>
            <filter id="node-shadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.12"/>
            </filter>
            <marker id="mindmap-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto">
              <path d="M0,0 L0,7 L8,3.5 z" fill="#64748b"/>
            </marker>
          </defs>
          <g id="cs-mm-zoom-group">
            <text x="${width / 2}" y="28" text-anchor="middle" font-family="Inter, sans-serif" font-size="20" font-weight="900" fill="#1e293b">${escapeSvgText(data.title || 'Sơ đồ kiến thức')}</text>
            <text x="${width / 2}" y="46" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" fill="#64748b">FLOW PHẢN ỨNG · HIGH-YIELD FACTS · ỨNG DỤNG</text>
  `;

  if (flow.length) {
    const totalFlowWidth = flow.length * flowWidth + (flow.length - 1) * flowGap;
    const flowStartX = (width - totalFlowWidth) / 2;
    flow.forEach((node, index) => {
      const x = flowStartX + index * (flowWidth + flowGap);
      const isHighlight = node.highlight;
      svg += `
        ${index < flow.length - 1 ? `<line x1="${x + flowWidth}" y1="${flowY + 48}" x2="${x + flowWidth + flowGap - 5}" y2="${flowY + 48}" stroke="#64748b" stroke-width="2.5" marker-end="url(#mindmap-arrow)"/>` : ''}
        <g transform="translate(${x}, ${flowY})" filter="url(#node-shadow)">
          <rect width="${flowWidth}" height="${flowHeight}" rx="14" fill="${isHighlight ? '#fff7ed' : '#ffffff'}" stroke="${isHighlight ? '#ea580c' : '#94a3b8'}" stroke-width="${isHighlight ? 3 : 2}"/>
          <circle cx="24" cy="24" r="14" fill="${isHighlight ? '#ea580c' : '#4f46e5'}"/>
          <text x="24" y="29" text-anchor="middle" font-family="Inter, sans-serif" font-size="12" font-weight="900" fill="#ffffff">${escapeSvgText(node.step || String(index + 1))}</text>
          <text x="48" y="28" font-family="Inter, sans-serif" font-size="13" font-weight="900" fill="#1e293b">${escapeSvgText(truncateText(node.title, 22))}</text>
          <text x="16" y="55" font-family="Inter, sans-serif" font-size="10.5" fill="#475569">${escapeSvgText(truncateText(node.summary, 31))}</text>
          ${isHighlight ? `<text x="16" y="77" font-family="Inter, sans-serif" font-size="9.5" font-weight="900" fill="#c2410c">⚠ ${escapeSvgText(node.highlight)}</text>` : ''}
        </g>
      `;
    });
  }

  sections.forEach((section, sectionIndex) => {
    const col = sectionIndex % 2;
    const row = Math.floor(sectionIndex / 2);
    const x = col === 0 ? 34 : 34 + sectionWidth + sectionGap;
    const y = sectionStartY + row * sectionRowHeight;
    const items = Array.isArray(section.items) ? section.items.slice(0, 4) : [];
    const color = section.color || '#2563eb';
    const itemHeight = 48 + items.length * 37;

    svg += `
      <g transform="translate(${x}, ${y})" filter="url(#node-shadow)">
        <rect width="${sectionWidth}" height="${itemHeight}" rx="16" fill="#ffffff" stroke="${color}" stroke-width="2"/>
        <rect width="${sectionWidth}" height="42" rx="16" fill="${color}" opacity="0.12"/>
        <text x="16" y="26" font-family="Inter, sans-serif" font-size="14" font-weight="900" fill="${color}">${escapeSvgText(section.title)}</text>
        <text x="${sectionWidth - 16}" y="26" text-anchor="end" font-family="Inter, sans-serif" font-size="9.5" fill="${color}">CHEAT-SHEET</text>
    `;

    items.forEach((item, itemIndex) => {
      const normalized = typeof item === 'string' ? { title: item, details: [] } : item;
      const itemTop = 68 + itemIndex * 37;
      const highlighted = Boolean(normalized.highlight);
      svg += `
        <circle cx="20" cy="${itemTop - 4}" r="3.5" fill="${highlighted ? '#dc2626' : color}"/>
        <text x="32" y="${itemTop}" font-family="Inter, sans-serif" font-size="12.5" font-weight="900" fill="${highlighted ? '#b91c1c' : '#1e293b'}">${escapeSvgText(truncateText(normalized.title, 62))}</text>
        ${normalized.details?.[0] ? `<text x="32" y="${itemTop + 15}" font-family="Inter, sans-serif" font-size="10.5" fill="#64748b">${escapeSvgText(truncateText(normalized.details[0], 86))}</text>` : ''}
        ${normalized.highlight ? `<rect x="${sectionWidth - 180}" y="${itemTop - 15}" width="164" height="20" rx="10" fill="#fef2f2"/><text x="${sectionWidth - 98}" y="${itemTop - 2}" text-anchor="middle" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="#dc2626">${escapeSvgText(truncateText(normalized.highlight, 25))}</text>` : ''}
      `;
    });
    svg += `</g>`;
  });

  svg += `
          </g>
        </svg>
      </div>
    </div>
  `;

  container.innerHTML = svg;
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

export function initMindmapControls(container) {
  const group = container.querySelector('#cs-mm-zoom-group');
  if (!group) return;
  const wrapper = container.querySelector('.cs-mindmap-wrapper');
  const fullscreenButton = container.querySelector('#cs-mm-fullscreen');

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

  function setFullscreen(isFullscreen) {
    if (!wrapper) return;
    scale = isFullscreen ? 1.35 : 1;
    pointX = 0;
    pointY = 0;
    wrapper.classList.toggle('cs-mindmap-fullscreen', isFullscreen);
    document.body.classList.toggle('cs-mindmap-open', isFullscreen);
    updateTransform();
    if (fullscreenButton) {
      fullscreenButton.title = isFullscreen ? 'Thoát toàn màn hình' : 'Mở toàn màn hình';
      fullscreenButton.setAttribute('aria-label', fullscreenButton.title);
      fullscreenButton.innerHTML = `<i class="fa-solid fa-${isFullscreen ? 'compress' : 'expand'}"></i>`;
    }
  }

  fullscreenButton?.addEventListener('click', event => {
    event.stopPropagation();
    setFullscreen(!wrapper?.classList.contains('cs-mindmap-fullscreen'));
  });

  wrapper?.querySelector('.cs-mindmap-canvas-viewport')?.addEventListener('click', event => {
    if (event.target.closest('button, a')) return;
    if (!wrapper.classList.contains('cs-mindmap-fullscreen')) setFullscreen(true);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && wrapper?.classList.contains('cs-mindmap-fullscreen')) {
      setFullscreen(false);
    }
  });
}
