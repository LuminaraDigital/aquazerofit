package fit.aquazero.app.core.data

/**
 * Asks for the outbox to be drained.
 *
 * Repositories need to say "there is offline work pending" after every local
 * write, but they have no business knowing about WorkManager. Declaring the
 * capability here, and implementing it in `core.sync`, keeps the dependency
 * one-way: sync depends on data, never the reverse.
 */
interface SyncScheduler {
    /**
     * Request a drain.
     *
     * @param initialDelaySeconds honours a server `Retry-After` when the
     *   previous attempt was rate-limited.
     * @param queueBehindCurrent when true, the request is queued *behind* a
     *   drain that is already in progress instead of being discarded as a
     *   duplicate of it.
     *
     *   Every caller outside the drain itself wants the default: several
     *   offline writes in a row should cost one drain, not one each. The
     *   drain worker is the exception, because the in-progress run it would
     *   be de-duplicated against is *itself*. Requesting a follow-up with the
     *   default policy from inside the worker silently drops it, and the
     *   outbox then sits untouched until some unrelated event — a later write,
     *   or connectivity returning — happens to schedule the next run.
     */
    fun requestSync(initialDelaySeconds: Long = 0L, queueBehindCurrent: Boolean = false)

    /** Stop an in-flight or queued outbox drain (called before wiping the outbox). */
    fun cancelPendingSync()
}
