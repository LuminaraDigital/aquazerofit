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
}
