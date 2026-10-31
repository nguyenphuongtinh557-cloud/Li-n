/**
 * Danh sách email quản trị dùng chung cho các API server-side.
 * ADMIN_EMAILS (env, phân tách bằng dấu phẩy) ghi đè danh sách mặc định.
 */

const DEFAULT_ADMINS = [
  'nguyenphuongtinh557@gmail.com',
  'macnghich@gmail.com'
];

export function getAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS || DEFAULT_ADMINS.join(','))
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email) {
  if (!email) return false;
  return getAdminEmails().has(String(email).trim().toLowerCase());
}
