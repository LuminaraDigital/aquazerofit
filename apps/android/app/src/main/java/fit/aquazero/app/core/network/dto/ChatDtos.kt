package fit.aquazero.app.core.network.dto

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** Mirrors TS `ChatSession`. */
@Serializable
data class ChatSessionDto(
    val id: String,
    val userId: String,
    val type: String = "chatSession",
    val title: String = "",
    val createdAt: String,
    val updatedAt: String,
)

/** Mirrors TS `ChatToolCall`. */
@Serializable
data class ChatToolCallDto(
    val tool: String,
    val args: JsonObject? = null,
    val resultSummary: String = "",
)

/** Guardrail verdict attached to a message. */
@Serializable
data class GuardrailDto(
    val blocked: Boolean = false,
    val category: SafetyCategory? = null,
)

/** Mirrors TS `ChatMessage`. */
@Serializable
data class ChatMessageDto(
    val id: String,
    val sessionId: String,
    val userId: String,
    val type: String = "chatMessage",
    val role: ChatRole,
    val content: String,
    val toolCalls: List<ChatToolCallDto>? = null,
    val guardrail: GuardrailDto? = null,
    val ai: AiMetadataDto? = null,
    val reported: Boolean? = null,
    val createdAt: String,
)

/** Response of `POST /chat/sessions` — `{session, suggestedPrompts, disclaimer}`. */
@Serializable
data class ChatSessionCreatedDto(
    val session: ChatSessionDto,
    val suggestedPrompts: List<String> = emptyList(),
    val disclaimer: String = "",
)

/** Response of `GET /chat/sessions` — `{sessions, suggestedPrompts}`. */
@Serializable
data class ChatSessionsDto(
    val sessions: List<ChatSessionDto> = emptyList(),
    val suggestedPrompts: List<String> = emptyList(),
)

/** Response of `GET /chat/sessions/:id/messages` — `{messages, …}`. */
@Serializable
data class ChatMessagesDto(
    val messages: List<ChatMessageDto> = emptyList(),
    val disclaimer: String? = null,
)

/** Body for the streaming turn `POST /chat/sessions/:id/messages`. */
@Serializable
data class ChatSendRequest(
    val content: String,
)

/** Mirrors API `ChatMealMatch` (chat/mealDraft.ts). */
@Serializable
data class ChatMealMatchDto(
    val foodId: String,
    val name: String,
    val grams: Double,
    val gramsBasis: GramsBasis = GramsBasis.ASSUMED,
    val servingLabel: String? = null,
    val kcal: Double = 0.0,
    val proteinG: Double = 0.0,
    val carbsG: Double = 0.0,
    val fatG: Double = 0.0,
    val allergenConflicts: List<Allergen> = emptyList(),
)

/** Mirrors API `ChatMealItem`. */
@Serializable
data class ChatMealItemDto(
    val id: String,
    val phrase: String = "",
    val spokenName: String = "",
    val quantity: Double = 0.0,
    val unit: String = "",
    val status: ChatMealItemStatus = ChatMealItemStatus.UNMATCHED,
    val matches: List<ChatMealMatchDto> = emptyList(),
    val suggestedFoodId: String? = null,
)

/** Mirrors API `ChatMealDraft`. */
@Serializable
data class ChatMealDraftDto(
    val id: String,
    val userId: String,
    val type: String = "chatMealDraft",
    val sessionId: String? = null,
    val sourceText: String = "",
    val mealType: MealType = MealType.SNACK,
    val localDate: String = "",
    val status: ChatMealDraftStatus = ChatMealDraftStatus.PROPOSED,
    val items: List<ChatMealItemDto> = emptyList(),
    val notes: List<String> = emptyList(),
    val allergyCheck: String = "applied",
    val ai: AiMetadataDto? = null,
    val loggedMealId: String? = null,
    val createdAt: String = "",
    val updatedAt: String = "",
)
