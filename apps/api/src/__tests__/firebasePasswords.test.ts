/**
 * Email/password accounts held in Firebase Auth (FIREBASE_API_KEY set).
 * Firebase is an in-memory fake so the suite stays offline and keyless; the
 * Admin token check is mocked to read that fake.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@aquazerofit/shared';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'azf-firebase-passwords-'));
process.env.AZF_DATA_DIR = dataDir;
process.env.EXPOSE_DEV_TOKENS = 'true';

interface FakeAccount {
  uid: string;
  email: string;
  password: string;
  emailVerified: boolean;
  displayName?: string;
  signInProvider?: string;
}

/** Firebase Auth as the API sees it: accounts by email, ID tokens by uid. */
const firebase = {
  accounts: new Map<string, FakeAccount>(),
  resets: [] as string[],
  verifications: [] as string[],
  /** uid -> Firebase tokensValidAfterTime (ms), moved by any password change. */
  validAfter: new Map<string, number>(),
  validAfterFails: false,
  failNext: false,
  nextUid: 1,
  add(email: string, password: string, emailVerified = false): FakeAccount {
    const account = { uid: `fb-uid-${firebase.nextUid++}`, email, password, emailVerified };
    firebase.accounts.set(email, account);
    firebase.validAfter.set(account.uid, Date.now());
    return account;
  },
  byUid(uid: string): FakeAccount | undefined {
    return [...firebase.accounts.values()].find((a) => a.uid === uid);
  },
};

const gateway = {
  async create(input: { email: string; password: string; displayName: string }) {
    if (firebase.failNext) {
      firebase.failNext = false;
      throw new Error('Firebase is down');
    }
    if (firebase.accounts.has(input.email)) return null;
    const account = firebase.add(input.email, input.password);
    account.displayName = input.displayName;
    return account.uid;
  },
  async signIn(email: string, password: string) {
    const account = firebase.accounts.get(email);
    return account && account.password === password ? `idt:${account.uid}` : null;
  },
  async setPassword(uid: string, password: string) {
    if (firebase.failNext) {
      firebase.failNext = false;
      throw new Error('Firebase is down');
    }
    const account = firebase.byUid(uid);
    if (!account) throw new Error('auth/user-not-found');
    account.password = password;
    firebase.validAfter.set(uid, Date.now());
  },
  async sendPasswordReset(email: string) {
    firebase.resets.push(email);
  },
  async sendVerification(email: string, password: string) {
    if (firebase.accounts.get(email)?.password === password) firebase.verifications.push(email);
  },
  async tokensValidAfter(uid: string) {
    if (firebase.validAfterFails) throw new Error('Firebase is down');
    return firebase.validAfter.get(uid) ?? null;
  },
};

/** A password change made outside this API: the web, or Firebase's reset page. */
function changePasswordInFirebase(email: string, password: string): void {
  const account = firebase.accounts.get(email)!;
  account.password = password;
  firebase.validAfter.set(account.uid, Date.now() + 1_000);
}

vi.mock('../platform/firebaseAdmin', () => ({
  isFirebaseAdminConfigured: () => true,
  verifyFirebaseIdToken: async (token: string) => {
    if (!token.startsWith('idt:')) return null;
    const account = firebase.byUid(token.slice(4));
    if (!account) throw new Error('auth/user-not-found');
    return {
      uid: account.uid,
      email: account.email,
      emailVerified: account.emailVerified,
      name: account.displayName,
      signInProvider: account.signInProvider ?? (account.password ? 'password' : 'google.com'),
    };
  },
  getFirebaseAuth: () => null,
  resetFirebaseAdminForTests: () => undefined,
  removeFirebaseIdentity: async () => undefined,
  FIREBASE_ACCOUNT_DELETE_FAILED: 'firebase_account_delete_failed',
}));

const { createApp } = await import('../app');
const { getStore, newId } = await import('../platform/store');
const { credentialsId } = await import('../modules/me/service');
const { resetLoginFailures, resetTelegramNewAccountLimits, findUserByEmail } = await import('../modules/auth/service');
const { signTelegramInitData } = await import('../modules/auth/telegram');
const { setFirebasePasswordsForTests } = await import('../modules/auth/firebasePasswords');
const app = createApp();
const base = '/api/v1';

const PASSWORD = 'CorrectHorse9Battery';
let emailCounter = 0;
const nextEmail = () => `fbpw-${Date.now()}-${emailCounter++}@example.com`;

const login = (email: string, password: string) =>
  request(app).post(`${base}/auth/login`).send({ email, password });

/** An Android account from before this change: bcrypt credentials, no Firebase. */
function legacyUser(email: string, password: string): User {
  const user: User = {
    id: newId('usr'),
    email,
    emailVerified: false,
    role: 'user',
    tier: 'free',
    displayName: 'Legacy',
    createdAt: new Date().toISOString(),
    deletionRequestedAt: null,
  };
  getStore().upsert('users', user);
  getStore().upsert('users', {
    id: credentialsId(user.id),
    type: 'credentials',
    userId: user.id,
    passwordHash: bcrypt.hashSync(password, 4),
  });
  return user;
}

const hasCredentials = (userId: string) => getStore().byId('users', credentialsId(userId)) !== undefined;

/** POST a reset request with dev token echo on; returns the response. */
async function requestReset(email: string) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    return await request(app).post(`${base}/auth/password-reset/request`).send({ email });
  } finally {
    process.env.NODE_ENV = previous;
  }
}

/**
 * POST /me/credentials with dev token echo on. The address waits on the
 * mailbox (202) until the returned token is confirmed.
 */
async function claimEmail(accessToken: string, email: string) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    return await request(app)
      .post(`${base}/me/credentials`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email, password: PASSWORD });
  } finally {
    process.env.NODE_ENV = previous;
  }
}

const confirmEmail = (token: string) =>
  request(app).post(`${base}/auth/email-confirm`).send({ token });

beforeEach(() => {
  setFirebasePasswordsForTests(gateway);
  resetLoginFailures();
  resetTelegramNewAccountLimits();
  firebase.failNext = false;
  firebase.validAfterFails = false;
});

afterAll(async () => {
  setFirebasePasswordsForTests(undefined);
  await getStore().flush();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup on Windows */
  }
});

describe('register with Firebase-held passwords', () => {
  it('creates the Firebase user and stores no password here', async () => {
    const email = nextEmail();
    const res = await request(app)
      .post(`${base}/auth/register`)
      .send({ email, password: PASSWORD, displayName: 'Ada' });

    expect(res.status).toBe(201);
    const account = firebase.accounts.get(email);
    expect(account).toMatchObject({ password: PASSWORD, displayName: 'Ada' });
    const user = findUserByEmail(email)!;
    expect(user.firebaseUid).toBe(account!.uid);
    expect(hasCredentials(user.id)).toBe(false);
  });

  it('refuses an email Firebase already holds, without creating a local user', async () => {
    const email = nextEmail();
    firebase.add(email, 'SomeoneElse9Password');
    const res = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(findUserByEmail(email)).toBeUndefined();
  });

  it('writes nothing when Firebase fails', async () => {
    const email = nextEmail();
    firebase.failNext = true;
    const res = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });

    expect(res.status).toBe(500);
    expect(findUserByEmail(email)).toBeUndefined();
  });
});

describe('login with Firebase-held passwords', () => {
  it('signs in an account created on the web', async () => {
    const email = nextEmail();
    const account = firebase.add(email, PASSWORD, true);

    const res = await login(email, PASSWORD);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    expect(findUserByEmail(email)!.firebaseUid).toBe(account.uid);
  });

  it('signs in an account made by /auth/register, which the web can also use', async () => {
    const email = nextEmail();
    await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });

    const res = await login(email, PASSWORD);

    expect(res.status).toBe(200);
    expect(await gateway.signIn(email, PASSWORD)).not.toBeNull();
  });

  it('answers a wrong password the same way as an unknown email', async () => {
    const email = nextEmail();
    firebase.add(email, PASSWORD, true);

    const wrong = await login(email, 'Wrong9PasswordHere');
    const unknown = await login(nextEmail(), PASSWORD);

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks the email after five wrong passwords', async () => {
    const email = nextEmail();
    firebase.add(email, PASSWORD, true);
    for (let i = 0; i < 5; i++) await login(email, 'Wrong9PasswordHere');

    const res = await login(email, PASSWORD);

    expect(res.status).toBe(429);
  });
});

describe('moving a bcrypt account to Firebase', () => {
  it('creates the Firebase user on a correct password and drops the local hash', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);

    const res = await login(email, PASSWORD);

    expect(res.status).toBe(200);
    const account = firebase.accounts.get(email);
    expect(account?.password).toBe(PASSWORD);
    expect(getStore().byId<User>('users', user.id)!.firebaseUid).toBe(account!.uid);
    expect(hasCredentials(user.id)).toBe(false);
    expect((await login(email, PASSWORD)).status).toBe(200);
  });

  it('does not move anything on a wrong password', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);

    expect((await login(email, 'Wrong9PasswordHere')).status).toBe(401);
    expect(firebase.accounts.has(email)).toBe(false);
    expect(hasCredentials(user.id)).toBe(true);
  });

  it('links a separate Firebase account with the same email and password', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    const account = firebase.add(email, PASSWORD);

    expect((await login(email, PASSWORD)).status).toBe(200);
    expect(getStore().byId<User>('users', user.id)!.firebaseUid).toBe(account.uid);
    expect(hasCredentials(user.id)).toBe(false);
  });

  it('keeps the bcrypt sign-in when that Firebase account has another password', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    firebase.add(email, 'Different9Password');

    expect((await login(email, PASSWORD)).status).toBe(200);
    expect(getStore().byId<User>('users', user.id)!.firebaseUid).toBeUndefined();
    expect(hasCredentials(user.id)).toBe(true);
  });

  it('still signs in when Firebase fails mid-move', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    firebase.failNext = true;

    expect((await login(email, PASSWORD)).status).toBe(200);
    expect(hasCredentials(user.id)).toBe(true);
  });

  it('adds the password to a Firebase identity the account is already linked to', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    const google = firebase.add(email, '', true);
    getStore().upsert('users', { ...getStore().byId<User>('users', user.id)!, firebaseUid: google.uid });

    expect((await login(email, PASSWORD)).status).toBe(200);
    expect(google.password).toBe(PASSWORD);
    expect(hasCredentials(user.id)).toBe(false);
  });
});

describe('password reset with Firebase-held passwords', () => {
  it('has Firebase send the reset email for a Firebase account', async () => {
    const email = nextEmail();
    firebase.add(email, PASSWORD, true);
    await login(email, PASSWORD);

    const res = await requestReset(email);

    expect(res.status).toBe(202);
    expect(res.body.devToken).toBeUndefined();
    await vi.waitFor(() => expect(firebase.resets).toContain(email));
  });

  it('keeps the API reset for a bcrypt account', async () => {
    const email = nextEmail();
    legacyUser(email, PASSWORD);

    const res = await requestReset(email);

    expect(res.status).toBe(202);
    expect(res.body.devToken).toBeTypeOf('string');
    expect(firebase.resets).not.toContain(email);
  });

  it('sets the Firebase password when an API reset link is used after the move', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    const token = (await requestReset(email)).body.devToken as string;
    await login(email, PASSWORD); // moves the account to Firebase

    const NEW_PASSWORD = 'BrandNew7Password';
    const res = await request(app)
      .post(`${base}/auth/password-reset/confirm`)
      .send({ token, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(firebase.accounts.get(email)!.password).toBe(NEW_PASSWORD);
    expect(hasCredentials(user.id)).toBe(false);
  });

  it('leaves the reset link usable when Firebase fails, and single-use after', async () => {
    const email = nextEmail();
    legacyUser(email, PASSWORD);
    const token = (await requestReset(email)).body.devToken as string;
    await login(email, PASSWORD); // moves the account to Firebase
    const confirm = () =>
      request(app)
        .post(`${base}/auth/password-reset/confirm`)
        .send({ token, newPassword: 'BrandNew7Password' });

    firebase.failNext = true;
    expect((await confirm()).status).toBe(500);
    expect((await confirm()).status).toBe(200);
    expect((await confirm()).status).toBe(400);
  });
});

describe('sessions after a password change in Firebase', () => {
  /*
   * Android holds this API's refresh tokens, not Firebase's. A reset through
   * Firebase's own mail (the only reset an account in Firebase gets) or a
   * change on the web never reached them, so a stolen Android session lived
   * on through the reset meant to end it. Refresh now checks Firebase's
   * tokensValidAfterTime against when the session was opened.
   */
  const refresh = (refreshToken: string) =>
    request(app).post(`${base}/auth/refresh`).send({ refreshToken });

  it('ends an Android session opened before the change', async () => {
    const email = nextEmail();
    const opened = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    const rotated = await refresh(opened.body.refreshToken);
    expect(rotated.status).toBe(200);

    changePasswordInFirebase(email, 'BrandNew7Password');

    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
  });

  it('ends a session opened before this check existed', async () => {
    const email = nextEmail();
    const opened = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    const userId = findUserByEmail(email)!.id;
    const rotated = await refresh(opened.body.refreshToken);
    // Families from before familyCreatedAt carry only per-token createdAt.
    for (const rec of getStore().where<{ id: string; type?: string; userId?: string }>(
      'users',
      (d) => (d as { type?: string }).type === 'refreshToken' && (d as { userId?: string }).userId === userId,
    )) {
      const { familyCreatedAt: _dropped, ...legacy } = rec as typeof rec & { familyCreatedAt?: string };
      getStore().upsert('users', legacy);
    }
    // The change lands between the family's first token and its current one.
    const account = firebase.accounts.get(email)!;
    account.password = 'BrandNew7Password';
    const first = getStore()
      .where<{ id: string; createdAt: string; type?: string; userId?: string }>(
        'users',
        (d) => (d as { type?: string }).type === 'refreshToken' && (d as { userId?: string }).userId === userId,
      )
      .map((r) => Date.parse(r.createdAt))
      .sort((a, b) => a - b)[0]!;
    firebase.validAfter.set(account.uid, first + 1);
    const current = getStore().findOne<{ id: string; createdAt: string; tokenHash: string }>(
      'users',
      (d) => (d as { usedAt?: unknown }).usedAt === null && (d as { userId?: string }).userId === userId,
    )!;
    getStore().upsert('users', { ...current, createdAt: new Date(first + 60_000).toISOString() });

    expect((await refresh(rotated.body.refreshToken)).status).toBe(401);
  });

  it('keeps a session opened after the change', async () => {
    const email = nextEmail();
    await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    firebase.accounts.get(email)!.password = 'BrandNew7Password';
    firebase.validAfter.set(firebase.accounts.get(email)!.uid, Date.now() - 1_000);

    const opened = await login(email, 'BrandNew7Password');
    expect((await refresh(opened.body.refreshToken)).status).toBe(200);
  });

  it('keeps the session when Firebase cannot be asked', async () => {
    const email = nextEmail();
    const opened = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    firebase.validAfterFails = true;

    expect((await refresh(opened.body.refreshToken)).status).toBe(200);
  });
});

describe('email verification with Firebase-held passwords', () => {
  /*
   * Nothing sent a verification mail, so every account made or moved here
   * stayed unverified, and assertFirebaseEmailProved then refused it a
   * Telegram link for good. Firebase sends its own, and the next sign-in
   * after the click records the proof.
   */
  it('asks Firebase to send one on register', async () => {
    const email = nextEmail();
    await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
    await vi.waitFor(() => expect(firebase.verifications).toContain(email));
  });

  it('asks Firebase to send one when an account moves across', async () => {
    const email = nextEmail();
    legacyUser(email, PASSWORD);
    await login(email, PASSWORD);
    await vi.waitFor(() => expect(firebase.verifications).toContain(email));
  });

  it('does not hold up register when Firebase cannot send it', async () => {
    const email = nextEmail();
    const sendVerification = gateway.sendVerification;
    gateway.sendVerification = async () => {
      throw new Error('Firebase is down');
    };
    try {
      const res = await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });
      expect(res.status).toBe(201);
    } finally {
      gateway.sendVerification = sendVerification;
    }
  });
});

describe('with Firebase-held passwords off', () => {
  it('keeps bcrypt credentials on register', async () => {
    setFirebasePasswordsForTests(null);
    const email = nextEmail();
    await request(app).post(`${base}/auth/register`).send({ email, password: PASSWORD });

    const user = findUserByEmail(email)!;
    expect(user.firebaseUid).toBeUndefined();
    expect(hasCredentials(user.id)).toBe(true);
    expect(firebase.accounts.has(email)).toBe(false);
  });
});

describe('Firebase password regressions (hasPassword, /me/credentials, legacy Telegram preservation)', () => {
  const tgInitData = (tgId: number) =>
    signTelegramInitData({
      auth_date: String(Math.floor(Date.now() / 1000)),
      query_id: `AA-fbpw-${tgId}`,
      user: JSON.stringify({ id: tgId, first_name: 'Tess', username: `tess_${tgId}` }),
    });

  it('reports hasPassword: true after Firebase register and after bcrypt migration', async () => {
    const regEmail = nextEmail();
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: regEmail, password: PASSWORD, displayName: 'Ada' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.hasPassword).toBe(true);
    const regMe = await request(app)
      .get(`${base}/me`)
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(regMe.status).toBe(200);
    expect(regMe.body.user.hasPassword).toBe(true);

    const migEmail = nextEmail();
    legacyUser(migEmail, PASSWORD);
    const migrated = await login(migEmail, PASSWORD);
    expect(migrated.status).toBe(200);
    expect(migrated.body.user.hasPassword).toBe(true);
    const migMe = await request(app)
      .get(`${base}/me`)
      .set('Authorization', `Bearer ${migrated.body.accessToken}`);
    expect(migMe.status).toBe(200);
    expect(migMe.body.user.hasPassword).toBe(true);
  });

  it('rejects POST /me/credentials with 409 for an existing Firebase account', async () => {
    const email = nextEmail();
    const reg = await request(app)
      .post(`${base}/auth/register`)
      .send({ email, password: PASSWORD, displayName: 'Ada' });
    expect(reg.status).toBe(201);
    // Dev marks local emailVerified true so assertFirebaseEmailProved passes and
    // the 409 existing-account check is what fires.
    const res = await request(app)
      .post(`${base}/me/credentials`)
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ email: nextEmail(), password: 'BrandNew9Password' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
    expect(res.body.message).toMatch(/already has a password/i);
    expect(hasCredentials(reg.body.user.id as string)).toBe(false);
  });

  it("holds a Telegram user's email until the link is opened, then moves the password into Firebase", async () => {
    const tg = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: tgInitData(980001) });
    expect(tg.status).toBe(200);
    expect(tg.body.user.hasPassword).toBe(false);

    const email = nextEmail();
    const set = await claimEmail(tg.body.accessToken as string, email);
    expect(set.status).toBe(202);
    expect(set.body.pendingEmail).toBe(email);
    expect(set.body.user.hasPassword).toBe(false);
    expect(set.body.user.email).not.toBe(email);
    // Nothing holds the address before the mailbox answers.
    expect(firebase.accounts.get(email)).toBeUndefined();
    expect(findUserByEmail(email)).toBeUndefined();

    expect((await confirmEmail(set.body.devToken as string)).status).toBe(200);
    const signedIn = await login(email, PASSWORD);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.user.emailVerified).toBe(true);
    expect(signedIn.body.user.hasPassword).toBe(true);

    // The first sign-in moved the confirmed password into Firebase.
    const stored = getStore().byId<User>('users', tg.body.user.id as string)!;
    const fbAccount = firebase.accounts.get(email);
    expect(fbAccount).toBeDefined();
    expect(stored.firebaseUid).toBe(fbAccount!.uid);
    expect(stored.firebasePassword).toBe(true);
    expect(hasCredentials(stored.id)).toBe(false);

    // A second Telegram user cannot claim an address an account now holds.
    const tg2 = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: tgInitData(980002) });
    const conflict = await claimEmail(tg2.body.accessToken as string, email);
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe('CONFLICT');
  });

  it('preserves a pre-existing Telegram link when a migrated legacy bcrypt user verifies their email', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    getStore().upsert('users', { ...user, tgId: 980010, tgUsername: 'legacy_tg' });

    // First login moves the bcrypt password into Firebase (unverified) and sets migratedFromBcrypt.
    const moved = await login(email, PASSWORD);
    expect(moved.status).toBe(200);
    const afterMove = getStore().byId<User>('users', user.id)!;
    expect(afterMove.firebaseUid).toBeDefined();
    expect(afterMove.firebasePassword).toBe(true);
    expect(afterMove.emailVerified).toBe(false);
    expect(afterMove.migratedFromBcrypt).toBe(true);
    expect(afterMove.tgId).toBe(980010);

    // Later, the user clicks the verification link and signs in via Firebase.
    firebase.accounts.get(email)!.emailVerified = true;
    const proved = await login(email, PASSWORD);
    expect(proved.status).toBe(200);
    expect(proved.body.user.emailVerified).toBe(true);
    expect(proved.body.user.telegramLinked).toBe(true);
    expect(proved.body.user.hasPassword).toBe(true);

    const afterProof = getStore().byId<User>('users', user.id)!;
    expect(afterProof.tgId).toBe(980010);
    expect(afterProof.tgUsername).toBe('legacy_tg');
    expect(afterProof.migratedFromBcrypt).toBeUndefined();

    const events = getStore().where<{ id: string; userId?: string; action?: string; detail?: Record<string, unknown> }>(
      'audit',
      (d) => d.userId === user.id && d.action === 'firebase.email.proved',
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toMatchObject({ droppedPassword: false, droppedTelegram: false });
  });

  it('marks emailVerified immediately and skips verification mail when linking an already-verified Firebase account', async () => {
    const email = nextEmail();
    const user = legacyUser(email, PASSWORD);
    firebase.add(email, PASSWORD, true);
    const beforeCount = firebase.verifications.filter((e) => e === email).length;

    const res = await login(email, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
    expect(res.body.user.hasPassword).toBe(true);
    expect(firebase.verifications.filter((e) => e === email)).toHaveLength(beforeCount);
    expect(getStore().byId<User>('users', user.id)!.migratedFromBcrypt).toBeUndefined();
  });

  it('preserves tgId when a Telegram user confirms their email and signs in with the password', async () => {
    const tg = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: tgInitData(980020) });
    expect(tg.status).toBe(200);
    const email = nextEmail();

    const set = await claimEmail(tg.body.accessToken as string, email);
    expect(set.status).toBe(202);
    expect(set.body.user.telegramLinked).toBe(true);
    expect((await confirmEmail(set.body.devToken as string)).status).toBe(200);

    const proved = await login(email, PASSWORD);
    expect(proved.status).toBe(200);
    expect(proved.body.user.emailVerified).toBe(true);
    expect(proved.body.user.telegramLinked).toBe(true);
    expect(proved.body.user.hasPassword).toBe(true);
    const stored = getStore().byId<User>('users', tg.body.user.id as string)!;
    expect(stored.tgId).toBe(980020);
    expect(stored.telegramCredentialsValidAfter).toBeUndefined();
  });

  it("never attaches an unconfirmed address, so its owner gets an account without the claimant's Telegram", async () => {
    // Case A: the owner registers with the address a Telegram user claimed.
    const tgSquat = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: tgInitData(980021) });
    const emailA = nextEmail();
    const claimA = await claimEmail(tgSquat.body.accessToken as string, emailA);
    expect(claimA.status).toBe(202);

    const owner = await request(app)
      .post(`${base}/auth/register`)
      .send({ email: emailA, password: 'Owner9Password' });
    expect(owner.status).toBe(201);
    expect(owner.body.user.telegramLinked).toBe(false);
    expect(owner.body.user.id).not.toBe(tgSquat.body.user.id);
    // The claimant's link now finds the address taken.
    expect((await confirmEmail(claimA.body.devToken as string)).status).toBe(409);
    const squatter = getStore().byId<User>('users', tgSquat.body.user.id as string)!;
    expect(squatter.email).not.toBe(emailA);
    expect(squatter.tgId).toBe(980021);

    // Case B: the owner signs in with Google on the claimed address.
    const tgSquatB = await request(app)
      .post(`${base}/auth/telegram`)
      .send({ initData: tgInitData(980022) });
    const emailB = nextEmail();
    expect((await claimEmail(tgSquatB.body.accessToken as string, emailB)).status).toBe(202);

    const accB = firebase.add(emailB, '', true);
    accB.signInProvider = 'google.com';
    const recoveredB = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', `Bearer idt:${accB.uid}`)
      .send({});
    expect(recoveredB.status).toBe(200);
    expect(recoveredB.body.user.emailVerified).toBe(true);
    expect(recoveredB.body.user.telegramLinked).toBe(false);
  });

  it('sets hasPassword: true on web password sign-in and lets Google-only users add a password on their own email', async () => {
    // Web email/password account hydrating via /auth/firebase/session
    const webEmail = nextEmail();
    const webAcc = firebase.add(webEmail, PASSWORD, true);
    const webRes = await request(app)
      .post(`${base}/auth/firebase/session`)
      .set('Authorization', `Bearer idt:${webAcc.uid}`)
      .send({});
    expect(webRes.status).toBe(200);
    expect(webRes.body.user.hasPassword).toBe(true);

    // Google-only Firebase user has hasPassword: false and can attach a password on the same email only
    const googleEmail = nextEmail();
    const googleAcc = firebase.add(googleEmail, '', true);
    googleAcc.signInProvider = 'google.com';
    const gToken = await request(app)
      .post(`${base}/auth/firebase/token`)
      .set('Authorization', `Bearer idt:${googleAcc.uid}`)
      .send({});
    expect(gToken.status).toBe(200);
    expect(gToken.body.user.hasPassword).toBe(false);

    // Changing email is refused (409)
    const wrongEmail = await request(app)
      .post(`${base}/me/credentials`)
      .set('Authorization', `Bearer ${gToken.body.accessToken}`)
      .send({ email: nextEmail(), password: PASSWORD });
    expect(wrongEmail.status).toBe(409);

    // Same verified email attaches Firebase password cleanly
    const sameEmail = await request(app)
      .post(`${base}/me/credentials`)
      .set('Authorization', `Bearer ${gToken.body.accessToken}`)
      .send({ email: googleEmail, password: PASSWORD });
    expect(sameEmail.status).toBe(200);
    expect(sameEmail.body.user.hasPassword).toBe(true);
    expect(googleAcc.password).toBe(PASSWORD);
  });
});
