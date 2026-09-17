import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const api = window.ShopApiConfig;
const s = createClient(api.url, api.key);
const TOKEN = 'mytool_shop_worker_token';
const EXPIRES = 'mytool_shop_worker_expires_at';
const CACHE_KEY = 'mytool_today_route_cache_v1';
const IDENTITY_KEY = 'mytool_today_route_identity_v1';
const QUEUE_KEY = 'mytool_today_route_queue_v1';
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('ar-DZ', { maximumFractionDigits: 2 }).format(Number(value || 0)) + ' دج';
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

let token = '';
let me = null;
let rows = [];
let syncing = false;
let completingTaskId = null;
let completionHasMoney = null;

$('day').value = today();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stat(text, kind = 'info') {
  $('status').textContent = text;
  $('status').className = 'status ' + kind;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function sessionFingerprint(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function ownerKey() {
  return token ? sessionFingerprint(token) : '';
}

function queueAll() {
  const value = readJson(QUEUE_KEY, []);
  return Array.isArray(value) ? value : [];
}

function currentQueue() {
  const owner = ownerKey();
  return queueAll().filter(item => item && item.owner === owner);
}

function replaceCurrentQueue(next) {
  const owner = ownerKey();
  const keep = queueAll().filter(item => !item || item.owner !== owner);
  writeJson(QUEUE_KEY, keep.concat(next));
  renderSyncState();
}

function upsertQueueItem(item) {
  const list = currentQueue();
  const index = list.findIndex(x => x.local_id === item.local_id);
  if (index >= 0) list[index] = item;
  else list.push(item);
  replaceCurrentQueue(list);
}

function removeQueueItem(localId) {
  replaceCurrentQueue(currentQueue().filter(item => item.local_id !== localId));
}

function pendingForTask(taskId) {
  return currentQueue().filter(item => Number(item.task_id) === Number(taskId));
}

function queuedAmount(taskId) {
  return pendingForTask(taskId)
    .filter(item => item.kind === 'collect' || (item.kind === 'complete' && item.has_money))
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function renderSyncState() {
  const box = $('syncBox');
  if (!box) return;
  const list = currentQueue();
  const blocked = list.filter(item => item.state === 'blocked').length;
  $('syncCount').textContent = list.length;
  $('syncBlocked').textContent = blocked;
  box.hidden = !me || me.account_role !== 'worker' || (navigator.onLine && list.length === 0 && !syncing);
  box.classList.toggle('has-pending', list.length > 0);
  box.classList.toggle('has-blocked', blocked > 0);
  $('syncNow').disabled = syncing || !list.length;
  $('syncNow').textContent = syncing ? 'جاري المزامنة…' : 'مزامنة الآن';
}

function saveIdentity() {
  if (!me || !token) return;
  writeJson(IDENTITY_KEY, {
    owner: ownerKey(),
    saved_at: Date.now(),
    account_role: me.account_role,
    nickname: me.nickname || '',
    pin_required: false
  });
}

function loadCachedIdentity() {
  const cached = readJson(IDENTITY_KEY, null);
  const expiresAt = Number(localStorage.getItem(EXPIRES) || 0);
  if (!cached || cached.owner !== ownerKey()) return null;
  if (expiresAt && expiresAt <= Date.now()) return null;
  return cached;
}

function saveRouteCache() {
  if (!me || !token) return;
  writeJson(CACHE_KEY, {
    owner: ownerKey(),
    role: me.account_role,
    date: $('day').value || today(),
    saved_at: Date.now(),
    rows
  });
}

function loadRouteCache() {
  const cache = readJson(CACHE_KEY, null);
  if (!cache || cache.owner !== ownerKey()) return false;
  if (cache.date !== ($('day').value || today())) return false;
  if (!Array.isArray(cache.rows)) return false;
  rows = cache.rows;
  applyQueuedStateLocally();
  render();
  const stamp = cache.saved_at ? new Date(cache.saved_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }) : '';
  stat('لا يوجد اتصال. تعرض آخر جولة محفوظة محليًا' + (stamp ? ' (' + stamp + ')' : '') + '. أي عملية جديدة ستبقى معلقة للمزامنة.', 'warn');
  return true;
}

function label(value) {
  return value === 'done' ? 'تمت الزيارة' : value === 'unavailable' ? 'تعذر' : 'لم أزر بعد';
}

function cls(value) {
  return value === 'done' ? 'done-label' : value === 'unavailable' ? 'unavailable' : 'pending';
}

function isConnectivityError(error) {
  if (!navigator.onLine) return true;
  const text = String(error?.message || error || '');
  return /failed to fetch|network|fetch failed|load failed|timeout|timed out|err_network|connection/i.test(text);
}

function safeError(error) {
  const text = String(error?.message || error || 'خطأ غير معروف');
  return text.replace(/(eyJ[a-zA-Z0-9._-]{20,}|sb_[a-zA-Z0-9_-]{20,})/g, '[محجوب]');
}

function applyQueuedStateLocally() {
  const list = currentQueue();
  for (const item of list) {
    const row = rows.find(x => Number(x.id) === Number(item.task_id));
    if (!row) continue;
    if (item.kind === 'status') row.status = item.status;
    if (item.kind === 'complete') {
      row.status = 'done';
      row.completion_note = item.notes || null;
    }
  }
}

async function identify() {
  token = localStorage.getItem(TOKEN) || '';
  if (!token) throw new Error('NO_SESSION');
  try {
    const response = await s.rpc('workspace_session_status', { p_session_token: token });
    if (response.error || !response.data?.length) throw response.error || new Error('NO_SESSION');
    me = response.data[0];
    if (me.pin_required) throw new Error('PIN_REQUIRED');
    saveIdentity();
  } catch (error) {
    if (!isConnectivityError(error)) throw error;
    me = loadCachedIdentity();
    if (!me) throw new Error('OFFLINE_NO_CACHE');
  }

  const isAdmin = me.account_role === 'workspace_admin';
  $('subtitle').textContent = isAdmin
    ? 'أنشئ جولة العامل وتابع التنفيذ والاستلام.'
    : 'المحلات المطلوبة منك اليوم؛ سجل ما استلمته فعليًا دون عرض تقدير الإدارة.';
  if (!isAdmin) {
    $('expectedSum').closest('.pill').hidden = true;
    $('remainingSum').closest('.pill').hidden = true;
  }
  ShopShell.mountRoleNavigation({ role: isAdmin ? 'admin' : 'worker', permissions: { can_record_money: true } }, 'today-route');
  document.querySelectorAll('.shell-identity').forEach(el => {
    el.textContent = (me.nickname || (isAdmin ? 'مدير' : 'عامل')) + ' · وضع الاستمرارية';
  });
  renderSyncState();
}

async function loadWorkers() {
  if (me.account_role !== 'workspace_admin') return;
  if (!navigator.onLine) {
    $('adminAdd').hidden = true;
    return;
  }
  const response = await s.rpc('workspace_visit_workers', { p_session_token: token });
  if (response.error) throw response.error;
  $('worker').innerHTML = (response.data || []).map(x => `<option value="${x.worker_id}">${esc(x.nickname)}</option>`).join('');
  $('adminAdd').hidden = false;
}

async function load() {
  stat('جاري تحميل الجولة…');
  try {
    const response = await s.rpc('workspace_visit_list_v2', {
      p_session_token: token,
      p_visit_date: $('day').value || today()
    });
    if (response.error) throw response.error;
    rows = Array.isArray(response.data) ? response.data : [];
    applyQueuedStateLocally();
    saveRouteCache();
    render();
    stat(rows.length ? 'الجولة والمبالغ محدثة.' : 'لا توجد محلات مضافة لهذا اليوم.', 'ok');
    if (navigator.onLine && currentQueue().length) void flushQueue(false);
  } catch (error) {
    if (isConnectivityError(error) && loadRouteCache()) return;
    throw error;
  }
}

function moneyBlock(row) {
  const received = money(row.received_amount);
  if (me.account_role === 'worker') {
    const local = queuedAmount(row.id);
    const localLine = local > 0 ? `<div><small>معلّق للمزامنة</small><b>${money(local)}</b></div>` : '';
    return `<div class="money worker-money"><div><small>مسجل على الخادم</small><b>${received}</b></div>${localLine}</div>`;
  }
  const expected = row.expected_amount == null ? 'غير محدد' : money(row.expected_amount);
  const remaining = row.expected_amount == null ? '—' : money(row.remaining_amount);
  const extra = Number(row.extra_amount || 0);
  return `<div class="money"><div><small>تقدير الإدارة</small><b>${expected}</b></div><div><small>المستلم</small><b>${received}</b></div><div><small>${extra > 0 ? 'زيادة تحتاج مراجعة' : 'الباقي التقديري'}</small><b>${extra > 0 ? money(extra) : remaining}</b></div></div>`;
}

function workerLinkNotice(row) {
  if (me.account_role !== 'worker' || row.party_id) return '';
  return '<div class="warnbox">هذا الاسم غير مربوط بدليل العملاء. يمكنك إتمام الزيارة وتسجيل المبلغ؛ سيُحفظ مؤقتًا باسم المحل حتى تربطه الإدارة لاحقًا.</div>';
}

function adminExpected(row) {
  if (me.account_role !== 'workspace_admin') return '';
  return `<div class="admin-expected"><div class="field"><label>تعديل المتوقع</label><input data-expected="${row.id}" type="number" min="0" step="0.01" value="${row.expected_amount == null ? '' : Number(row.expected_amount)}" placeholder="غير محدد"></div><button class="btn secondary" data-save-expected="${row.id}" type="button">حفظ المتوقع</button></div>`;
}

function pendingBadge(row) {
  const list = pendingForTask(row.id);
  if (!list.length) return '';
  const blocked = list.some(item => item.state === 'blocked');
  return `<span class="sync-badge ${blocked ? 'blocked' : ''}">${blocked ? 'يحتاج مراجعة' : 'معلّق للمزامنة'}</span>`;
}

function dedupeRenderedCards(root) {
  const seen = new Set();
  root.querySelectorAll(':scope > .item[data-id]').forEach(card => {
    const key = String(card.dataset.id || '');
    if (seen.has(key)) card.remove();
    else seen.add(key);
  });
}

function renderDoneSection(doneRows) {
  const section = $('doneSection');
  const root = $('doneItems');
  $('doneSectionCount').textContent = doneRows.length;
  section.hidden = doneRows.length === 0;
  if (!doneRows.length) {
    root.innerHTML = '';
    return;
  }
  root.innerHTML = doneRows.map(row => {
    const note = row.completion_note ? `<div class="note">ملاحظة الإتمام: ${esc(row.completion_note)}</div>` : '';
    const unlinked = !row.party_id && Number(row.received_amount || 0) > 0
      ? '<div class="warnbox">الاستلام محفوظ باسم المحل وغير مربوط بحساب بعد.</div>'
      : '';
    const reopen = me.account_role === 'worker'
      ? `<div class="actions"><button class="btn secondary" data-reopen="${row.id}" type="button">إرجاع للزيارات</button></div>`
      : '';
    return `<div class="done-card" data-done-id="${row.id}"><div class="head"><div><div class="name">${esc(row.shop_name)}</div><div class="meta"><span class="done-label">تمت الزيارة</span> ${pendingBadge(row)}</div></div></div>${moneyBlock(row)}${note}${unlinked}${reopen}</div>`;
  }).join('');
  root.querySelectorAll('[data-reopen]').forEach(button => {
    button.onclick = () => setStatus(Number(button.dataset.reopen), 'pending');
  });
}

function render() {
  const root = $('items');
  const activeRows = rows.filter(row => row.status !== 'done');
  const doneRows = rows.filter(row => row.status === 'done');

  $('allCount').textContent = rows.length;
  $('pendingCount').textContent = activeRows.length;
  $('doneCount').textContent = doneRows.length;
  $('expectedSum').textContent = money(rows.reduce((sum, row) => sum + Number(row.expected_amount || 0), 0));
  $('receivedSum').textContent = money(rows.reduce((sum, row) => sum + Number(row.received_amount || 0), 0));
  $('remainingSum').textContent = money(rows.reduce((sum, row) => sum + Number(row.remaining_amount || 0), 0));
  renderSyncState();
  renderDoneSection(doneRows);

  if (!activeRows.length) {
    root.innerHTML = '<div class="card empty">لا توجد زيارات متبقية.</div>';
    return;
  }

  root.innerHTML = activeRows.map((row, index) => {
    const workerActions = me.account_role === 'worker'
      ? `<button class="btn" data-complete="${row.id}" type="button">تمت الزيارة</button>`
        + (row.status !== 'unavailable'
          ? '<button class="btn secondary" data-s="unavailable" type="button">تعذر</button>'
          : '<button class="btn secondary" data-s="pending" type="button">إرجاع</button>')
      : '';
    const adminActions = me.account_role === 'workspace_admin'
      ? '<button class="btn danger" data-del type="button">حذف</button>'
      : '';
    return `<section class="item" data-id="${row.id}"><div class="head"><div><div class="name">${index + 1}. ${esc(row.shop_name)}</div><div class="meta">${me.account_role === 'workspace_admin' && row.assigned_name ? esc(row.assigned_name) + ' · ' : ''}<span class="${cls(row.status)}">${label(row.status)}</span>${row.party_name ? ' · مربوط: ' + esc(row.party_name) : ''} ${pendingBadge(row)}</div></div></div>${row.notes ? `<div class="note">${esc(row.notes)}</div>` : ''}${moneyBlock(row)}${adminExpected(row)}${workerLinkNotice(row)}<div class="actions">${workerActions}${adminActions}</div></section>`;
  }).join('');

  dedupeRenderedCards(root);

  root.querySelectorAll('[data-complete]').forEach(button => {
    button.onclick = () => openCompleteDialog(Number(button.dataset.complete));
  });
  root.querySelectorAll('[data-s]').forEach(button => {
    button.onclick = () => setStatus(Number(button.closest('[data-id]').dataset.id), button.dataset.s);
  });
  root.querySelectorAll('[data-del]').forEach(button => {
    button.onclick = () => del(Number(button.closest('[data-id]').dataset.id));
  });
  root.querySelectorAll('[data-save-expected]').forEach(button => {
    button.onclick = () => saveExpected(Number(button.dataset.saveExpected));
  });
}

function setCompletionChoice(hasMoney) {
  completionHasMoney = hasMoney;
  $('completeYesMoney').classList.toggle('active', hasMoney === true);
  $('completeNoMoney').classList.toggle('active', hasMoney === false);
  $('completeMoneyFields').hidden = hasMoney !== true;
  if (hasMoney !== true) $('completeAmount').value = '';
}

function openCompleteDialog(id) {
  if (me.account_role !== 'worker') return;
  const row = rows.find(item => Number(item.id) === Number(id));
  if (!row) return stat('تعذر العثور على الزيارة.', 'err');

  completingTaskId = id;
  completionHasMoney = null;
  $('completeShopName').textContent = row.shop_name;
  $('completeAmount').value = '';
  $('completeNote').value = row.completion_note || '';
  $('completeYesMoney').classList.remove('active');
  $('completeNoMoney').classList.remove('active');
  $('completeMoneyFields').hidden = true;

  if (row.party_id) {
    $('completeLinkHint').hidden = true;
    $('completeLinkHint').textContent = '';
  } else {
    $('completeLinkHint').hidden = false;
    $('completeLinkHint').textContent = 'إذا اخترت «نعم»، سيُحفظ المبلغ مؤقتًا باسم هذا المحل حتى تربطه الإدارة بحساب العميل الصحيح.';
  }

  $('completeDialog').hidden = false;
  document.body.classList.add('dialog-open');
}

function closeCompleteDialog() {
  $('completeDialog').hidden = true;
  document.body.classList.remove('dialog-open');
  completingTaskId = null;
  completionHasMoney = null;
}

async function completeVisit() {
  if (completingTaskId == null) return;
  if (completionHasMoney === null) return stat('اختر هل استلمت مالًا أم لا.', 'err');

  const row = rows.find(item => Number(item.id) === Number(completingTaskId));
  if (!row) return stat('تعذر العثور على الزيارة.', 'err');

  const amount = completionHasMoney ? Number($('completeAmount').value) : null;
  if (completionHasMoney && (!Number.isFinite(amount) || amount <= 0)) {
    return stat('أدخل المبلغ الذي استلمته فعليًا.', 'err');
  }

  const note = $('completeNote').value.trim() || null;
  const taskId = completingTaskId;
  const item = {
    local_id: crypto.randomUUID(),
    owner: ownerKey(),
    kind: 'complete',
    task_id: taskId,
    has_money: completionHasMoney,
    amount,
    notes: note,
    request_key: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    state: 'pending',
    last_error: ''
  };

  upsertQueueItem(item);
  row.status = 'done';
  row.completion_note = note;
  saveRouteCache();
  closeCompleteDialog();
  render();

  if (!navigator.onLine) {
    stat(completionHasMoney
      ? 'تم حفظ الزيارة والمبلغ محليًا، وسيُزامنان معًا عند رجوع الإنترنت.'
      : 'تم حفظ إتمام الزيارة محليًا، وسيُزامن عند رجوع الإنترنت.', 'warn');
    return;
  }

  stat('جاري حفظ إتمام الزيارة…');
  await flushQueue(false);
}

async function saveExpected(id) {
  if (!navigator.onLine) return stat('تعديل المتوقع يحتاج اتصالًا. لم يتم حفظ أي تغيير.', 'err');
  const input = document.querySelector('[data-expected="' + id + '"]');
  const raw = input?.value.trim() || '';
  const amount = raw === '' ? null : Number(raw);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return stat('راجع المبلغ المتوقع.', 'err');
  stat('جاري حفظ المتوقع…');
  const response = await s.rpc('workspace_admin_set_visit_expected', { p_session_token: token, p_task_id: id, p_expected_amount: amount });
  if (response.error) return stat('تعذر حفظ المتوقع: ' + safeError(response.error), 'err');
  await load();
}

async function syncItem(item) {
  if (item.kind === 'collect') {
    const response = await s.rpc('worker_create_visit_cash_receipt_safe', {
      p_session_token: token,
      p_task_id: item.task_id,
      p_amount: item.amount,
      p_notes: item.notes || 'من جولة اليوم',
      p_request_key: item.request_key
    });
    if (response.error) throw response.error;
    return;
  }
  if (item.kind === 'complete') {
    const response = await s.rpc('worker_complete_visit_safe', {
      p_session_token: token,
      p_task_id: item.task_id,
      p_has_money: Boolean(item.has_money),
      p_amount: item.has_money ? Number(item.amount) : null,
      p_notes: item.notes || null,
      p_request_key: item.request_key
    });
    if (response.error) throw response.error;
    return;
  }
  if (item.kind === 'status') {
    const response = await s.rpc('workspace_visit_set_status', {
      p_session_token: token,
      p_task_id: item.task_id,
      p_status: item.status
    });
    if (response.error) throw response.error;
    return;
  }
  throw new Error('UNKNOWN_LOCAL_OPERATION');
}

async function flushQueue(manual = false) {
  if (syncing || !me || me.account_role !== 'worker') return;
  const list = currentQueue();
  if (!list.length) return renderSyncState();
  if (!navigator.onLine) {
    if (manual) stat('لا يوجد اتصال الآن. العمليات محفوظة محليًا ولم تُفقد.', 'warn');
    return;
  }

  syncing = true;
  renderSyncState();
  let synced = 0;
  let blocked = 0;

  for (const original of [...list]) {
    const item = { ...original };
    if (item.state === 'blocked' && !manual) continue;
    if (manual) item.state = 'pending';
    try {
      await syncItem(item);
      removeQueueItem(item.local_id);
      synced += 1;
    } catch (error) {
      if (isConnectivityError(error)) {
        item.state = 'pending';
        item.last_error = '';
        upsertQueueItem(item);
        break;
      }
      item.state = 'blocked';
      item.last_error = safeError(error);
      upsertQueueItem(item);
      blocked += 1;
    }
  }

  syncing = false;
  renderSyncState();

  if (synced > 0) {
    try {
      await load();
    } catch (_) {
      applyQueuedStateLocally();
      render();
    }
  }

  if (blocked > 0) stat('هناك عملية معلقة رفضها الخادم وتحتاج مراجعة. لم تُحذف من الجهاز.', 'err');
  else if (currentQueue().length) stat('بعض العمليات ما زالت محفوظة محليًا وستُعاد مزامنتها.', 'warn');
  else if (synced > 0) stat('تمت مزامنة العمليات المحلية بنجاح.', 'ok');
}

async function collect(id) {
  const input = document.querySelector('[data-collect-amount="' + id + '"]');
  const button = document.querySelector('[data-collect="' + id + '"]');
  const amount = Number(input?.value);
  if (!Number.isFinite(amount) || amount <= 0) return stat('راجع المبلغ المستلم.', 'err');
  if (!confirm('تسجيل استلام ' + money(amount) + '؟')) return;

  const item = {
    local_id: crypto.randomUUID(),
    owner: ownerKey(),
    kind: 'collect',
    task_id: id,
    amount,
    request_key: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    state: 'pending',
    last_error: ''
  };
  upsertQueueItem(item);
  if (button) button.disabled = true;
  if (input) input.value = '';
  render();

  if (!navigator.onLine) {
    stat('تم حفظ الاستلام على هذا الجهاز وهو معلّق للمزامنة. لا تعِد إدخاله.', 'warn');
    return;
  }

  stat('جاري تسجيل الاستلام…');
  try {
    await syncItem(item);
    removeQueueItem(item.local_id);
    await load();
    stat('تم تسجيل الاستلام وأضيف إلى أموال العامل.', 'ok');
  } catch (error) {
    if (isConnectivityError(error)) {
      stat('تعذر الاتصال بعد الحفظ. الاستلام محفوظ محليًا وسيُزامن بنفس رقم الطلب عند رجوع الإنترنت.', 'warn');
    } else {
      item.state = 'blocked';
      item.last_error = safeError(error);
      upsertQueueItem(item);
      stat('الخادم رفض العملية؛ بقيت محفوظة للمراجعة ولم تُحذف: ' + item.last_error, 'err');
    }
  } finally {
    if (button) button.disabled = false;
    render();
  }
}

async function setStatus(id, status) {
  if (me.account_role !== 'worker') return stat('هذه العملية خاصة بالعامل.', 'err');
  const localId = crypto.randomUUID();
  const item = {
    local_id: localId,
    owner: ownerKey(),
    kind: 'status',
    task_id: id,
    status,
    created_at: new Date().toISOString(),
    state: 'pending',
    last_error: ''
  };

  const list = currentQueue().filter(x => !(x.kind === 'status' && Number(x.task_id) === Number(id)));
  replaceCurrentQueue(list.concat(item));
  const row = rows.find(x => Number(x.id) === Number(id));
  if (row) row.status = status;
  saveRouteCache();
  render();

  if (!navigator.onLine) {
    stat('تم حفظ حالة الزيارة محليًا وستُزامن عند رجوع الإنترنت.', 'warn');
    return;
  }

  stat('جاري تحديث حالة الزيارة…');
  try {
    await syncItem(item);
    removeQueueItem(localId);
    await load();
  } catch (error) {
    if (isConnectivityError(error)) {
      stat('حالة الزيارة محفوظة محليًا ومعلقة للمزامنة.', 'warn');
    } else {
      item.state = 'blocked';
      item.last_error = safeError(error);
      upsertQueueItem(item);
      stat('الخادم رفض تحديث حالة الزيارة؛ بقي التغيير محليًا للمراجعة: ' + item.last_error, 'err');
    }
  }
}

async function del(id) {
  if (!navigator.onLine) return stat('حذف المحل يحتاج اتصالًا. لم يتم الحذف.', 'err');
  if (!confirm('حذف المحل من الجولة؟')) return;
  const response = await s.rpc('workspace_admin_delete_visit_task', { p_session_token: token, p_task_id: id });
  if (response.error) return stat('تعذر الحذف: ' + safeError(response.error), 'err');
  await load();
}

$('addBtn').onclick = async () => {
  if (!navigator.onLine) return stat('إضافة جولة جديدة تحتاج اتصالًا. القائمة الحالية فقط تعمل محليًا.', 'err');
  const lines = $('lines').value.trim();
  if (!lines) return stat('ألصق أسماء المحلات أولًا.', 'err');
  const worker = Number($('worker').value || 0);
  stat('جاري إضافة الجولة…');
  const response = await s.rpc('workspace_admin_add_visit_tasks_v2', {
    p_session_token: token,
    p_lines: lines,
    p_visit_date: $('day').value || today(),
    p_assigned_worker_id: worker || null
  });
  if (response.error) return stat('تعذر الإضافة: ' + safeError(response.error), 'err');
  $('lines').value = '';
  await load();
  stat('تمت إضافة ' + response.data + ' محل/محلات للجولة.', 'ok');
};

$('day').onchange = load;
$('syncNow').onclick = () => void flushQueue(true);
$('completeNoMoney').onclick = () => setCompletionChoice(false);
$('completeYesMoney').onclick = () => setCompletionChoice(true);
$('completeCancel').onclick = closeCompleteDialog;
$('completeSave').onclick = () => void completeVisit();
$('completeDialog').onclick = event => {
  if (event.target === $('completeDialog')) closeCompleteDialog();
};
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('completeDialog').hidden) closeCompleteDialog();
});
window.addEventListener('online', () => {
  stat('عاد الاتصال. جاري فحص العمليات المحلية…', 'info');
  void flushQueue(false);
});
window.addEventListener('offline', () => stat('انقطع الاتصال. يمكنك متابعة الجولة؛ العمليات الجديدة ستُحفظ محليًا.', 'warn'));
window.addEventListener('pageshow', event => {
  if (event.persisted && rows.length) render();
});
setInterval(() => {
  if (navigator.onLine && currentQueue().length) void flushQueue(false);
}, 30000);

(async () => {
  try {
    await identify();
    await loadWorkers();
    await load();
  } catch (error) {
    if (error.message === 'PIN_REQUIRED') stat('افتح MyTool وأدخل PIN اليومي أولًا.', 'err');
    else if (error.message === 'OFFLINE_NO_CACHE') stat('لا يوجد اتصال ولا توجد جولة محفوظة سابقًا على هذا الجهاز. افتح الجولة مرة واحدة أثناء الاتصال.', 'err');
    else {
      stat('انتهت الجلسة أو لا توجد صلاحية.', 'err');
      if (navigator.onLine) setTimeout(() => location.replace('../'), 1200);
    }
  }
})();
