/**
 * ============================================================
 * notifications.js — Trackify Notification System
 * ============================================================
 *
 * Dua jenis notifikasi:
 *
 * 1. PENGINGAT RUTIN — jadwal tetap harian (jam bisa diatur)
 *    habit, journal, mood, todo-review, streak, refleksi
 *
 * 2. DEADLINE ALERT — berbasis data aktual
 *    - Todo belum selesai yang dueDate-nya mendekati/melewati deadline
 *    - Target on_progress yang deadline-nya mendekati/melewati deadline
 *    Dikirim max 1× per item per hari via localStorage agar tidak spam.
 * ============================================================
 */

'use strict';

import { requestFCMPermission, initForegroundNotifications } from './fcm.js';

const STORAGE_KEY       = 'Trackify_notifPrefs';
const DEADLINE_SENT_KEY = 'Trackify_notifDeadlineSent';

// ── Default preferences ───────────────────────────────────────
const DEFAULT_PREFS = {
  enabled: false,
  deadlines: {
    todo:   { enabled: true,  advanceDays: 1 },
    target: { enabled: true,  advanceDays: 3 },
  },
  types: {
    habit:    { enabled: true,  time: '08:00', label: 'Check Habit',         body: 'Sudah cek habit harianmu hari ini? Jaga konsistensi!',        lastSent: '' },
    journal:  { enabled: true,  time: '21:00', label: 'Tulis Jurnal',        body: 'Waktunya refleksikan harimu. Tulis jurnal sekarang!',          lastSent: '' },
    mood:     { enabled: true,  time: '19:00', label: 'Catat Emosi',         body: 'Bagaimana perasaanmu hari ini? Catat emosimu!',               lastSent: '' },
    todo:     { enabled: false, time: '07:30', label: 'Review To-Do',        body: 'Cek daftar tugasmu dan rencanakan harimu!',                   lastSent: '' },
    streak:   { enabled: true,  time: '20:00', label: 'Jaga Streak',         body: 'Jangan lupa check-in hari ini untuk menjaga streakmu!',       lastSent: '' },
    refleksi: { enabled: false, time: '20:30', label: 'Refleksi Mingguan',   body: 'Sudah tulis refleksi mingguan? Evaluasi progresmu!',          lastSent: '' },
  }
};

// ── State ─────────────────────────────────────────────────────
let _prefs    = null;
let _timerId  = null;
let _appState = null;

/** Dipanggil dari script.js setiap saveState/renderAll agar data selalu fresh */
export function setAppState(appState) {
  _appState = appState;
}

// ── Load/Save ─────────────────────────────────────────────────
function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_PREFS);
    const saved  = JSON.parse(raw);
    const merged = deepClone(DEFAULT_PREFS);
    merged.enabled = !!saved.enabled;
    if (saved.deadlines) {
      Object.keys(merged.deadlines).forEach(k => {
        if (saved.deadlines[k]) merged.deadlines[k] = { ...merged.deadlines[k], ...saved.deadlines[k] };
      });
    }
    if (saved.types) {
      Object.keys(merged.types).forEach(k => {
        if (saved.types[k]) merged.types[k] = { ...merged.types[k], ...saved.types[k] };
      });
    }
    return merged;
  } catch { return deepClone(DEFAULT_PREFS); }
}
function savePrefs() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_prefs)); } catch {}
}
function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── Deadline sent log ─────────────────────────────────────────
function getDeadlineSent() {
  try { return JSON.parse(localStorage.getItem(DEADLINE_SENT_KEY) || '{}'); } catch { return {}; }
}
function markDeadlineSent(key) {
  try {
    const log    = getDeadlineSent();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
    const cutStr = cutoff.toISOString().slice(0, 10);
    Object.keys(log).forEach(k => { if (k.slice(-10) < cutStr) delete log[k]; });
    log[key] = true;
    localStorage.setItem(DEADLINE_SENT_KEY, JSON.stringify(log));
  } catch {}
}
function wasDeadlineSent(key) { return !!getDeadlineSent()[key]; }

// ── Helpers ───────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function diffDays(dateStr) {
  const now  = new Date(); now.setHours(0,0,0,0);
  const then = new Date(dateStr + 'T00:00:00');
  return Math.round((then - now) / 86400000);
}

// ── Permission ────────────────────────────────────────────────
export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied')  return 'denied';
  return await Notification.requestPermission();
}
export function getPermissionStatus() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// ── Send ──────────────────────────────────────────────────────
function send(title, body, tag) {
  if (Notification.permission !== 'granted') return false;
  const n = new Notification(title, { body, tag, icon: '/favicon.ico' });
  n.onclick = () => { window.focus(); n.close(); };
  return true;
}

export function testNotification(type) {
  if (Notification.permission !== 'granted') return false;
  const t = _prefs?.types[type];
  if (!t) return false;
  return send('Trackify — ' + t.label, t.body, 'trackify-test-' + type);
}

// ── Routine checker ───────────────────────────────────────────
function checkRoutine() {
  if (!_prefs?.enabled || Notification.permission !== 'granted') return;
  const today = todayStr();
  const hhmm  = new Date().toTimeString().slice(0, 5);
  Object.keys(_prefs.types).forEach(key => {
    const t = _prefs.types[key];
    if (!t.enabled || t.lastSent === today || t.time !== hhmm) return;
    if (send('Trackify — ' + t.label, t.body, 'trackify-' + key)) {
      _prefs.types[key].lastSent = today;
      savePrefs();
    }
  });
}

// ── Deadline checker ──────────────────────────────────────────
function checkDeadlines() {
  if (!_prefs?.enabled || Notification.permission !== 'granted') return;
  if (!_appState) return;

  const today = todayStr();
  const dl    = _prefs.deadlines;

  // Todo
  if (dl.todo?.enabled) {
    (_appState.todos || []).forEach(todo => {
      if (todo.done || !todo.dueDate) return;
      const diff = diffDays(todo.dueDate);
      const adv  = dl.todo.advanceDays ?? 1;
      if (diff > adv || diff < -3) return;           // terlalu jauh atau terlalu lama lewat

      const sentKey = `todo-${todo.id}-${today}`;
      if (wasDeadlineSent(sentKey)) return;

      let label, body;
      if (diff < 0)       { label = `To-Do Terlewat (${Math.abs(diff)}h)!`; body = `"${todo.text}" sudah ${Math.abs(diff)} hari melewati deadline dan belum selesai.`; }
      else if (diff === 0){ label = 'To-Do Deadline Hari Ini!';              body = `"${todo.text}" harus diselesaikan hari ini.`; }
      else if (diff === 1){ label = 'To-Do Deadline Besok!';                 body = `"${todo.text}" deadline besok (${todo.dueDate}).`; }
      else                { label = `To-Do — ${diff} Hari Lagi`;            body = `"${todo.text}" deadline pada ${todo.dueDate}.`; }

      if (send('Trackify — ' + label, body, `trackify-deadline-todo-${todo.id}`)) {
        markDeadlineSent(sentKey);
      }
    });
  }

  // Target
  if (dl.target?.enabled) {
    (_appState.targets || []).forEach((target, idx) => {
      if (target.status === 'done' || !target.deadline) return;
      const diff = diffDays(target.deadline);
      const adv  = dl.target.advanceDays ?? 3;
      if (diff > adv || diff < -3) return;

      const id      = target._id || `idx-${idx}`;
      const sentKey = `target-${id}-${today}`;
      if (wasDeadlineSent(sentKey)) return;

      let label, body;
      if (diff < 0)       { label = `Target Terlewat (${Math.abs(diff)}h)!`; body = `Target "${target.name}" sudah ${Math.abs(diff)} hari melewati deadline.`; }
      else if (diff === 0){ label = 'Target Deadline Hari Ini!';              body = `Target "${target.name}" harus dicapai hari ini!`; }
      else if (diff === 1){ label = 'Target Deadline Besok!';                 body = `Target "${target.name}" deadline besok (${target.deadline}).`; }
      else                { label = `Target — ${diff} Hari Lagi`;            body = `Target "${target.name}" deadline pada ${target.deadline}.`; }

      if (send('Trackify — ' + label, body, `trackify-deadline-target-${id}`)) {
        markDeadlineSent(sentKey);
      }
    });
  }
}

// ── Scheduler ─────────────────────────────────────────────────
function tick() { checkRoutine(); checkDeadlines(); }
function startScheduler() {
  if (_timerId) return;
  tick();
  _timerId = setInterval(tick, 60_000);
}
function stopScheduler() {
  if (_timerId) { clearInterval(_timerId); _timerId = null; }
}

// ── Init / enable / disable ───────────────────────────────────
export function initNotifications() {
  _prefs = loadPrefs();
  if (_prefs.enabled && getPermissionStatus() === 'granted') {
    startScheduler();
    // Init FCM foreground handler supaya notif tetap muncul saat app terbuka
    initForegroundNotifications();
  }
}
export function getPrefs() { return deepClone(_prefs); }

export async function enableNotifications() {
  const status = await requestPermission();
  if (status !== 'granted') return status;
  _prefs.enabled = true;
  savePrefs();
  startScheduler();
  // Request FCM permission & daftarkan service worker
  try {
    const token = await requestFCMPermission();
    if (token) {
      localStorage.setItem('fcm_token', token);
      console.log('[Trackify] FCM token tersimpan:', token.slice(0, 20) + '...');
    }
    initForegroundNotifications();
  } catch (e) {
    console.warn('[Trackify] FCM setup gagal, fallback ke Browser API:', e);
  }
  return 'granted';
}
export function disableNotifications() {
  _prefs.enabled = false;
  savePrefs();
  stopScheduler();
}
export function updateTypePrefs(type, changes) {
  if (!_prefs.types[type]) return;
  _prefs.types[type] = { ..._prefs.types[type], ...changes };
  if (changes.time !== undefined) _prefs.types[type].lastSent = '';
  savePrefs();
}
export function updateDeadlinePrefs(type, changes) {
  if (!_prefs.deadlines?.[type]) return;
  _prefs.deadlines[type] = { ..._prefs.deadlines[type], ...changes };
  savePrefs();
}

// ── Render UI ─────────────────────────────────────────────────
export function renderNotifSettings() {
  const container = document.getElementById('notif-settings-body');
  if (!container) return;

  const prefs  = getPrefs();
  const status = getPermissionStatus();

  const TYPE_ICONS = {
    habit: 'icon-habit', journal: 'icon-journal', mood: 'icon-emosi',
    todo: 'icon-todo', streak: 'icon-fire', refleksi: 'icon-refleksi',
  };

  let banner = '';
  if (status === 'unsupported') {
    banner = `<div class="notif-banner notif-banner-warn"><svg width="15" height="15"><use href="#icon-warning"/></svg>Browser kamu tidak mendukung notifikasi.</div>`;
  } else if (status === 'denied') {
    banner = `<div class="notif-banner notif-banner-warn"><svg width="15" height="15"><use href="#icon-warning"/></svg>Izin ditolak. Aktifkan manual di pengaturan browser (klik ikon kunci di address bar).</div>`;
  } else if (status === 'default') {
    banner = `<div class="notif-banner notif-banner-info"><svg width="15" height="15"><use href="#icon-info"/></svg>Aktifkan notifikasi untuk mendapat pengingat harian &amp; alert deadline otomatis.</div>`;
  } else if (status === 'granted' && !prefs.enabled) {
    banner = `<div class="notif-banner notif-banner-info"><svg width="15" height="15"><use href="#icon-info"/></svg>Izin diberikan. Aktifkan master switch untuk mulai menerima pengingat.</div>`;
  }

  const masterChecked  = prefs.enabled && status === 'granted' ? 'checked' : '';
  const masterDisabled = (status === 'unsupported' || status === 'denied') ? 'disabled' : '';
  const rowDisabled    = !prefs.enabled || status !== 'granted';

  // Deadline rows
  const DL_META = {
    todo:   { icon: 'icon-todo',   label: 'Deadline To-Do',        desc: 'Notifikasi otomatis untuk tugas yang belum selesai mendekati atau melewati deadline.' },
    target: { icon: 'icon-target', label: 'Deadline Target Hidup', desc: 'Notifikasi otomatis untuk target on-progress yang mendekati atau melewati deadline.' },
  };
  const deadlineRows = Object.entries(prefs.deadlines).map(([key, d]) => {
    const meta    = DL_META[key];
    const checked = d.enabled ? 'checked' : '';
    const dis     = rowDisabled ? 'disabled' : '';
    return `
      <div class="notif-row">
        <div class="notif-row-left">
          <svg width="16" height="16" class="notif-row-icon"><use href="#${meta.icon}"/></svg>
          <div>
            <div class="notif-row-label">${meta.label}</div>
            <div class="notif-row-desc">${meta.desc}</div>
          </div>
        </div>
        <div class="notif-row-right">
          <div class="notif-advance-wrap" style="${rowDisabled ? 'opacity:.4' : ''}">
            <span class="notif-advance-label">H&minus;</span>
            <input type="number" class="notif-advance-input" min="0" max="30"
              value="${d.advanceDays}" ${dis}
              data-action="updateNotifAdvance(this,'${key}')"
              aria-label="Ingatkan berapa hari sebelum deadline">
            <span class="notif-advance-label">hari</span>
          </div>
          <label class="notif-toggle-wrap" aria-label="Aktifkan ${meta.label}">
            <input type="checkbox" ${checked} ${dis}
              data-action="toggleNotifDeadline(this,'${key}')">
            <span class="notif-toggle-slider"></span>
          </label>
        </div>
      </div>`;
  }).join('');

  // Routine rows
  const routineRows = Object.entries(prefs.types).map(([key, t]) => {
    const icon    = TYPE_ICONS[key] || 'icon-info';
    const checked = t.enabled ? 'checked' : '';
    const dis     = rowDisabled ? 'disabled' : '';
    return `
      <div class="notif-row">
        <div class="notif-row-left">
          <svg width="16" height="16" class="notif-row-icon"><use href="#${icon}"/></svg>
          <div>
            <div class="notif-row-label">${t.label}</div>
            <div class="notif-row-desc">${t.body}</div>
          </div>
        </div>
        <div class="notif-row-right">
          <input type="time" class="notif-time-input" value="${t.time}" ${dis}
            data-action="updateNotifTime(this,'${key}')"
            aria-label="Waktu pengingat ${t.label}">
          <label class="notif-toggle-wrap" aria-label="Aktifkan ${t.label}">
            <input type="checkbox" ${checked} ${dis}
              data-action="toggleNotifType(this,'${key}')">
            <span class="notif-toggle-slider"></span>
          </label>
          <button class="btn btn-sm notif-test-btn" title="Kirim notifikasi test sekarang"
            ${rowDisabled ? 'disabled' : ''}
            data-action="testNotif('${key}')">
            <svg width="12" height="12"><use href="#icon-lightning"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    ${banner}
    <div class="notif-master-row">
      <div>
        <div style="font-size:14px;font-weight:700;color:var(--text)">Aktifkan Notifikasi</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Pengingat harian &amp; alert deadline otomatis</div>
      </div>
      <label class="notif-toggle-wrap" aria-label="Master switch notifikasi">
        <input type="checkbox" id="notif-master-toggle" ${masterChecked} ${masterDisabled}
          data-action="toggleMasterNotif(this)">
        <span class="notif-toggle-slider"></span>
      </label>
    </div>
    <div class="notif-section-title"><svg width="13" height="13"><use href="#icon-calendar"/></svg> Alert Deadline</div>
    <div class="notif-section-desc">Notifikasi otomatis saat tugas atau target mendekati atau melewati deadline. Dikirim maksimal 1&times; per item per hari.</div>
    ${deadlineRows}
    <div class="notif-section-title" style="margin-top:20px"><svg width="13" height="13"><use href="#icon-cycle"/></svg> Pengingat Rutin Harian</div>
    <div class="notif-section-desc">Pengingat terjadwal untuk mengisi catatan harian.</div>
    ${routineRows}
  `;
}
