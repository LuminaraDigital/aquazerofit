/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- audit container ----------

export interface AuditEvent {
  id: string;
  userId: string;
  type: 'authEvent' | 'dataAccessEvent' | 'guardrailTrigger';
  action: string;
  detail?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
  /** Monotonic 1-based sequence number in the tamper-evident audit hash chain. */
  seq?: number;
  /** SHA-256 hex digest of the preceding AuditEvent ('GENESIS' for seq === 1). */
  prevHash?: string;
  /** SHA-256 hex digest over (seq, prevHash, id, type, action, createdAt). */
  hash?: string;
}
