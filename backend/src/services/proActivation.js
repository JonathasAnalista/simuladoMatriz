import { getTenantServices } from '../firebase.js';

const DAYS_DEFAULT = 365;

const emailDocId = (email) =>
  String(email || '')
    .trim()
    .toLowerCase()
    .replace(/[.@]/g, '_');

const resolveContext = (tenant) => getTenantServices(tenant);

const expirationTimestamp = (Timestamp, days) =>
  Timestamp.fromDate(new Date(Date.now() + days * 86400000));

export async function activateProFor(uid, purchase, { days = DAYS_DEFAULT, tenant } = {}) {
  if (!uid) return;
  const { db, auth, Timestamp } = resolveContext(tenant);
  const ref = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    const expires = expirationTimestamp(Timestamp, days);
    const current = snap.exists ? snap.data() : {};

    if (current?.plan?.purchase?.id === purchase.id) return;

    tx.set(
      ref,
      {
        plan: {
          type: 'PRO',
          status: 'active',
          startedAt: now,
          expiresAt: expires,
          purchase
        }
      },
      { merge: true }
    );
  });

  await auth.setCustomUserClaims(uid, { plan: 'pro' });
}

export async function activateProByEmail(email, purchase, { days = DAYS_DEFAULT, tenant } = {}) {
  if (!email) return;
  const { db, Timestamp } = resolveContext(tenant);
  const id = emailDocId(email);
  const ref = db.collection('liberacoes').doc(id);
  const now = Timestamp.now();
  const expires = expirationTimestamp(Timestamp, days);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = snap.exists ? snap.data() : {};
    if (previous?.purchase?.id === purchase.id && previous?.plano === 'pro') return;

    tx.set(
      ref,
      {
        email: String(email || '').trim().toLowerCase(),
        plano: 'pro',
        ativo: true,
        ate: expires,
        atualizadoEm: now,
        purchase
      },
      { merge: true }
    );
  });
}

export async function activateProLegacyUser(uid, purchase, { days = DAYS_DEFAULT, tenant } = {}) {
  if (!uid) return;
  const { db, auth, Timestamp } = resolveContext(tenant);
  const ref = db.collection('users').doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    const expires = expirationTimestamp(Timestamp, days);
    const current = snap.exists ? snap.data() : {};

    if (current?.plan?.purchase?.id === purchase.id) return;

    tx.set(
      ref,
      { plan: { type: 'PRO', status: 'active', startedAt: now, expiresAt: expires, purchase } },
      { merge: true }
    );
  });

  try {
    await auth.setCustomUserClaims(uid, { plan: 'pro' });
  } catch (error) {
    console.warn('[proActivation] falha ao definir custom claim', error);
  }
}
