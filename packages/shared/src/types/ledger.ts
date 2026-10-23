/**
 * Domain types split from the shared types barrel.
 * Import via `@aquazerofit/shared` (public API unchanged).
 */

// ---------- ledger container ----------

export interface CreditTransaction {
  id: string;
  userId: string;
  type: 'creditTransaction';
  kind: 'grant' | 'reserve' | 'commit' | 'release' | 'purchase';
  amount: number; // positive for grant/release/purchase, negative for commit
  reservationId?: string;
  reason: string;
  createdAt: string;
}
