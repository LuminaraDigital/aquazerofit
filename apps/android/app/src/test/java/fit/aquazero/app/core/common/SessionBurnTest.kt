package fit.aquazero.app.core.common

import fit.aquazero.app.core.database.WorkoutSessionEntity
import fit.aquazero.app.core.model.AzfJson
import fit.aquazero.app.core.model.WorkoutSessionDto
import fit.aquazero.app.core.model.WorkoutSessionStatus
import org.junit.Assert.assertEquals
import org.junit.Test

class SessionBurnTest {

    @Test
    fun `null session returns zero burn`() {
        assertEquals(0.0, kcalBurnedFromSession(null), 1e-9)
    }

    @Test
    fun `pending session returns zero burn`() {
        val entity = entityWith(
            status = WorkoutSessionStatus.PENDING.name,
            kcalBurned = 420.0,
        )
        assertEquals(0.0, kcalBurnedFromSession(entity), 1e-9)
    }

    @Test
    fun `completed session returns stored burn`() {
        val entity = entityWith(
            status = WorkoutSessionStatus.COMPLETED.name,
            kcalBurned = 310.5,
        )
        assertEquals(310.5, kcalBurnedFromSession(entity), 1e-9)
    }

    @Test
    fun `completed session without burn field returns zero`() {
        val entity = entityWith(
            status = WorkoutSessionStatus.COMPLETED.name,
            kcalBurned = null,
        )
        assertEquals(0.0, kcalBurnedFromSession(entity), 1e-9)
    }

    @Test
    fun `negative burn is clamped to zero`() {
        val entity = entityWith(
            status = WorkoutSessionStatus.COMPLETED.name,
            kcalBurned = -50.0,
        )
        assertEquals(0.0, kcalBurnedFromSession(entity), 1e-9)
    }

    @Test
    fun `invalid session json returns zero`() {
        val entity = WorkoutSessionEntity(
            id = "s1",
            status = WorkoutSessionStatus.COMPLETED.name,
            docJson = "{not valid json",
        )
        assertEquals(0.0, kcalBurnedFromSession(entity), 1e-9)
    }

    private fun entityWith(status: String, kcalBurned: Double?): WorkoutSessionEntity {
        val session = WorkoutSessionDto(
            id = "s1",
            userId = "u1",
            status = WorkoutSessionStatus.valueOf(status.uppercase()),
            kcalBurned = kcalBurned,
        )
        return WorkoutSessionEntity(
            id = session.id,
            status = status,
            docJson = AzfJson.encodeToString(WorkoutSessionDto.serializer(), session),
        )
    }
}
