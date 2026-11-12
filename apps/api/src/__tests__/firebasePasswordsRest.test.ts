/**
 * The Identity Toolkit side of firebasePasswords: which Firebase answers mean
 * "wrong credentials" and which mean "Firebase is unavailable". fetch is
 * stubbed; nothing leaves the process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const adminAuth = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../platform/firebaseAdmin', () => ({ getFirebaseAuth: () => adminAuth.current }));

const { firebasePasswords } = await import('../modules/auth/firebasePasswords');

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const firebaseError = (message: string) => reply(400, { error: { code: 400, message } });

beforeEach(() => {
  process.env.FIREBASE_API_KEY = 'test-key';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  delete process.env.FIREBASE_API_KEY;
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  adminAuth.current = null;
});

describe('firebasePasswords REST gateway', () => {
  it('is off without FIREBASE_API_KEY', () => {
    delete process.env.FIREBASE_API_KEY;
    expect(firebasePasswords()).toBeNull();
  });

  it('returns the ID token for a correct password', async () => {
    reply(200, { idToken: 'id-token', localId: 'uid-1' });
    expect(await firebasePasswords()!.signIn('a@example.com', 'pw')).toBe('id-token');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('accounts:signInWithPassword?key=test-key');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@example.com', password: 'pw', returnSecureToken: true });
  });

  it.each(['INVALID_LOGIN_CREDENTIALS', 'INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'USER_DISABLED : The user account has been disabled.'])(
    'treats %s as wrong credentials',
    async (message) => {
      firebaseError(message);
      expect(await firebasePasswords()!.signIn('a@example.com', 'pw')).toBeNull();
    },
  );

  it('maps Firebase throttling to RATE_LIMITED', async () => {
    firebaseError('TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled');
    await expect(firebasePasswords()!.signIn('a@example.com', 'pw')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('maps a bad key or an outage to INTERNAL, not to wrong credentials', async () => {
    firebaseError('API key not valid. Please pass a valid API key.');
    await expect(firebasePasswords()!.signIn('a@example.com', 'pw')).rejects.toMatchObject({ code: 'INTERNAL' });
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(firebasePasswords()!.signIn('a@example.com', 'pw')).rejects.toMatchObject({ code: 'INTERNAL' });
  });

  it('asks Firebase for a reset mail and ignores an unknown address', async () => {
    reply(200, { email: 'a@example.com' });
    await firebasePasswords()!.sendPasswordReset('a@example.com');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ requestType: 'PASSWORD_RESET', email: 'a@example.com' });
    firebaseError('EMAIL_NOT_FOUND');
    await expect(firebasePasswords()!.sendPasswordReset('b@example.com')).resolves.toBeUndefined();
  });

  it('signs in as the user to have Firebase send a verification mail', async () => {
    reply(200, { idToken: 'id-token', localId: 'uid-1' });
    reply(200, { email: 'a@example.com' });
    await firebasePasswords()!.sendVerification('a@example.com', 'pw');
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toContain('accounts:sendOobCode?key=test-key');
    expect(JSON.parse(init.body)).toEqual({ requestType: 'VERIFY_EMAIL', idToken: 'id-token' });
  });

  it('sends no verification mail for a wrong password', async () => {
    firebaseError('INVALID_LOGIN_CREDENTIALS');
    await firebasePasswords()!.sendVerification('a@example.com', 'wrong');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads Firebase's tokensValidAfterTime as milliseconds", async () => {
    const getUser = vi.fn().mockResolvedValue({ tokensValidAfterTime: 'Thu, 12 Nov 2026 10:00:00 GMT' });
    adminAuth.current = { getUser };
    expect(await firebasePasswords()!.tokensValidAfter('uid-1')).toBe(Date.UTC(2026, 10, 12, 10));
    getUser.mockResolvedValueOnce({});
    expect(await firebasePasswords()!.tokensValidAfter('uid-1')).toBeNull();
  });

  it('fails create and setPassword when Firebase Admin is not configured', async () => {
    await expect(
      firebasePasswords()!.create({ email: 'a@example.com', password: 'pw', displayName: 'A' }),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(firebasePasswords()!.setPassword('uid', 'pw')).rejects.toMatchObject({ code: 'INTERNAL' });
  });
});
