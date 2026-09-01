package fit.aquazero.app.core.database

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

/** Cached `ChatSession` (offline history is read-only). */
@Entity(tableName = "chat_sessions")
data class ChatSessionEntity(
    @PrimaryKey val id: String,
    val title: String = "",
    val createdAt: String = "",
    val updatedAt: String = "",
)

/** Cached `ChatMessage` for offline history. */
@Entity(
    tableName = "chat_messages",
    indices = [Index("sessionId")],
)
data class ChatMessageEntity(
    @PrimaryKey val id: String,
    val sessionId: String,
    val role: String,
    val content: String,
    val guardrailBlocked: Boolean = false,
    val guardrailCategory: String? = null,
    val reported: Boolean = false,
    val createdAt: String = "",
)

/** Cached AI memory fact (consent-gated feature). */
@Entity(tableName = "memory_facts")
data class MemoryFactEntity(
    @PrimaryKey val id: String,
    val text: String,
    val category: String = "context",
    val status: String = "suggested",
    val sourceKind: String = "user",
    val createdAt: String = "",
    val updatedAt: String = "",
)

/** Cached `BuddyChallenge` (whole document as JSON). */
@Entity(tableName = "challenges")
data class ChallengeEntity(
    @PrimaryKey val id: String,
    val code: String = "",
    val status: String = "open",
    val docJson: String,
    val cachedAt: Long = 0L,
)
