package fit.aquazero.app

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/**
 * Every navigable destination in the app, as type-safe Navigation 3 keys.
 *
 * Two families:
 *  - [TabKey]s are the five roots hosted inside the authed scaffold.
 *  - Everything else is pushed on the root stack *above* the scaffold
 *    (full-screen destinations), or belongs to the pre-auth flow.
 */

// ---------------------------------------------------------------------------
// Pre-auth flow
// ---------------------------------------------------------------------------

/** Onboarding carousel — the app's front door when signed out. */
@Serializable data object WelcomeKey : NavKey

/** Email/password sign-in and registration. [register] opens in register mode. */
@Serializable data class SignInKey(val register: Boolean = false) : NavKey

// ---------------------------------------------------------------------------
// Authed: 5-tab scaffold roots
// ---------------------------------------------------------------------------

/** Marker for the five bottom-nav roots. */
sealed interface TabKey : NavKey

/** Home dashboard: rings, water, XP, suggested meal. */
@Serializable data object DashboardKey : TabKey

/** Nutrition day view: meal timeline, food search, day switcher. */
@Serializable data object NutritionKey : TabKey

/** Workout library + plan strip. */
@Serializable data object WorkoutLibraryKey : TabKey

/** Progress: weight chart, kcal bars, consistency, achievements. */
@Serializable data object ProgressKey : TabKey

/** Coach chat. */
@Serializable data object CoachKey : TabKey

// ---------------------------------------------------------------------------
// Authed: full-screen destinations above the scaffold
// ---------------------------------------------------------------------------

/** Post-register interstitial before profile setup. */
@Serializable data object FirstRunKey : NavKey

/** Wellness profile setup form. */
@Serializable data object SetupKey : NavKey

/** Camera capture for photo meal logging. */
@Serializable data object CaptureMealKey : NavKey

/** Vision analysis results for a submitted photo job. */
@Serializable data class AnalysisResultsKey(val jobId: String) : NavKey

/**
 * Barcode scanner. A full-screen destination that hosts a modal sheet, so the
 * scanner survives process death with the rest of the back stack and the
 * system back gesture dismisses it like any other screen.
 */
@Serializable data object BarcodeKey : NavKey

/** AI meal plan surface. */
@Serializable data object MealPlanKey : NavKey

/** Recipe detail. */
@Serializable data class RecipeDetailKey(val recipeId: String) : NavKey

/** Guided workout session. */
@Serializable data class WorkoutSessionKey(val sessionId: String) : NavKey

/** Weight logging sheet/screen. */
@Serializable data object LogWeightKey : NavKey

/** Coach character select. */
@Serializable data object CoachSelectKey : NavKey

/** Buddy challenges. [joinCode] pre-fills the join field from a deep link. */
@Serializable data class ChallengesKey(val joinCode: String? = null) : NavKey

/** Settings root. */
@Serializable data object SettingsKey : NavKey

/** Local reminder configuration. */
@Serializable data object NotificationSettingsKey : NavKey

/** AI memory facts management. */
@Serializable data object MemoryKey : NavKey

/** Plan / entitlements read-only screen. */
@Serializable data object PlanEntitlementsKey : NavKey

/** Health Connect permissions and sync. */
@Serializable data object HealthConnectKey : NavKey
