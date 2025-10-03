const FIREBASE_SDK_VERSION = "10.13.2";

import firebase from `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-compat.js`;
import `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth-compat.js`;
import `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore-compat.js`;

function normalizeHost(host) {
  return String(host || "").trim().toLowerCase();
}

function toHostMap(raw) {
  if (!raw) return {};
  if (raw instanceof Map) {
    const result = {};
    raw.forEach((value, key) => {
      result[normalizeHost(key)] = value;
    });
    return result;
  }
  if (Array.isArray(raw)) {
    return raw.reduce((acc, entry) => {
      if (!entry || !entry.hosts || !entry.firebaseConfig) return acc;
      const hosts = Array.isArray(entry.hosts) ? entry.hosts : [entry.hosts];
      hosts.forEach((host) => {
        const normalized = normalizeHost(host);
        if (!normalized) return;
        acc[normalized] = {
          id: entry.id || null,
          label: entry.label || null,
          apiBase: entry.apiBase || entry.API_BASE || "",
          firebaseConfig: entry.firebaseConfig || entry.FIREBASE_CONFIG || null
        };
      });
      return acc;
    }, {});
  }
  if (typeof raw === "object") {
    return Object.keys(raw).reduce((acc, key) => {
      acc[normalizeHost(key)] = raw[key];
      return acc;
    }, {});
  }
  return {};
}

function resolveRuntimeClient() {
  const host = normalizeHost(window.location.host || window.location.hostname);
  const preloadedMap = toHostMap(window.LEGMASTER_CLIENTS_MAP);
  const externalOverrides = Array.isArray(window.LEGMASTER_CLIENTS)
    ? toHostMap(window.LEGMASTER_CLIENTS)
    : {};
  const fullMap = { ...preloadedMap, ...externalOverrides };
  const fallback = window.LEGMASTER_DEFAULT_CLIENT || null;
  const fromMap = (host && fullMap[host]) ? fullMap[host] : null;
  const resolved = fromMap || fallback;

  if (!resolved || !resolved.firebaseConfig) {
    console.error(`[firebase.js] No Firebase config found for host "${host}". Define LEGMASTER_DEFAULT_CLIENT or add an entry in LEGMASTER_CLIENTS_MAP.`);
    return {
      host,
      resolved: null,
      firebaseConfig: null,
      apiBase: ""
    };
  }

  return {
    host,
    resolved,
    firebaseConfig: resolved.firebaseConfig,
    apiBase: resolved.apiBase || "",
    id: resolved.id || null
  };
}

const runtimeClient = resolveRuntimeClient();
const firebaseConfig = runtimeClient.firebaseConfig;

if (!firebaseConfig) {
  throw new Error("Firebase config not provided. Check LEGMASTER_CLIENTS_MAP or LEGMASTER_DEFAULT_CLIENT.");
}

const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

if (runtimeClient.apiBase && typeof runtimeClient.apiBase === "string" && runtimeClient.apiBase.trim()) {
  const trimmed = runtimeClient.apiBase.trim();
  if (!window.__LEGMASTER_API_BASE__ || window.__LEGMASTER_API_BASE__ !== trimmed) {
    window.__LEGMASTER_API_BASE__ = trimmed;
  }
}

window.firebase = firebase;
window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseAppInitialized = true;
window.LegmasterFirebase = {
  host: runtimeClient.host,
  clientId: runtimeClient.id,
  apiBase: runtimeClient.apiBase,
  hasPersistenceSetup: false
};

const browserLocalPersistence = firebase.auth.Auth.Persistence.LOCAL;

function setPersistenceWrapper(targetAuth, persistence) {
  try {
    if (!targetAuth || typeof targetAuth.setPersistence !== "function") {
      return Promise.resolve();
    }
    return targetAuth.setPersistence(persistence);
  } catch (err) {
    return Promise.reject(err);
  }
}

export function markPersistenceConfigured() {
  const state = window.LegmasterFirebase || {};
  state.hasPersistenceSetup = true;
  window.LegmasterFirebase = state;
}

export function getRuntimeClient() {
  return runtimeClient;
}

export const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
export const increment = (value = 1) => firebase.firestore.FieldValue.increment(value);
export const Timestamp = firebase.firestore.Timestamp;

export { app, auth, db };
export { firebase as firebaseCompat };
export { setPersistenceWrapper as setPersistence, browserLocalPersistence };

export default {
  app,
  auth,
  db,
  firebase: firebase,
  setPersistence: setPersistenceWrapper,
  browserLocalPersistence,
  serverTimestamp,
  Timestamp,
  increment,
  markPersistenceConfigured,
  getRuntimeClient
};
