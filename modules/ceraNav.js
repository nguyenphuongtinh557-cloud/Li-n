/**
 * ceraNav.js — Điều hướng bằng câu lệnh cho FTECA.
 *
 * Không gọi AI: nhận diện câu lệnh ngắn ("thi thử môn X", "xem bài báo Y",
 * "mở ngân hàng câu hỏi"…) rồi mở đúng trang. Câu không đủ rõ trả về null
 * để cuộc trò chuyện tiếp tục như bình thường.
 */

import { DB } from './db.js';
import { getAllSubjects } from './subjects.js?v=20261110-ft4498';
import { mentionedSubjects, recallCeraSubject, rememberCeraSubject, refersToPreviousSubject, getCeraUserProfile } from './ceraContext.js?v=20261113-allkb3';

const CUES = /(mở|xem|đưa (tôi|mình|em)|dẫn (tôi|mình|em)|đi đến|đi tới|đến trang|chuyển (sang|đến|qua)|vào trang|tới trang|tôi muốn|mình muốn|em muốn|cho (tôi|mình|em) (xem|đến|xin|hỏi)|xem trang|quay (lại|về)|thi thử|thi môn|làm bài thi|vào thi|đi thi|thông tin liên hệ|liên hệ (tác giả|admin|anh Phúc)|liên lạc|nâng cấp tài khoản|gói (vip|cao cấp|premium)|(?:tải|lấy|xin|download)\s+(?:tài liệu|file|drive|tài nguyên)|link drive|tải xuống)/i;

const FILLER = new Set([
  'bai', 'bao', 'viet', 'tin', 'tuc', 'xem', 'mo', 'tai', 'lieu', 'bai', 'giang', 'hoc',
  'mon', 'cho', 'toi', 'minh', 'em', 'nay', 'do', 've', 'co', 'ten', 'la', 'giup', 'voi',
  'cua', 'va', 'nhung', 'cac', 'mot', 'di', 'nhe', 'nha', 'muon', 'den', 'trang', 'toi'
]);

function plain(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function norm(value) {
  return plain(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi-VN')
    .replace(/đ/g, 'd');
}

function tokensOf(value) {
  return norm(value).match(/[a-z0-9]{2,}/g) || [];
}

function subjectLabel(subject) {
  return `${subject.code || subject.id} · ${plain(subject.name)}`;
}

function hintAfter(query, marker) {
  const match = String(query || '').match(new RegExp(`${marker}\\s+([^,.!?;]+)`, 'i'));
  return match ? match[1].replace(/\b(không|nhe|nhé|giúp|đi|với|ạ|à|nhá)\b/gi, '').trim().slice(0, 60) : '';
}

// Tìm mục (bài viết / bài giảng / tài liệu) khớp tiêu đề trong câu lệnh
function bestTitleMatch(itemText, query) {
  const queryTokens = [...new Set(tokensOf(query))].filter(token => !FILLER.has(token));
  const itemTokens = new Set(tokensOf(itemText));
  const hits = queryTokens.filter(token => itemTokens.has(token));
  const strong = hits.filter(token => token.length >= 4);
  if (hits.length < 2 || strong.length === 0) return 0;
  const phrase = norm(query).replace(/\s+/g, ' ');
  return hits.length + (norm(itemText).includes(phrase) ? 3 : 0);
}

function findArticle(query, subjects) {
  const list = window.ArticlesModule?.getArticlesData?.() || DB.getArticles() || [];
  let best = null;
  list.forEach(article => {
    const subjectBoost = subjects.some(subject => article.subjectId === subject.id) ? 1 : 0;
    const score = bestTitleMatch(article.title || '', query) + subjectBoost;
    if (score > 0 && (!best || score > best.score)) best = { title: plain(article.title), id: article.id, score };
  });
  return best;
}

function findReaderTarget(query, subjects) {
  let best = null;
  getAllSubjects().forEach(subject => {
    const subjectBoost = subjects.some(item => item.id === subject.id) ? 1 : 0;
    const details = DB.getSubjectDetails(subject.id) || {};
    const collected = [
      ...(Array.isArray(details.resources) ? details.resources : []),
      ...(DB.getResources() || []).filter(item => item.subjectId === subject.id || item.subjectCode === subject.code)
    ];
    const seen = new Set();
    collected.forEach(resource => {
      if (!resource?.id || seen.has(`r:${resource.id}`)) return;
      seen.add(`r:${resource.id}`);
      const score = bestTitleMatch(resource.name || '', query) + subjectBoost;
      if (score > 0 && (!best || score > best.score)) {
        best = { score, kind: 'resource', name: plain(resource.name), context: { subjectId: subject.id, resourceId: resource.id, returnPage: 'subject-detail' } };
      }
    });
    (details.chapters || []).forEach(chapter => {
      (chapter.lessons || []).forEach(lesson => {
        if (!lesson?.id || lesson.status === 'draft') return;
        const score = bestTitleMatch(lesson.title || '', query) + subjectBoost;
        if (score > 0 && (!best || score > best.score)) {
          best = { score, kind: 'lesson', name: plain(lesson.title), context: { subjectId: subject.id, chapterId: chapter.id, lessonId: lesson.id, returnPage: 'subject-detail' } };
        }
      });
    });
  });
  return best;
}

function pick(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function isExternalResourceUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDriveResourceUrl(value) {
  return /^https?:\/\/(?:drive|docs)\.google\.com\//i.test(String(value || '').trim());
}

// Tài liệu admin đăng có link ngoài (Drive/PDF...) để người học mở tải.
function downloadResourcesFor(subject) {
  const code = String(subject?.code || '').toLowerCase();
  return DB.getResources()
    .filter(resource => {
      if (!resource || resource.readerConfig?.visibility === 'draft') return false;
      const sameSubject = resource.subjectId === subject.id
        || (code && String(resource.subjectCode || '').toLowerCase() === code);
      return sameSubject && isExternalResourceUrl(resource.url);
    })
    .sort((a, b) => (isDriveResourceUrl(b.url) ? 1 : 0) - (isDriveResourceUrl(a.url) ? 1 : 0)
      || (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
}

function pickDownloadResource(links, query) {
  let best = null;
  links.forEach(resource => {
    const score = bestTitleMatch(resource.name || '', query);
    if (score > 0 && (!best || score > best.score)) best = { resource, score };
  });
  return best?.resource || links[0];
}

// Nhắc tên môn trong chat (kể cả câu hỏi thường) cũng đủ để lệnh ngắn
// tiếp theo như "thi thử" hiểu đúng môn, không bám môn đang chọn cũ.
export function rememberSubjectMentions(query) {
  const [first] = mentionedSubjects(String(query || ''));
  return first ? rememberCeraSubject(first.id) : false;
}

export function planCeraNavigation(query) {
  const raw = String(query || '').trim();
  if (!raw || raw.length > 220) return null;
  if (!CUES.test(raw)) return null;
  // Câu dài chỉ được hiểu là lệnh khi có động từ điều hướng rõ ràng,
  // tránh cướp mất câu hỏi kiểu "tôi xem bài giảng rồi nhưng vẫn chưa hiểu…".
  const strongCue = /(mở|tôi muốn|mình muốn|em muốn|thi thử|thi môn|làm bài thi|vào thi|đi thi|đi đến|đi tới|chuyển (sang|đến|qua)|đưa (tôi|mình|em)|dẫn (tôi|mình|em)|vào trang|tới trang|quay (lại|về)|tải (tài liệu|file|drive)|link drive)/i;
  if (raw.length > 80 && !strongCue.test(raw)) return null;

  const q = norm(raw).replace(/\s+/g, ' ');
  // Câu hỏi học thuật có nhắc "bài giảng/tài liệu" không phải lệnh mở trang.
  if (/(chua hieu|khong hieu|giai thich|tai sao|vi sao|nhu the nao|la gi|co phai|nghia la|khac (gi|nhau)|so sanh|lam sao|cach (tai|mo|gui|dang|su dung))/.test(q)
    && !/(^|\s)(mo|di den|di toi|chuyen|vao trang|toi trang)\b/.test(q)) return null;
  const explicitSubjects = mentionedSubjects(raw);
  const refersBack = !explicitSubjects.length && refersToPreviousSubject(raw);
  const remembered = explicitSubjects.length ? null : recallCeraSubject();
  // "môn đó" / "môn này" và lệnh ngắn ("thi thử", "tải tài liệu") lấy đúng môn
  // CERA vừa mở hoặc vừa được nhắc, không đoán theo môn đang chọn cũ.
  const subjects = explicitSubjects.length ? explicitSubjects : (remembered ? [remembered] : []);
  const subject = subjects[0];

  if (/(thi thu|thi mon|lam bai thi|vao thi|di thi|lam de)/.test(q)) {
    if (subject) {
      const label = subjectLabel(subject);
      return {
        kind: 'exam',
        subjectId: subject.id,
        reply: pick([
          `Oke nhích thôi! Phòng thi thử **${label}** mở sẵn rồi, chọn số câu rồi bấm **Bắt đầu thi** nhé.`,
          `Chốt kèo luôn! **${label}** đang mở, bấm **Bắt đầu thi** là vào chiến được ngay.`,
          `Đi thôi nào! Phòng thi **${label}** mở rồi đó, chỉnh số câu xong là bấm **Bắt đầu thi**.`,
          `Lên thuyền **${label}**! Chọn số câu rồi bấm **Bắt đầu thi** là vào làm được ngay.`,
          `Đã mở **${label}** cho cậu. Hít thở sâu rồi bấm **Bắt đầu thi** nào, đừng căng nhé!`
        ])
      };
    }
    if (refersBack) {
      return {
        kind: 'reply',
        reply: pick([
          'Tớ chưa nhớ cậu đang nói tới môn nào. Cậu nói rõ tên môn giúp tớ nhé (ví dụ: “thi thử môn Công nghệ sau thu hoạch thực vật”).',
          'Câu này nhắc “môn đó” nhưng tớ chưa có môn nào để nhớ. Cậu ghi tên môn cụ thể giúp tớ nhé!'
        ])
      };
    }
    const hint = hintAfter(raw, 'môn');
    if (hint && tokensOf(hint).length) {
      return {
        kind: 'reply',
        reply: pick([
          `Ui, tớ lật cả danh sách mà chưa thấy môn “${hint}”. Cậu mở **Không gian học tập** chọn lại giúp tớ nhé!`,
          `Hmm, “${hint}” chưa có trong danh sách môn. Vào **Không gian học tập** chọn đúng môn là tớ mở liền!`
        ])
      };
    }
    return {
      kind: 'exam',
      subjectId: null,
      reply: pick([
        'Oke nhích thôi! Phòng thi thử của môn đang chọn mở rồi, cậu chỉnh số câu rồi bấm **Bắt đầu thi** nhé.',
        'Mở phòng thi thử rồi đó, vào thử sức xem hôm nay tay nghề tới đâu!',
        'Phòng thi sẵn sàng, chọn số câu xong là chiến thôi!'
      ])
    };
  }

  const adminCue = /(trang admin|trang quan tri|admin dashboard|khu quan tri|bang dieu khien|quan ly (mon hoc|cau hinh mon|nguoi dung|hoc vien|tai nguyen|hoc lieu|bai viet|bai dang|thong bao|phan hoi|ngan hang cau hoi)|(mo|vao|den|toi|cho (toi|minh|em)|dua (toi|minh|em))\s+(?:trang\s+)?(admin|quan tri)\b)/;
  if (adminCue.test(q)) {
    const profile = getCeraUserProfile();
    if (!profile.isAdmin) {
      return {
        kind: 'reply',
        reply: pick([
          `Tài khoản **${profile.name}** hiện là tài khoản thường nên không mở được **trang Quản trị**. Nếu cậu có Gmail admin, đăng nhập lại bằng tài khoản đó rồi nhắn “mở trang admin” giúp tớ nhé!`,
          'Cậu đang dùng tài khoản không có quyền quản trị nên tớ không mở **trang Quản trị** được. Đăng nhập Gmail admin rồi gọi tớ lại nha!'
        ])
      };
    }
    let tab = null;
    let label = '';
    if (/(nguoi dung|hoc vien|cap quyen)/.test(q)) { tab = 'users'; label = 'Quản lý người dùng'; }
    else if (/(mon hoc|cau hinh mon)/.test(q)) { tab = 'subject-config'; label = 'Cấu hình môn học'; }
    else if (/(tai nguyen|hoc lieu)/.test(q)) { tab = 'resources'; label = 'Tài nguyên học tập'; }
    else if (/(bai viet|bai dang|cms)/.test(q)) { tab = 'cms'; label = 'Bài viết'; }
    else if (/(thong bao)/.test(q)) { tab = 'announcement'; label = 'Thông báo'; }
    else if (/(phan hoi|feedback|gop y)/.test(q)) { tab = 'feedback'; label = 'Phản hồi'; }
    else if (/(ngan hang cau hoi|ngan hang)/.test(q)) { tab = 'bank'; label = 'Ngân hàng câu hỏi'; }
    return {
      kind: 'admin',
      tab,
      reply: tab
        ? `Mở mục **${label}** trong **trang Quản trị** cho ${profile.name} rồi nhé!`
        : pick([
            `Trang **Quản trị** mở rồi — tài khoản ${profile.name} có quyền ADMIN nên vào thẳng được luôn!`,
            `Mở **trang Quản trị** cho ${profile.name} đây. Cần xem mục nào cứ gọi tớ!`
          ])
    };
  }

  if (/(tom tat (giao trinh|de cuong|tai lieu)|trang tom tat)/.test(q)) {
    return {
      kind: 'page',
      page: 'curriculum-summary',
      reply: pick([
        'Trang **Tóm tắt giáo trình** mở rồi, thả file PDF/DOCX vào là tớ tóm gọn cho!',
        'Mở **Tóm tắt giáo trình** đây. Cậu tải file lên, tớ biến nó thành bản ngắn gọn liền.',
        '**Tóm tắt giáo trình** sẵn sàng! Tải file lên rồi để tớ lo phần chữ nghĩa nhé.'
      ])
    };
  }

  if (/(ngan hang cau hoi|ngan hang|luyen tap|trac nghiem)/.test(q)) {
    const target = subject ? ` của ${subjectLabel(subject)}` : '';
    return {
      kind: 'page',
      page: 'ontap',
      tab: 'bank-tab',
      subjectId: subject?.id || null,
      reply: pick([
        `Ngân hàng câu hỏi${target} mở rồi, vào cày thôi!`,
        `Đây rồi — **Ngân hàng câu hỏi**${target}. Luyện vài câu cho nóng tay nào!`,
        `**Ngân hàng câu hỏi**${target} mở sẵn, cậu lọc theo chương rồi chiến nhé!`
      ])
    };
  }

  if (/(tao cau hoi|sinh cau hoi|them nguon|nguon tai lieu|sinh de)/.test(q)) {
    return {
      kind: 'page',
      page: 'ontap',
      tab: 'source-tab',
      reply: pick([
        'Trang **Thêm nguồn & sinh câu hỏi AI** mở rồi, thả tài liệu vào là tớ sinh đề cho!',
        'Mở công cụ sinh câu hỏi rồi đó, tải nguồn lên rồi để tớ làm phần nặng nhé!'
      ])
    };
  }

  if (/(lich su|ket qua thi|luot thi|bai da lam)/.test(q)) {
    return {
      kind: 'page',
      page: 'ontap',
      tab: 'history-tab',
      reply: pick([
        '**Lịch sử thi** mở rồi, xem lại cho biết mình tiến bộ cỡ nào nhé!',
        'Đây là **Lịch sử thi** của cậu. Nhìn lại điểm cũ để lên kế hoạch ôn tiếp nào!'
      ])
    };
  }

  if (/(de chia se|de da chia se|quiz chia se|de da gui)/.test(q)) {
    return { kind: 'page', page: 'ontap', tab: 'share-tab', reply: '**Đề đã chia sẻ** mở rồi, xem có ai làm đề của cậu chưa nhé!' };
  }

  if (/(bai bao|bai viet|tin tuc|blog)/.test(q)) {
    const article = findArticle(raw, subjects);
    if (article) {
      return {
        kind: 'article',
        articleId: article.id,
        reply: pick([
          `Đang mở bài viết **${article.title}** — đọc xong kể tớ nghe cảm nghĩ nha!`,
          `Bài **${article.title}** mở rồi đó. Đọc vui nhé, có gì hot nhớ rủ tớ bàn!`,
          `Lên bài **${article.title}** rồi nha, đọc thử xem có gì mới không!`
        ])
      };
    }
    return { kind: 'page', page: 'about', reply: 'Trang **Bài viết** mở rồi. Tớ chưa khớp đúng tiêu đề cậu nói, cậu lướt danh sách xem giúp tớ nhé!' };
  }

  if (/(?:tai|download|xuong|lay|xin|muon|can)\s+(?:tai\s+lieu|file|tai\s+nguyen|link|drive)|\blink\s+drive\b/.test(q)) {
    if (!subject) {
      return {
        kind: 'reply',
        reply: pick([
          'Cậu muốn tải tài liệu môn nào? Ghi rõ mã hoặc tên môn giúp tớ nhé (ví dụ: “tải tài liệu môn FT4488”).',
          'Tớ cần biết môn cụ thể mới lấy đúng link được. Cậu nhắn kiểu “tải tài liệu môn <tên môn>” giúp tớ nha!'
        ])
      };
    }
    const links = downloadResourcesFor(subject);
    if (!links.length) {
      return {
        kind: 'reply',
        reply: pick([
          `Môn **${subjectLabel(subject)}** chưa có link Drive/tài liệu đính kèm nào do admin đăng. Cậu xem bài giảng trong app trước nhé!`,
          `Tớ lục kho rồi, môn **${subjectLabel(subject)}** hiện chưa có file/link Drive để tải. Admin đăng thêm là tớ mở liền!`
        ])
      };
    }
    const chosen = pickDownloadResource(links, raw);
    const resourceName = plain(chosen.name);
    const isPlaceholderName = resourceName.length < 3 || /^(tai lieu|file|link)( mon)?$/.test(norm(resourceName));
    const label = isPlaceholderName ? `tài liệu môn **${subjectLabel(subject)}**` : `**${resourceName}**`;
    const more = links.length > 1 ? ` Môn này có tất cả ${links.length} tài liệu kèm link; cần file khác thì cậu nhắn đúng tên giúp tớ nhé.` : '';
    return {
      kind: 'download',
      subjectId: subject.id,
      resourceId: chosen.id,
      url: chosen.url,
      reply: pick([
        `Tớ mở link tải ${label} cho cậu rồi nhé. Cậu kiểm tra tab mới giúp tớ!${more}`,
        `Link tải ${label} đã mở. Cậu xem có đúng tài liệu cần tải không nhé!${more}`
      ])
    };
  }

  if (/(bai giang|bai hoc|tai lieu|tai nguyen|doc bai|mo bai|vo (phan|bai|mon)|vao (phan|bai|mon)|hoc (mon|bai|phan))/.test(q)) {
    const target = findReaderTarget(raw, subjects);
    if (target) {
      const kind = target.kind === 'resource' ? 'tài liệu' : 'bài giảng';
      return {
        kind: 'reader',
        context: target.context,
        reply: pick([
          `Đang mở ${kind} **${target.name}** cho cậu, đọc vui nhé!`,
          `Mở ${kind} **${target.name}** rồi đó, vào học thôi!`,
          `${kind === 'tài liệu' ? 'Tài liệu' : 'Bài giảng'} **${target.name}** đây, cậu đọc trước rồi hỏi tớ phần nào chưa hiểu nhé!`
        ])
      };
    }
    if (subject) {
      // Chỉ nhắc môn thay thế khi người học nói ngắn ("bài giảng vi sinh"),
      // tránh gợi ý thừa khi họ đã nói rõ ("vi sinh đại cương").
      const alt = tokensOf(raw).length <= 6 ? subjects.find(item => item.id !== subject.id) : null;
      const altHint = alt ? ` Nếu ý cậu là **${plain(alt.name).split(' - ')[0]}** thì nhắn tớ nha!` : '';
      return {
        kind: 'subject',
        subjectId: subject.id,
        reply: pick([
          `Mở môn **${subjectLabel(subject)}** rồi, cậu chọn bài giảng hay tài liệu muốn đọc nhé!${altHint}`,
          `**${subjectLabel(subject)}** đây. Bài nào muốn học cứ bấm vào, tớ mở trình đọc cho!${altHint}`
        ])
      };
    }
    return { kind: 'page', page: 'study-space', reply: 'Tớ chưa thấy mục nào khớp đúng tên nên mở **Không gian học tập** trước nhé. Cậu chọn môn và bài cần đọc giúp tớ!' };
  }

  if (/(khong gian hoc tap|danh sach mon|chon mon|danh muc mon)/.test(q)) {
    return {
      kind: 'page',
      page: 'study-space',
      reply: pick([
        '**Không gian học tập** mở rồi, chọn môn mà chiến thôi!',
        'Đây là **Không gian học tập**, cậu chọn môn rồi mình bắt đầu nhé!'
      ])
    };
  }

  if (/(cai dat|doi giao dien|che do toi|che do sang|giao dien)/.test(q)) {
    return {
      kind: 'settings',
      reply: pick([
        '**Cài đặt** mở rồi, chỉnh giao diện theo gu của cậu nhé!',
        'Mở **Cài đặt** đây, đổi theme hay tuỳ chọn gì cứ thử!'
      ])
    };
  }

  if (/(thong bao|tin moi)/.test(q)) {
    return { kind: 'page', page: 'notifications', reply: '**Thông báo** mở rồi, xem có gì mới không nào!' };
  }

  if (/(ho tro|phan hoi|bao loi|khieu nai|bao cao (su co|loi)|gop y)/.test(q)) {
    return { kind: 'page', page: 'report', reply: 'Trang **Hỗ trợ & phản hồi** mở rồi, có gì cứ gõ vào nhé!' };
  }

  if (/(nang cap (tai khoan|goi|premium)|premium|goi vip|goi cao cap|thong tin (lien he|lien lac)|lien he (tac gia|admin|nguoi tao|anh phuc|thay)|lien lac (tac gia|admin))/.test(q)) {
    return {
      kind: 'page',
      page: 'upgrade',
      reply: pick([
        'Trang **Nâng cấp tài khoản** mở rồi — có Facebook và Zalo để nhắn trực tiếp cho anh Phúc nhé!',
        'Thông tin liên hệ nằm trong **Nâng cấp tài khoản** đó, cậu vào chọn Facebook hoặc Zalo là nhắn được ngay!'
      ])
    };
  }

  if (/(trang chu|ve nha|man hinh chinh)/.test(q)) {
    return { kind: 'page', page: 'home', reply: 'Về **Trang chủ** rồi, bắt đầu từ đâu cũng được!' };
  }

  // Nhắc đúng tên môn nhưng chưa nói rõ muốn gì: mở trang môn để chọn bài giảng / thi thử.
  // Chỉ áp dụng cho câu ngắn có chữ "môn"/"vào học" để không bắt nhầm câu hỏi chuyên môn dài.
  if (subject && raw.length <= 50 && /(mon|vao hoc|vo hoc|vao phan|vo phan|hoc phan)/.test(q)) {
    return {
      kind: 'subject',
      subjectId: subject.id,
      reply: pick([
        `Mở môn **${subjectLabel(subject)}** rồi — muốn đọc bài giảng hay thi thử thì chọn ngay trên trang này nhé!`,
        `**${subjectLabel(subject)}** đây. Cậu xem bài giảng trước hay vào thi thử luôn?`
      ])
    };
  }

  return null;
}

function activateSubject(subjectId) {
  if (!subjectId) return;
  DB.setActiveSubject(subjectId);
  const select = document.getElementById('global-subject-select');
  if (select) select.value = subjectId;
  window.updateSubjectBanner?.(subjectId);
  window.updateBankCount?.();
}

export function runCeraNavigation(plan) {
  if (!plan) return '';
  const targetSubjectId = plan.subjectId || plan.context?.subjectId;
  if (targetSubjectId) rememberCeraSubject(targetSubjectId);
  const nav = window.NavController;
  if (!nav) return plan.reply || '';
  switch (plan.kind) {
    case 'reply':
      return plan.reply;
    case 'exam':
      if (plan.subjectId && nav.startSubjectExam) nav.startSubjectExam(plan.subjectId);
      else nav.navigateToPage('ontap', 'exam-tab');
      return plan.reply;
    case 'download': {
      activateSubject(plan.subjectId);
      let popup = null;
      try {
        popup = window.open(plan.url, '_blank');
        if (popup) popup.opener = null;
      } catch {
        popup = null;
      }
      if (popup) return plan.reply;
      if (plan.resourceId && nav.openStudyReader) {
        nav.openStudyReader({ subjectId: plan.subjectId, resourceId: plan.resourceId, returnPage: 'subject-detail' });
        return `${plan.reply} Trình duyệt chặn tab mới nên tớ mở tài liệu trong app — bấm **Mở tài liệu gốc** để tải nhé!`;
      }
      return `${plan.reply} Trình duyệt đang chặn tab mới, cậu cho phép popup rồi nhắn tớ mở lại nhé!`;
    }
    case 'page':
      activateSubject(plan.subjectId);
      nav.navigateToPage(plan.page, plan.tab || null, plan.params || {});
      return plan.reply;
    case 'admin':
      nav.navigateToPage('admin');
      if (plan.tab) window.setTimeout(() => window.switchAdminSubTab?.(plan.tab), 350);
      return plan.reply;
    case 'subject':
      nav.openSubjectDetail(plan.subjectId, 'study-space');
      return plan.reply;
    case 'article':
      nav.navigateToPage('about');
      window.setTimeout(() => window.ArticlesModule?.openDetail?.(plan.articleId), 180);
      return plan.reply;
    case 'reader':
      // Mở bài của môn khác phải đổi luôn môn đang chọn, để lệnh tiếp theo
      // ("thi thử", "ngân hàng câu hỏi"...) không rơi lại môn cũ.
      if (plan.context?.subjectId) activateSubject(plan.context.subjectId);
      nav.openStudyReader(plan.context);
      return plan.reply;
    case 'settings':
      window.openSettings?.();
      return plan.reply;
    default:
      return plan.reply || '';
  }
}
