/**
 * adminDashboard.js — Renderer cho dashboard Tổng quan của trang Admin.
 * Chỉ đọc dữ liệu thật từ DB (users, premium, bank, history, feedbacks,
 * articles, announcements) và vẽ KPI extras / chart / timeline / bảng gần đây.
 * Không thay đổi business logic hiện có.
 */

import { DB } from './db.js';
import { fetchAllUsersFromFirestore } from './firestoreUsers.js';

const analyticsState = { range: 7 };

const ONLINE_MS = 30 * 60 * 1000;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtN(n) { return Number(n || 0).toLocaleString('vi-VN'); }

function statNumber(id) {
  const el = document.getElementById(id);
  return el ? parseInt(el.textContent.replace(/\D/g, ''), 10) || 0 : 0;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastNDays(n) {
  const now = startOfDay(new Date());
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push(d);
  }
  return days;
}

function countByDay(timestamps, days) {
  const map = new Map(days.map((d) => [d.getTime(), 0]));
  timestamps.forEach((raw) => {
    const ts = Date.parse(raw || '');
    if (!ts) return;
    const key = startOfDay(ts).getTime();
    if (map.has(key)) map.set(key, map.get(key) + 1);
  });
  return days.map((d) => map.get(d.getTime()));
}

/** Chuỗi hoạt động học tập: lượt thi thử; nếu chưa có thì dùng lượt đăng nhập. */
function learningSeries(days) {
  const examDates = DB.getHistory().map((h) => h.date).filter(Boolean);
  const series = countByDay(examDates, days);
  if (series.reduce((a, b) => a + b, 0) > 0) return series;
  return countByDay(DB.getAllRegisteredUsers().map((u) => u.lastLogin), days);
}

function deltaPercent(current, previous) {
  if (!current && !previous) return null;
  if (!previous) return { pct: 100, dir: 'up' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { pct: 0, dir: 'flat' };
  return { pct: Math.abs(pct), dir: pct > 0 ? 'up' : 'down' };
}

function paintDelta(el, delta, suffix = 'so với kỳ trước') {
  if (!el) return;
  if (!delta) { el.textContent = ''; el.className = 'adm-kpi-delta'; return; }
  const arrow = delta.dir === 'up' ? '↑' : delta.dir === 'down' ? '↓' : '→';
  el.textContent = `${arrow} ${delta.pct}% ${suffix}`;
  el.className = `adm-kpi-delta ${delta.dir}`;
}

function relTime(iso) {
  const ts = Date.parse(iso || '');
  if (!ts) return 'Chưa ghi nhận';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Vừa xong';
  if (min < 60) return `${min} phút trước`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(ts).toLocaleDateString('vi-VN');
}

function isOnline(iso) {
  const ts = Date.parse(iso || '');
  return Boolean(ts) && Date.now() - ts < ONLINE_MS;
}

/* ─── Sparkline & area chart (SVG thuần, không thư viện) ─── */

function sparkPath(data, width, height, pad = 3) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const step = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  return data.map((v, i) => {
    const x = pad + i * step;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
}

function renderSparkline(svgId, data, colorVar) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const W = 120, H = 36;
  const pts = sparkPath(data, W, H);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]} ${H} L${pts[0][0]} ${H} Z`;
  const [ex, ey] = pts[pts.length - 1];
  svg.innerHTML =
    `<path d="${area}" fill="color-mix(in srgb, var(${colorVar}) 14%, transparent)"></path>` +
    `<path d="${line}" fill="none" stroke="var(${colorVar})" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>` +
    `<circle cx="${ex}" cy="${ey}" r="2.6" fill="var(${colorVar})"></circle>`;
}

function renderAreaChart(svg, series, days) {
  const W = 640, H = 240, padL = 34, padR = 14, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const rawMax = Math.max(...series, 0);
  const max = rawMax === 0 ? 4 : Math.ceil(rawMax * 1.15);
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((r) => {
    const y = padT + innerH - r * innerH;
    const label = Math.round(max * r);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--adm-border)" stroke-width="1" stroke-dasharray="${r === 0 ? '' : '3 5'}"></line>` +
      `<text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="var(--adm-muted)">${label}</text>`;
  }).join('');

  const tickEvery = series.length > 10 ? 5 : 1;
  const xLabels = days.map((d, i) => {
    if (i % tickEvery !== 0 && i !== days.length - 1) return '';
    const x = padL + i * stepX;
    const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--adm-muted)">${label}</text>`;
  }).join('');

  const pts = series.map((v, i) => [padL + i * stepX, padT + innerH - (v / max) * innerH]);
  let line = '';
  pts.forEach(([x, y], i) => {
    if (!i) { line = `M${x} ${y}`; return; }
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    line += ` C${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  });
  const area = `${line} L${pts[pts.length - 1][0]} ${padT + innerH} L${pts[0][0]} ${padT + innerH} Z`;
  const [ex, ey] = pts[pts.length - 1];

  svg.innerHTML =
    `<defs><linearGradient id="admChartGrad" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" style="stop-color:var(--adm-green);stop-opacity:0.28"></stop>` +
    `<stop offset="100%" style="stop-color:var(--adm-green);stop-opacity:0.02"></stop>` +
    `</linearGradient></defs>` +
    gridLines + xLabels +
    `<path d="${area}" fill="url(#admChartGrad)"></path>` +
    `<path class="adm-chart-line" d="${line}" fill="none" stroke="var(--adm-green)" stroke-width="2.4" stroke-linecap="round"></path>` +
    `<circle cx="${ex}" cy="${ey}" r="4" fill="var(--adm-green)" stroke="var(--adm-card)" stroke-width="2"></circle>`;
}

/* ─── KPI extras: delta + sparkline ─── */

function renderKpiExtras() {
  const users = DB.getAllRegisteredUsers();
  const premiumEmails = DB.getPremiumEmails();
  const bank = DB.getBank();
  const subjectsCount = statNumber('stat-total-subjects');
  const customSubjects = DB.getCustomSubjects().length;

  const week = lastNDays(7);
  const prevWeek = lastNDays(14).slice(0, 7);
  const activeNow = countByDay(users.map((u) => u.lastLogin), week).reduce((a, b) => a + b, 0);
  const activePrev = countByDay(users.map((u) => u.lastLogin), prevWeek).reduce((a, b) => a + b, 0);
  paintDelta(document.getElementById('adm-kpi-delta-users'), deltaPercent(activeNow, activePrev), 'so với tuần trước');

  const subPremium = document.getElementById('adm-kpi-sub-premium');
  if (subPremium) {
    subPremium.textContent = users.length
      ? `${Math.round((premiumEmails.length / users.length) * 100)}% tổng học viên`
      : 'Mở khóa toàn bộ AI Models';
  }

  const subQuestions = document.getElementById('adm-kpi-sub-questions');
  if (subQuestions && subjectsCount) {
    subQuestions.textContent = `≈ ${fmtN(Math.round(bank.length / subjectsCount))} câu/môn · ${subjectsCount} môn`;
  }
  const subSubjects = document.getElementById('adm-kpi-sub-subjects');
  if (subSubjects) subSubjects.textContent = `${customSubjects} môn tùy chỉnh · cách ly 100%`;

  const twoWeeks = lastNDays(14);
  const registrations = countByDay(users.map((u) => u.firstSeen || u.lastLogin), twoWeeks);
  const cumulative = registrations.reduce((acc, v) => { acc.push((acc.at(-1) || 0) + v); return acc; }, []);
  renderSparkline('adm-spark-users', cumulative.length ? cumulative : [0, 0], '--adm-green');

  const premiumEvents = DB.getAnnouncements()
    .filter((a) => (a.category || '').includes('Quyền') || /premium/i.test(a.title || ''))
    .map((a) => a.createdAt || a.date);
  const premiumDays = countByDay(premiumEvents, twoWeeks);
  const premiumCum = premiumDays.reduce((acc, v) => { acc.push((acc.at(-1) || 0) + v); return acc; }, []);
  renderSparkline('adm-spark-premium', premiumCum.some(Boolean) ? premiumCum : new Array(14).fill(premiumEmails.length), '--adm-purple');

  renderSparkline('adm-spark-questions', new Array(14).fill(bank.length), '--adm-blue');
  renderSparkline('adm-spark-subjects', new Array(14).fill(subjectsCount), '--adm-pink');

  const chip = document.getElementById('adm-chip-questions');
  if (chip) chip.textContent = fmtN(bank.length);
}

/* ─── Analytics: chart + side stats ─── */

function renderAnalytics() {
  const range = analyticsState.range;
  const days = lastNDays(range);
  const prevDays = lastNDays(range * 2).slice(0, range);
  const series = learningSeries(days);
  const prevSeries = learningSeries(prevDays);

  const svg = document.getElementById('adm-chart');
  const empty = document.getElementById('adm-chart-empty');
  if (svg) renderAreaChart(svg, series, days);
  if (empty) empty.classList.toggle('hidden', series.some((v) => v > 0));

  const total = series.reduce((a, b) => a + b, 0);
  const prevTotal = prevSeries.reduce((a, b) => a + b, 0);
  const sessionsEl = document.getElementById('adm-stat-sessions');
  if (sessionsEl) sessionsEl.textContent = fmtN(total);
  paintDelta(document.getElementById('adm-stat-sessions-delta'), deltaPercent(total, prevTotal), 'so với kỳ trước');

  const windowHistory = DB.getHistory().filter((h) => {
    const ts = Date.parse(h.date || '');
    return ts && ts >= days[0].getTime();
  });
  const timeEl = document.getElementById('adm-stat-time');
  const timeDeltaEl = document.getElementById('adm-stat-time-delta');
  const withTime = windowHistory.filter((h) => Number(h.timeSpent) > 0);
  if (timeEl) {
    timeEl.textContent = withTime.length
      ? `${Math.round(withTime.reduce((sum, h) => sum + Number(h.timeSpent), 0) / withTime.length / 60)} phút`
      : '—';
  }
  if (timeDeltaEl) timeDeltaEl.textContent = '';

  const rateEl = document.getElementById('adm-stat-rate');
  const rateDeltaEl = document.getElementById('adm-stat-rate-delta');
  if (rateEl) {
    rateEl.textContent = windowHistory.length
      ? `${Math.round((windowHistory.filter((h) => h.isPassed).length / windowHistory.length) * 100)}%`
      : '—';
  }
  if (rateDeltaEl) rateDeltaEl.textContent = '';
}

function switchAdminAnalyticsRange(range) {
  analyticsState.range = Number(range) === 30 ? 30 : 7;
  document.querySelectorAll('.adm-range-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.range) === analyticsState.range);
  });
  renderAnalytics();
}

/* ─── Activity timeline ─── */

function renderActivityFeed() {
  const list = document.getElementById('adm-activity-list');
  if (!list) return;

  const events = [];
  DB.getAllRegisteredUsers().forEach((u) => {
    const name = esc(u.name || 'Học viên');
    if (u.firstSeen) events.push({ t: u.firstSeen, tone: 'green', icon: 'fa-user-plus', badge: 'Mới', text: `Học viên <strong>${name}</strong> đăng ký tài khoản mới` });
    if (u.lastLogin) events.push({ t: u.lastLogin, tone: 'blue', icon: 'fa-right-to-bracket', badge: 'Truy cập', text: `<strong>${name}</strong> đăng nhập hệ thống` });
  });
  DB.getAnnouncements().forEach((a) => {
    const isPremium = (a.category || '').includes('Quyền') || /premium/i.test(a.title || '');
    events.push({
      t: a.createdAt || a.date,
      tone: isPremium ? 'purple' : 'cyan',
      icon: isPremium ? 'fa-crown' : 'fa-bullhorn',
      badge: isPremium ? 'Premium' : 'Thông báo',
      text: esc(a.title || 'Thông báo hệ thống'),
    });
  });
  DB.getHistory().forEach((h) => {
    const subject = h.meta?.subjectName || h.meta?.subject || '';
    events.push({
      t: h.date,
      tone: 'green',
      icon: 'fa-flag-checkered',
      badge: 'Hoàn thành',
      text: `Hoàn thành bài thi${subject ? ` môn <strong>${esc(subject)}</strong>` : ''} · ${esc(h.pct ?? 0)}%`,
    });
  });
  DB.getFeedbacks().forEach((f) => {
    events.push({
      t: f.createdAt,
      tone: 'orange',
      icon: 'fa-inbox',
      badge: 'Phản hồi',
      text: `Phản hồi mới từ <strong>${esc(f.userName || 'học viên')}</strong>: ${esc(f.title || '')}`,
    });
  });
  DB.getArticles().forEach((a) => {
    events.push({
      t: a.updatedAt || a.date,
      tone: 'pink',
      icon: 'fa-newspaper',
      badge: 'CMS',
      text: `Bài viết “${esc(a.title || '')}” được cập nhật`,
    });
  });

  const rows = events
    .filter((e) => Date.parse(e.t || ''))
    .sort((a, b) => Date.parse(b.t) - Date.parse(a.t))
    .slice(0, 6);

  if (!rows.length) {
    list.innerHTML = '<li class="adm-activity-empty">Chưa có hoạt động nào được ghi nhận.</li>';
    return;
  }

  list.innerHTML = rows.map((e) => {
    const d = new Date(e.t);
    const sameDay = startOfDay(d).getTime() === startOfDay(Date.now()).getTime();
    const time = sameDay
      ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    return `<li class="adm-activity-item adm-tone-${e.tone}">
      <span class="adm-activity-time">${time}</span>
      <span class="adm-activity-icon"><i class="fa-solid ${e.icon}"></i></span>
      <span class="adm-activity-text">${e.text}</span>
      <span class="adm-activity-badge">${e.badge}</span>
    </li>`;
  }).join('');
}

/* ─── Quick admin badges ─── */

function setBadge(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = Number(value) || 0;
  el.textContent = fmtN(n);
  el.hidden = n === 0;
}

function renderQuickBadges() {
  setBadge('adm-badge-users', DB.getAllRegisteredUsers().length);
  setBadge('adm-badge-questions', DB.getBank().length);
  setBadge('adm-badge-subjects', statNumber('stat-total-subjects'));
  setBadge('adm-badge-cms', DB.getArticles().length);
  const modelSelect = document.getElementById('admin-bank-model');
  setBadge('adm-badge-ai', modelSelect ? modelSelect.options.length : 0);
}

/* ─── Bảng học viên gần đây ─── */

function roleBadgeHtml(email, premiumEmails) {
  const superAdmins = ['nguyenphuongtinh557@gmail.com', 'macnghich@gmail.com'];
  if (superAdmins.includes(email)) return '<span class="badge badge-admin"><i class="fa-solid fa-shield-halved"></i> SUPER ADMIN</span>';
  if (premiumEmails.includes(email)) return '<span class="badge badge-premium"><i class="fa-solid fa-crown"></i> PREMIUM</span>';
  return '<span class="badge badge-newbie">NEWBIE</span>';
}

function actionHtml(user, email, isSuperAdmin, isPremium) {
  if (isSuperAdmin) return '<span class="text-xs text-muted font-bold">Quản trị viên Tối cao</span>';
  if (isPremium) {
    return `<button class="btn btn-secondary btn-xs" onclick="revokeAdminUserPremium('${esc(email)}')"><i class="fa-solid fa-user-minus"></i> Hạ quyền</button>`;
  }
  return `<button class="btn btn-success btn-xs font-bold" onclick="grantAdminUserPremium('${esc(email)}')"><i class="fa-solid fa-crown"></i> Cấp PREMIUM</button>`;
}

function renderRecentUsers() {
  const tbody = document.getElementById('adm-recent-users-body');
  if (!tbody) return;

  const keyword = (document.getElementById('adm-recent-user-search')?.value || '').trim().toLowerCase();
  const status = document.getElementById('adm-recent-user-status')?.value || 'all';

  const premiumEmails = DB.getPremiumEmails().map((e) => String(e || '').trim().toLowerCase());
  const superAdmins = ['nguyenphuongtinh557@gmail.com', 'macnghich@gmail.com'];

  let users = DB.getAllRegisteredUsers()
    .slice()
    .sort((a, b) => (Date.parse(b.lastLogin || '') || 0) - (Date.parse(a.lastLogin || '') || 0));

  if (keyword) {
    users = users.filter((u) => (u.name || '').toLowerCase().includes(keyword) || (u.email || '').toLowerCase().includes(keyword));
  }
  if (status !== 'all') {
    users = users.filter((u) => (status === 'online' ? isOnline(u.lastLogin) : !isOnline(u.lastLogin)));
  }

  const rows = users.slice(0, 6);
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:22px 0;" class="text-muted">Không có học viên nào phù hợp.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map((u, idx) => {
    const email = String(u.email || '').trim().toLowerCase();
    const isSuperAdmin = superAdmins.includes(email);
    const isPremium = premiumEmails.includes(email);
    const online = isOnline(u.lastLogin);
    const fullDate = u.lastLogin ? new Date(u.lastLogin).toLocaleString('vi-VN') : 'Chưa ghi nhận';
    return `<tr>
      <td class="font-bold">${idx + 1}</td>
      <td>
        <div class="adm-user-cell">
          <img class="adm-avatar" src="${esc(u.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(u.name || 'User'))}" referrerpolicy="no-referrer" alt="">
          <span class="adm-user-name">${esc(u.name || 'Học viên')}</span>
        </div>
      </td>
      <td class="font-mono text-xs">${esc(u.email || '')}</td>
      <td>${roleBadgeHtml(email, premiumEmails)}</td>
      <td class="text-xs text-muted" title="${esc(fullDate)}">${relTime(u.lastLogin)}</td>
      <td><span class="adm-status ${online ? 'online' : 'offline'}"><i></i>${online ? 'Online' : 'Offline'}</span></td>
      <td style="text-align:right;">${actionHtml(u, email, isSuperAdmin, isPremium)}</td>
    </tr>`;
  }).join('');
}

function filterAdminRecentUsers() { renderRecentUsers(); }

/* ─── Entry point: gọi bởi renderAdminDashboard() của app.js ─── */

function renderAdminDashboardExtras() {
  renderKpiExtras();
  renderAnalytics();
  renderActivityFeed();
  renderQuickBadges();
  renderRecentUsers();

  // Async: Đọc danh sách học viên từ Firestore Cloud và làm mới UI
  fetchAllUsersFromFirestore().then((cloudUsers) => {
    if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
      DB.mergeUserRolesFromServer({ users: cloudUsers });
      renderKpiExtras();
      renderQuickBadges();
      renderRecentUsers();
      renderActivityFeed();
    }
  }).catch((err) => {
    console.warn('[AdminDashboard] Không thể tải danh sách học viên từ Firestore:', err);
  });
}

Object.assign(window, {
  renderAdminDashboardExtras,
  switchAdminAnalyticsRange,
  filterAdminRecentUsers,
});
