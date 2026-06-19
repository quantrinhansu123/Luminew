import bcrypt from 'bcryptjs';

/** Lấy hash/plain password từ dòng `users` (schema cũ có thể dùng `password_hash`). */
export function getUserStoredPassword(user) {
  if (!user || typeof user !== 'object') return '';
  return String(user.password ?? user.password_hash ?? '').trim();
}

/** So khớp mật khẩu: bcrypt hash hoặc plain text legacy. */
export function verifyUserPassword(plainPassword, storedPassword) {
  const plain = String(plainPassword ?? '');
  const stored = String(storedPassword ?? '').trim();
  if (!stored) return false;
  if (/^\$2[aby]\$/.test(stored)) {
    try {
      return bcrypt.compareSync(plain, stored);
    } catch {
      return false;
    }
  }
  return plain === stored;
}
