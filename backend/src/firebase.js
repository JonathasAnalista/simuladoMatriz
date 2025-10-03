import admin from 'firebase-admin';
import { config } from './config.js';

const DEFAULT_CACHE_KEY = '__default__';
const appCache = new Map();

const buildCredential = (firebaseConfig) =>
  admin.credential.cert({
    projectId: firebaseConfig.projectId,
    clientEmail: firebaseConfig.clientEmail,
    privateKey: firebaseConfig.privateKey
  });

const ensureDefaultApp = () => {
  if (appCache.has(DEFAULT_CACHE_KEY)) {
    return appCache.get(DEFAULT_CACHE_KEY);
  }

  const existing = admin.apps.find((app) => app.name === '[DEFAULT]');
  if (existing) {
    appCache.set(DEFAULT_CACHE_KEY, existing);
    return existing;
  }

  if (!config.firebase) {
    return null;
  }

  const app = admin.initializeApp({
    credential: buildCredential(config.firebase)
  });

  appCache.set(DEFAULT_CACHE_KEY, app);
  return app;
};

const ensureAppForTenant = (tenant) => {
  if (!tenant) {
    return ensureDefaultApp();
  }

  const cacheKey = tenant.id || DEFAULT_CACHE_KEY;

  if (appCache.has(cacheKey)) {
    return appCache.get(cacheKey);
  }

  const firebaseConfig = tenant.firebase || config.firebase;
  if (!firebaseConfig) {
    throw new Error(`[firebase] Tenant '${tenant.id}' não possui credenciais configuradas.`);
  }

  const existing = admin.apps.find((app) => app.name === tenant.id);
  const app =
    existing ||
    admin.initializeApp(
      {
        credential: buildCredential(firebaseConfig)
      },
      tenant.id
    );

  appCache.set(cacheKey, app);
  return app;
};

export const firebaseAdmin = admin;

const defaultApp = ensureDefaultApp();

export const db = defaultApp ? defaultApp.firestore() : null;

export function getFirebaseApp(tenant) {
  return ensureAppForTenant(tenant);
}

export function getFirestore(tenant) {
  const app = ensureAppForTenant(tenant);
  return app ? app.firestore() : null;
}

export function getAuth(tenant) {
  const app = ensureAppForTenant(tenant);
  return app ? app.auth() : null;
}

export function getTenantServices(tenant) {
  const app = ensureAppForTenant(tenant);
  if (!app) {
    throw new Error('[firebase] Nenhuma credencial disponível para o tenant solicitado.');
  }

  return {
    tenant,
    app,
    admin,
    db: app.firestore(),
    auth: app.auth(),
    Timestamp: admin.firestore.Timestamp
  };
}
