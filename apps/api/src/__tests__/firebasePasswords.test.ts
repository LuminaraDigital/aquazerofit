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
const { resetLoginFailures, findUserByEmail } = await import('../modules/auth/service');
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

beforeEach(() => {
  setFirebasePasswordsForTests(gateway);
  resetLoginFailures();
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
