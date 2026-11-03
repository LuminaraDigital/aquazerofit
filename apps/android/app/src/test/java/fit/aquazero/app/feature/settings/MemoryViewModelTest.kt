package fit.aquazero.app.feature.settings

import fit.aquazero.app.core.data.AccountRepository
import fit.aquazero.app.core.data.MemoryRepository
import fit.aquazero.app.core.database.ConsentEntity
import fit.aquazero.app.core.model.MemoryFactCategory
import fit.aquazero.app.core.model.MemoryFactStatus
import fit.aquazero.app.core.model.UserMemoryDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Coach memory: the optimistic path and, more importantly, what happens when
 * it fails.
 *
 * A status change moves a fact between sections immediately, because a control
 * that waits on a round trip reads as one that did not respond. That is only
 * defensible if the failure path puts the fact back exactly where it was —
 * which is what most of this file checks.
 */
class MemoryViewModelTest {

    private val dispatcher = StandardTestDispatcher()
    private lateinit var api: FakeAccountApi
    private lateinit var dao: FakeUserDao

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        api = FakeAccountApi()
        dao = FakeUserDao()
        dao.consentsFlow.value = ConsentEntity(userId = "me", aiPersonalisation = true)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun viewModel(): MemoryViewModel = MemoryViewModel(
        memoryRepository = MemoryRepository(api),
        accountRepository = AccountRepository(api, dao),
    )

    @Test
    fun `facts are grouped by status`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(
            id = "mem-1",
            summary = "Trains early, avoids overhead work.",
            facts = listOf(
                suggestedFact("f1"),
                confirmedFact("f2"),
                confirmedFact("f3").copy(status = MemoryFactStatus.REJECTED),
            ),
        )
        val vm = viewModel()
        advanceUntilIdle()

        val state = vm.uiState.value
        assertEquals(listOf("f1"), state.suggested.map { it.id })
        assertEquals(listOf("f2"), state.confirmed.map { it.id })
        assertEquals(listOf("f3"), state.rejected.map { it.id })
        assertEquals("Trains early, avoids overhead work.", state.summary)
        assertFalse(state.isEmpty)
    }

    @Test
    fun `keeping a suggestion moves it to remembered straight away`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(id = "mem-1", facts = listOf(suggestedFact("f1")))
        val vm = viewModel()
        advanceUntilIdle()

        vm.setStatus(vm.uiState.value.suggested.first(), MemoryFactStatus.CONFIRMED)
        // Before the request has had a chance to complete.
        assertTrue(vm.uiState.value.suggested.isEmpty())
        assertEquals(listOf("f1"), vm.uiState.value.confirmed.map { it.id })

        advanceUntilIdle()
        assertEquals(listOf("f1"), vm.uiState.value.confirmed.map { it.id })
        assertEquals(listOf("f1" to MemoryFactStatus.CONFIRMED), api.statusUpdates)
    }

    @Test
    fun `a failed status change puts the fact back where it was`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(id = "mem-1", facts = listOf(suggestedFact("f1")))
        val vm = viewModel()
        advanceUntilIdle()
        api.mutationOutcome = FakeOutcome.Offline

        vm.setStatus(vm.uiState.value.suggested.first(), MemoryFactStatus.REJECTED)
        assertTrue("the optimistic move happens first", vm.uiState.value.suggested.isEmpty())

        advanceUntilIdle()
        assertEquals(listOf("f1"), vm.uiState.value.suggested.map { it.id })
        assertTrue(vm.uiState.value.rejected.isEmpty())
        assertFalse(vm.uiState.value.busy)
    }

    @Test
    fun `a failed delete restores the fact`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(
            id = "mem-1",
            facts = listOf(confirmedFact("f1"), confirmedFact("f2")),
        )
        val vm = viewModel()
        advanceUntilIdle()
        api.mutationOutcome = FakeOutcome.Offline

        vm.deleteFact(vm.uiState.value.confirmed.first())
        assertEquals(listOf("f2"), vm.uiState.value.confirmed.map { it.id })

        advanceUntilIdle()
        assertEquals(listOf("f1", "f2"), vm.uiState.value.confirmed.map { it.id })
    }

    @Test
    fun `a successful delete leaves the fact gone`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(
            id = "mem-1",
            facts = listOf(confirmedFact("f1"), confirmedFact("f2")),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.deleteFact(vm.uiState.value.confirmed.first())
        advanceUntilIdle()

        assertEquals(listOf("f2"), vm.uiState.value.confirmed.map { it.id })
        assertEquals(listOf("f1"), api.deletedFactIds)
    }

    @Test
    fun `a failed reword restores the original text`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(
            id = "mem-1",
            facts = listOf(confirmedFact("f1", text = "Original wording")),
        )
        val vm = viewModel()
        advanceUntilIdle()
        api.mutationOutcome = FakeOutcome.Offline

        vm.startEditing(vm.uiState.value.confirmed.first())
        vm.onEditingTextChange("New wording")
        vm.saveEditing()
        assertEquals("New wording", vm.uiState.value.confirmed.first().text)

        advanceUntilIdle()
        assertEquals("Original wording", vm.uiState.value.confirmed.first().text)
    }

    @Test
    fun `an empty reword is not sent`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(id = "mem-1", facts = listOf(confirmedFact("f1")))
        val vm = viewModel()
        advanceUntilIdle()

        vm.startEditing(vm.uiState.value.confirmed.first())
        vm.onEditingTextChange("   ")
        vm.saveEditing()
        advanceUntilIdle()

        assertTrue(api.statusUpdates.isEmpty())
        assertEquals("f1", vm.uiState.value.editingFactId)
    }

    @Test
    fun `adding waits for the server rather than inventing a fact locally`() =
        runTest(dispatcher) {
            val vm = viewModel()
            advanceUntilIdle()

            vm.onDraftTextChange("I train before work")
            vm.onDraftCategoryChange(MemoryFactCategory.CONTEXT)
            vm.addFact()
            // Nothing is shown until the server has assigned an id.
            assertTrue(vm.uiState.value.confirmed.isEmpty())
            assertTrue(vm.uiState.value.adding)

            advanceUntilIdle()
            assertEquals(1, vm.uiState.value.confirmed.size)
            assertEquals("I train before work", api.addedFacts.single().text)
            assertEquals("", vm.uiState.value.draftText)
            // The category is kept: one constraint is usually followed by another.
            assertEquals(MemoryFactCategory.CONTEXT, vm.uiState.value.draftCategory)
        }

    @Test
    fun `a blank draft is never submitted`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.onDraftTextChange("   ")
        assertFalse(vm.uiState.value.canAdd)
        vm.addFact()
        advanceUntilIdle()
        assertTrue(api.addedFacts.isEmpty())
    }

    @Test
    fun `fact text is capped at the shared limit`() = runTest(dispatcher) {
        val vm = viewModel()
        advanceUntilIdle()

        vm.onDraftTextChange("x".repeat(400))
        assertEquals(MemoryRepository.MAX_FACT_CHARS, vm.uiState.value.draftText.length)
    }

    @Test
    fun `a consent-required refusal shows the paused explainer, not an error`() =
        runTest(dispatcher) {
            api.memoryOutcome = FakeOutcome.Http(403, MemoryRepository.CONSENT_REQUIRED)
            val vm = viewModel()
            advanceUntilIdle()

            assertTrue(vm.uiState.value.consentOff)
            assertFalse("a paused feature is not a failed load", vm.uiState.value.loadFailed)
        }

    @Test
    fun `a transport failure is a retryable error, not the paused state`() = runTest(dispatcher) {
        api.memoryOutcome = FakeOutcome.Offline
        val vm = viewModel()
        advanceUntilIdle()

        assertTrue(vm.uiState.value.loadFailed)
        assertFalse(vm.uiState.value.consentOff)
    }

    @Test
    fun `personalisation switched off pauses memory from the consent bit alone`() =
        runTest(dispatcher) {
            // Both the cached row and the server agree it is off. The refresh
            // writes the server's answer over the cache, so a test that set
            // only the cache would be asserting the wrong thing.
            dao.consentsFlow.value = ConsentEntity(userId = "me", aiPersonalisation = false)
            api.consentsDoc = api.consentsDoc.copy(aiPersonalisation = false)
            val vm = viewModel()
            advanceUntilIdle()

            assertTrue(vm.uiState.value.consentOff)
        }

    @Test
    fun `forgetting everything clears the doc and reloads`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(
            id = "mem-1",
            summary = "Something",
            facts = listOf(confirmedFact("f1")),
        )
        val vm = viewModel()
        advanceUntilIdle()

        vm.forgetEverything()
        advanceUntilIdle()

        assertEquals(1, api.clearCalls)
        assertTrue(vm.uiState.value.isEmpty)
        assertEquals("", vm.uiState.value.summary)
        assertFalse(vm.uiState.value.showForgetDialog)
    }

    @Test
    fun `a failed wipe leaves the memory intact`() = runTest(dispatcher) {
        api.memoryDoc = UserMemoryDto(id = "mem-1", facts = listOf(confirmedFact("f1")))
        val vm = viewModel()
        advanceUntilIdle()
        api.mutationOutcome = FakeOutcome.Offline

        vm.forgetEverything()
        advanceUntilIdle()

        assertEquals(listOf("f1"), vm.uiState.value.confirmed.map { it.id })
    }
}
