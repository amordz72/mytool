export const roles = {
  account_key: 'معرّف الحساب الثابت (مطلوب)', username: 'اسم المستخدم',
  external_account_id: 'المعرّف الخارجي', first_name: 'الاسم', last_name: 'اللقب',
  display_name: 'اسم المحل / العرض', phone: 'الهاتف', email: 'الإيميل',
  balance: 'الرصيد', debt: 'الدين', profit: 'الربح', source_status: 'الحالة'
}
const norm = v => String(v ?? '').trim().toLowerCase()
export function signature(headers) {
  return headers.map(norm).join('|')
}
export function validateHeaders(headers) {
  if (!headers.length || headers.length > 100 || headers.some(h => !norm(h) || String(h).length > 120 || String(h).includes('|')))
    throw new Error('الأعمدة فارغة أو كثيرة أو غير صالحة. راجع صف العناوين.')
  if (new Set(headers.map(norm)).size !== headers.length)
    throw new Error('توجد أعمدة بنفس الاسم. صحح العناوين أولًا.')
}
export function suggestMapping(headers) {
  const aliases = {
    account_key: ['uid', 'اسم المستخدم', 'username', 'user', 'المعرف', 'id'],
    username: ['اسم المستخدم', 'username', 'user'], external_account_id: ['uid', 'المعرف', 'معرف الحساب', 'account id', 'id'],
    first_name: ['الاسم', 'first name', 'firstname'], last_name: ['اللقب', 'last name', 'lastname'],
    display_name: ['اسم المحل', 'المحل', 'shop name', 'display name'],
    phone: ['الهاتف', 'رقم الهاتف', 'هاتف', 'phone', 'telephone'],
    email: ['بريد إلكتروني', 'البريد الإلكتروني', 'البريد الالكتروني', 'email'],
    balance: ['رصيد', 'الرصيد', 'balance', 'solde'], debt: ['ديون', 'الدين', 'debt', 'مقترض'],
    profit: ['ارباح', 'أرباح', 'الارباح', 'الأرباح', 'profit'], source_status: ['حالة الحساب', 'الحالة', 'status']
  }
  return Object.fromEntries(Object.entries(aliases).map(([role, names]) =>
    [role, names.map(n => headers.find(h => norm(h) === norm(n))).find(Boolean) || '']))
}
export function parseNumber(value, style) {
  if (value === '' || value === null || value === undefined) return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('قيمة مالية غير صالحة')
    return value
  }
  let s = String(value).trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776)).replace(/\s/g, '')
  const pattern = style === 'comma' ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/ : style === 'dot' ? /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^-?\d+(?:\.\d+)?$/
  if (!pattern.test(s)) throw new Error('صيغة مبلغ لا توافق الإعداد المختار: ' + String(value).slice(0,30))
  if (style === 'comma') s = s.replace(/\./g, '').replace(',', '.')
  else if (style === 'dot') s = s.replace(/,/g, '')
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error('قيمة مالية غير صالحة')
  return n
}
export function mapAccounts(matrix, headerIndex, definition) {
  const headers = matrix[headerIndex].map(v => String(v ?? '').trim())
  validateHeaders(headers)
  const mapping = definition.mapping
  if (!mapping.account_key || Object.entries(mapping).some(([r,h]) => !roles[r] || (h && !headers.includes(h))))
    throw new Error('تعريف الأعمدة غير صالح أو معرّف الحساب غير محدد.')
  const rows = matrix.slice(headerIndex + 1).filter(r => Array.isArray(r) && r.some(v => String(v ?? '').trim()))
  if (!rows.length) throw new Error('الملف لا يحتوي حسابات.')
  const seen = new Set()
  const accounts = rows.map((row, i) => {
    const raw = Object.fromEntries(headers.map((h,j) => [h, row[j] ?? '']))
    const value = role => mapping[role] ? raw[mapping[role]] : ''
    const text = role => String(value(role) ?? '').trim()
    const key = text('account_key')
    if (!key || key.length > 254) throw new Error('معرّف حساب فارغ أو طويل في الصف ' + (headerIndex + i + 2))
    if (seen.has(norm(key))) throw new Error('معرّف حساب مكرر: ' + key)
    seen.add(norm(key))
    const actualUsername = text('username')
    let phone = text('phone')
    if (definition.phone_suffix && !phone) phone = actualUsername.match(/(?:^|[-\s])(\+?213\d{9}|0[5-7]\d{8})\s*$/)?.[1] || ''
    const a = {
      username: key, external_account_id: text('external_account_id') || null,
      display_name: text('display_name') || [text('first_name'), text('last_name')].filter(Boolean).join(' ') || actualUsername || key,
      first_name: text('first_name') || null, last_name: text('last_name') || null,
      phone: phone || null, email: text('email') || null,
      source_status: text('source_status') || null, active: !/معطل|disabled|inactive/i.test(text('source_status')), raw_data: raw
    }
    for (const role of ['balance', 'debt', 'profit']) {
      if (mapping[role]) {
        const n = parseNumber(value(role), definition.number_style)
        if (n === null) throw new Error('مبلغ فارغ في عمود ' + mapping[role] + '، الصف ' + (headerIndex + i + 2))
        a[role] = n
      }
    }
    return a
  })
  return { accounts, headers, headerSignature: signature(headers), financialFields: Object.fromEntries(['balance','debt','profit'].map(r => [r, Boolean(mapping[r])])) }
}
