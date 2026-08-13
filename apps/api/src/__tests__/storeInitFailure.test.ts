/**
 * A Postgres that is unreachable at boot must produce a startup error that
 * names the cause, not a bare driver code. index.ts prints
 * describeStoreInitFailure(err) and exits 1; these cases pin the mapping for
 * every failure class the pg driver actually emits, so a future change to the
 * boot sequence cannot quietly turn "wrong password" back into an opaque
 * stack trace.
 */
import { describe, expect, it } from 'vitest';
import { describeStoreInitFailure } from '../platform/store';

function pgError(message: string, code: string): Error {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

describe('describeStoreInitFailure', () => {
  it('identifies a refused connection (server down / wrong port)', () => {
    const msg = describeStoreInitFailure(
      pgError('connect ECONNREFUSED 127.0.0.1:5432', 'ECONNREFUSED'),
    );
    expect(msg).toMatch(/refused the connection/i);
    expect(msg).toMatch(/database is running/i);
    expect(msg).toContain('connect ECONNREFUSED 127.0.0.1:5432');
  });

  it('identifies an unresolvable host (typo in DATABASE_URL)', () => {
    const msg = describeStoreInitFailure(
      pgError('getaddrinfo ENOTFOUND db.exmaple.com', 'ENOTFOUND'),
    );
    expect(msg).toMatch(/could not be resolved/i);
    expect(msg).toMatch(/hostname/i);
  });

  it('identifies rejected credentials (28P01 auth failure)', () => {
    const msg = describeStoreInitFailure(
      pgError('password authentication failed for user "azf"', '28P01'),
    );
    expect(msg).toMatch(/rejected the credentials/i);
    expect(msg).toMatch(/username and password/i);
  });

  it('identifies a missing database (3D000)', () => {
    const msg = describeStoreInitFailure(pgError('database "azf" does not exist', '3D000'));
    expect(msg).toMatch(/does not exist/i);
    expect(msg).toMatch(/database name/i);
  });

  it('identifies a timeout / dropped connection (network partition)', () => {
    const msg = describeStoreInitFailure(pgError('connect ETIMEDOUT 10.0.0.9:5432', 'ETIMEDOUT'));
    expect(msg).toMatch(/timed out or was dropped/i);
    expect(msg).toMatch(/firewall/i);
  });

  it('identifies a database still starting up (57P03)', () => {
    const msg = describeStoreInitFailure(
      pgError('the database system is starting up', '57P03'),
    );
    expect(msg).toMatch(/starting up or shutting down/i);
  });

  it('unwraps AggregateError from Node net (dual-stack connect failures)', () => {
    const agg = new AggregateError(
      [pgError('connect ECONNREFUSED ::1:5432', 'ECONNREFUSED')],
      '',
    );
    const msg = describeStoreInitFailure(agg);
    expect(msg).toMatch(/refused the connection/i);
  });

  it('falls back to a message that still points at DATABASE_URL', () => {
    const msg = describeStoreInitFailure(new Error('unexpected wire protocol byte'));
    expect(msg).toContain('unexpected wire protocol byte');
    expect(msg).toMatch(/DATABASE_URL/);
  });

  it('survives non-Error throwables', () => {
    expect(describeStoreInitFailure('boom')).toContain('boom');
  });
});
