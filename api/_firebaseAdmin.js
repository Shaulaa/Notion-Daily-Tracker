import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function parseJsonEnv(name, raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${name} tidak valid JSON: ${err.message}`);
  }
}

function getServiceAccount() {
  const fullJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (fullJson) {
    const parsed = parseJsonEnv('FIREBASE_SERVICE_ACCOUNT_JSON', fullJson);
    const projectId = parsed.project_id || parsed.projectId;
    const clientEmail = parsed.client_email || parsed.clientEmail;
    const privateKey = (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON wajib berisi project_id, client_email, dan private_key');
    }

    return { projectId, clientEmail, privateKey };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, dan FIREBASE_PRIVATE_KEY wajib di-set');
  }

  return { projectId, clientEmail, privateKey };
}

export function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert(getServiceAccount())
  });
}

export function getAdminDB() {
  return getFirestore(getAdminApp());
}

export function getAdminMessaging() {
  return getMessaging(getAdminApp());
}

export { FieldValue };
