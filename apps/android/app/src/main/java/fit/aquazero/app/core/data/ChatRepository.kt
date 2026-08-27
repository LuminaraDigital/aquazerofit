package fit.aquazero.app.core.data

import fit.aquazero.app.core.database.ChatDao
import fit.aquazero.app.core.database.ChatMessageEntity
import fit.aquazero.app.core.database.ChatSessionEntity
import fit.aquazero.app.core.network.ApiResult
import fit.aquazero.app.core.network.ChatStreamClient
import fit.aquazero.app.core.network.ChatStreamEvent
import fit.aquazero.app.core.network.api.ChatApi
import fit.aquazero.app.core.network.api.CreateMealDraftRequest
import fit.aquazero.app.core.network.api.ConfirmMealDraftRequest
import fit.aquazero.app.core.network.dto.ChatMessageDto
import fit.aquazero.app.core.network.dto.ChatSessionCreatedDto
import fit.aquazero.app.core.network.dto.MealType
import fit.aquazero.app.core.network.safeCall
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Coach chat: SSE streaming for the live turn, Room for read-only offline
 * history, server-persisted meal drafts. Send is online-only by design.
 */
@Singleton
class ChatRepository @Inject constructor(
    private val chatApi: ChatApi,
    private val chatDao: ChatDao,
    private val streamClient: ChatStreamClient,
) {

    /** Cached sessions, newest first. */
    fun sessions(): Flow<List<ChatSessionEntity>> = chatDao.sessions()

    /** Cached messages of one session (offline history). */
    fun messages(sessionId: String): Flow<List<ChatMessageEntity>> = chatDao.messages(sessionId)

    /** Create a session; caches it and returns prompts + disclaimer. */
    suspend fun createSession(): ApiResult<ChatSessionCreatedDto> =
        safeCall { chatApi.createSession() }.also { result ->
            if (result is ApiResult.Success) {
                val s = result.data.session
                chatDao.upsertSessions(
                    listOf(
                        ChatSessionEntity(
                            id = s.id,
                            title = s.title,
                            createdAt = s.createdAt,
                            updatedAt = s.updatedAt,
                        ),
                    ),
                )
            }
        }

    /** Refresh session list into Room. */
    suspend fun refreshSessions(): ApiResult<Unit> =
        when (val result = safeCall { chatApi.sessions() }) {
            is ApiResult.Success -> {
                chatDao.upsertSessions(
                    result.data.sessions.map {
                        ChatSessionEntity(
                            id = it.id,
                            title = it.title,
                            createdAt = it.createdAt,
                            updatedAt = it.updatedAt,
                        )
                    },
                )
                ApiResult.Success(Unit)
            }
            is ApiResult.Failure -> result
        }

    /**
     * Refresh one session's messages into Room. Also the recovery poll after
     * a dropped stream: the assistant message persists BEFORE the `done`
     * frame server-side, so a re-fetch finds it (or proves it never landed).
     */
    suspend fun refreshMessages(sessionId: String): ApiResult<List<ChatMessageDto>> =
        when (val result = safeCall { chatApi.messages(sessionId) }) {
            is ApiResult.Success -> {
                chatDao.upsertMessages(result.data.messages.map { it.toEntity() })
                ApiResult.Success(result.data.messages)
            }
            is ApiResult.Failure -> result
        }

    /** Open the SSE streaming turn. */
    fun stream(sessionId: String, content: String): Flow<ChatStreamEvent> =
        streamClient.stream(sessionId, content)

    /** Report an assistant message (Play AI-GC control). */
    suspend fun reportMessage(messageId: String): ApiResult<Unit> =
        safeCall { chatApi.reportMessage(messageId) }

    // ----- meal drafts (explicit "log this as a meal", never inferred) -----

    suspend fun createMealDraft(text: String, mealType: MealType?, sessionId: String?) =
        safeCall {
            chatApi.createMealDraft(
                CreateMealDraftRequest(text = text, mealType = mealType, sessionId = sessionId),
            )
        }

    suspend fun mealDrafts() = safeCall { chatApi.mealDrafts() }

    suspend fun dismissMealDraft(id: String) = safeCall { chatApi.dismissMealDraft(id) }

    suspend fun confirmMealDraft(id: String, body: ConfirmMealDraftRequest) =
        safeCall { chatApi.confirmMealDraft(id, body) }

    private fun ChatMessageDto.toEntity(): ChatMessageEntity = ChatMessageEntity(
        id = id,
        sessionId = sessionId,
        role = role.name.lowercase(),
        content = content,
        guardrailBlocked = guardrail?.blocked ?: false,
        guardrailCategory = guardrail?.category?.name?.lowercase(),
        reported = reported ?: false,
        createdAt = createdAt,
    )
}
