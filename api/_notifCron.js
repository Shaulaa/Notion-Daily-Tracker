import { FieldValue, getAdminDB, getAdminMessaging } from './_firebaseAdmin.js';

const DEFAULT_PREFS = {
  enabled: false,
  deadlines: {
    todo: { enabled: true, advanceDays: 1 },
    target: { enabled: true, advanceDays: 3 },
  },
  types: {
    habit:      { enabled: true,  time: '08:00', label: 'Check Habit',       body: 'Sudah cek habit harianmu hari ini? Jaga konsistensi!' },
    journal:    { enabled: true,  time: '21:00', label: 'Tulis Jurnal',      body: 'Waktunya refleksikan harimu. Tulis jurnal sekarang!' },
    mood:       { enabled: true,  time: '19:00', label: 'Catat Emosi',       body: 'Bagaimana perasaanmu hari ini? Catat emosimu!' },
    todo:       { enabled: false, time: '07:30', label: 'Review To-Do',      body: 'Cek daftar tugasmu dan rencanakan harimu!' },
    streak:     { enabled: true,  time: '20:00', label: 'Jaga Streak',       body: 'Jangan lupa check-in hari ini untuk menjaga streakmu!' },
    refleksi:   { enabled: false, time: '20:30', label: 'Refleksi Mingguan', body: 'Sudah tulis refleksi mingguan? Evaluasi progresmu!' },
    reward:     { enabled: false, time: '18:00', label: 'Cek Reward',        body: 'Lihat pencapaianmu hari ini! Reward menunggumu.' },
    learning:   { enabled: false, time: '09:00', label: 'Sesi Belajar',      body: 'Waktunya belajar hal baru! Buka Learning Tracker dan mulai sesi.' },
    sosial:     { enabled: false, time: '17:00', label: 'Komunikasi Sosial', body: 'Sudah terhubung dengan orang-orang terdekatmu hari ini?' },
    emosi:      { enabled: false, time: '22:00', label: 'Tracker Emosi',     body: 'Catat kondisi emosimu sebelum tidur untuk insight yang lebih baik.' },
    menstruasi: { enabled: false, time: '08:30', label: 'Siklus Menstruasi', body: 'Jangan lupa update data siklus menstruasimu hari ini.' },
  }
};

const DEFAULT_TZ = process.env.NOTIF_TIMEZONE || 'Asia/Jakarta';

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function mergePrefs(saved = {}) {
  const merged = deepClone(DEFAULT_PREFS);
  merged.enabled = !!saved.enabled;

  if (saved.deadlines) {
    for (const key of Object.keys(merged.deadlines)) {
      if (saved.deadlines[key]) merged.deadlines[key] = { ...merged.deadlines[key], ...saved.deadlines[key] };
    }
  }

  if (saved.types) {
    for (const key of Object.keys(merged.types)) {
      if (saved.types[key]) merged.types[key] = { ...merged.types[key], ...saved.types[key] };
    }
  }

  if (saved.timezone && typeof saved.timezone === 'string') {
    merged.timezone = saved.timezone;
  }

  return merged;
}

function dateParts(tz) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${byType.year}-${byType.month}-${byType.day}`,
    hhmm: `${byType.hour}:${byType.minute}`
  };
}

function diffDaysFrom(dateStr, tz) {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const nowDate = dateParts(tz).date;
  const now = new Date(`${nowDate}T00:00:00Z`);
  const then = new Date(`${dateStr}T00:00:00Z`);
  return Math.round((then - now) / 86400000);
}

async function getUserTokens(uid) {
  const snap = await getAdminDB().collection('fcmTokens').doc(uid).collection('tokens').get();
  return snap.docs.map((doc) => doc.id).filter(Boolean);
}

async function getUserTodos(uid) {
  const snap = await getAdminDB().collection('users').doc(uid).collection('todos').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getUserTargets(uid) {
  const snap = await getAdminDB().collection('users').doc(uid).collection('targets').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getRuntime(uid) {
  const ref = getAdminDB().collection('notifRuntime').doc(uid);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : {} };
}

function pruneDeadlineLog(log = {}, today) {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);
  const cutStr = cutoff.toISOString().slice(0, 10);
  const next = {};

  for (const [key, value] of Object.entries(log)) {
    const maybeDate = key.slice(-10);
    if (maybeDate >= cutStr) next[key] = value;
  }
  return next;
}

function buildRoutineMessages(prefs, runtime, today, hhmm) {
  const messages = [];
  for (const [key, cfg] of Object.entries(prefs.types || {})) {
    if (!cfg?.enabled || cfg.time !== hhmm) continue;
    if (runtime?.routineLastSent?.[key] === today) continue;

    messages.push({
      kind: 'routine',
      runtimeKey: key,
      title: `Trackify - ${cfg.label}`,
      body: cfg.body,
      tag: `trackify-${key}`
    });
  }
  return messages;
}

function buildDeadlineMessages(prefs, runtime, today, tz, todos, targets) {
  const messages = [];
  const sentLog = runtime?.deadlineLastSent || {};

  if (prefs.deadlines?.todo?.enabled) {
    const adv = prefs.deadlines.todo.advanceDays ?? 1;
    for (const todo of todos) {
      const dueDate = todo.date || todo.dueDate || '';
      if (todo.done || !dueDate) continue;

      const diff = diffDaysFrom(dueDate, tz);
      if (diff > adv || diff < -3) continue;

      const itemId = todo.id || todo._id || todo.text || 'todo';
      const sentKey = `todo-${itemId}-${today}`;
      if (sentLog[sentKey]) continue;

      let label;
      let body;
      if (diff < 0) {
        label = `To-Do Terlewat (${Math.abs(diff)}h)!`;
        body = `"${todo.text || 'Tugas'}" sudah ${Math.abs(diff)} hari melewati deadline dan belum selesai.`;
      } else if (diff === 0) {
        label = 'To-Do Deadline Hari Ini!';
        body = `"${todo.text || 'Tugas'}" harus diselesaikan hari ini.`;
      } else if (diff === 1) {
        label = 'To-Do Deadline Besok!';
        body = `"${todo.text || 'Tugas'}" deadline besok (${dueDate}).`;
      } else {
        label = `To-Do - ${diff} Hari Lagi`;
        body = `"${todo.text || 'Tugas'}" deadline pada ${dueDate}.`;
      }

      messages.push({
        kind: 'deadline',
        runtimeKey: sentKey,
        title: `Trackify - ${label}`,
        body,
        tag: `trackify-deadline-todo-${itemId}`
      });
    }
  }

  if (prefs.deadlines?.target?.enabled) {
    const adv = prefs.deadlines.target.advanceDays ?? 3;
    for (const target of targets) {
      const deadline = target.deadline || '';
      if (target.status === 'done' || !deadline) continue;

      const diff = diffDaysFrom(deadline, tz);
      if (diff > adv || diff < -3) continue;

      const itemId = target.id || target._id || target.name || 'target';
      const sentKey = `target-${itemId}-${today}`;
      if (sentLog[sentKey]) continue;

      let label;
      let body;
      if (diff < 0) {
        label = `Target Terlewat (${Math.abs(diff)}h)!`;
        body = `Target "${target.name || 'Tanpa nama'}" sudah ${Math.abs(diff)} hari melewati deadline.`;
      } else if (diff === 0) {
        label = 'Target Deadline Hari Ini!';
        body = `Target "${target.name || 'Tanpa nama'}" harus dicapai hari ini!`;
      } else if (diff === 1) {
        label = 'Target Deadline Besok!';
        body = `Target "${target.name || 'Tanpa nama'}" deadline besok (${deadline}).`;
      } else {
        label = `Target - ${diff} Hari Lagi`;
        body = `Target "${target.name || 'Tanpa nama'}" deadline pada ${deadline}.`;
      }

      messages.push({
        kind: 'deadline',
        runtimeKey: sentKey,
        title: `Trackify - ${label}`,
        body,
        tag: `trackify-deadline-target-${itemId}`
      });
    }
  }

  return messages;
}

async function sendToTokens(tokens, message) {
  if (!tokens.length) return { successCount: 0, failureCount: 0, responses: [] };

  return getAdminMessaging().sendEachForMulticast({
    tokens,
    notification: {
      title: message.title,
      body: message.body
    },
    webpush: {
      notification: {
        title: message.title,
        body: message.body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: message.tag || 'trackify-reminder',
        renotify: true,
        actions: [
          { action: 'open', title: 'Buka Trackify' },
          { action: 'dismiss', title: 'Tutup' }
        ]
      },
      fcmOptions: {
        link: 'https://trackify-daily-tracker.vercel.app/'
      }
    },
    data: {
      tag: message.tag || 'trackify-reminder'
    }
  });
}

async function removeInvalidTokens(uid, tokens, responses) {
  const invalidIndexes = [];
  responses.forEach((resp, idx) => {
    const code = resp?.error?.code || '';
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      invalidIndexes.push(idx);
    }
  });

  if (!invalidIndexes.length) return 0;

  const batch = getAdminDB().batch();
  for (const idx of invalidIndexes) {
    const token = tokens[idx];
    const ref = getAdminDB().collection('fcmTokens').doc(uid).collection('tokens').doc(token);
    batch.delete(ref);
  }
  await batch.commit();
  return invalidIndexes.length;
}

async function markSent(uid, runtimeRef, runtime, sentMessages, today) {
  const routineLastSent = { ...(runtime.routineLastSent || {}) };
  const deadlineLastSent = pruneDeadlineLog(runtime.deadlineLastSent, today);

  for (const msg of sentMessages) {
    if (msg.kind === 'routine') routineLastSent[msg.runtimeKey] = today;
    if (msg.kind === 'deadline') deadlineLastSent[msg.runtimeKey] = true;
  }

  await runtimeRef.set({
    routineLastSent,
    deadlineLastSent,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

export async function runNotificationCron() {
  const prefsSnap = await getAdminDB().collection('notifPrefs').get();
  const summary = {
    scannedUsers: prefsSnap.size,
    eligibleUsers: 0,
    sentMessages: 0,
    sentNotifications: 0,
    removedTokens: 0,
    details: []
  };

  for (const prefDoc of prefsSnap.docs) {
    const uid = prefDoc.id;
    const prefs = mergePrefs(prefDoc.data());
    if (!prefs.enabled) continue;

    const tz = prefs.timezone || DEFAULT_TZ;
    const { date: today, hhmm } = dateParts(tz);
    const [tokens, runtimeObj, todos, targets] = await Promise.all([
      getUserTokens(uid),
      getRuntime(uid),
      getUserTodos(uid),
      getUserTargets(uid)
    ]);

    if (!tokens.length) continue;
    summary.eligibleUsers += 1;

    const runtime = runtimeObj.data || {};
    const messages = [
      ...buildRoutineMessages(prefs, runtime, today, hhmm),
      ...buildDeadlineMessages(prefs, runtime, today, tz, todos, targets)
    ];

    if (!messages.length) continue;

    const sentForUser = [];
    let notifCountForUser = 0;
    let removedForUser = 0;

    for (const message of messages) {
      const result = await sendToTokens(tokens, message);
      notifCountForUser += result.successCount;
      removedForUser += await removeInvalidTokens(uid, tokens, result.responses || []);
      if (result.successCount > 0) sentForUser.push(message);
    }

    if (sentForUser.length) {
      await markSent(uid, runtimeObj.ref, runtime, sentForUser, today);
    }

    summary.sentMessages += sentForUser.length;
    summary.sentNotifications += notifCountForUser;
    summary.removedTokens += removedForUser;
    summary.details.push({
      uid,
      timezone: tz,
      messagesPlanned: messages.length,
      messagesSent: sentForUser.length,
      notificationsSent: notifCountForUser,
      removedTokens: removedForUser
    });
  }

  return summary;
}
