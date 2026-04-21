/**
 * ============================================================
 * Trackify — Personal Dashboard  |  script.js
 * ============================================================
 *
 * ARSITEKTUR SINGKAT
 * ------------------
 *  1. Storage Layer   → StorageManager  : baca/tulis localStorage
 *  2. State Layer     → state           : satu objek data utama aplikasi
 *  3. Persistence     → saveState()     : serialisasi state ke localStorage
 *  4. Render Layer    → render*()       : update DOM dari state
 *  5. Event Handlers  → add*(), save*() : mutasi state lalu render + save
 *  6. UI Helpers      → showToast(),
 *                       showPage(), dll : navigasi & feedback
 *
 * ALUR DATA
 * ---------
 *  User action → handler → mutasi state → saveState() → render DOM
 *  Halaman dimuat → StorageManager.load() → hydrate state → render DOM
 *
 * STORAGE
 * -------
 *  localStorage key tunggal: "Trackify_v1"
 *  Seluruh state di-serialize sebagai JSON.
 *  Versi key memudahkan migrasi data di masa depan.
 *
 * KONVENSI NAMA
 * -------------
 *  render*()  → hanya baca state, update DOM
 *  save*()    → validasi input, mutasi state, panggil saveState + render
 *  update*()  → hitung ulang tampilan agregat (dashboard, stats)
 * ============================================================
 */

'use strict';

import {
  loginWithGoogle, logoutUser, onAuthChange, getCurrentUser,
  addItem, getItems, updateItem, deleteItem, deleteAllItems,
  getStreak, updateStreak, achieveMilestone
} from './firebase.js';

// ============================================================
// AUTH HANDLER
// ============================================================

// Pantau perubahan auth state
onAuthChange((user) => {
  if (user) {
    // Mobile topbar
    document.getElementById("auth-logged-out").style.display = "none";
    document.getElementById("auth-logged-in").style.display = "block";
    const avatarSrc = user.photoURL || "";
    const avatarEl = document.getElementById("user-avatar");
    const avatarMenuEl = document.getElementById("user-avatar-menu");
    if (avatarEl) avatarEl.src = avatarSrc;
    if (avatarMenuEl) avatarMenuEl.src = avatarSrc;
    document.getElementById("user-name").textContent = user.displayName;

    // Desktop dropdown
    const dropOut = document.getElementById("auth-drop-loggedout");
    const dropIn  = document.getElementById("auth-drop-loggedin");
    if (dropOut) dropOut.style.display = "none";
    if (dropIn)  dropIn.style.display = "block";
    // Tampilkan avatar di trigger button
    const triggerIcon = document.getElementById("auth-trigger-icon");
    if (triggerIcon) {
      if (avatarSrc) {
        triggerIcon.innerHTML = `<img src="${avatarSrc}" width="28" height="28" style="border-radius:50%;display:block">`;
        triggerIcon.style.background = 'transparent';
        triggerIcon.style.border = '1.5px solid var(--accent)';
      } else {
        triggerIcon.textContent = (user.displayName || 'U')[0].toUpperCase();
      }
    }
    const triggerLabel = document.getElementById("auth-trigger-label");
    if (triggerLabel) triggerLabel.textContent = (user.displayName || '').split(' ')[0];
    // Isi data di dropdown
    const dropAvatar = document.getElementById("auth-drop-avatar");
    const dropName   = document.getElementById("auth-drop-name");
    const dropEmail  = document.getElementById("auth-drop-email");
    if (dropAvatar) dropAvatar.src = avatarSrc;
    if (dropName)   dropName.textContent = user.displayName || '';
    if (dropEmail)  dropEmail.textContent = user.email || '';

    loadAllData();
  } else {
    // Mobile topbar
    document.getElementById("auth-logged-out").style.display = "block";
    document.getElementById("auth-logged-in").style.display = "none";
    // Desktop dropdown — reset ke state belum login
    const dropOut = document.getElementById("auth-drop-loggedout");
    const dropIn  = document.getElementById("auth-drop-loggedin");
    if (dropOut) dropOut.style.display = "block";
    if (dropIn)  dropIn.style.display = "none";
    const triggerIcon = document.getElementById("auth-trigger-icon");
    if (triggerIcon) { triggerIcon.innerHTML = '<svg width="16" height="16" style="color:var(--accent)"><use href="#logo-trackify"/></svg>'; triggerIcon.style.background = 'var(--accent-glow)'; }
    const triggerLabel = document.getElementById("auth-trigger-label");
    if (triggerLabel) triggerLabel.textContent = 'Akun';
  }
});

// ============================================================
// FIREBASE DATA LOADERS
// ============================================================

async function loadAllData() {
  if (!getCurrentUser()) return;
  try {
    const [
      journals, reflections, sosials, emosis, menstruasis,
      learnings, targets, todos, habits, streakData
    ] = await Promise.all([
      getItems('journals'),
      getItems('reflections'),
      getItems('communications'),
      getItems('emotions'),
      getItems('menstrual', 'startDate'),
      getItems('learnings'),
      getItems('targets', 'createdAt'),
      getItems('todos', 'createdAt'),
      getItems('habits', 'createdAt'),
      getStreak()
    ]);

    state.journals     = journals.map(j => ({ date: j.date, did: j.activity || j.did || '', good: j.positive || j.good || '', improve: j.improve || '', mood: j.mood || '' }));
    state.reflections  = reflections.map(r => ({ date: r.date, grow: r.growth || r.grow || '', lack: r.lacking || r.lack || '', plan: r.plan || '' }));
    state.sosials      = sosials.map(s => ({ date: s.date, who: s.person || s.who || '', topic: s.topic || '', improve: s.improvement || s.improve || '', note: s.notes || s.note || '' }));
    state.emosis       = emosis.map(e => ({ date: e.date, mood: e.mood || '', cause: e.cause || '', solution: e.solution || '' }));
    state.menstruasis  = menstruasis.map(m => ({ start: m.startDate || m.start, end: m.endDate || m.end, flow: m.intensity || m.flow || 'sedang', symptoms: m.symptoms || [], mood: m.mood || '', note: m.notes || m.note || '' }));
    state.learnings    = learnings.map(l => ({ date: l.date, subject: l.topic || l.subject || '', what: l.content || l.what || '', insight: l.insight || '', duration: l.duration || '', cat: l.category || l.cat || '' }));
    state.targets      = targets.map(t => ({ _id: t.id, name: t.name || '', deadline: t.deadline || '', status: t.status || 'on_progress' }));
    state.todos        = todos.map((t, i) => ({ id: t.id || i + 1, text: t.text || '', done: !!t.done, createdAt: t.createdAt, dueDate: t.date || '', dueTime: t.time || '' }));
    state.habits       = habits.map(h => h.name);

    state.habitData = {};
    habits.forEach((h, hi) => {
      (h.dates || []).forEach(date => {
        state.habitData[`${date}_${hi}`] = 'done';
      });
    });

    state.streak      = streakData.currentStreak || 0;
    state.lastCheckin = streakData.lastCheckIn || '';
    state.checkins    = (streakData.checkIns || []).map(date => ({ date, streak: streakData.currentStreak }));

    renderAll();
    updateDashboard();
    showToast('✓ Data berhasil dimuat dari cloud');
  } catch (e) {
    console.error('[Trackify] loadAllData error:', e);
    showToast('⚠ Gagal memuat data: ' + e.message);
  }
}

function clearAllDisplays() {
  state = createDefaultState();
  habitRows = [today()];
  selectedCat = '';
  renderAll();
  updateDashboard();
}

/*1. STORAGE LAYER*/

const StorageManager = {
  KEY: 'Trackify_v1',

  /** Simpan state ke localStorage. */
  save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[Trackify] Gagal menyimpan ke localStorage:', err);
      showToast('⚠ Penyimpanan gagal — ruang penuh atau mode private');
    }
  },

  /** Muat state dari localStorage; kembalikan null jika kosong/rusak. */
  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[Trackify] Data tersimpan rusak, direset:', err);
      return null;
    }
  },

  /** Hapus semua data (untuk fitur reset). */
  clear() {
    try { localStorage.removeItem(this.KEY); }
    catch (err) { console.warn('[Trackify] Gagal menghapus data:', err); }
  }
};

/* ============================================================
   2. STATE — nilai default (dipakai saat localStorage kosong)
   ============================================================ */

function createDefaultState() {
  return {
    theme: 'dark',

    // Target Hidup: [{ name, deadline (YYYY-MM-DD), status: 'on_progress'|'done' }]
    targets: [],

    // Habit Tracker
    habits:    [],   // ['Bangun Pagi', ...]
    habitData: {},   // { 'YYYY-MM-DD_idx': 'done'|'skip'|'none' }
    habitRows: [],   // ['YYYY-MM-DD', ...]

    // To-Do List: [{ id, text, done, createdAt }]
    todos: [],

    // Daily Journal: [{ date, did, good, improve, mood }]
    journals:     [],
    selectedMood: '',

    // Refleksi: [{ date, grow, lack, plan }]
    reflections: [],

    // Sosial: [{ date, who, topic, improve, note }]
    sosials: [],

    // Emosi: [{ date, mood, cause, solution }]
    emosis: [],

    // Menstruasi: [{ start, end, flow, symptoms:[], mood, note }]
    menstruasis: [],

    // Reward / Streak
    streak:      0,
    lastCheckin: '',   // YYYY-MM-DD
    checkins:    [],   // [{ date, streak }]

    // Learning Tracker: [{ date, subject, what, insight, duration, cat }]
    learnings:   [],
    selectedCat: '',

    // ID counter untuk todo (agar index tidak bergeser saat delete)
    _nextId: 1
  };
}

let state     = createDefaultState();
let habitRows = [];
let selectedCat = '';

/** Sinkronkan habitRows ke state lalu simpan ke localStorage. */
function saveState() {
  state.habitRows = habitRows;
  StorageManager.save(state);
}

// ============================================================
// FIREBASE SYNC — fire-and-forget, tidak blokir UI
// ============================================================

/**
 * Sync penuh semua koleksi ke Firestore.
 * Dipanggil setiap kali ada mutasi data.
 * Strategi: deleteAllItems lalu addItem ulang (simple, stateless).
 */
async function syncToFirebase() {
  if (!getCurrentUser()) return;
  try {
    // Sync tiap koleksi secara paralel
    await Promise.all([
      syncCollection('journals', state.journals.map(j => ({
        date: j.date, activity: j.did, positive: j.good,
        improve: j.improve, mood: j.mood
      }))),
      syncCollection('reflections', state.reflections.map(r => ({
        date: r.date, growth: r.grow, lacking: r.lack, plan: r.plan
      }))),
      syncCollection('communications', state.sosials.map(s => ({
        date: s.date, person: s.who, topic: s.topic,
        improvement: s.improve, notes: s.note
      }))),
      syncCollection('emotions', state.emosis.map(e => ({
        date: e.date, mood: e.mood, cause: e.cause, solution: e.solution
      }))),
      syncCollection('menstrual', state.menstruasis.map(m => ({
        startDate: m.start, endDate: m.end, intensity: m.flow,
        symptoms: m.symptoms, mood: m.mood, notes: m.note
      }))),
      syncCollection('learnings', state.learnings.map(l => ({
        date: l.date, topic: l.subject, content: l.what,
        insight: l.insight, duration: l.duration, category: l.cat
      }))),
      syncCollection('targets', state.targets.map(t => ({
        name: t.name, deadline: t.deadline, status: t.status
      }))),
      syncCollection('todos', state.todos.map(t => ({
        text: t.text, done: t.done, date: t.dueDate, time: t.dueTime
      }))),
      syncHabits(),
      updateStreak({
        currentStreak: state.streak,
        lastCheckIn: state.lastCheckin,
        checkIns: state.checkins.map(c => c.date)
      })
    ]);
  } catch (e) {
    console.warn('[Trackify] syncToFirebase error:', e.message);
  }
}

async function syncCollection(colName, items) {
  await deleteAllItems(colName);
  await Promise.all(items.map(item => addItem(colName, item)));
}

async function syncHabits() {
  await deleteAllItems('habits');
  await Promise.all(state.habits.map((name, hi) => {
    const dates = Object.entries(state.habitData)
      .filter(([k, v]) => k.endsWith(`_${hi}`) && v === 'done')
      .map(([k]) => k.split('_')[0]);
    return addItem('habits', { name, dates });
  }));
}

/** saveState + sync ke Firebase */
function saveAndSync() {
  saveState();
  syncToFirebase(); // intentionally not awaited
}

/* ============================================================
   3. INISIALISASI
   ============================================================ */

function initApp() {
  // Selalu mulai dari state kosong — data diambil dari Firebase saat login
  state = createDefaultState();

  // Pulihkan tema dari localStorage agar tidak flicker saat refresh
  try {
    const savedTheme = localStorage.getItem('Trackify_theme');
    if (savedTheme === 'light' || savedTheme === 'dark') state.theme = savedTheme;
  } catch(e) {}

  habitRows   = [today()];
  selectedCat = '';

  applyTheme(state.theme);
  setDefaultFormDates();
  renderAll();
  renderDashboardDate();
}

function setDefaultFormDates() {
  const t = today();
  ['j-date','r-date','s-date','e-date','habit-date','l-date','todo-date','mens-start','mens-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = t;
  });
}

function renderAll() {
  renderTargets();
  renderHabit();
  renderTodo();
  renderJournals();
  renderReflections();
  renderSosials();
  renderEmosi();
  renderMenstruasi();
  renderLearnings();
  updateDashboard();
  updateRewardPage();
  updateLearningStats();
  setTimeout(registerAllLongPress, 60);
}

/* ============================================================
   4. TEMA
   ============================================================ */

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const iconSvg = theme === 'dark'
    ? '<svg width="16" height="16"><use href="#icon-moon"/></svg>'
    : '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
  const label = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
  document.querySelectorAll('#theme-btn, #theme-btn-mobile').forEach(btn => {
    if (!btn) return;
    btn.innerHTML = iconSvg;
    btn.setAttribute('aria-label', `Ganti ke ${label}`);
  });
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem('Trackify_theme', next); } catch(e) {}
  showToast(next === 'dark' ? 'Mode Gelap aktif' : 'Mode Terang aktif');
}

/* ============================================================
   5. NAVIGASI
   ============================================================ */

const VALID_PAGES = new Set([
  'dashboard','target','habit','todo','reward','learning',
  'journal','reflection','sosial','emosi','menstruasi','settings'
]);

// ── History API: back button mobile tidak keluar dari app ──
let _historyReady = false;
function _initHistory() {
  if (_historyReady) return;
  _historyReady = true;
  // Ganti state awal agar ada entry sebelum halaman pertama
  history.replaceState({ page: 'dashboard' }, '', location.href);
  window.addEventListener('popstate', (e) => {
    const id = e.state?.page || 'dashboard';
    // Panggil showPage tanpa push history (pakai flag internal)
    _showPageInternal(id);
    // Selalu push state baru agar back berikutnya tetap di dalam app
    history.pushState({ page: id }, '', location.href);
  });
}

function _showPageInternal(id) {
  if (!VALID_PAGES.has(id)) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-current', 'false');
  });
  const pageEl = document.getElementById('page-' + id);
  if (!pageEl) return;
  pageEl.classList.add('active');

  // Sync active nav btn
  document.querySelectorAll('.nav-btn').forEach(b => {
    const action = b.getAttribute('data-action') || '';
    if (action.includes(`'${id}'`)) {
      b.classList.add('active');
      b.setAttribute('aria-current', 'page');
    }
  });

  if (id === 'dashboard') updateDashboard();
  if (id === 'reward')    updateRewardPage();
  if (id === 'learning')  updateLearningStats();
  if (id === 'menstruasi') renderMenstruasi();
  if (id === 'settings')  updateSettingsPage();

  closeSidebar();
  const title = pageEl.querySelector('.page-title');
  if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
}

function showPage(id, btn) {
  if (!VALID_PAGES.has(id)) {
    console.warn('[Trackify] ID halaman tidak valid:', id);
    return;
  }
  _initHistory();

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-current', 'false');
  });

  const pageEl = document.getElementById('page-' + id);
  if (!pageEl) { console.error('[Trackify] Elemen tidak ditemukan: page-' + id); return; }
  pageEl.classList.add('active');

  if (btn) { btn.classList.add('active'); btn.setAttribute('aria-current', 'page'); }

  if (id === 'dashboard') updateDashboard();
  if (id === 'reward')    updateRewardPage();
  if (id === 'learning')  updateLearningStats();
  if (id === 'menstruasi') renderMenstruasi();
  if (id === 'settings')  updateSettingsPage();

  // Push ke history agar back button tidak keluar dari app
  history.pushState({ page: id }, '', location.href);

  closeSidebar();

  // Pindahkan fokus ke judul halaman (aksesibilitas)
  const title = pageEl.querySelector('.page-title');
  if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
}

// Quick action shortcuts
// navBtn index sesuai urutan .nav-btn di HTML:
// [0]=Dashboard [1]=Target [2]=Habit [3]=Todo [4]=Reward [5]=Learning
// [6]=Journal [7]=Reflection [8]=Menstruasi [9]=Sosial [10]=Emosi [11]=Settings
function quickJournal()  { showPage('journal',  navBtn(6));  focusEl('j-did'); }
function quickHabit()    { showPage('habit',     navBtn(2)); }
function quickTodo()     { showPage('todo',       navBtn(3));  focusEl('todo-input'); }
function quickLearning() { showPage('learning',   navBtn(5));  focusEl('l-subject'); }
function quickEmosi()    { showPage('emosi',      navBtn(10)); }
function quickTarget()   { showPage('target',     navBtn(1));  focusEl('t-name'); }

function navBtn(n) { return document.querySelectorAll('.nav-btn')[n] || null; }
function focusEl(id, ms = 300) { setTimeout(() => document.getElementById(id)?.focus(), ms); }

// Sidebar mobile
function toggleSidebar() {
  const open = document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('hamburger')?.classList.toggle('open', open);
  document.getElementById('overlay')?.classList.toggle('show', open);
  document.getElementById('hamburger')?.setAttribute('aria-expanded', String(!!open));
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
  document.getElementById('hamburger')?.setAttribute('aria-expanded', 'false');
}

// Toast
let _toastTimer = null;
function showToast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  if (!t) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  t.textContent = msg;
  t.setAttribute('aria-live', 'polite');
  t.classList.add('show');
  _toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// Modal reward
function showRewardModal(iconId, _unused, title, desc) {
  const bg = document.getElementById('reward-modal-bg');
  if (!bg) return;
  const rmIcon = document.getElementById('rm-icon');
  if (rmIcon) rmIcon.innerHTML = `<svg width="52" height="52" style="color:#fbbf24"><use href="#${iconId}"/></svg>`;
  const rmConf = document.getElementById('rm-confetti');
  if (rmConf) rmConf.innerHTML = `
    <svg width="22" height="22" style="color:#a78bfa"><use href="#ms-icon-7"/></svg>
    <svg width="28" height="28" style="color:#fbbf24"><use href="#${iconId}"/></svg>
    <svg width="22" height="22" style="color:#4ade80"><use href="#ms-icon-7"/></svg>`;
  setText('rm-title', title); setText('rm-desc', desc);
  bg.classList.add('show');
  bg.setAttribute('aria-hidden', 'false');
  bg.querySelector('.reward-modal')?.focus?.();
}
function closeRewardModal() {
  const bg = document.getElementById('reward-modal-bg');
  bg?.classList.remove('show');
  bg?.setAttribute('aria-hidden', 'true');
}

// Konfirmasi hapus
function konfirmasiHapus(label = 'item ini') {
  return window.confirm(`Hapus ${label}?\nTindakan ini tidak dapat dibatalkan.`);
}

/* ============================================================
   6. UTILITAS
   ============================================================ */

function today()        { return new Date().toISOString().slice(0, 10); }
function getWeekStart() {
  const d = new Date(); d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function clearFields(...ids) { ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }

function emptyHTML(iconKey, msg) {
  const EMPTY_ICONS = {
    '🎯': '<svg width="28" height="28"><use href="#icon-target"/></svg>',
    '🔥': '<svg width="28" height="28"><use href="#icon-fire"/></svg>',
    '✅': '<svg width="28" height="28"><use href="#icon-check-circle"/></svg>',
    '📝': '<svg width="28" height="28"><use href="#icon-journal"/></svg>',
    '📖': '<svg width="28" height="28"><use href="#icon-learning"/></svg>',
    '🔮': '<svg width="28" height="28"><use href="#icon-refleksi"/></svg>',
    '💬': '<svg width="28" height="28"><use href="#icon-komunikasi"/></svg>',
    '🌊': '<svg width="28" height="28"><use href="#icon-emosi"/></svg>',
    '📅': '<svg width="28" height="28"><use href="#icon-calendar"/></svg>',
    '📚': '<svg width="28" height="28"><use href="#icon-learning"/></svg>',
    '🗒️': '<svg width="28" height="28"><use href="#icon-todo"/></svg>',
    '🔍': '<svg width="28" height="28"><use href="#icon-search"/></svg>',
    '😶': '<svg width="28" height="28"><use href="#icon-emosi"/></svg>',
  };
  const iconSvg = EMPTY_ICONS[iconKey] || `<svg width="28" height="28"><use href="#icon-info"/></svg>`;
  return `<div class="empty" role="status" aria-label="${msg}">
    <div class="empty-icon" aria-hidden="true">${iconSvg}</div>${msg}</div>`;
}

/**
 * Escape karakter HTML — WAJIB digunakan sebelum memasukkan
 * input pengguna ke innerHTML untuk mencegah XSS.
 */
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   7. DASHBOARD
   ============================================================ */

function renderDashboardDate() {
  const el = document.getElementById('dash-date-sub');
  if (el) el.textContent = new Date().toLocaleDateString('id-ID',
    { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}

function updateDashboard() {
  // Metrik ringkasan
  const doneTgt = state.targets.filter(t => t.status === 'done').length;
  setText('d-target', `${doneTgt}/${state.targets.length}`);

  const totalChecks = habitRows.length * state.habits.length;
  const doneChecks  = Object.values(state.habitData).filter(v => v === 'done').length;
  setText('d-habit', totalChecks ? `${Math.round(doneChecks / totalChecks * 100)}%` : '0%');

  const doneTodos = state.todos.filter(t => t.done).length;
  setText('d-todo', `${doneTodos}/${state.todos.length}`);

  // Target terkini
  const tl = document.getElementById('d-target-list');
  if (tl) {
    tl.innerHTML = !state.targets.length
      ? emptyHTML('🎯', 'Belum ada target.')
      : state.targets.slice(0, 3).map(t => `
          <div class="quick-stat">
            <div class="quick-dot" style="background:${t.status==='done'?'var(--green)':'var(--amber)'}" aria-hidden="true"></div>
            <span style="flex:1;font-size:13px">${escapeHTML(t.name)}</span>
            ${t.status==='done'
              ? '<span class="badge badge-green">Selesai</span>'
              : '<span class="badge badge-amber">Berjalan</span>'}
          </div>`).join('');
  }

  // Habit hari ini
  const hp = document.getElementById('d-habit-progress');
  if (hp) {
    if (!state.habits.length) { hp.innerHTML = emptyHTML('🔥', 'Belum ada habit.'); }
    else {
      const td = today();
      hp.innerHTML = state.habits.map((h, hi) => {
        const v = state.habitData[`${td}_${hi}`] || 'none';
        const badge = v === 'done'
          ? '<span class="badge badge-green" aria-label="Selesai">✓</span>'
          : v === 'skip'
          ? '<span class="badge badge-red" aria-label="Dilewati">✕</span>'
          : '<span class="badge" style="background:var(--bg4);color:var(--text3)" aria-label="Belum">—</span>';
        return `<div class="quick-stat"><span style="flex:1;font-size:13px">${escapeHTML(h)}</span>${badge}</div>`;
      }).join('');
    }
  }

  // Preview to-do
  const tp = document.getElementById('d-todo-preview');
  if (tp) {
    if (!state.todos.length) { tp.innerHTML = emptyHTML('✅', 'Belum ada tugas.'); }
    else {
      tp.innerHTML = state.todos.slice(0, 5).map(t => `
        <div class="todo-item" role="listitem">
          <button class="todo-check ${t.done?'done':''}"
                  data-action="toggleTodoById(${t.id})"
                  aria-label="${t.done?'Tandai belum selesai':'Tandai selesai'}: ${escapeHTML(t.text)}"
                  aria-pressed="${t.done}">
            ${t.done ? '✓' : ''}
          </button>
          <span class="todo-text ${t.done?'done':''}">${escapeHTML(t.text)}</span>
        </div>`).join('');
    }
  }

  // Jurnal hari ini
  const jp = document.getElementById('d-journal-preview');
  if (jp) {
    const tj = state.journals.find(j => j.date === today());
    if (tj) {
      jp.innerHTML = `<div>
        <div style="margin-bottom:8px">${tj.mood ? `<span class="badge badge-purple">${escapeHTML(tj.mood)}</span>` : ''}</div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6">
          ${escapeHTML(tj.did.slice(0,140))}${tj.did.length>140?'…':''}
        </div></div>`;
    } else {
      jp.innerHTML = emptyHTML('📝', 'Belum ada jurnal hari ini.');
    }
  }

  const qaSub = document.getElementById('qa-streak-sub');
  if (qaSub) qaSub.textContent = `${state.streak} hari streak`;
}

/* ============================================================
   8. TARGET HIDUP
   ============================================================ */

function renderTargets() {
  const tb = document.getElementById('target-table');
  if (!tb) return;
  if (!state.targets.length) {
    tb.innerHTML = `<tr><td colspan="5">${emptyHTML('🎯','Belum ada target.')}</td></tr>`; return;
  }
  tb.innerHTML = state.targets.map((t, i) => {
    const dl   = t.deadline ? new Date(t.deadline + 'T00:00:00') : null;
    const days = dl ? Math.ceil((dl - new Date()) / 86_400_000) : null;
    const prog = t.status === 'done' ? 100
               : days !== null ? Math.max(0, Math.min(85, 100 - days * 2)) : 30;
    const isDone = t.status === 'done';
    return `<tr>
      <td data-label="Target" style="font-weight:600">${escapeHTML(t.name)}</td>
      <td data-label="Deadline" style="color:var(--text3);font-size:12px"><time datetime="${t.deadline||''}">${t.deadline||'—'}</time></td>
      <td data-label="Status">
        <button class="status-toggle-btn ${isDone ? 'status-done' : 'status-progress'}"
                data-action="toggleTargetStatus(${i})"
                aria-label="Klik untuk ubah status: ${isDone ? 'Selesai' : 'On Progress'}"
                title="Klik untuk ubah status">
          ${isDone ? '✓ Selesai' : 'Berjalan'}
        </button>
      </td>
      <td data-label="Progress" style="min-width:120px">
        <div class="prog-label" aria-hidden="true"><span>${prog}%</span></div>
        <div class="prog-bar" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"
             aria-label="Progress ${prog}%">
          <div class="prog-fill" style="width:${prog}%"></div>
        </div>
      </td>
      <td data-label=""><div style="display:flex;gap:6px;align-items:center;">
        <button class="edit-btn" data-action="editTarget(${i})" aria-label="Edit target: ${escapeHTML(t.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="del-btn" data-action="delTarget(${i})" aria-label="Hapus target: ${escapeHTML(t.name)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div></td>
    </tr>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function addTarget() {
  const name     = document.getElementById('t-name')?.value.trim();
  const deadline = document.getElementById('t-deadline')?.value;
  const status   = document.getElementById('t-status')?.value;
  if (!name) { showToast('⚠ Nama target tidak boleh kosong'); document.getElementById('t-name')?.focus(); return; }
  state.targets.push({ name, deadline, status: status || 'on_progress' });
  clearFields('t-name','t-deadline');
  saveAndSync(); renderTargets(); updateDashboard();
  showToast('✓ Target berhasil ditambahkan');
}

function delTarget(i) {
  if (!state.targets[i]) return;
  if (!konfirmasiHapus(`target "${state.targets[i].name}"`)) return;
  state.targets.splice(i, 1);
  saveAndSync(); renderTargets(); updateDashboard();
  showToast('Target dihapus');
}

function toggleTargetStatus(i) {
  if (!state.targets[i]) return;
  state.targets[i].status = state.targets[i].status === 'done' ? 'on_progress' : 'done';
  saveAndSync(); renderTargets(); updateDashboard();
  showToast(state.targets[i].status === 'done' ? 'Target ditandai selesai' : 'Target kembali on progress');
}

/* ============================================================
   9. HABIT TRACKER
   ============================================================ */

function renderHabit() {
  const head = document.getElementById('habit-head');
  const body = document.getElementById('habit-body');
  if (!head || !body) return;

  if (!state.habits.length) {
    head.innerHTML = '';
    body.innerHTML = `<tr><td>${emptyHTML('🔥','Belum ada habit. Tambahkan di atas!')}</td></tr>`; return;
  }

  const TRASH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

  head.innerHTML = '<tr><th scope="col">Tanggal</th>' +
    state.habits.map((h, hi) => `
      <th scope="col" class="habit-col-th" style="text-align:center;min-width:80px;cursor:pointer;user-select:none"
          data-action="toggleHabitDelBtn(this, ${hi})"
          aria-label="Klik/tahan untuk hapus habit: ${escapeHTML(h)}">
        <span class="habit-col-name">${escapeHTML(h)}</span>
        <button class="habit-col-del" data-action="delHabit(${hi})"
                aria-label="Hapus habit: ${escapeHTML(h)}">${TRASH}</button>
      </th>`).join('') +
    '<th scope="col"><span class="sr-only">Hapus baris</span></th></tr>';

  // Daftarkan long-press pada th habit (mobile)
  setTimeout(() => {
    document.querySelectorAll('.habit-col-th').forEach((th, hi) => {
      registerLongPress(th, () => [
        { icon: 'trash', label: `Hapus "${state.habits[hi]}"`, danger: true,
          action: () => delHabit(hi) }
      ]);
    });
  }, 60);

  body.innerHTML = habitRows.map((row, ri) => {
    const cells = state.habits.map((h, hi) => {
      const val   = state.habitData[`${row}_${hi}`] || 'none';
      const label = val==='done' ? 'Selesai' : val==='skip' ? 'Dilewati' : 'Belum';
      return `<td class="check-cell">
        <button class="habit-check ${val==='done'?'done':val==='skip'?'skip':''}"
                data-action="toggleHabit('${row}',${hi})"
                aria-label="${escapeHTML(h)} pada ${row}: ${label}"
                aria-pressed="${val==='done'}">
          ${val==='done'?'✓':val==='skip'?'✕':''}
        </button>
      </td>`;
    }).join('');
    return `<tr>
      <td style="white-space:nowrap;color:var(--text3);font-size:12px;font-weight:600">
        <time datetime="${row}">${row}</time>
      </td>${cells}
      <td><button class="del-btn" data-action="delHabitRow(${ri})" aria-label="Hapus baris ${row}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td>
    </tr>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function toggleHabit(row, hi) {
  const key = `${row}_${hi}`;
  const cur = state.habitData[key] || 'none';
  state.habitData[key] = cur==='none' ? 'done' : cur==='done' ? 'skip' : 'none';
  saveAndSync(); renderHabit(); updateDashboard();
}

function addHabit() {
  const v = document.getElementById('new-habit')?.value.trim();
  if (!v) { showToast('⚠ Nama habit tidak boleh kosong'); document.getElementById('new-habit')?.focus(); return; }
  if (state.habits.includes(v)) { showToast('⚠ Habit ini sudah ada'); return; }
  state.habits.push(v); clearFields('new-habit');
  saveAndSync(); renderHabit(); showToast('✓ Habit ditambahkan');
}

function addHabitRow() {
  const d = document.getElementById('habit-date')?.value || today();
  if (habitRows.includes(d)) { showToast('ℹ Tanggal tersebut sudah ada'); return; }
  habitRows.push(d); habitRows.sort();
  saveAndSync(); renderHabit(); showToast(`✓ Tanggal ${d} ditambahkan`);
}

function delHabitRow(i) {
  if (i < 0 || i >= habitRows.length) return;
  if (!konfirmasiHapus(`baris tanggal ${habitRows[i]}`)) return;
  habitRows.splice(i, 1); saveAndSync(); renderHabit();
}

function delHabit(i) {
  if (!state.habits[i]) return;
  clearTimeout(_habitDelTimer);
  if (!konfirmasiHapus(`habit "${state.habits[i]}"`)) return;
  state.habits.splice(i, 1); saveAndSync(); renderHabit(); showToast('Habit dihapus');
}

/** Tap nama kolom habit → toggle tampil/sembunyi ikon sampah
 *  Mobile: auto-hide setelah 2 detik jika tidak diklik
 */
let _habitDelTimer = null;
function toggleHabitDelBtn(thEl, hi) {
  const isActive = thEl.classList.contains('habit-col-active');
  // Tutup semua dulu, bersihkan timer
  document.querySelectorAll('.habit-col-th').forEach(t => t.classList.remove('habit-col-active'));
  clearTimeout(_habitDelTimer);

  if (!isActive) {
    thEl.classList.add('habit-col-active');
    // Mobile only: auto-hide setelah 2 detik
    if (isMobile()) {
      _habitDelTimer = setTimeout(() => {
        thEl.classList.remove('habit-col-active');
      }, 2000);
    }
  }
}

/* ============================================================
   10. TO-DO LIST
   ============================================================ */

function renderTodo() {
  const el = document.getElementById('todo-list');
  if (!el) return;
  if (!state.todos.length) { el.innerHTML = emptyHTML('🗒️','Belum ada tugas. Tambahkan sekarang!'); return; }
  el.setAttribute('role', 'list');
  el.innerHTML = state.todos.map(t => {
    let dueMeta = '';
    if (t.dueDate || t.dueTime) {
      const isOverdue = t.dueDate && !t.done && t.dueDate < today();
      dueMeta = `<span class="todo-due ${isOverdue ? 'overdue' : ''}" aria-label="Jatuh tempo">
        ${t.dueDate ? t.dueDate : ''}${t.dueDate && t.dueTime ? ' · ' : ''}${t.dueTime ? t.dueTime : ''}
      </span>`;
    }
    return `<div class="todo-item" role="listitem">
      <button class="todo-check ${t.done?'done':''}"
              data-action="toggleTodoById(${t.id})"
              aria-label="${t.done?'Tandai belum selesai':'Tandai selesai'}: ${escapeHTML(t.text)}"
              aria-pressed="${t.done}">
        ${t.done ? '✓' : ''}
      </button>
      <div class="todo-content">
        <span class="todo-text ${t.done?'done':''}">${escapeHTML(t.text)}</span>
        ${dueMeta}
      </div>
      <button class="edit-btn" data-action="editTodo(${t.id})" aria-label="Edit tugas: ${escapeHTML(t.text)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="del-btn" data-action="delTodoById(${t.id})"
              aria-label="Hapus tugas: ${escapeHTML(t.text)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
    </div>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function toggleTodoById(id) {
  // eslint-disable-next-line eqeqeq
  const todo = state.todos.find(t => t.id == id);
  if (!todo) return;
  todo.done = !todo.done;
  saveAndSync(); renderTodo(); updateDashboard();
}

function delTodoById(id) {
  // eslint-disable-next-line eqeqeq
  const idx = state.todos.findIndex(t => t.id == id);
  if (idx === -1) return;
  if (!konfirmasiHapus(`tugas "${state.todos[idx].text}"`)) return;
  state.todos.splice(idx, 1);
  saveAndSync(); renderTodo(); updateDashboard(); showToast('Tugas dihapus');
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const v = input?.value.trim();
  if (!v) { showToast('⚠ Teks tugas tidak boleh kosong'); input?.focus(); return; }
  const dateVal = document.getElementById('todo-date')?.value || '';
  const timeVal = document.getElementById('todo-time')?.value || '';
  state.todos.push({
    id: state._nextId++,
    text: v,
    done: false,
    createdAt: new Date().toISOString(),
    dueDate: dateVal,
    dueTime: timeVal
  });
  if (input) input.value = '';
  saveAndSync(); renderTodo(); updateDashboard(); showToast('✓ Tugas ditambahkan');
}

// Alias untuk kompatibilitas event handler di HTML yang menggunakan index
function toggleTodo(i) { if (state.todos[i]) toggleTodoById(state.todos[i].id); }
function delTodo(i)    { if (state.todos[i]) delTodoById(state.todos[i].id); }

/* ============================================================
   11. DAILY JOURNAL
   ============================================================ */

function selectMood(btn, mood) {
  document.querySelectorAll('#j-mood-row .mood-btn').forEach(b => {
    b.classList.remove('sel'); b.setAttribute('aria-pressed','false');
  });
  btn.classList.add('sel'); btn.setAttribute('aria-pressed','true');
  state.selectedMood = mood;
}

function saveJournal() {
  const date    = document.getElementById('j-date')?.value    || today();
  const did     = document.getElementById('j-did')?.value.trim();
  const good    = document.getElementById('j-good')?.value.trim()    || '';
  const improve = document.getElementById('j-improve')?.value.trim() || '';
  const mood    = document.getElementById('j-mood')?.value || '';
  if (!did) { showToast('⚠ Isi kolom Aktivitas terlebih dahulu'); document.getElementById('j-did')?.focus(); return; }
  state.journals.unshift({ date, did, good, improve, mood });
  clearFields('j-did','j-good','j-improve');
  const moodEl = document.getElementById('j-mood');
  if (moodEl) moodEl.value = '';
  state.selectedMood = '';
  saveAndSync(); renderJournals(); updateDashboard(); updateRewardPage();
  showToast('✓ Jurnal tersimpan');
}

function renderJournals() {
  const el = document.getElementById('journal-list');
  if (!el) return;
  if (!state.journals.length) { el.innerHTML = emptyHTML('📖','Belum ada jurnal.'); return; }
  el.innerHTML = state.journals.map((j, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date"><svg width="11" height="11" style="vertical-align:-1px;margin-right:4px;color:var(--text3)"><use href="#icon-calendar"/></svg><time datetime="${j.date}">${j.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          ${j.mood ? `<span class="badge badge-purple">${escapeHTML(j.mood)}</span>` : ''}
          <button class="edit-btn" data-action="editJournal(${i})" aria-label="Edit jurnal ${j.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="del-btn" data-action="delJournal(${i})" aria-label="Hapus jurnal ${j.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6">
        ${escapeHTML(j.did.slice(0,150))}${j.did.length>150?'…':''}
      </div>
    </article>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delJournal(i) {
  if (!konfirmasiHapus('jurnal ini')) return;
  state.journals.splice(i, 1); saveAndSync(); renderJournals(); updateDashboard(); updateRewardPage();
  showToast('Jurnal dihapus');
}

/* ============================================================
   12. REFLEKSI
   ============================================================ */

function saveReflection() {
  const date = document.getElementById('r-date')?.value  || today();
  const grow = document.getElementById('r-grow')?.value.trim();
  const lack = document.getElementById('r-lack')?.value.trim() || '';
  const plan = document.getElementById('r-plan')?.value.trim() || '';
  if (!grow) { showToast('⚠ Isi kolom "Yang sudah berkembang"'); document.getElementById('r-grow')?.focus(); return; }
  state.reflections.unshift({ date, grow, lack, plan });
  clearFields('r-grow','r-lack','r-plan');
  saveAndSync(); renderReflections(); showToast('✓ Refleksi tersimpan');
}

function renderReflections() {
  const el = document.getElementById('reflection-list');
  if (!el) return;
  if (!state.reflections.length) { el.innerHTML = emptyHTML('🔮','Belum ada refleksi.'); return; }
  el.innerHTML = state.reflections.map((r, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date"><svg width="11" height="11" style="vertical-align:-1px;margin-right:4px;color:var(--text3)"><use href="#icon-calendar"/></svg><time datetime="${r.date}">${r.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="edit-btn" data-action="editReflection(${i})" aria-label="Edit refleksi ${r.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="del-btn" data-action="delReflection(${i})" aria-label="Hapus refleksi ${r.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>
      <div style="font-size:13px;line-height:1.7">
        <span style="color:var(--green);font-weight:600">Berkembang: </span><span style="color:var(--text2)">${escapeHTML(r.grow)}</span><br>
        ${r.lack ? `<span style="color:var(--amber);font-weight:600">Masih kurang: </span><span style="color:var(--text2)">${escapeHTML(r.lack)}</span><br>` : ''}
        ${r.plan ? `<span style="color:var(--blue);font-weight:600">Rencana: </span><span style="color:var(--text2)">${escapeHTML(r.plan)}</span>` : ''}
      </div>
    </article>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delReflection(i) {
  if (!konfirmasiHapus('refleksi ini')) return;
  state.reflections.splice(i, 1); saveAndSync(); renderReflections();
  showToast('Refleksi dihapus');
}

/* ============================================================
   13. KOMUNIKASI & SOSIAL
   ============================================================ */

function saveSosial() {
  const date    = document.getElementById('s-date')?.value    || today();
  const who     = document.getElementById('s-who')?.value.trim();
  const topic   = document.getElementById('s-topic')?.value.trim()   || '';
  const improve = document.getElementById('s-improve')?.value.trim() || '';
  const note    = document.getElementById('s-note')?.value.trim()    || '';
  if (!who) { showToast('⚠ Isi nama orang yang diajak bicara'); document.getElementById('s-who')?.focus(); return; }
  state.sosials.unshift({ date, who, topic, improve, note });
  clearFields('s-who','s-topic','s-improve','s-note');
  saveAndSync(); renderSosials(); showToast('✓ Catatan sosial tersimpan');
}

function renderSosials() {
  const el = document.getElementById('sosial-list');
  if (!el) return;
  if (!state.sosials.length) { el.innerHTML = emptyHTML('💬','Belum ada catatan.'); return; }
  el.innerHTML = state.sosials.map((s, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date"><svg width="11" height="11" style="vertical-align:-1px;margin-right:4px;color:var(--text3)"><use href="#icon-calendar"/></svg><time datetime="${s.date}">${s.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-blue">${escapeHTML(s.who)}</span>
          <button class="edit-btn" data-action="editSosial(${i})" aria-label="Edit catatan sosial ${s.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="del-btn" data-action="delSosial(${i})" aria-label="Hapus catatan sosial ${s.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>
      ${s.topic   ? `<div style="font-size:13px;color:var(--text2);margin-top:4px">${escapeHTML(s.topic)}</div>` : ''}
      ${s.improve ? `<div style="font-size:13px;margin-top:4px"><span style="color:var(--blue);font-weight:600">Perbaikan: </span>${escapeHTML(s.improve)}</div>` : ''}
    </article>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delSosial(i) {
  if (!konfirmasiHapus('catatan sosial ini')) return;
  state.sosials.splice(i, 1); saveAndSync(); renderSosials();
  showToast('Catatan sosial dihapus');
}

/* ============================================================
   14. TRACKER EMOSI
   ============================================================ */

const MOOD_COLOR = {
  Bahagia:'badge-green', Semangat:'badge-blue', Biasa:'badge-purple',
  Lelah:'badge-amber',   Cemas:'badge-amber',   Sedih:'badge-amber',
  Marah:'badge-red',     Stres:'badge-red'
};

function addEmosi() {
  const date     = document.getElementById('e-date')?.value     || today();
  const mood     = document.getElementById('e-mood')?.value;
  const cause    = document.getElementById('e-cause')?.value.trim()    || '';
  const solution = document.getElementById('e-solution')?.value.trim() || '';
  if (!mood) { showToast('⚠ Pilih mood terlebih dahulu'); return; }
  state.emosis.unshift({ date, mood, cause, solution });
  clearFields('e-cause','e-solution');
  saveAndSync(); renderEmosi(); showToast('✓ Emosi dicatat');
}

function renderEmosi() {
  const tb = document.getElementById('emosi-table');
  if (!tb) return;
  if (!state.emosis.length) { tb.innerHTML = `<tr><td colspan="5">${emptyHTML('🌊','Belum ada data emosi.')}</td></tr>`; return; }
  tb.innerHTML = state.emosis.map((e, i) => `
    <tr>
      <td data-label="Tanggal" style="white-space:nowrap;font-size:12px;color:var(--text3)"><time datetime="${e.date}">${e.date}</time></td>
      <td data-label="Mood"><span class="badge ${MOOD_COLOR[e.mood]||'badge-purple'}">${escapeHTML(e.mood)}</span></td>
      <td data-label="Penyebab" style="font-size:12px;color:var(--text2)">${escapeHTML(e.cause)||'—'}</td>
      <td data-label="Solusi" style="font-size:12px;color:var(--text2)">${escapeHTML(e.solution)||'—'}</td>
      <td data-label=""><div style="display:flex;gap:6px;">
        <button class="edit-btn" data-action="editEmosi(${i})" aria-label="Edit catatan emosi ${e.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        <button class="del-btn" data-action="delEmosi(${i})" aria-label="Hapus catatan emosi ${e.date}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
      </div></td>
    </tr>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delEmosi(i) {
  if (!konfirmasiHapus('catatan emosi ini')) return;
  state.emosis.splice(i, 1); saveAndSync(); renderEmosi(); showToast('Catatan emosi dihapus');
}

/* ============================================================
   15. REWARD & STREAK
   ============================================================ */

function claimDailyStreak() {
  const t = today();
  if (state.lastCheckin === t) { showToast('✓ Sudah check-in hari ini!'); return; }

  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  const yStr = yest.toISOString().slice(0, 10);
  state.streak = (state.lastCheckin === yStr) ? state.streak + 1 : 1;
  state.lastCheckin = t;
  state.checkins.unshift({ date: t, streak: state.streak });
  saveAndSync(); updateRewardPage(); updateDashboard();

  const MILESTONES = {
    1:  ['ms-icon-1','Perjalanan Dimulai!',   'Selamat melakukan check-in pertamamu!'],
    3:  ['ms-icon-3','3 Hari Berturut!',      'Kamu berhasil menjaga konsistensi 3 hari!'],
    7:  ['ms-icon-7','Consistency Starter!', 'LUAR BIASA! 7 hari berturut-turut!'],
    14: ['ms-icon-14','Two-Week Warrior!',     '14 hari konsisten! Badge sudah milikmu!'],
    30: ['ms-icon-30','ULTIMATE ACHIEVER!','WOW! 30 HARI BERTURUT-TURUT!']
  };
  const s = state.streak;
  if (MILESTONES[s] && (s > 1 || state.checkins.length === 1)) {
    const [icon, title, desc] = MILESTONES[s];
    showRewardModal(icon, null, title, desc);
  } else {
    showToast(`Check-in berhasil! Streak: ${s} hari`);
  }
}

function updateRewardPage() {
  const s = state.streak;
  setText('streak-count', s);

  const MSGS = [
    [30,'ULTIMATE ACHIEVER!','Kamu adalah inspirasi! Pertahankan!'],
    [14,'Two-Week Warrior!','Tinggal 16 hari lagi untuk Ultimate Achiever'],
    [7, 'Consistency Starter unlocked!','Tinggal 23 hari lagi untuk reward BESAR'],
    [3, '3 hari! On fire!','Tinggal 4 hari lagi untuk badge pertama'],
    [1, 'Hari pertama! Mulai yang baik','Lanjutkan besok untuk membangun momentum'],
    [0, 'Mulai streak-mu hari ini!','Check habit & jurnal untuk membangun streak']
  ];
  const [,msgT,msgS] = MSGS.find(([min]) => s >= min) || MSGS[MSGS.length - 1];
  setText('streak-msg', msgT); setText('streak-sub', msgS);

  const p7  = document.getElementById('prog-7');
  const p30 = document.getElementById('prog-30');
  if (p7)  p7.style.width  = `${Math.min(100, s/7*100)}%`;
  if (p30) p30.style.width = `${Math.min(100, s/30*100)}%`;
  setText('days-7',  `${Math.min(s,7)} / 7 hari`);
  setText('days-30', `${Math.min(s,30)} / 30 hari`);

  if (s >= 7)  document.getElementById('reward-7-card')?.classList.add('unlocked');
  if (s >= 30) document.getElementById('reward-30-card')?.classList.add('unlocked');

  const unlockMs = (id, ok) => {
    if (!ok) return;
    document.getElementById(`ms-${id}`)?.classList.add('earned');
    const st = document.getElementById(`ms-${id}-status`);
    if (st) st.innerHTML = '<span class="badge badge-green" aria-label="Sudah diraih"><svg width="11" height="11" style="vertical-align:-1px;margin-right:3px"><use href="#icon-check-circle"/></svg>Earned</span>';
  };
  unlockMs('1',       state.checkins.length >= 1);
  unlockMs('3',       s >= 3);
  unlockMs('7',       s >= 7);
  unlockMs('14',      s >= 14);
  unlockMs('30',      s >= 30);
  unlockMs('learn',   state.learnings.length >= 10);
  unlockMs('journal', state.journals.length  >= 7);

  const ch = document.getElementById('checkin-history');
  if (ch) {
    ch.innerHTML = !state.checkins.length
      ? emptyHTML('📅','Belum ada check-in.')
      : state.checkins.slice(0, 10).map(c => `
          <div class="quick-stat">
            <svg width="18" height="18" style="color:#f97316;vertical-align:-3px"><use href="#icon-fire"/></svg>
            <span style="flex:1;font-size:13px"><time datetime="${c.date}">${c.date}</time></span>
            <span class="badge badge-amber">Streak: ${c.streak} hari</span>
          </div>`).join('');
  }

  const qaSub = document.getElementById('qa-streak-sub');
  if (qaSub) qaSub.textContent = `${s} hari streak`;
}

/* ============================================================
   16. LEARNING TRACKER
   ============================================================ */

function selectCat(btn, cat) {
  document.querySelectorAll('#cat-chips .cat-chip').forEach(b => {
    b.classList.remove('sel'); b.setAttribute('aria-pressed','false');
  });
  btn.classList.add('sel'); btn.setAttribute('aria-pressed','true');
  selectedCat = cat; state.selectedCat = cat;
}

function saveLearning() {
  const date     = document.getElementById('l-date')?.value     || today();
  const subject  = document.getElementById('l-subject')?.value.trim();
  const what     = document.getElementById('l-what')?.value.trim();
  const insight  = document.getElementById('l-insight')?.value.trim()  || '';
  const duration = document.getElementById('l-duration')?.value || '';

  if (!subject) { showToast('⚠ Isi kolom Topik terlebih dahulu'); document.getElementById('l-subject')?.focus(); return; }
  if (!what)    { showToast('⚠ Isi kolom Materi terlebih dahulu'); document.getElementById('l-what')?.focus(); return; }
  if (duration && (isNaN(Number(duration)) || Number(duration) <= 0)) {
    showToast('⚠ Durasi harus berupa angka positif'); document.getElementById('l-duration')?.focus(); return;
  }

  state.learnings.unshift({ date, subject, what, insight, duration, cat: selectedCat });
  clearFields('l-subject','l-what','l-insight','l-duration');
  document.querySelectorAll('#cat-chips .cat-chip').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed','false'); });
  selectedCat = ''; state.selectedCat = '';
  saveAndSync(); renderLearnings(); updateLearningStats(); updateRewardPage();
  showToast('Sesi belajar tersimpan!');
}

function renderLearnings() {
  const el = document.getElementById('learning-list');
  if (!el) return;
  if (!state.learnings.length) { el.innerHTML = emptyHTML('📖','Belum ada sesi belajar.'); return; }
  el.innerHTML = state.learnings.map((l, i) => `
    <article class="learning-entry">
      <div class="learning-entry-header">
        <span class="learning-date"><svg width="11" height="11" style="vertical-align:-1px;margin-right:4px;color:var(--text3)"><use href="#icon-calendar"/></svg><time datetime="${l.date}">${l.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          ${l.cat      ? `<span class="learning-tag">${escapeHTML(l.cat)}</span>` : ''}
          ${l.duration ? `<span class="badge badge-blue"><svg width="11" height="11" style="vertical-align:-1px;margin-right:3px"><use href="#icon-calendar"/></svg>${escapeHTML(l.duration)} mnt</span>` : ''}
          <button class="edit-btn" data-action="editLearning(${i})" aria-label="Edit sesi: ${escapeHTML(l.subject)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="del-btn" data-action="delLearning(${i})" aria-label="Hapus sesi: ${escapeHTML(l.subject)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>
        </div>
      </div>
      <div class="learning-subject">${escapeHTML(l.subject)}</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-top:4px">
        ${escapeHTML(l.what.slice(0,180))}${l.what.length>180?'…':''}
      </div>
      ${l.insight ? `<div class="learning-insight">💡 ${escapeHTML(l.insight.slice(0,160))}${l.insight.length>160?'…':''}</div>` : ''}
    </article>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delLearning(i) {
  if (!state.learnings[i]) return;
  if (!konfirmasiHapus(`sesi belajar "${state.learnings[i].subject}"`)) return;
  state.learnings.splice(i, 1);
  saveAndSync(); renderLearnings(); updateLearningStats(); showToast('Sesi belajar dihapus');
}

function updateLearningStats() {
  setText('learn-total', state.learnings.length);
  const ws = getWeekStart();
  setText('learn-this-week', state.learnings.filter(l => l.date >= ws).length);
  setText('learn-insights',  state.learnings.filter(l => l.insight?.trim()).length);
}

/* ============================================================
   16b. MENSTRUASI TRACKER
   ============================================================ */

/** Utilitas tanggal */
function diffDays(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDateID(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${+d} ${bulan[+m - 1]} ${y}`;
}

const SYMPTOM_LABEL = {
  kram: 'Kram', sakit_kepala: 'Sakit Kepala', kembung: 'Kembung',
  mood_swing: 'Mood Swing', nyeri_punggung: 'Nyeri Punggung', lelah: 'Lelah',
  mual: 'Mual', jerawat: 'Jerawat', payudara_nyeri: 'Payudara Nyeri',
  insomnia: 'Insomnia', nafsu_makan: 'Nafsu Makan Naik', sembelit: 'Sembelit/Diare'
};
const MOOD_LABEL = {
  baik: 'Baik', biasa: 'Biasa', sensitif: 'Sensitif',
  mudah_marah: 'Mudah Marah', cemas: 'Cemas', depresi: 'Depresi'
};
const FLOW_LABEL = { ringan: '◆ Ringan', sedang: '◆◆ Sedang', deras: '◆◆◆ Deras' };

let _selectedSymptoms = [];

function toggleSymptom(btn) {
  const sym = btn.dataset.sym;
  if (_selectedSymptoms.includes(sym)) {
    _selectedSymptoms = _selectedSymptoms.filter(s => s !== sym);
    btn.classList.remove('active');
  } else {
    _selectedSymptoms.push(sym);
    btn.classList.add('active');
  }
}

function addMenstruasi() {
  const start = document.getElementById('mens-start')?.value;
  const end   = document.getElementById('mens-end')?.value;
  const flow  = document.getElementById('mens-flow')?.value || 'sedang';
  const mood  = document.getElementById('mens-mood')?.value || '';
  const note  = document.getElementById('mens-note')?.value?.trim() || '';

  if (!start) { showToast('⚠ Isi tanggal mulai haid'); return; }
  if (end && end < start) { showToast('⚠ Tanggal selesai tidak boleh sebelum mulai'); return; }

  state.menstruasis.unshift({ start, end, flow, symptoms: [..._selectedSymptoms], mood, note });
  saveAndSync();

  // Reset form
  document.getElementById('mens-end').value  = '';
  document.getElementById('mens-mood').value = '';
  document.getElementById('mens-note').value = '';
  document.getElementById('mens-flow').value = 'sedang';
  _selectedSymptoms = [];
  document.querySelectorAll('.symptom-tag.active').forEach(b => b.classList.remove('active'));

  renderMenstruasi();
  showToast('Siklus berhasil disimpan!');
}

function delMenstruasi(i) {
  if (!konfirmasiHapus('siklus ini')) return;
  state.menstruasis.splice(i, 1);
  saveAndSync(); renderMenstruasi();
  showToast('🗑️ Siklus dihapus');
}

function getMensStats() {
  const data = [...state.menstruasis].sort((a, b) => a.start > b.start ? 1 : -1);
  if (!data.length) return null;

  // Durasi haid rata-rata
  const durations = data.filter(d => d.end).map(d => diffDays(d.start, d.end) + 1);
  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 5;

  // Panjang siklus rata-rata (jarak antar menstruasi)
  const cycles = [];
  for (let i = 1; i < data.length; i++) {
    cycles.push(diffDays(data[i-1].start, data[i].start));
  }
  const avgCycle = cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : 28;

  const last = data[data.length - 1];
  const lastStart = last.start;
  const nextPeriod = addDays(lastStart, avgCycle);
  const ovulasi = addDays(lastStart, avgCycle - 14);

  // Fase saat ini
  const todayStr = today();
  const dayInCycle = diffDays(lastStart, todayStr) + 1;
  let phase = '—';
  if (dayInCycle >= 1 && dayInCycle <= avgDuration) phase = `🩸 Menstruasi (hari ke-${dayInCycle})`;
  else if (dayInCycle <= 7) phase = '🌱 Folikular Awal';
  else if (dayInCycle <= avgCycle - 14) phase = 'Folikular';
  else if (dayInCycle >= avgCycle - 16 && dayInCycle <= avgCycle - 12) phase = 'Ovulasi';
  else if (dayInCycle < avgCycle) phase = '🌙 Luteal';
  else phase = '⏳ Menjelang Haid';

  return { last: lastStart, avgCycle, avgDuration, nextPeriod, ovulasi, dayInCycle, phase };
}

function renderMenstruasi() {
  const stats = getMensStats();
  const data  = state.menstruasis;

  // Summary cards
  setText('mens-last-period',  stats ? fmtDateID(stats.last) : '—');
  setText('mens-cycle-avg',    stats ? `${stats.avgCycle} hari` : '—');
  setText('mens-next-ovulasi', stats ? fmtDateID(stats.ovulasi) : '—');

  // Prediction box
  setText('mens-next-period',    stats ? fmtDateID(stats.nextPeriod) : '—');
  setText('mens-current-phase',  stats ? stats.phase : '—');
  setText('mens-cycle-day',      stats ? `Hari ke-${Math.max(1, stats.dayInCycle)}` : '—');
  setText('mens-duration-avg',   stats ? `${stats.avgDuration} hari` : '— hari');

  // Tabel riwayat
  const tbody = document.getElementById('mens-table');
  if (tbody) {
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">Belum ada data siklus</td></tr>`;
    } else {
      tbody.innerHTML = data.map((d, i) => {
        const dur = d.end ? (diffDays(d.start, d.end) + 1) + ' hari' : '—';
        const prevIdx = [...state.menstruasis].sort((a,b) => a.start>b.start?1:-1).findIndex(x => x.start === d.start);
        const sorted  = [...state.menstruasis].sort((a,b) => a.start>b.start?1:-1);
        const cycleLen = prevIdx > 0 ? diffDays(sorted[prevIdx-1].start, sorted[prevIdx].start) + ' hr' : '—';
        const syms = d.symptoms?.map(s => SYMPTOM_LABEL[s] || s).join(', ') || '—';
        return `<tr>
          <td data-label="Mulai">${fmtDateID(d.start)}</td>
          <td data-label="Selesai">${d.end ? fmtDateID(d.end) : '—'}</td>
          <td data-label="Durasi">${dur}</td>
          <td data-label="Siklus">${cycleLen}</td>
          <td data-label="Aliran">${FLOW_LABEL[d.flow] || d.flow}</td>
          <td data-label="Gejala" style="font-size:11px;max-width:180px">${escapeHTML(syms)}</td>
          <td data-label="Mood">${d.mood ? MOOD_LABEL[d.mood] || d.mood : '—'}</td>
          <td data-label=""><button class="del-btn btn-danger" data-action="delMenstruasi(${i})" aria-label="Hapus siklus ini"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button></td>
        </tr>`;
      }).join('');
    }
  }

  // Kalender siklus 3 bulan
  renderMensCalendar(stats);

  // Analisis gejala
  const symsCount = {};
  data.forEach(d => (d.symptoms || []).forEach(s => { symsCount[s] = (symsCount[s]||0)+1; }));
  const symEl = document.getElementById('mens-symptom-analysis');
  if (symEl) {
    if (!Object.keys(symsCount).length) {
      symEl.innerHTML = '<span style="color:var(--text3);font-size:13px">Belum ada data gejala</span>';
    } else {
      symEl.innerHTML = Object.entries(symsCount)
        .sort((a,b)=>b[1]-a[1])
        .map(([s,c]) => `<div class="symptom-badge">${SYMPTOM_LABEL[s]||s} <span class="sym-count">${c}×</span></div>`)
        .join('');
    }
  }

  updateSettingsCountMens();
}

function renderMensCalendar(stats) {
  const el = document.getElementById('mens-calendar');
  if (!el) return;
  if (!stats) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;padding:8px">Tambah data siklus untuk melihat kalender.</p>'; return; }

  const todayStr = today();
  const sorted   = [...state.menstruasis].sort((a,b)=>a.start>b.start?1:-1);

  // Buat set tanggal haid dan prediksi
  const periodDays = new Set();
  const predictDays = new Set();
  const ovulasiDays = new Set();

  sorted.forEach(d => {
    const dur = d.end ? diffDays(d.start, d.end)+1 : (stats.avgDuration||5);
    for (let i=0; i<dur; i++) periodDays.add(addDays(d.start, i));
  });

  // Prediksi 2 siklus ke depan
  for (let c=1; c<=2; c++) {
    const predStart = addDays(stats.last, stats.avgCycle * c);
    for (let i=0; i<stats.avgDuration; i++) predictDays.add(addDays(predStart, i));
    ovulasiDays.add(addDays(predStart, -(14)));
  }
  // Ovulasi siklus ini
  ovulasiDays.add(stats.ovulasi);

  // Render 3 bulan: bulan lalu, ini, depan
  const now = new Date(todayStr);
  let html = '<div style="display:flex;gap:16px;flex-wrap:wrap">';
  for (let mo = -1; mo <= 1; mo++) {
    const d = new Date(now.getFullYear(), now.getMonth() + mo, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthName = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][month];
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun

    html += `<div class="mens-cal-month">
      <div class="mens-cal-title">${monthName} ${year}</div>
      <div class="mens-cal-grid">
        ${['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d=>`<div class="mens-cal-dow">${d}</div>`).join('')}
        ${Array(firstDay).fill('<div></div>').join('')}`;

    for (let day=1; day<=daysInMonth; day++) {
      const ds = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      let cls = 'mens-cal-day';
      if (ds === todayStr)       cls += ' cal-today';
      if (periodDays.has(ds))    cls += ' cal-period';
      if (predictDays.has(ds))   cls += ' cal-predict';
      if (ovulasiDays.has(ds))   cls += ' cal-ovulasi';
      html += `<div class="${cls}" title="${ds}">${day}</div>`;
    }
    html += `</div></div>`;
  }
  html += `</div>
  <div class="mens-cal-legend">
    <span><span class="legend-dot" style="background:#ec4899"></span> Menstruasi</span>
    <span><span class="legend-dot" style="background:rgba(236,72,153,.3)"></span> Prediksi</span>
    <span><span class="legend-dot" style="background:#a855f7"></span> Ovulasi</span>
    <span><span class="legend-dot" style="background:var(--accent)"></span> Hari Ini</span>
  </div>`;

  el.innerHTML = html;
}

function updateSettingsCountMens() {
  const el = document.getElementById('settings-count-menstruasi');
  if (el) el.textContent = `${state.menstruasis.length} siklus tersimpan`;
}

/* ============================================================
   17. RESET DATA
   ============================================================ */

/**
 * Reset semua data ke kondisi awal.
 * Minta konfirmasi dua kali karena tidak dapat dibatalkan.
 */
function resetAllData() {
  if (!window.confirm('⚠️ PERINGATAN: Seluruh data akan dihapus permanen!\n\nLanjutkan?')) return;
  if (!window.confirm('Yakin? Tindakan ini TIDAK DAPAT DIBATALKAN.')) return;
  const currentTheme = state.theme;
  StorageManager.clear();
  state = createDefaultState(); habitRows = [today()]; selectedCat = '';
  state.theme = currentTheme;
  applyTheme(currentTheme); setDefaultFormDates(); renderAll(); renderDashboardDate();
  showToast('🗑️ Semua data berhasil direset');
}

/* ============================================================
   18. SETTINGS PAGE
   ============================================================ */

function updateSettingsPage() {
  setText('settings-count-target',   `${state.targets.length} target tersimpan`);
  setText('settings-count-habit',    `${state.habits.length} habit tersimpan`);
  setText('settings-count-todo',     `${state.todos.length} tugas tersimpan`);
  setText('settings-count-journal',  `${state.journals.length} jurnal tersimpan`);
  setText('settings-count-reflection', `${state.reflections.length} refleksi tersimpan`);
  setText('settings-count-sosial',   `${state.sosials.length} catatan tersimpan`);
  setText('settings-count-emosi',    `${state.emosis.length} catatan tersimpan`);
  setText('settings-count-menstruasi', `${(state.menstruasis||[]).length} siklus tersimpan`);
  setText('settings-count-learning', `${state.learnings.length} sesi tersimpan`);
  setText('settings-count-streak',   `Streak ${state.streak} hari · ${state.checkins.length} check-in`);
  // Update tombol tema di settings
  const btn = document.getElementById('settings-theme-btn');
  if (btn) btn.textContent = state.theme === 'dark' ? '☀️ Ganti ke Mode Terang' : '🌙 Ganti ke Mode Gelap';
}

function clearSectionData(section) {
  const labels = {
    targets: 'semua target hidup', habits: 'semua habit & data habit',
    todos: 'semua tugas to-do', journals: 'semua jurnal',
    reflections: 'semua refleksi', sosials: 'semua catatan sosial',
    emosis: 'semua catatan emosi', learnings: 'semua sesi belajar',
    menstruasis: 'semua data siklus menstruasi',
    streak: 'data streak & check-in'
  };
  if (!konfirmasiHapus(labels[section] || section)) return;
  if (section === 'habits') {
    state.habits = []; state.habitData = {}; habitRows = [today()];
  } else if (section === 'streak') {
    state.streak = 0; state.lastCheckin = ''; state.checkins = [];
  } else {
    state[section] = [];
  }
  saveAndSync(); renderAll(); updateSettingsPage();
  showToast(`🗑️ Data berhasil dihapus`);
}

/* ============================================================
   19. LONG PRESS CONTEXT MENU (Mobile)
   ============================================================ */

/** Deteksi mobile: layar ≤ 900px */
function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

let _lpTimer = null;
let _ctxMenu = null;
let _ctxOverlay = null;

/** Buat elemen context menu lalu tampilkan di posisi (x, y). */
function showContextMenu(x, y, items) {
  closeContextMenu();

  _ctxOverlay = document.createElement('div');
  _ctxOverlay.className = 'ctx-overlay';
  _ctxOverlay.addEventListener('click', closeContextMenu);
  document.body.appendChild(_ctxOverlay);

  _ctxMenu = document.createElement('div');
  _ctxMenu.className = 'ctx-menu';
  _ctxMenu.setAttribute('role', 'menu');

  const CTX_ICON_MAP = {
    'trash': '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>',
    'edit':  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>',
  };
  items.forEach(({ icon, label, action, danger }) => {
    const btn = document.createElement('button');
    btn.className = 'ctx-menu-item' + (danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    const iconHtml = CTX_ICON_MAP[icon] || (icon ? `<span aria-hidden="true">${icon}</span>` : '');
    btn.innerHTML = `<span aria-hidden="true" style="display:inline-flex;align-items:center">${iconHtml}</span>${label}`;
    btn.addEventListener('click', () => { closeContextMenu(); action(); });
    _ctxMenu.appendChild(btn);
  });

  document.body.appendChild(_ctxMenu);

  // Pastikan menu tidak keluar dari viewport
  const mw = _ctxMenu.offsetWidth || 180;
  const mh = _ctxMenu.offsetHeight || 120;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(x, vw - mw - 12);
  const cy = Math.min(y, vh - mh - 12);
  _ctxMenu.style.left = Math.max(8, cx) + 'px';
  _ctxMenu.style.top  = Math.max(8, cy) + 'px';
}

function closeContextMenu() {
  _ctxMenu?.remove(); _ctxMenu = null;
  _ctxOverlay?.remove(); _ctxOverlay = null;
}

/**
 * Daftarkan long press pada elemen `el`.
 * `getMenuItems(el)` harus mengembalikan array { icon, label, action, danger }.
 */
function registerLongPress(el, getMenuItems) {
  if (!el) return;

  const DURATION = 500; // ms

  const start = (e) => {
    if (!isMobile()) return;
    const touch = e.touches ? e.touches[0] : e;
    const x = touch.clientX;
    const y = touch.clientY;

    el.classList.add('lp-active');
    _lpTimer = setTimeout(() => {
      el.classList.remove('lp-active');
      // Hapus seleksi teks jika ada
      window.getSelection()?.removeAllRanges();
      const items = getMenuItems(el);
      if (items && items.length) showContextMenu(x, y - 10, items);
    }, DURATION);
  };

  const cancel = () => {
    clearTimeout(_lpTimer);
    el.classList.remove('lp-active');
  };

  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('contextmenu', (e) => { if (isMobile()) e.preventDefault(); });
}

/**
 * Inject tombol ⋮ di setiap baris/item yang punya del-btn.
 * Dipanggil setelah setiap render. Di desktop tidak visible (CSS).
 */
function registerAllLongPress() {
  injectRowMenuButtons();
}

function injectRowMenuButtons() {
  // Del-btn sudah visible langsung di mobile via CSS.
  // Fungsi ini tidak perlu inject tombol tambahan.
  // Hanya pastikan habit-col-th punya long-press (dipanggil dari renderHabit).
}

/**
 * makeRowMenuBtn masih ada untuk kompatibilitas, tidak dipakai aktif.
 */
function makeRowMenuBtn(getItems) {
  const btn = document.createElement('button');
  btn.className = 'row-menu-btn';
  btn.style.display = 'none';
  return btn;
}

/* ============================================================
   20. GLOBAL SEARCH
   ============================================================ */

/**
 * Definisi sumber data pencarian.
 * Setiap entry: { page, icon, badge, getItems() → [{ title, meta }] }
 */
function getSearchSources() {
  return [
    {
      page: 'target', icon: 'target', badge: 'Target',
      getItems: () => state.targets.map((t, i) => ({
        title: t.name,
        meta: `${t.deadline || 'Tanpa deadline'} · ${t.status === 'done' ? '✓ Selesai' : '⏳ Berjalan'}`,
        action: () => showPage('target', navBtn(1))
      }))
    },
    {
      page: 'habit', icon: 'habit', badge: 'Habit',
      getItems: () => state.habits.map((h) => ({
        title: h,
        meta: 'Habit harian',
        action: () => showPage('habit', navBtn(2))
      }))
    },
    {
      page: 'todo', icon: 'todo', badge: 'To-Do',
      getItems: () => state.todos.map((t) => ({
        title: t.text,
        meta: `${t.done ? '✓ Selesai' : '○ Belum'} · ${t.createdAt || ''}`,
        action: () => showPage('todo', navBtn(3))
      }))
    },
    {
      page: 'journal', icon: 'journal', badge: 'Jurnal',
      getItems: () => state.journals.map((j) => ({
        title: j.did ? j.did.slice(0, 80) : `Jurnal ${j.date}`,
        meta: `${j.date} · ${j.mood || 'Tanpa mood'}`,
        action: () => showPage('journal', navBtn(6))
      }))
    },
    {
      page: 'reflection', icon: 'refleksi', badge: 'Refleksi',
      getItems: () => state.reflections.map((r) => ({
        title: r.grow ? r.grow.slice(0, 80) : `Refleksi ${r.date}`,
        meta: `${r.date} · ${r.lack ? r.lack.slice(0, 40) : ''}`,
        action: () => showPage('reflection', navBtn(7))
      }))
    },
    {
      page: 'sosial', icon: 'komunikasi', badge: 'Komunikasi',
      getItems: () => state.sosials.map((s) => ({
        title: s.topic || `Dengan ${s.who}`,
        meta: `${s.date} · ${s.who || ''}`,
        action: () => showPage('sosial', navBtn(9))
      }))
    },
    {
      page: 'emosi', icon: 'emosi', badge: 'Emosi',
      getItems: () => state.emosis.map((e) => ({
        title: `${e.mood} — ${e.cause ? e.cause.slice(0, 60) : 'Tanpa keterangan'}`,
        meta: `${e.date} · ${e.solution ? e.solution.slice(0, 40) : ''}`,
        action: () => showPage('emosi', navBtn(10))
      }))
    },
    {
      page: 'learning', icon: 'learning', badge: 'Learning',
      getItems: () => state.learnings.map((l) => ({
        title: l.subject || 'Sesi belajar',
        meta: `${l.date} · ${l.what ? l.what.slice(0, 50) : ''} · ${l.duration ? l.duration + ' menit' : ''}`,
        action: () => showPage('learning', navBtn(5))
      }))
    }
  ];
}

function openSearch() {
  const bg = document.getElementById('search-modal-bg');
  if (!bg) return;
  bg.classList.add('show');
  bg.setAttribute('aria-hidden', 'false');
  setTimeout(() => document.getElementById('search-input')?.focus(), 80);
  // Tampilkan hint awal
  document.getElementById('search-results').innerHTML =
    `<div class="search-empty" id="search-hint">
       <div class="search-empty-icon"><svg width="28" height="28" style="color:var(--text3)"><use href="#icon-search"/></svg></div>
       Ketik untuk mencari di semua menu
     </div>`;
}

function closeSearch() {
  const bg = document.getElementById('search-modal-bg');
  bg?.classList.remove('show');
  bg?.setAttribute('aria-hidden', 'true');
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
}

/**
 * Highlight semua kemunculan `query` dalam `text` (case-insensitive).
 * Mengembalikan HTML string.
 */
function highlightMatch(text, query) {
  if (!query) return escapeHTML(text);
  const safe = escapeHTML(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(re, '<mark>$1</mark>');
}

function runSearch(raw) {
  const q = raw.trim().toLowerCase();
  const container = document.getElementById('search-results');
  if (!container) return;

  if (!q) {
    container.innerHTML =
      `<div class="search-empty">
         <div class="search-empty-icon"><svg width="28" height="28" style="color:var(--text3)"><use href="#icon-search"/></svg></div>
         Ketik untuk mencari di semua menu
       </div>`;
    return;
  }

  const sources = getSearchSources();
  let totalHits = 0;
  let html = '';

  const SEARCH_ICON_MAP = {
    'target':     '<svg width="16" height="16"><use href="#icon-target"/></svg>',
    'habit':      '<svg width="16" height="16"><use href="#icon-habit"/></svg>',
    'todo':       '<svg width="16" height="16"><use href="#icon-todo"/></svg>',
    'journal':    '<svg width="16" height="16"><use href="#icon-journal"/></svg>',
    'refleksi':   '<svg width="16" height="16"><use href="#icon-refleksi"/></svg>',
    'komunikasi': '<svg width="16" height="16"><use href="#icon-komunikasi"/></svg>',
    'emosi':      '<svg width="16" height="16"><use href="#icon-emosi"/></svg>',
    'learning':   '<svg width="16" height="16"><use href="#icon-learning"/></svg>',
  };

  sources.forEach(src => {
    const items = src.getItems().filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.meta.toLowerCase().includes(q)
    );
    if (!items.length) return;
    totalHits += items.length;
    const iconSvg = SEARCH_ICON_MAP[src.icon] || '';

    html += `<div class="search-group-label">${iconSvg} ${src.badge}</div>`;
    items.forEach((item, idx) => {
      // Encode action index untuk onclick
      html += `<button class="search-result-item"
                 data-action="triggerSearchResult('${src.page}', ${idx})"
                 role="listitem">
        <div class="search-result-icon" aria-hidden="true">${iconSvg}</div>
        <div class="search-result-body">
          <div class="search-result-title">${highlightMatch(item.title, raw.trim())}</div>
          <div class="search-result-meta">${highlightMatch(item.meta, raw.trim())}</div>
        </div>
        <div class="search-result-badge">${src.badge}</div>
      </button>`;
    });
  });

  if (!totalHits) {
    container.innerHTML =
      `<div class="search-empty">
         <div class="search-empty-icon"><svg width="28" height="28" style="color:var(--text3)"><use href="#icon-emosi"/></svg></div>
         Tidak ada hasil untuk "<strong>${escapeHTML(raw.trim())}</strong>"
       </div>`;
    return;
  }

  container.innerHTML =
    `<div class="search-count">${totalHits} hasil ditemukan</div>` + html;
}

/**
 * Saat item diklik: navigate ke halaman terkait & tutup modal.
 * `srcIdx` = indeks di getSearchSources() bisa dihitung dari page name.
 */
function triggerSearchResult(page, itemIdx) {
  closeSearch();
  const pageNavMap = {
    target: 1, habit: 2, todo: 3, reward: 4,
    learning: 5, journal: 6, reflection: 7,
    sosial: 9, emosi: 10
  };
  const n = pageNavMap[page];
  showPage(page, n !== undefined ? navBtn(n) : null);
}

/* ============================================================
   21. EDIT MODAL
   ============================================================ */

let _editCtx = null; // { type, index }

function openEditModal(title, bodyHTML, ctx) {
  _editCtx = ctx;
  document.getElementById('edit-modal-title').textContent = title;
  document.getElementById('edit-modal-body').innerHTML = bodyHTML;
  const bg = document.getElementById('edit-modal-bg');
  bg.style.display = 'flex';
  setTimeout(() => bg.querySelector('input,textarea,select')?.focus(), 80);
}

function closeEditModal() {
  document.getElementById('edit-modal-bg').style.display = 'none';
  _editCtx = null;
}

function saveEditModal() {
  if (!_editCtx) return;
  const { type, index, todoId } = _editCtx;
  if (type === 'target')     _saveEditTarget(index);
  else if (type === 'todo')  _saveEditTodo(todoId !== undefined ? todoId : index);
  else if (type === 'journal') _saveEditJournal(index);
  else if (type === 'reflection') _saveEditReflection(index);
  else if (type === 'sosial') _saveEditSosial(index);
  else if (type === 'emosi') _saveEditEmosi(index);
  else if (type === 'learning') _saveEditLearning(index);
}

// ── TARGET ──
function editTarget(i) {
  const t = state.targets[i];
  if (!t) return;
  openEditModal('Edit Target', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Nama Target</label>
    <input id="em-t-name" type="text" value="${escapeHTML(t.name)}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Deadline</label>
    <input id="em-t-deadline" type="date" value="${t.deadline||''}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Status</label>
    <select id="em-t-status" style="width:100%">
      <option value="on_progress" ${t.status==='on_progress'?'selected':''}>On Progress</option>
      <option value="done" ${t.status==='done'?'selected':''}>Selesai</option>
    </select>`, { type: 'target', index: i });
}
function _saveEditTarget(i) {
  const name = document.getElementById('em-t-name')?.value.trim();
  if (!name) { showToast('⚠ Nama target tidak boleh kosong'); return; }
  state.targets[i].name     = name;
  state.targets[i].deadline = document.getElementById('em-t-deadline')?.value || '';
  state.targets[i].status   = document.getElementById('em-t-status')?.value || 'on_progress';
  saveAndSync(); renderTargets(); updateDashboard();
  showToast('✓ Target berhasil diupdate'); closeEditModal();
}

// ── TODO ──
function editTodo(id) {
  // eslint-disable-next-line eqeqeq
  const t = state.todos.find(x => x.id == id);
  if (!t) return;
  openEditModal('Edit Tugas', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Teks Tugas</label>
    <input id="em-td-text" type="text" value="${escapeHTML(t.text)}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-td-date" type="date" value="${t.dueDate||''}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Jam</label>
    <input id="em-td-time" type="time" value="${t.dueTime||''}" style="width:100%">`, { type: 'todo', todoId: id });
}
function _saveEditTodo(todoId) {
  const text = document.getElementById('em-td-text')?.value.trim();
  if (!text) { showToast('⚠ Teks tugas tidak boleh kosong'); return; }
  // eslint-disable-next-line eqeqeq
  const todo = state.todos.find(x => x.id == todoId);
  if (!todo) { showToast('⚠ Tugas tidak ditemukan'); return; }
  todo.text    = text;
  todo.dueDate = document.getElementById('em-td-date')?.value || '';
  todo.dueTime = document.getElementById('em-td-time')?.value || '';
  saveAndSync(); renderTodo(); updateDashboard();
  showToast('✓ Tugas berhasil diupdate'); closeEditModal();
}

// ── JOURNAL ──
function editJournal(i) {
  const j = state.journals[i];
  if (!j) return;
  const moodOpts = ['','Bahagia','Semangat','Biasa','Lelah','Cemas','Sedih','Marah','Stres']
    .map(m => `<option value="${m}" ${j.mood===m?'selected':''}>${m||'— Pilih mood —'}</option>`).join('');
  openEditModal('Edit Jurnal', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-j-date" type="date" value="${j.date}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Aktivitas</label>
    <textarea id="em-j-did" style="width:100%;margin-bottom:12px;min-height:80px">${escapeHTML(j.did)}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Hal Positif</label>
    <textarea id="em-j-good" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(j.good||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Yang Perlu Diperbaiki</label>
    <textarea id="em-j-improve" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(j.improve||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Mood</label>
    <select id="em-j-mood" style="width:100%">${moodOpts}</select>`, { type: 'journal', index: i });
}
function _saveEditJournal(i) {
  const did = document.getElementById('em-j-did')?.value.trim();
  if (!did) { showToast('⚠ Aktivitas tidak boleh kosong'); return; }
  state.journals[i].date    = document.getElementById('em-j-date')?.value || today();
  state.journals[i].did     = did;
  state.journals[i].good    = document.getElementById('em-j-good')?.value.trim() || '';
  state.journals[i].improve = document.getElementById('em-j-improve')?.value.trim() || '';
  state.journals[i].mood    = document.getElementById('em-j-mood')?.value || '';
  saveAndSync(); renderJournals(); updateDashboard();
  showToast('✓ Jurnal berhasil diupdate'); closeEditModal();
}

// ── REFLEKSI ──
function editReflection(i) {
  const r = state.reflections[i];
  if (!r) return;
  openEditModal('Edit Refleksi', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-r-date" type="date" value="${r.date}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Yang Sudah Berkembang</label>
    <textarea id="em-r-grow" style="width:100%;margin-bottom:12px;min-height:70px">${escapeHTML(r.grow)}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Yang Masih Kurang</label>
    <textarea id="em-r-lack" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(r.lack||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Rencana Minggu Depan</label>
    <textarea id="em-r-plan" style="width:100%;min-height:60px">${escapeHTML(r.plan||'')}</textarea>`, { type: 'reflection', index: i });
}
function _saveEditReflection(i) {
  const grow = document.getElementById('em-r-grow')?.value.trim();
  if (!grow) { showToast('⚠ Kolom berkembang tidak boleh kosong'); return; }
  state.reflections[i].date = document.getElementById('em-r-date')?.value || today();
  state.reflections[i].grow = grow;
  state.reflections[i].lack = document.getElementById('em-r-lack')?.value.trim() || '';
  state.reflections[i].plan = document.getElementById('em-r-plan')?.value.trim() || '';
  saveAndSync(); renderReflections();
  showToast('✓ Refleksi berhasil diupdate'); closeEditModal();
}

// ── SOSIAL ──
function editSosial(i) {
  const s = state.sosials[i];
  if (!s) return;
  openEditModal('Edit Catatan Sosial', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-s-date" type="date" value="${s.date}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Ngobrol dengan Siapa</label>
    <input id="em-s-who" type="text" value="${escapeHTML(s.who)}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Topik</label>
    <textarea id="em-s-topic" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(s.topic||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Perbaikan Komunikasi</label>
    <textarea id="em-s-improve" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(s.improve||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Catatan</label>
    <textarea id="em-s-note" style="width:100%;min-height:60px">${escapeHTML(s.note||'')}</textarea>`, { type: 'sosial', index: i });
}
function _saveEditSosial(i) {
  const who = document.getElementById('em-s-who')?.value.trim();
  if (!who) { showToast('⚠ Nama orang tidak boleh kosong'); return; }
  state.sosials[i].date    = document.getElementById('em-s-date')?.value || today();
  state.sosials[i].who     = who;
  state.sosials[i].topic   = document.getElementById('em-s-topic')?.value.trim() || '';
  state.sosials[i].improve = document.getElementById('em-s-improve')?.value.trim() || '';
  state.sosials[i].note    = document.getElementById('em-s-note')?.value.trim() || '';
  saveAndSync(); renderSosials();
  showToast('✓ Catatan sosial diupdate'); closeEditModal();
}

// ── EMOSI ──
function editEmosi(i) {
  const e = state.emosis[i];
  if (!e) return;
  const moods = ['Bahagia','Semangat','Biasa','Lelah','Cemas','Sedih','Marah','Stres']
    .map(m => `<option value="${m}" ${e.mood===m?'selected':''}>${m}</option>`).join('');
  openEditModal('Edit Catatan Emosi', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-e-date" type="date" value="${e.date}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Mood</label>
    <select id="em-e-mood" style="width:100%;margin-bottom:12px">${moods}</select>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Penyebab</label>
    <textarea id="em-e-cause" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(e.cause||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Solusi</label>
    <textarea id="em-e-solution" style="width:100%;min-height:60px">${escapeHTML(e.solution||'')}</textarea>`, { type: 'emosi', index: i });
}
function _saveEditEmosi(i) {
  const mood = document.getElementById('em-e-mood')?.value;
  if (!mood) { showToast('⚠ Pilih mood'); return; }
  state.emosis[i].date     = document.getElementById('em-e-date')?.value || today();
  state.emosis[i].mood     = mood;
  state.emosis[i].cause    = document.getElementById('em-e-cause')?.value.trim() || '';
  state.emosis[i].solution = document.getElementById('em-e-solution')?.value.trim() || '';
  saveAndSync(); renderEmosi();
  showToast('✓ Catatan emosi diupdate'); closeEditModal();
}

// ── LEARNING ──
function editLearning(i) {
  const l = state.learnings[i];
  if (!l) return;
  const cats = ['','Teknologi','Bahasa','Finansial','Kesehatan','Seni','Lainnya']
    .map(c => `<option value="${c}" ${l.cat===c?'selected':''}>${c||'— Pilih kategori —'}</option>`).join('');
  openEditModal('Edit Sesi Belajar', `
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Tanggal</label>
    <input id="em-l-date" type="date" value="${l.date}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Topik</label>
    <input id="em-l-subject" type="text" value="${escapeHTML(l.subject)}" style="width:100%;margin-bottom:12px">
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Kategori</label>
    <select id="em-l-cat" style="width:100%;margin-bottom:12px">${cats}</select>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Materi</label>
    <textarea id="em-l-what" style="width:100%;margin-bottom:12px;min-height:70px">${escapeHTML(l.what)}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Insight</label>
    <textarea id="em-l-insight" style="width:100%;margin-bottom:12px;min-height:60px">${escapeHTML(l.insight||'')}</textarea>
    <label style="display:block;font-size:12px;color:var(--text3);margin-bottom:4px">Durasi (menit)</label>
    <input id="em-l-duration" type="number" min="1" value="${l.duration||''}" style="width:100%">`, { type: 'learning', index: i });
}
function _saveEditLearning(i) {
  const subject = document.getElementById('em-l-subject')?.value.trim();
  const what    = document.getElementById('em-l-what')?.value.trim();
  if (!subject) { showToast('⚠ Topik tidak boleh kosong'); return; }
  if (!what)    { showToast('⚠ Materi tidak boleh kosong'); return; }
  state.learnings[i].date     = document.getElementById('em-l-date')?.value || today();
  state.learnings[i].subject  = subject;
  state.learnings[i].what     = what;
  state.learnings[i].insight  = document.getElementById('em-l-insight')?.value.trim() || '';
  state.learnings[i].duration = document.getElementById('em-l-duration')?.value || '';
  state.learnings[i].cat      = document.getElementById('em-l-cat')?.value || '';
  saveAndSync(); renderLearnings(); updateLearningStats();
  showToast('✓ Sesi belajar diupdate'); closeEditModal();
}

/* ============================================================
   22. EXPORT / IMPORT DATA
   ============================================================ */

function exportData() {
  const backup = {
    version: '1.3.1',
    exportedAt: new Date().toISOString(),
    data: {
      targets:     state.targets,
      habits:      state.habits,
      habitData:   state.habitData,
      habitRows:   habitRows,
      todos:       state.todos,
      journals:    state.journals,
      reflections: state.reflections,
      sosials:     state.sosials,
      emosis:      state.emosis,
      menstruasis: state.menstruasis,
      learnings:   state.learnings,
      streak:      state.streak,
      lastCheckin: state.lastCheckin,
      checkins:    state.checkins,
    }
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href     = url;
  a.download = `trackify-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Data berhasil diekspor!');
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  if (!window.confirm('Import akan menimpa data saat ini.\n\nLanjutkan?')) {
    input.value = ''; return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      const d = backup.data || backup; // support format lama
      if (d.targets)     state.targets     = d.targets;
      if (d.habits)      state.habits      = d.habits;
      if (d.habitData)   state.habitData   = d.habitData;
      if (d.habitRows)   habitRows         = d.habitRows;
      if (d.todos)       state.todos       = d.todos;
      if (d.journals)    state.journals    = d.journals;
      if (d.reflections) state.reflections = d.reflections;
      if (d.sosials)     state.sosials     = d.sosials;
      if (d.emosis)      state.emosis      = d.emosis;
      if (d.menstruasis) state.menstruasis = d.menstruasis;
      if (d.learnings)   state.learnings   = d.learnings;
      if (d.streak !== undefined) state.streak = d.streak;
      if (d.lastCheckin) state.lastCheckin = d.lastCheckin;
      if (d.checkins)    state.checkins    = d.checkins;
      syncToFirebase();
      renderAll(); updateDashboard();
      showToast('✓ Data berhasil diimport!');
    } catch(err) {
      showToast('File tidak valid: ' + err.message);
    }
    input.value = '';
  };
  reader.readAsText(file);
}



document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSidebar(); closeRewardModal(); closeContextMenu(); closeSearch(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
});

/* ============================================================
   19. ENTRY POINT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // Hapus data localStorage lama (migrasi ke Firebase-only)
  try { localStorage.removeItem('Trackify_v1'); } catch(e) {}
  initApp();
});

/* ============================================================
   EXPOSE FUNCTIONS TO WINDOW (required for ES Module scope)
   data-action="..." di HTML tidak bisa akses fungsi module secara
   langsung — semua yang dipanggil dari HTML harus didaftarkan
   ke window secara eksplisit.
   ============================================================ */

// Navigasi
Object.assign(window, {
  showPage, toggleTheme, toggleSidebar, closeSidebar, navBtn,
  quickJournal, quickHabit, quickTodo, quickLearning, quickEmosi, quickTarget,

  // Target
  addTarget, delTarget, toggleTargetStatus,

  // Habit
  addHabit, addHabitRow, delHabit, delHabitRow,
  toggleHabit, toggleHabitDelBtn,

  // Todo
  addTodo, toggleTodo, delTodo, toggleTodoById, delTodoById,

  // Journal
  saveJournal, delJournal, selectMood,

  // Refleksi
  saveReflection, delReflection,

  // Sosial
  saveSosial, delSosial,

  // Emosi
  addEmosi, delEmosi,

  // Menstruasi
  addMenstruasi, delMenstruasi, toggleSymptom,

  // Learning
  saveLearning, delLearning, selectCat,

  // Reward / Streak
  claimDailyStreak, closeRewardModal,

  // Settings & Reset
  resetAllData, clearSectionData, updateSettingsPage,
  exportData, importData,

  // Edit modal
  closeEditModal, saveEditModal,
  editTarget, editTodo, editJournal, editReflection,
  editSosial, editEmosi, editLearning,

  // Search
  openSearch, closeSearch, runSearch, triggerSearchResult,

  // Auth
  handleLogin: async () => {
    try {
      const user = await loginWithGoogle();
      showToast("Login berhasil! Selamat datang, " + user.displayName);
      loadAllData();
    } catch (e) {
      showToast("Login gagal: " + e.message);
    }
  },
  handleLogout: async () => {
    await logoutUser();
    showToast("Berhasil logout");
    clearAllDisplays();
  },
});

/* ============================================================
   EVENT DELEGATION — menggantikan semua onclick di HTML.
   Extension browser tidak bisa inject ke addEventListener,
   hanya ke atribut onclick. Dengan delegation ini semua klik
   ditangani dari JS murni, aman dari interference extension.
   ============================================================ */

function _evalAction(expr, target) {
  // Jalankan ekspresi action dengan context window
  // Mapping ekspresi umum ke fungsi langsung (lebih aman dari eval)
  const fn = _ACTION_MAP[expr];
  if (fn) { fn(target); return; }

  // Fallback untuk ekspresi sederhana "fnName(args)"
  try {
    const f = new Function(...Object.keys(window), `"use strict"; return (${expr})`);
    f(...Object.values(window));
  } catch(e) {
    console.warn('[Trackify] action error:', expr, e.message);
  }
}

// Map action string -> handler function (hindari eval untuk kasus umum)
const _ACTION_MAP = {
  'openSearch()':       () => openSearch(),
  'closeSearch()':      () => closeSearch(),
  'closeRewardModal()': () => closeRewardModal(),
  'closeEditModal()':   () => closeEditModal(),
  'saveEditModal()':    () => saveEditModal(),
  'toggleSidebar()':    () => toggleSidebar(),
  'closeSidebar()':     () => closeSidebar(),
  'toggleTheme()':      () => toggleTheme(),
  'quickJournal()':     () => quickJournal(),
  'quickHabit()':       () => quickHabit(),
  'quickTodo()':        () => quickTodo(),
  'quickLearning()':    () => quickLearning(),
  'quickEmosi()':       () => quickEmosi(),
  'quickTarget()':      () => quickTarget(),
  'addTarget()':        () => addTarget(),
  'addHabit()':         () => addHabit(),
  'addHabitRow()':      () => addHabitRow(),
  'addTodo()':          () => addTodo(),
  'saveJournal()':      () => saveJournal(),
  'saveReflection()':   () => saveReflection(),
  'saveSosial()':       () => saveSosial(),
  'addEmosi()':         () => addEmosi(),
  'addMenstruasi()':    () => addMenstruasi(),
  'saveLearning()':     () => saveLearning(),
  'claimDailyStreak()': () => claimDailyStreak(),
  'exportData()':       () => exportData(),
  'resetAllData()':     () => resetAllData(),
  'event.stopPropagation()': (_, e) => e && e.stopPropagation(),

  // showPage calls
  "showPage('dashboard',this)":          (el) => showPage('dashboard', el),
  "showPage('target',this)":             (el) => showPage('target', el),
  "showPage('habit',this)":              (el) => showPage('habit', el),
  "showPage('todo',this)":               (el) => showPage('todo', el),
  "showPage('reward',this)":             (el) => showPage('reward', el),
  "showPage('learning',this)":           (el) => showPage('learning', el),
  "showPage('journal',this)":            (el) => showPage('journal', el),
  "showPage('reflection',this)":         (el) => showPage('reflection', el),
  "showPage('menstruasi',this)":         (el) => showPage('menstruasi', el),
  "showPage('sosial',this)":             (el) => showPage('sosial', el),
  "showPage('emosi',this)":              (el) => showPage('emosi', el),
  "showPage('settings',this)":           (el) => showPage('settings', el),
  "showPage('reward', navBtn(4))":       () => showPage('reward', navBtn(4)),
  "showPage('habit',navBtn(2))":         () => showPage('habit', navBtn(2)),
  "showPage('target',navBtn(1))":        () => showPage('target', navBtn(1)),
  "showPage('todo',navBtn(3))":          () => showPage('todo', navBtn(3)),
  "showPage('reflection', navBtn(7))":   () => showPage('reflection', navBtn(7)),

  // metric cards (same as nav)
  "showPage('target',navBtn(1))":        () => showPage('target', navBtn(1)),
  "showPage('habit',navBtn(2))":         () => showPage('habit', navBtn(2)),
  "showPage('todo',navBtn(3))":          () => showPage('todo', navBtn(3)),

  // clearSectionData
  "clearSectionData('targets')":     () => clearSectionData('targets'),
  "clearSectionData('habits')":      () => clearSectionData('habits'),
  "clearSectionData('todos')":       () => clearSectionData('todos'),
  "clearSectionData('journals')":    () => clearSectionData('journals'),
  "clearSectionData('reflections')": () => clearSectionData('reflections'),
  "clearSectionData('sosials')":     () => clearSectionData('sosials'),
  "clearSectionData('emosis')":      () => clearSectionData('emosis'),
  "clearSectionData('menstruasis')": () => clearSectionData('menstruasis'),
  "clearSectionData('learnings')":   () => clearSectionData('learnings'),
  "clearSectionData('streak')":      () => clearSectionData('streak'),

  // selectCat
  "selectCat(this,'Teknologi')": (el) => selectCat(el, 'Teknologi'),
  "selectCat(this,'Bahasa')":    (el) => selectCat(el, 'Bahasa'),
  "selectCat(this,'Finansial')": (el) => selectCat(el, 'Finansial'),
  "selectCat(this,'Kesehatan')": (el) => selectCat(el, 'Kesehatan'),
  "selectCat(this,'Seni')":      (el) => selectCat(el, 'Seni'),
  "selectCat(this,'Lainnya')":   (el) => selectCat(el, 'Lainnya'),

  // toggleSymptom
  'toggleSymptom(this)': (el) => toggleSymptom(el),

  // auth
  "if(window.handleLogin){handleLogin()}else{document.addEventListener('trackify-ready',function(){handleLogin()},{once:true})}":
    () => { if (window.handleLogin) handleLogin(); else document.addEventListener('trackify-ready', () => handleLogin(), {once:true}); },
  "if(window.handleLogout)handleLogout()":
    () => { if (window.handleLogout) handleLogout(); },
};

document.addEventListener('click', function(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.getAttribute('data-action');
  if (!action) return;
  e.stopPropagation();
  // Jalankan action — kirim original event untuk stopPropagation cases
  const fn = _ACTION_MAP[action];
  if (fn) {
    fn(el, e);
  } else {
    // Dynamic actions dari render (toggleTodoById, delTodo, editTodo, dll)
    // Format: "fnName(arg)" — parse dan panggil dari window
    const m = action.match(/^(\w+)\((.*)?\)$/);
    if (m) {
      const fnName = m[1];
      const argStr = m[2] ? m[2].trim() : '';
      const fn2 = window[fnName];
      if (typeof fn2 === 'function') {
        try {
          // Parse args: angka, string, atau 'this'
          const args = argStr === '' ? [] : argStr.split(',').map(a => {
            a = a.trim();
            if (a === 'this') return el;
            if (/^-?\d+$/.test(a)) return parseInt(a, 10);
            if (/^['"]/.test(a)) return a.slice(1, -1);
            return a;
          });
          fn2(...args);
        } catch(err) {
          console.warn('[Trackify] dynamic action error:', action, err.message);
        }
      }
    }
  }
}, true); // capture phase — sebelum extension bisa interfere

// oninput untuk search
document.addEventListener('input', function(e) {
  if (e.target.getAttribute('data-oninput') === 'runSearch') {
    runSearch(e.target.value);
  }
});

// onkeydown Enter untuk input fields
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  const action = e.target.getAttribute('data-onenter');
  if (action && window[action]) window[action]();
});

// onchange untuk import file
document.addEventListener('change', function(e) {
  if (e.target.id === 'import-file-input') importData(e.target);
});

// keyboard nav untuk metric cards
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const page = e.target.getAttribute('data-onenter-page');
  const nav  = e.target.getAttribute('data-onenter-nav');
  if (page) { e.preventDefault(); showPage(page, nav ? navBtn(parseInt(nav)) : null); }
});

// Beritahu HTML bahwa module sudah siap
document.dispatchEvent(new CustomEvent('trackify-ready'));
