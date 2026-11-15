import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getHanoiReadPages, isHanoiDepartmentPeer, normalizeBranch, normalizeDepartment, withHanoiReadPermissions } from '../src/utils/hcmHanoiViewAccess.js';

test('normalizes branch and department labels used by personnel records', () => {
  for (const value of ['HCM', 'TP.HCM', 'Hồ Chí Minh']) assert.equal(normalizeBranch(value), 'hcm');
  for (const value of ['Hà Nội', 'HN', 'Hanoi']) assert.equal(normalizeBranch(value), 'hn');
  assert.equal(normalizeDepartment('Kế Toán'), 'finance');
  assert.equal(normalizeDepartment('Vận Đơn'), 'orders');
  assert.equal(normalizeDepartment('HCNS'), normalizeDepartment('HR'));
  assert.equal(normalizeDepartment('R&D'), 'rnd');
});

test('HCM departments receive only their own Hanoi read pages', () => {
  for (const [department, expected] of [['MKT', 'MKT_VIEW'], ['Sale', 'SALE_VIEW'], ['CSKH', 'CSKH_VIEW'], ['Vận Đơn', 'ORDERS_LIST'], ['HR', 'HR_LIST'], ['Kế Toán', 'FINANCE_F3'], ['R&D', 'RND_VIEW'], ['FFM MGT', 'ORDERS_FFM_MGT']]) {
    const pages = getHanoiReadPages({ branch: 'HCM', department });
    assert.ok(pages.includes(expected), department);
    assert.ok(!pages.some((p) => /INPUT|NEW|EDIT|ADMIN|CEO/.test(p)), department);
    if (department !== 'MKT') assert.ok(!pages.includes('MKT_VIEW'));
  }
});

test('does not grant reverse, unknown, inactive or missing-profile access', () => {
  for (const user of [{ branch: 'Hà Nội', department: 'MKT' }, { branch: 'HCM', department: 'Nghỉ' }, { branch: 'HCM', department: 'unknown' }, { department: 'MKT' }, null]) {
    assert.deepEqual(getHanoiReadPages(user), []);
  }
});

test('adds full-column view without changing existing write permissions or source rows', () => {
  const original = [{ page_code: ' mkt_view ', can_view: false, can_edit: false, can_delete: false, allowed_columns: ['Tên'] }, { page_code: 'SALE_VIEW', can_view: false }];
  const result = withHanoiReadPermissions(original, { branch: 'HCM', department: 'MKT' });
  assert.equal(result[0].can_view, true);
  assert.deepEqual(result[0].allowed_columns, ['*']);
  assert.equal(result[0].can_edit, false);
  assert.equal(result[0].can_delete, false);
  assert.equal(result[1].can_view, false);
  assert.equal(original[0].can_view, false);
  for (const p of result.slice(2)) {
    assert.equal(p.can_edit, false);
    assert.equal(p.can_delete, false);
  }
  const writable = withHanoiReadPermissions([{ page_code: 'SALE_VIEW', can_edit: true }], { branch: 'HCM', department: 'Sale' });
  assert.equal(writable[0].can_edit, true);
});

test('personnel expansion includes only Hanoi peers in the same department', () => {
  const user = { branch: 'HCM', department: 'HR' };
  assert.equal(isHanoiDepartmentPeer(user, { branch: 'Hà Nội', department: 'HCNS' }), true);
  for (const peer of [{ branch: 'HCM', department: 'HR' }, { branch: 'Hà Nội', department: 'Sale' }, { department: 'HR' }]) assert.equal(isHanoiDepartmentPeer(user, peer), false);
  assert.equal(isHanoiDepartmentPeer({ branch: 'HCM' }, { branch: 'Hà Nội' }), false);
});
