// ============================================================
// firebase.js — Trackify Firebase Integration Module
// ============================================================
// Instruksi:
// 1. Ganti firebaseConfig di bawah dengan config dari Firebase Console kamu
// 2. Letakkan file ini di root project (sama level dengan index.html)
// 3. Di script.js, tambahkan: <script type="module" src="script.js"></script>
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAsRDFhH4V0PHOumpwYXs4U6Z-uZS5g1C4",
  authDomain: "trackify-app-420ea.firebaseapp.com",
  projectId: "trackify-app-420ea",
  storageBucket: "trackify-app-420ea.firebasestorage.app",
  messagingSenderId: "815026874634",
  appId: "1:815026874634:web:2185ab91685070677632f3"
};

// ============================================================
// INIT
// ============================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ============================================================
// AUTH
// ============================================================

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  const user = result.user;
  await setDoc(doc(db, "users", user.uid, "profile", "data"), {
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    lastLogin: serverTimestamp()
  }, { merge: true });
  return user;
}

export async function logoutUser() {
  await signOut(auth);
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

// ============================================================
// HELPERS INTERNAL
// ============================================================

function uid() {
  const user = auth.currentUser;
  if (!user) throw new Error("User belum login. Silakan login terlebih dahulu.");
  return user.uid;
}

function userCol(colName) {
  return collection(db, "users", uid(), colName);
}

function userDocRef(colName, docId) {
  return doc(db, "users", uid(), colName, docId);
}

// ============================================================
// GENERIC CRUD — bisa dipakai untuk semua fitur
// ============================================================

/**
 * Tambah item baru ke koleksi
 * @param {string} colName - nama koleksi (journals, todos, habits, dll)
 * @param {object} data - data yang mau disimpan
 * @returns {string} id dokumen yang baru dibuat
 */
export async function addItem(colName, data) {
  const ref = await addDoc(userCol(colName), {
    ...data,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

/**
 * Ambil semua item dari koleksi, diurutkan descending
 * @param {string} colName
 * @param {string} orderField - field untuk sorting (default: createdAt)
 */
export async function getItems(colName, orderField = "createdAt") {
  const q = query(userCol(colName), orderBy(orderField, "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Update item berdasarkan id
 */
export async function updateItem(colName, docId, data) {
  await updateDoc(userDocRef(colName, docId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

/**
 * Hapus satu item
 */
export async function deleteItem(colName, docId) {
  await deleteDoc(userDocRef(colName, docId));
}

/**
 * Hapus semua item dalam koleksi (untuk fitur reset data)
 */
export async function deleteAllItems(colName) {
  const snapshot = await getDocs(userCol(colName));
  await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
}

/**
 * Upsert item dengan ID deterministik (tidak pernah duplikat)
 * @param {string} colName
 * @param {string} docId  - ID unik yang stabil (misal index atau hash)
 * @param {object} data
 */
export async function setItem(colName, docId, data) {
  await setDoc(userDocRef(colName, docId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: false });
}

/**
 * Ganti seluruh koleksi secara atomik dengan data baru.
 * Strategi: hapus doc yang tidak ada di newItems, upsert sisanya.
 * Tidak pernah menghasilkan duplikat karena pakai ID deterministik.
 * @param {string} colName
 * @param {Array<object>} newItems  - tiap item harus punya field _docId
 */
export async function replaceCollection(colName, newItems) {
  const snapshot = await getDocs(userCol(colName));
  const existingIds = new Set(snapshot.docs.map(d => d.id));
  const newIds      = new Set(newItems.map(item => item._docId));

  // Hapus doc yang sudah tidak ada di data baru
  const toDelete = [...existingIds].filter(id => !newIds.has(id));

  // Pakai merge:true supaya createdAt yang sudah ada tidak ditimpa.
  // Kalau createdAt hilang, query orderBy("createdAt") akan skip dokumen itu
  // sehingga data seolah menghilang padahal masih ada di Firestore.
  await Promise.all([
    ...toDelete.map(id => deleteDoc(userDocRef(colName, id))),
    ...newItems.map(({ _docId, ...data }) => {
      const isNew = !existingIds.has(_docId);
      return setDoc(
        userDocRef(colName, _docId),
        { ...data, updatedAt: serverTimestamp(), ...(isNew ? { createdAt: serverTimestamp() } : {}) },
        { merge: true }
      );
    })
  ]);
}

// ============================================================
// STREAK & REWARD
// ============================================================

export async function getStreak() {
  const ref = userDocRef("streak", "data");
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  return { currentStreak: 0, checkIns: [], lastCheckIn: null };
}

export async function updateStreak(data) {
  await setDoc(userDocRef("streak", "data"), data, { merge: true });
}

// ============================================================
// MILESTONES
// ============================================================

export async function getMilestones() {
  const snapshot = await getDocs(userCol("milestones"));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function achieveMilestone(milestoneId) {
  await setDoc(userDocRef("milestones", milestoneId), {
    achieved: true,
    achievedAt: serverTimestamp()
  }, { merge: true });
}

// ============================================================
// CONTOH PENGGUNAAN DI script.js:
// ============================================================
//
// import {
//   loginWithGoogle, logoutUser, onAuthChange, getCurrentUser,
//   addItem, getItems, updateItem, deleteItem, deleteAllItems,
//   getStreak, updateStreak, getMilestones, achieveMilestone
// } from './firebase.js';
//
// // Login
// const user = await loginWithGoogle();
//
// // Simpan jurnal
// await addItem('journals', { date: '2025-04-19', activity: '...', mood: '😄' });
//
// // Ambil semua jurnal
// const journals = await getItems('journals');
//
// // Update todo jadi selesai
// await updateItem('todos', todoId, { done: true });
//
// // Hapus target
// await deleteItem('targets', targetId);
//
// // Hapus semua emosi
// await deleteAllItems('emotions');
//
// // Streak check-in
// const streakData = await getStreak();
// await updateStreak({ currentStreak: 5, lastCheckIn: '2025-04-19', checkIns: [...] });
