package fit.aquazero.app.core.model

import kotlinx.serialization.Serializable

/** Where a memory fact came from. */
@Serializable
data class MemoryFactSourceDto(
    val kind: String,
    val refId: String? = null,
)

/** Mirrors TS `MemoryFact`. */
@Serializable
data class MemoryFactDto(
    val id: String,
    val text: String,
    val category: MemoryFactCategory = MemoryFactCategory.CONTEXT,
    val status: MemoryFactStatus = MemoryFactStatus.SUGGESTED,
    val source: MemoryFactSourceDto = MemoryFactSourceDto(kind = "user"),
    val createdAt: String = "",
    val updatedAt: String = "",
)

/** Mirrors TS `UserMemory` — the consent-gated memory doc. */
@Serializable
data class UserMemoryDto(
    val id: String,
    val type: String = "userMemory",
    val userId: String = "",
    val summary: String = "",
    val facts: List<MemoryFactDto> = emptyList(),
    val version: Int = 0,
    val factsAtLastSummary: Int? = null,
    val updatedAt: String = "",
)

/** Envelope of all `/me/memory` responses — `{memory}`. */
@Serializable
data class MemoryEnvelopeDto(
    val memory: UserMemoryDto,
)

/** Body for `POST /me/memory/facts`. Outbound only, so [category] stays required. */
@Serializable
data class AddMemoryFactRequest(
    val text: String,
    val category: MemoryFactCategory,
)

/** Body for `PATCH /me/memory/facts/:factId`. */
@Serializable
data class UpdateMemoryFactRequest(
    val text: String? = null,
    val status: MemoryFactStatus? = null,
)
