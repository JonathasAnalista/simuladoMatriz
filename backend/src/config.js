import { readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const requiredEnv = (value, name) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const maskEnvValue = (value) =>
  value ? `${String(value).slice(0, 6)}***${String(value).slice(-4)}` : null;

const sanitizePrivateKey = (key) =>
  key ? String(key).replace(/\\n/g, '\n') : undefined;

const sanitizeString = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const toLowerOrNull = (value) => {
  const text = sanitizeString(value);
  return text ? text.toLowerCase() : null;
};

const hostFromUrl = (value) => {
  const text = sanitizeString(value);
  if (!text) return null;
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const readTenantsSource = () => {
  const pathEnv = sanitizeString(process.env.TENANTS_CONFIG_PATH);
  const jsonEnv = process.env.TENANTS_CONFIG_JSON || process.env.TENANTS_CONFIG;

  if (pathEnv) {
    const absolute = path.isAbsolute(pathEnv)
      ? pathEnv
      : path.resolve(process.cwd(), pathEnv);
    try {
      return readFileSync(absolute, 'utf8');
    } catch (error) {
      console.error('[config] Não foi possível ler TENANTS_CONFIG_PATH:', absolute, error.message);
    }
  }

  if (typeof jsonEnv === 'string' && jsonEnv.trim()) {
    return jsonEnv;
  }

  return null;
};

const normalizeTenant = (raw, index) => {
  if (!raw || typeof raw !== 'object') {
    console.warn('[config] Ignorando tenant inválido na posição', index);
    return null;
  }

  const id = sanitizeString(raw.id || raw.slug);
  if (!id) {
    console.warn('[config] Tenant sem id definido na posição', index);
    return null;
  }

  const firebase = raw.firebase || {};
  const projectId = sanitizeString(firebase.projectId);
  const clientEmail = sanitizeString(firebase.clientEmail);
  const privateKey = sanitizePrivateKey(firebase.privateKey);

  if (!projectId || !clientEmail || !privateKey) {
    console.warn(`[config] Tenant '${id}' ignorado: credenciais Firebase incompletas.`);
    return null;
  }

  const frontendUrl = sanitizeString(raw.frontendUrl);
  const baseUrl = sanitizeString(raw.baseUrl);
  const mpAccessToken = sanitizeString(raw.mpAccessToken);

  const hostsSet = new Set();
  const pushHost = (value) => {
    const host = toLowerOrNull(value);
    if (host) hostsSet.add(host);
  };

  if (Array.isArray(raw.hosts)) raw.hosts.forEach(pushHost);
  if (Array.isArray(raw.domains)) raw.domains.forEach(pushHost);

  const originsSet = new Set();
  const pushOrigin = (value) => {
    const origin = sanitizeString(value);
    if (origin) originsSet.add(origin);
  };

  if (Array.isArray(raw.origins)) raw.origins.forEach(pushOrigin);
  if (Array.isArray(raw.allowedOrigins)) raw.allowedOrigins.forEach(pushOrigin);
  if (frontendUrl) pushOrigin(frontendUrl);

  const allowedOrigins = Array.from(originsSet);

  allowedOrigins.forEach((origin) => {
    const host = hostFromUrl(origin);
    if (host) hostsSet.add(host);
  });

  if (!hostsSet.size && frontendUrl) {
    const host = hostFromUrl(frontendUrl);
    if (host) hostsSet.add(host);
  }

  return {
    id,
    label: sanitizeString(raw.label) || id,
    isDefault: Boolean(raw.isDefault),
    hosts: Array.from(hostsSet),
    frontendUrl: frontendUrl || null,
    baseUrl: baseUrl || null,
    mpAccessToken: mpAccessToken || null,
    firebase: {
      projectId,
      clientEmail,
      privateKey
    },
    allowedOrigins
  };
};

const loadTenants = () => {
  const source = readTenantsSource();
  if (!source) return [];

  try {
    const parsed = JSON.parse(source);
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tenants)
        ? parsed.tenants
        : null;

    if (!Array.isArray(list)) {
      console.error('[config] Arquivo de tenants inválido: esperado array ou objeto { tenants: [] }.');
      return [];
    }

    return list
      .map((item, index) => normalizeTenant(item, index))
      .filter(Boolean);
  } catch (error) {
    console.error('[config] Falha ao interpretar configuração de tenants:', error.message);
    return [];
  }
};

const tenants = loadTenants();
const defaultTenant = tenants.find((tenant) => tenant.isDefault) || tenants[0] || null;

const envFrontendUrl = sanitizeString(process.env.FRONTEND_URL) || null;
const envBaseUrl = sanitizeString(process.env.BASE_URL) || null;
const envMpAccessToken = sanitizeString(process.env.MP_ACCESS_TOKEN) || null;

const envFirebaseProjectId = sanitizeString(process.env.FIREBASE_PROJECT_ID) || null;
const envFirebaseClientEmail = sanitizeString(process.env.FIREBASE_CLIENT_EMAIL) || null;
const envFirebasePrivateKey = sanitizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

let defaultFirebase = null;

if (envFirebaseProjectId || envFirebaseClientEmail || envFirebasePrivateKey) {
  defaultFirebase = {
    projectId: requiredEnv(envFirebaseProjectId, 'FIREBASE_PROJECT_ID'),
    clientEmail: requiredEnv(envFirebaseClientEmail, 'FIREBASE_CLIENT_EMAIL'),
    privateKey: requiredEnv(envFirebasePrivateKey, 'FIREBASE_PRIVATE_KEY')
  };
} else if (!tenants.length) {
  throw new Error(
    'Missing Firebase credentials: configure variáveis padrão ou forneça TENANTS_CONFIG.'
  );
}

const envCorsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => sanitizeString(origin))
  .filter(Boolean);

const allowedOriginsSet = new Set([
  ...DEFAULT_LOCAL_ORIGINS,
  ...envCorsOrigins
]);

if (envFrontendUrl) allowedOriginsSet.add(envFrontendUrl);

tenants.forEach((tenant) => {
  if (tenant.frontendUrl) {
    allowedOriginsSet.add(tenant.frontendUrl);
  }
  tenant.allowedOrigins.forEach((origin) => allowedOriginsSet.add(origin));
});

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8080),
  frontendUrl: envFrontendUrl || defaultTenant?.frontendUrl || null,
  baseUrl: envBaseUrl || defaultTenant?.baseUrl || null,
  mpAccessToken: envMpAccessToken || defaultTenant?.mpAccessToken || null,
  allowedOrigins: Array.from(allowedOriginsSet).filter(Boolean),
  firebase: defaultFirebase,
  tenants,
  defaultTenantId: defaultTenant?.id || null
};

export function logLoadedConfig() {
  console.log('[ENV] {');
  console.log('  NODE_ENV       :', `'${config.env}'`, ',');
  console.log('  FRONTEND_URL   :', `'${config.frontendUrl}'`, ',');
  console.log('  BASE_URL       :', `'${config.baseUrl}'`, ',');
  console.log('  PORT           :', `'${config.port}'`, ',');
  console.log('  MP_ACCESS_TOKEN:', `'${maskEnvValue(config.mpAccessToken)}'`, ',');
  console.log('  TENANTS        :', `[${config.tenants.map((tenant) => tenant.id).join(', ')}]`, ',');
  console.log('  DEFAULT_TENANT :', `'${config.defaultTenantId || ''}'`);
  console.log('}');

  const everyTenantHasMpToken = config.tenants.length
    ? config.tenants.every((tenant) => tenant.mpAccessToken)
    : false;

  if (!config.mpAccessToken && !everyTenantHasMpToken) {
    console.warn('[env] Atenção: MP_ACCESS_TOKEN não definido - rotas Mercado Pago retornarão erro 500.');
  }

  if (!config.baseUrl && !config.tenants.length) {
    console.warn('[env] Atenção: BASE_URL não definido - notificações Mercado Pago não funcionarão.');
  }

  if (!config.frontendUrl && !config.tenants.length) {
    console.warn('[env] Atenção: FRONTEND_URL não definido - redirecionamentos de pagamento podem quebrar.');
  }
}

export const listTenants = () => config.tenants;

export function findTenantById(id) {
  const normalized = sanitizeString(id);
  if (!normalized) return null;
  return config.tenants.find((tenant) => tenant.id === normalized) || null;
}

export function findTenantByHost(hostname) {
  const normalized = toLowerOrNull(hostname);
  if (!normalized) return null;
  return config.tenants.find((tenant) => tenant.hosts.includes(normalized)) || null;
}

export function findTenantByOrigin(origin) {
  const host = hostFromUrl(origin);
  if (!host) return null;
  return findTenantByHost(host);
}

export function resolveTenant({ tenantId, host, origin } = {}) {
  return (
    findTenantById(tenantId) ||
    findTenantByHost(host) ||
    findTenantByOrigin(origin) ||
    (config.defaultTenantId ? findTenantById(config.defaultTenantId) : null) ||
    config.tenants[0] ||
    null
  );
}
