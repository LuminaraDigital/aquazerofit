package fit.aquazero.app.core.data

import fit.aquazero.app.core.model.AddMemoryFactRequest
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.model.MemoryFactCategory
import fit.aquazero.app.core.model.MemoryFactStatus
import fit.aquazero.app.core.model.UpdateMemoryFactRequest
import fit.aquazero.app.core.model.UserMemoryDto
import fit.aquazero.app.core.model.map
import fit.aquazero.app.core.network.api.AccountApi
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Coach memory, under `/me/memory`.
 *
 * Every route — reads included — sits behind the `aiPersonalisation` consent
 * gate server-side and answers `403 CONSENT_REQUIRED` when it is off. That is
 * not an error to retry: it is the calm explainer state, so [CONSENT_REQUIRED]
 * is exposed for callers to branch on rather than being buried in a message.
 *
 * The whole doc comes back from every mutation, which is what makes optimistic
 * updates safe here: the screen can apply a change immediately, and the
 * server's version replaces it wholesale on success or the snapshot is
 * restored on failure.
 */
@Singleton
class MemoryRepository @Inject constructor(
    private val accountApi: AccountApi,
) {

    /** Load the memory doc. Lazily created server-side on first read. */
    suspend fun memory(): ApiResult<UserMemoryDto> =
        safeCall { accountApi.memory() }.map { it.memory }

    /**
     * Add a fact the user asserted directly. The server files it as
     * `confirmed` with source `user` — only the extraction pipeline creates
     * suggestions.
     */
    suspend fun addFact(text: String, category: MemoryFactCategory): ApiResult<UserMemoryDto> =
        safeCall {
            accountApi.addFact(AddMemoryFactRequest(text = text.trim(), category = category))
        }.map { it.memory }

    /** Confirm or reject a suggestion. `suggested` is deliberately not settable. */
    suspend fun setFactStatus(
        factId: String,
        status: MemoryFactStatus,
    ): ApiResult<UserMemoryDto> =
        safeCall {
            accountApi.updateFact(factId, UpdateMemoryFactRequest(status = status))
        }.map { it.memory }

    /** Reword a fact, keeping its status. */
    suspend fun setFactText(factId: String, text: String): ApiResult<UserMemoryDto> =
        safeCall {
            accountApi.updateFact(factId, UpdateMemoryFactRequest(text = text.trim()))
        }.map { it.memory }

    /** Delete one fact. */
    suspend fun deleteFact(factId: String): ApiResult<UserMemoryDto> =
        safeCall { accountApi.deleteFact(factId) }.map { it.memory }

    /** Wipe the whole doc — summary and every fact. Replies 204. */
    suspend fun clearMemory(): ApiResult<Unit> = safeCall { accountApi.clearMemory() }

    companion object {
        /** Error code every memory route returns when personalisation is off. */
        const val CONSENT_REQUIRED = "CONSENT_REQUIRED"

        /** `MEMORY_FACT_MAX_CHARS` in `packages/shared/src/constants.ts`. */
        const val MAX_FACT_CHARS = 280
    }
}
