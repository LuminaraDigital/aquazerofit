package fit.aquazero.app.core.database

import androidx.room3.Dao
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** DAO for chat history (read-only offline), memory facts and challenges. */
@Dao
interface ChatDao {

    @Upsert
    suspend fun upsertSessions(sessions: List<ChatSessionEntity>)

    @Query("SELECT * FROM chat_sessions ORDER BY updatedAt DESC")
    fun sessions(): Flow<List<ChatSessionEntity>>

    @Upsert
    suspend fun upsertMessages(messages: List<ChatMessageEntity>)

    @Query("SELECT * FROM chat_messages WHERE sessionId = :sessionId ORDER BY createdAt")
    fun messages(sessionId: String): Flow<List<ChatMessageEntity>>

    @Upsert
    suspend fun upsertMemoryFacts(facts: List<MemoryFactEntity>)

    @Query("DELETE FROM memory_facts")
    suspend fun clearMemoryFacts()

    @Query("SELECT * FROM memory_facts ORDER BY updatedAt DESC")
    fun memoryFacts(): Flow<List<MemoryFactEntity>>

    @Upsert
    suspend fun upsertChallenges(challenges: List<ChallengeEntity>)

    @Query("SELECT * FROM challenges ORDER BY cachedAt DESC")
    fun challenges(): Flow<List<ChallengeEntity>>
}
