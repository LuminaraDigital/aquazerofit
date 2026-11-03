package fit.aquazero.app.core.common

import java.util.UUID

/**
 * Idempotency keys for the three offline-writable POST creates
 * (`/meal-logs`, `/water-logs`, `/weight-logs`).
 *
 * Server contract (verified against `apps/api/src/modules/logs/service.ts`):
 * the dedupe id is `sha256(userId:method:path:key)`; the request body is NOT
 * fingerprinted and the cached response replays verbatim for 24h. A key must
 * therefore never be reused with a different payload.
 */
object IdempotencyKeys {
    /** HTTP header carrying the key. */
    const val HEADER = "Idempotency-Key"

    /** A fresh, unique key. */
    fun generate(): String = UUID.randomUUID().toString()
}
