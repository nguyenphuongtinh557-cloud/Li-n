export const SUMMARY_DOCUMENT_HISTORY_LIMIT = 8;
export const SUMMARY_DOCUMENT_HISTORY_MAX_CHARACTERS = 2_800_000;

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError'
    || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error?.code === 22
    || error?.code === 1014;
}

export function readSummaryDocumentHistory(storage, storageKey) {
  const raw = storage.getItem(storageKey);
  if (raw === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('Dữ liệu lịch sử phiên bản bị lỗi, không thể đọc an toàn.', { cause: error });
  }
  if (!Array.isArray(parsed)) throw new Error('Dữ liệu lịch sử phiên bản không hợp lệ.');
  return parsed.filter(version => version
    && typeof version.id === 'string'
    && typeof version.label === 'string'
    && typeof version.createdAt === 'string'
    && typeof version.html === 'string'
  ).slice(0, SUMMARY_DOCUMENT_HISTORY_LIMIT);
}

export function createSummaryDocumentVersion(storage, storageKey, html, label, createdAt = new Date()) {
  const normalizedLabel = String(label || '').trim();
  if (!normalizedLabel || normalizedLabel.length > 80) {
    throw new Error('Tên phiên bản phải có từ 1 đến 80 ký tự.');
  }
  if (typeof html !== 'string' || !html.trim()) throw new Error('Không thể lưu phiên bản rỗng.');

  const version = {
    id: `${createdAt.getTime()}-${Math.random().toString(36).slice(2, 9)}`,
    label: normalizedLabel,
    createdAt: createdAt.toISOString(),
    html
  };
  let previous = readSummaryDocumentHistory(storage, storageKey);
  let candidate = [version, ...previous].slice(0, SUMMARY_DOCUMENT_HISTORY_LIMIT);
  let removed = previous.length - (candidate.length - 1);

  while (candidate.length > 1 && JSON.stringify(candidate).length > SUMMARY_DOCUMENT_HISTORY_MAX_CHARACTERS) {
    candidate.pop();
    removed += 1;
  }
  if (JSON.stringify(candidate).length > SUMMARY_DOCUMENT_HISTORY_MAX_CHARACTERS) {
    throw new Error('Phiên bản vượt giới hạn dung lượng lịch sử.');
  }

  while (true) {
    try {
      storage.setItem(storageKey, JSON.stringify(candidate));
      return { version, removed };
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      if (candidate.length <= 1) {
        throw new Error('Không đủ dung lượng trình duyệt để lưu phiên bản. Nội dung hiện tại vẫn được giữ nguyên.', { cause: error });
      }
      candidate.pop();
      removed += 1;
    }
  }
}
