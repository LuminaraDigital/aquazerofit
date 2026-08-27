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
     * Request a drain. [initialDelaySeconds] honours a server `Retry-After`
     * when the previous attempt was rate-limited.
     */
    fun requestSync(initialDelaySeconds: Long = 0L)
}
