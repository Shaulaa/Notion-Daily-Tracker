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

/*1. STORAGE LAYER*/

const StorageManager = {
  KEY: 'Trackify_v1',

  /** Simpan state ke localStorage. */
  save(data) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[Trackify] Gagal menyimpan ke localStorage:', err);
      showToast('⚠️ Penyimpanan gagal — ruang penuh atau mode private');
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

/* ============================================================
   3. INISIALISASI
   ============================================================ */

function initApp() {
  const saved = StorageManager.load();
  if (saved) {
    // Gabungkan dengan default agar field baru tidak hilang
    state = Object.assign(createDefaultState(), saved);
  }

  // Pulihkan variabel pendukung
  habitRows   = Array.isArray(state.habitRows) && state.habitRows.length
                  ? state.habitRows : [today()];
  selectedCat = state.selectedCat || '';

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
  const icon  = theme === 'dark' ? '🌙' : '☀️';
  const label = theme === 'dark' ? 'Mode Terang' : 'Mode Gelap';
  document.querySelectorAll('#theme-btn, #theme-btn-mobile').forEach(btn => {
    if (!btn) return;
    btn.textContent = icon;
    btn.setAttribute('aria-label', `Ganti ke ${label}`);
  });
}

function toggleTheme() {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  saveState();
  showToast(next === 'dark' ? '🌙 Mode Gelap aktif' : '☀️ Mode Terang aktif');
}

/* ============================================================
   5. NAVIGASI
   ============================================================ */

const VALID_PAGES = new Set([
  'dashboard','target','habit','todo','reward','learning',
  'journal','reflection','sosial','emosi','menstruasi','settings'
]);

function showPage(id, btn) {
  if (!VALID_PAGES.has(id)) {
    console.warn('[Trackify] ID halaman tidak valid:', id);
    return;
  }
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

  closeSidebar();

  // Pindahkan fokus ke judul halaman (aksesibilitas)
  const title = pageEl.querySelector('.page-title');
  if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
}

// Quick action shortcuts
function quickJournal()  { showPage('journal',  navBtn(8));  focusEl('j-did'); }
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
function showRewardModal(icon, confetti, title, desc) {
  const bg = document.getElementById('reward-modal-bg');
  if (!bg) return;
  setText('rm-icon', icon); setText('rm-confetti', confetti);
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

function emptyHTML(emoji, msg) {
  return `<div class="empty" role="status" aria-label="${msg}">
    <div class="empty-icon" aria-hidden="true">${emoji}</div>${msg}</div>`;
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
                  onclick="toggleTodoById(${t.id})"
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
      <td style="font-weight:600">${escapeHTML(t.name)}</td>
      <td style="color:var(--text3);font-size:12px"><time datetime="${t.deadline||''}">${t.deadline||'—'}</time></td>
      <td>
        <button class="status-toggle-btn ${isDone ? 'status-done' : 'status-progress'}"
                onclick="toggleTargetStatus(${i})"
                aria-label="Klik untuk ubah status: ${isDone ? 'Selesai' : 'On Progress'}"
                title="Klik untuk ubah status">
          ${isDone ? '✓ Selesai' : '⏳ Berjalan'}
        </button>
      </td>
      <td style="min-width:120px">
        <div class="prog-label" aria-hidden="true"><span>${prog}%</span></div>
        <div class="prog-bar" role="progressbar" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"
             aria-label="Progress ${prog}%">
          <div class="prog-fill" style="width:${prog}%"></div>
        </div>
      </td>
      <td><button class="del-btn" onclick="delTarget(${i})" aria-label="Hapus target: ${escapeHTML(t.name)}">✕</button></td>
    </tr>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function addTarget() {
  const name     = document.getElementById('t-name')?.value.trim();
  const deadline = document.getElementById('t-deadline')?.value;
  const status   = document.getElementById('t-status')?.value;
  if (!name) { showToast('⚠️ Nama target tidak boleh kosong'); document.getElementById('t-name')?.focus(); return; }
  state.targets.push({ name, deadline, status: status || 'on_progress' });
  clearFields('t-name','t-deadline');
  saveState(); renderTargets(); updateDashboard();
  showToast('✓ Target berhasil ditambahkan');
}

function delTarget(i) {
  if (!state.targets[i]) return;
  if (!konfirmasiHapus(`target "${state.targets[i].name}"`)) return;
  state.targets.splice(i, 1);
  saveState(); renderTargets(); updateDashboard();
  showToast('🗑️ Target dihapus');
}

function toggleTargetStatus(i) {
  if (!state.targets[i]) return;
  state.targets[i].status = state.targets[i].status === 'done' ? 'on_progress' : 'done';
  saveState(); renderTargets(); updateDashboard();
  showToast(state.targets[i].status === 'done' ? '✅ Target ditandai selesai' : '⏳ Target kembali on progress');
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

  head.innerHTML = '<tr><th scope="col">Tanggal</th>' +
    state.habits.map((h, hi) => `
      <th scope="col" style="text-align:center;min-width:80px">${escapeHTML(h)}<br>
        <button class="del-btn" onclick="delHabit(${hi})" style="font-size:10px"
                aria-label="Hapus habit: ${escapeHTML(h)}">✕</button>
      </th>`).join('') +
    '<th scope="col"><span class="sr-only">Hapus baris</span></th></tr>';

  body.innerHTML = habitRows.map((row, ri) => {
    const cells = state.habits.map((h, hi) => {
      const val   = state.habitData[`${row}_${hi}`] || 'none';
      const label = val==='done' ? 'Selesai' : val==='skip' ? 'Dilewati' : 'Belum';
      return `<td class="check-cell">
        <button class="habit-check ${val==='done'?'done':val==='skip'?'skip':''}"
                onclick="toggleHabit('${row}',${hi})"
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
      <td><button class="del-btn" onclick="delHabitRow(${ri})" aria-label="Hapus baris ${row}">✕</button></td>
    </tr>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function toggleHabit(row, hi) {
  const key = `${row}_${hi}`;
  const cur = state.habitData[key] || 'none';
  state.habitData[key] = cur==='none' ? 'done' : cur==='done' ? 'skip' : 'none';
  saveState(); renderHabit(); updateDashboard();
}

function addHabit() {
  const v = document.getElementById('new-habit')?.value.trim();
  if (!v) { showToast('⚠️ Nama habit tidak boleh kosong'); document.getElementById('new-habit')?.focus(); return; }
  if (state.habits.includes(v)) { showToast('⚠️ Habit ini sudah ada'); return; }
  state.habits.push(v); clearFields('new-habit');
  saveState(); renderHabit(); showToast('✓ Habit ditambahkan');
}

function addHabitRow() {
  const d = document.getElementById('habit-date')?.value || today();
  if (habitRows.includes(d)) { showToast('ℹ️ Tanggal tersebut sudah ada'); return; }
  habitRows.push(d); habitRows.sort();
  saveState(); renderHabit(); showToast(`✓ Tanggal ${d} ditambahkan`);
}

function delHabitRow(i) {
  if (i < 0 || i >= habitRows.length) return;
  if (!konfirmasiHapus(`baris tanggal ${habitRows[i]}`)) return;
  habitRows.splice(i, 1); saveState(); renderHabit();
}

function delHabit(i) {
  if (!state.habits[i]) return;
  if (!konfirmasiHapus(`habit "${state.habits[i]}"`)) return;
  state.habits.splice(i, 1); saveState(); renderHabit(); showToast('🗑️ Habit dihapus');
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
        ${t.dueDate ? `📅 ${t.dueDate}` : ''}${t.dueDate && t.dueTime ? ' ' : ''}${t.dueTime ? `🕐 ${t.dueTime}` : ''}
      </span>`;
    }
    return `<div class="todo-item" role="listitem">
      <button class="todo-check ${t.done?'done':''}"
              onclick="toggleTodoById(${t.id})"
              aria-label="${t.done?'Tandai belum selesai':'Tandai selesai'}: ${escapeHTML(t.text)}"
              aria-pressed="${t.done}">
        ${t.done ? '✓' : ''}
      </button>
      <div class="todo-content">
        <span class="todo-text ${t.done?'done':''}">${escapeHTML(t.text)}</span>
        ${dueMeta}
      </div>
      <button class="del-btn" onclick="delTodoById(${t.id})"
              aria-label="Hapus tugas: ${escapeHTML(t.text)}">✕</button>
    </div>`;
  }).join('');
  setTimeout(registerAllLongPress, 60);
}

function toggleTodoById(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  todo.done = !todo.done;
  saveState(); renderTodo(); updateDashboard();
}

function delTodoById(id) {
  const idx = state.todos.findIndex(t => t.id === id);
  if (idx === -1) return;
  if (!konfirmasiHapus(`tugas "${state.todos[idx].text}"`)) return;
  state.todos.splice(idx, 1);
  saveState(); renderTodo(); updateDashboard(); showToast('🗑️ Tugas dihapus');
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const v = input?.value.trim();
  if (!v) { showToast('⚠️ Teks tugas tidak boleh kosong'); input?.focus(); return; }
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
  saveState(); renderTodo(); updateDashboard(); showToast('✓ Tugas ditambahkan');
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
  if (!did) { showToast('⚠️ Isi kolom Aktivitas terlebih dahulu'); document.getElementById('j-did')?.focus(); return; }
  state.journals.unshift({ date, did, good, improve, mood });
  clearFields('j-did','j-good','j-improve');
  const moodEl = document.getElementById('j-mood');
  if (moodEl) moodEl.value = '';
  state.selectedMood = '';
  saveState(); renderJournals(); updateDashboard(); updateRewardPage();
  showToast('✓ Jurnal tersimpan');
}

function renderJournals() {
  const el = document.getElementById('journal-list');
  if (!el) return;
  if (!state.journals.length) { el.innerHTML = emptyHTML('📖','Belum ada jurnal.'); return; }
  el.innerHTML = state.journals.map((j, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date">📅 <time datetime="${j.date}">${j.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          ${j.mood ? `<span class="badge badge-purple">${escapeHTML(j.mood)}</span>` : ''}
          <button class="del-btn" onclick="delJournal(${i})" aria-label="Hapus jurnal ${j.date}">✕</button>
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
  state.journals.splice(i, 1); saveState(); renderJournals(); updateDashboard(); updateRewardPage();
  showToast('🗑️ Jurnal dihapus');
}

/* ============================================================
   12. REFLEKSI
   ============================================================ */

function saveReflection() {
  const date = document.getElementById('r-date')?.value  || today();
  const grow = document.getElementById('r-grow')?.value.trim();
  const lack = document.getElementById('r-lack')?.value.trim() || '';
  const plan = document.getElementById('r-plan')?.value.trim() || '';
  if (!grow) { showToast('⚠️ Isi kolom "Yang sudah berkembang"'); document.getElementById('r-grow')?.focus(); return; }
  state.reflections.unshift({ date, grow, lack, plan });
  clearFields('r-grow','r-lack','r-plan');
  saveState(); renderReflections(); showToast('✓ Refleksi tersimpan');
}

function renderReflections() {
  const el = document.getElementById('reflection-list');
  if (!el) return;
  if (!state.reflections.length) { el.innerHTML = emptyHTML('🔮','Belum ada refleksi.'); return; }
  el.innerHTML = state.reflections.map((r, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date">📅 <time datetime="${r.date}">${r.date}</time></span>
        <button class="del-btn" onclick="delReflection(${i})" aria-label="Hapus refleksi ${r.date}">✕</button>
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
  state.reflections.splice(i, 1); saveState(); renderReflections();
  showToast('🗑️ Refleksi dihapus');
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
  if (!who) { showToast('⚠️ Isi nama orang yang diajak bicara'); document.getElementById('s-who')?.focus(); return; }
  state.sosials.unshift({ date, who, topic, improve, note });
  clearFields('s-who','s-topic','s-improve','s-note');
  saveState(); renderSosials(); showToast('✓ Catatan sosial tersimpan');
}

function renderSosials() {
  const el = document.getElementById('sosial-list');
  if (!el) return;
  if (!state.sosials.length) { el.innerHTML = emptyHTML('💬','Belum ada catatan.'); return; }
  el.innerHTML = state.sosials.map((s, i) => `
    <article class="journal-entry">
      <div class="journal-meta">
        <span class="journal-date">📅 <time datetime="${s.date}">${s.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-blue">${escapeHTML(s.who)}</span>
          <button class="del-btn" onclick="delSosial(${i})" aria-label="Hapus catatan sosial ${s.date}">✕</button>
        </div>
      </div>
      ${s.topic   ? `<div style="font-size:13px;color:var(--text2);margin-top:4px">📌 ${escapeHTML(s.topic)}</div>` : ''}
      ${s.improve ? `<div style="font-size:13px;margin-top:4px"><span style="color:var(--blue);font-weight:600">Perbaikan: </span>${escapeHTML(s.improve)}</div>` : ''}
    </article>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delSosial(i) {
  if (!konfirmasiHapus('catatan sosial ini')) return;
  state.sosials.splice(i, 1); saveState(); renderSosials();
  showToast('🗑️ Catatan sosial dihapus');
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
  if (!mood) { showToast('⚠️ Pilih mood terlebih dahulu'); return; }
  state.emosis.unshift({ date, mood, cause, solution });
  clearFields('e-cause','e-solution');
  saveState(); renderEmosi(); showToast('✓ Emosi dicatat');
}

function renderEmosi() {
  const tb = document.getElementById('emosi-table');
  if (!tb) return;
  if (!state.emosis.length) { tb.innerHTML = `<tr><td colspan="5">${emptyHTML('🌊','Belum ada data emosi.')}</td></tr>`; return; }
  tb.innerHTML = state.emosis.map((e, i) => `
    <tr>
      <td style="white-space:nowrap;font-size:12px;color:var(--text3)"><time datetime="${e.date}">${e.date}</time></td>
      <td><span class="badge ${MOOD_COLOR[e.mood]||'badge-purple'}">${escapeHTML(e.mood)}</span></td>
      <td style="font-size:12px;color:var(--text2)">${escapeHTML(e.cause)||'—'}</td>
      <td style="font-size:12px;color:var(--text2)">${escapeHTML(e.solution)||'—'}</td>
      <td><button class="del-btn" onclick="delEmosi(${i})" aria-label="Hapus catatan emosi ${e.date}">✕</button></td>
    </tr>`).join('');
  setTimeout(registerAllLongPress, 60);
}

function delEmosi(i) {
  if (!konfirmasiHapus('catatan emosi ini')) return;
  state.emosis.splice(i, 1); saveState(); renderEmosi(); showToast('🗑️ Catatan emosi dihapus');
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
  saveState(); updateRewardPage(); updateDashboard();

  const MILESTONES = {
    1:  ['🌱','🎊 ✨ 🎊','Perjalanan Dimulai!',   'Selamat melakukan check-in pertamamu!'],
    3:  ['🔥','🎊 🔥 🎊','3 Hari Berturut!',      'Kamu berhasil menjaga konsistensi 3 hari!'],
    7:  ['🌟','🎊 🌟 🏆','Consistency Starter!', 'LUAR BIASA! 7 hari berturut-turut!'],
    14: ['💎','🎊 💎 🎊','Two-Week Warrior!',     '14 hari konsisten! Badge sudah milikmu!'],
    30: ['👑','👑 🎊 🏆 🎊 👑','ULTIMATE ACHIEVER!','WOW! 30 HARI BERTURUT-TURUT!']
  };
  const s = state.streak;
  if (MILESTONES[s] && (s > 1 || state.checkins.length === 1)) {
    const [icon, conf, title, desc] = MILESTONES[s];
    showRewardModal(icon, conf, title, desc);
  } else {
    showToast(`🔥 Check-in berhasil! Streak: ${s} hari`);
  }
}

function updateRewardPage() {
  const s = state.streak;
  setText('streak-count', s);

  const MSGS = [
    [30,'ULTIMATE ACHIEVER! 👑','Kamu adalah inspirasi! Pertahankan!'],
    [14,'Two-Week Warrior! 💎','Tinggal 16 hari lagi untuk Ultimate Achiever'],
    [7, 'Consistency Starter unlocked! 🌟','Tinggal 23 hari lagi untuk reward BESAR'],
    [3, '3 hari! Kamu sedang on fire! 🔥','Tinggal 4 hari lagi untuk badge pertama'],
    [1, 'Hari pertama! Mulai yang baik 💪','Lanjutkan besok untuk membangun momentum'],
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
    if (st) st.innerHTML = '<span class="badge badge-green" aria-label="Sudah diraih">✅ Earned</span>';
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
            <span style="font-size:18px" aria-hidden="true">🔥</span>
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

  if (!subject) { showToast('⚠️ Isi kolom Topik terlebih dahulu'); document.getElementById('l-subject')?.focus(); return; }
  if (!what)    { showToast('⚠️ Isi kolom Materi terlebih dahulu'); document.getElementById('l-what')?.focus(); return; }
  if (duration && (isNaN(Number(duration)) || Number(duration) <= 0)) {
    showToast('⚠️ Durasi harus berupa angka positif'); document.getElementById('l-duration')?.focus(); return;
  }

  state.learnings.unshift({ date, subject, what, insight, duration, cat: selectedCat });
  clearFields('l-subject','l-what','l-insight','l-duration');
  document.querySelectorAll('#cat-chips .cat-chip').forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed','false'); });
  selectedCat = ''; state.selectedCat = '';
  saveState(); renderLearnings(); updateLearningStats(); updateRewardPage();
  showToast('📚 Sesi belajar tersimpan!');
}

function renderLearnings() {
  const el = document.getElementById('learning-list');
  if (!el) return;
  if (!state.learnings.length) { el.innerHTML = emptyHTML('📖','Belum ada sesi belajar.'); return; }
  el.innerHTML = state.learnings.map((l, i) => `
    <article class="learning-entry">
      <div class="learning-entry-header">
        <span class="learning-date">📅 <time datetime="${l.date}">${l.date}</time></span>
        <div style="display:flex;align-items:center;gap:8px">
          ${l.cat      ? `<span class="learning-tag">${escapeHTML(l.cat)}</span>` : ''}
          ${l.duration ? `<span class="badge badge-blue">⏱ ${escapeHTML(l.duration)} mnt</span>` : ''}
          <button class="del-btn" onclick="delLearning(${i})" aria-label="Hapus sesi: ${escapeHTML(l.subject)}">✕</button>
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
  saveState(); renderLearnings(); updateLearningStats(); showToast('🗑️ Sesi belajar dihapus');
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
  baik: '😊 Baik', biasa: '😐 Biasa', sensitif: '😢 Sensitif',
  mudah_marah: '😠 Mudah Marah', cemas: '😰 Cemas', depresi: '😔 Depresi'
};
const FLOW_LABEL = { ringan: '🩸 Ringan', sedang: '🩸🩸 Sedang', deras: '🩸🩸🩸 Deras' };

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

  if (!start) { showToast('⚠️ Isi tanggal mulai haid'); return; }
  if (end && end < start) { showToast('⚠️ Tanggal selesai tidak boleh sebelum mulai'); return; }

  state.menstruasis.unshift({ start, end, flow, symptoms: [..._selectedSymptoms], mood, note });
  saveState();

  // Reset form
  document.getElementById('mens-end').value  = '';
  document.getElementById('mens-mood').value = '';
  document.getElementById('mens-note').value = '';
  document.getElementById('mens-flow').value = 'sedang';
  _selectedSymptoms = [];
  document.querySelectorAll('.symptom-tag.active').forEach(b => b.classList.remove('active'));

  renderMenstruasi();
  showToast('🌸 Siklus berhasil disimpan!');
}

function delMenstruasi(i) {
  if (!konfirmasiHapus('siklus ini')) return;
  state.menstruasis.splice(i, 1);
  saveState(); renderMenstruasi();
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
  else if (dayInCycle <= avgCycle - 14) phase = '🌼 Folikular';
  else if (dayInCycle >= avgCycle - 16 && dayInCycle <= avgCycle - 12) phase = '🥚 Ovulasi';
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
          <td>${fmtDateID(d.start)}</td>
          <td>${d.end ? fmtDateID(d.end) : '—'}</td>
          <td>${dur}</td>
          <td>${cycleLen}</td>
          <td>${FLOW_LABEL[d.flow] || d.flow}</td>
          <td style="font-size:11px;max-width:180px">${escapeHTML(syms)}</td>
          <td>${d.mood ? MOOD_LABEL[d.mood] || d.mood : '—'}</td>
          <td><button class="del-btn btn-danger" onclick="delMenstruasi(${i})" aria-label="Hapus siklus ini">🗑️</button></td>
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
  saveState(); renderAll(); updateSettingsPage();
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

  items.forEach(({ icon, label, action, danger }) => {
    const btn = document.createElement('button');
    btn.className = 'ctx-menu-item' + (danger ? ' danger' : '');
    btn.setAttribute('role', 'menuitem');
    btn.innerHTML = `<span aria-hidden="true">${icon}</span>${label}`;
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
 * Panggil setelah render — daftarkan long press pada semua item yang bisa dihapus.
 * Tidak perlu edit data (untuk sekarang aksi edit bisa dikembangkan nanti).
 */
function registerAllLongPress() {
  if (!isMobile()) return;

  // ── To-Do Items ──
  document.querySelectorAll('.todo-item[role="listitem"]').forEach(el => {
    const delBtn = el.querySelector('.del-btn[aria-label^="Hapus tugas"]');
    if (!delBtn) return;
    // Ambil ID dari onclick atribut tombol
    const match = delBtn.getAttribute('onclick')?.match(/\d+/);
    if (!match) return;
    const id = parseInt(match[0]);
    registerLongPress(el, () => [
      { icon: '🗑️', label: 'Hapus Tugas', danger: true, action: () => delTodoById(id) }
    ]);
  });

  // ── Journal Entries ──
  document.querySelectorAll('.journal-entry').forEach(el => {
    const delBtn = el.querySelector('.del-btn');
    if (!delBtn) return;
    const match = delBtn.getAttribute('onclick')?.match(/(\w+)\((\d+)\)/);
    if (!match) return;
    const fn = match[1], idx = parseInt(match[2]);
    registerLongPress(el, () => [
      { icon: '🗑️', label: 'Hapus', danger: true, action: () => window[fn]?.(idx) }
    ]);
  });

  // ── Learning Entries ──
  document.querySelectorAll('.learning-entry').forEach(el => {
    const delBtn = el.querySelector('.del-btn');
    if (!delBtn) return;
    const match = delBtn.getAttribute('onclick')?.match(/(\w+)\((\d+)\)/);
    if (!match) return;
    const fn = match[1], idx = parseInt(match[2]);
    registerLongPress(el, () => [
      { icon: '🗑️', label: 'Hapus Sesi', danger: true, action: () => window[fn]?.(idx) }
    ]);
  });

  // ── Table Rows (Target, Habit, Emosi, Sosial, Refleksi) ──
  document.querySelectorAll('tr').forEach(el => {
    const delBtn = el.querySelector('.del-btn');
    if (!delBtn) return;
    const match = delBtn.getAttribute('onclick')?.match(/(\w+)\((\d+)\)/);
    if (!match) return;
    const fn = match[1], idx = parseInt(match[2]);
    registerLongPress(el, () => [
      { icon: '🗑️', label: 'Hapus', danger: true, action: () => window[fn]?.(idx) }
    ]);
  });
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
      page: 'target', icon: '🎯', badge: 'Target',
      getItems: () => state.targets.map((t, i) => ({
        title: t.name,
        meta: `${t.deadline || 'Tanpa deadline'} · ${t.status === 'done' ? '✓ Selesai' : '⏳ Berjalan'}`,
        action: () => showPage('target', navBtn(1))
      }))
    },
    {
      page: 'habit', icon: '🔥', badge: 'Habit',
      getItems: () => state.habits.map((h) => ({
        title: h,
        meta: 'Habit harian',
        action: () => showPage('habit', navBtn(2))
      }))
    },
    {
      page: 'todo', icon: '✅', badge: 'To-Do',
      getItems: () => state.todos.map((t) => ({
        title: t.text,
        meta: `${t.done ? '✓ Selesai' : '○ Belum'} · ${t.createdAt || ''}`,
        action: () => showPage('todo', navBtn(3))
      }))
    },
    {
      page: 'journal', icon: '📝', badge: 'Jurnal',
      getItems: () => state.journals.map((j) => ({
        title: j.did ? j.did.slice(0, 80) : `Jurnal ${j.date}`,
        meta: `${j.date} · ${j.mood || 'Tanpa mood'}`,
        action: () => showPage('journal', navBtn(8))
      }))
    },
    {
      page: 'reflection', icon: '🔮', badge: 'Refleksi',
      getItems: () => state.reflections.map((r) => ({
        title: r.grow ? r.grow.slice(0, 80) : `Refleksi ${r.date}`,
        meta: `${r.date} · ${r.lack ? r.lack.slice(0, 40) : ''}`,
        action: () => showPage('reflection', navBtn(7))
      }))
    },
    {
      page: 'sosial', icon: '💬', badge: 'Komunikasi',
      getItems: () => state.sosials.map((s) => ({
        title: s.topic || `Dengan ${s.who}`,
        meta: `${s.date} · ${s.who || ''}`,
        action: () => showPage('sosial', navBtn(9))
      }))
    },
    {
      page: 'emosi', icon: '🌊', badge: 'Emosi',
      getItems: () => state.emosis.map((e) => ({
        title: `${e.mood} — ${e.cause ? e.cause.slice(0, 60) : 'Tanpa keterangan'}`,
        meta: `${e.date} · ${e.solution ? e.solution.slice(0, 40) : ''}`,
        action: () => showPage('emosi', navBtn(10))
      }))
    },
    {
      page: 'learning', icon: '📚', badge: 'Learning',
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
       <div class="search-empty-icon">🔍</div>
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
         <div class="search-empty-icon">🔍</div>
         Ketik untuk mencari di semua menu
       </div>`;
    return;
  }

  const sources = getSearchSources();
  let totalHits = 0;
  let html = '';

  sources.forEach(src => {
    const items = src.getItems().filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.meta.toLowerCase().includes(q)
    );
    if (!items.length) return;
    totalHits += items.length;

    html += `<div class="search-group-label">${src.icon} ${src.badge}</div>`;
    items.forEach((item, idx) => {
      // Encode action index untuk onclick
      html += `<button class="search-result-item"
                 onclick="triggerSearchResult('${src.page}', ${idx})"
                 role="listitem">
        <div class="search-result-icon" aria-hidden="true">${src.icon}</div>
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
         <div class="search-empty-icon">😶</div>
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
    learning: 5, journal: 8, reflection: 7,
    sosial: 9, emosi: 10
  };
  const n = pageNavMap[page];
  showPage(page, n !== undefined ? navBtn(n) : null);
}

/* ============================================================
   19. KEYBOARD SHORTCUTS
   ============================================================ */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSidebar(); closeRewardModal(); closeContextMenu(); closeSearch(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openSearch(); }
});

/* ============================================================
   19. ENTRY POINT
   ============================================================ */

document.addEventListener('DOMContentLoaded', initApp);
