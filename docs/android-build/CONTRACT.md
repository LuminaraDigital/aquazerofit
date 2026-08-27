# Android ↔ API contract map (Wave 1)

Single source of truth: `packages/shared/src/types.ts` (plus `constants.ts`,
`coaches.ts`, `gamification.ts`, and the per-module zod schemas in
`packages/shared/src/schemas.ts`). Every Kotlin DTO below lives in
`apps/android/app/src/main/java/fit/aquazero/app/core/network/dto/` and is
decoded with `AzfJson` (`ignoreUnknownKeys`, `explicitNulls = false`,
`coerceInputValues`) so server-side additive changes never break the client.

When the TS types change, update the matching Kotlin DTO **and** this file.

## Enums (`Enums.kt`)

| Kotlin | TS source | Notes |
|---|---|---|
| `Sex`, `Goal`, `ActivityLevel`, `ExerciseExperience`, `UnitPreference`, `MealType`, `UserRole`, `UserTier` | `types.ts` unions | `@SerialName` matches TS strings exactly (`veryActive`, …) |
| `DietaryPreference` | `DIETARY_PREFERENCES` | 9 values |
| `Allergen` | `ALLERGENS` | 9 values |
| `Equipment` | `EQUIPMENT` | 14 values — append-only server-side |
| `MealLogSource` | `MealLog['source']` | `manual\|photo\|recommendation\|chat` |
| `SafetyCategory` | `SafetyCategory` | |
| `ConsistencyState` | `ConsistencyState` | deliberately no "broken" member |
| `ReadinessMode` | `ReadinessMode` | |
| `MemoryFactCategory`, `MemoryFactStatus` | memory unions | |
| `Nutriscore` | `Food['nutriscore']` | `a…e` |
| `VisionJobStatus` | `VisionJob['status']` | |
| `WorkoutSessionStatus` | `WorkoutSession['status']` | `inProgress` mapped |
| `BuddyChallengeKind`, `BuddyChallengeStatus` | growth unions | |
| `ChatRole` | `ChatMessage['role']` | |
| `ChatMealDraftStatus`, `ChatMealItemStatus`, `GramsBasis` | `apps/api/src/modules/chat/mealDraft.ts` | lane-owned shapes, mirrored |
| `CoachLockReason`, `CoachExpression` | coach types | |

## DTOs

| Kotlin DTO | TS type / route shape |
|---|---|
| `PublicUserDto` | `PublicUser` |
| `AuthTokensDto` / `AuthResponseDto` | `AuthTokens` / `AuthResponse` |
| `RegisterRequest`, `LoginRequest`, `RefreshRequest`, `LogoutRequest`, `PasswordResetRequest`, `PasswordResetConfirmRequest` | `registerSchema`, `loginSchema`, `refreshSchema`, logout body, `passwordResetRequestSchema`, `passwordResetConfirmSchema` |
| `WellnessProfileDto` / `ProfileInputDto` | `WellnessProfile` / `profileSchema` |
| `DerivedTargetsDto` | `DerivedTargets` |
| `ConsentStateDto` / `ConsentUpdateRequest` | `ConsentState` |
| `EntitlementsDto` | `GET /me/entitlements` response (me/router.ts) |
| `FoodNutrientsDto` | `FoodNutrients` / `NutritionSummary` (identical shape) |
| `FoodDto` (+`FoodServingDto`) | `Food` |
| `RecipeDto` (+`RecipeIngredientDto`) | `Recipe` |
| `ExerciseDto` (+`ExerciseMediaDto`) | `Exercise` / `ExerciseMedia` — attribution fields never stripped |
| `AchievementDefinitionDto` | `AchievementDefinition` — `rule` kept as raw JSON union |
| `PagedExercisesDto` | `{items,total,limit,offset}` envelope (query params REQUIRED) |
| `MealLogDto` (+`MealLogItemDto`) | `MealLog` / `MealLogItem` |
| `CreateMealLogRequest` / `UpdateMealLogRequest` | `createMealLogSchema` / `updateMealLogSchema` |
| `MealLogEnvelopeDto` | `{log}` (POST/PUT /meal-logs) |
| `MealDayDto` | `GET /meal-logs` → `{date, meals, totals}` |
| `WaterLogDto` / `CreateWaterLogRequest` | `WaterLog` / `waterLogSchema` (1–3000 ml) |
| `WaterDayDto` | `GET /water-logs` → `{date, totalMl}` (day totals ONLY) |
| `WeightLogDto` / `CreateWeightLogRequest` | `WeightLog` / `weightLogSchema` (canonical kg, upsert per localDate) |
| `WeightLogEnvelopeDto` / `WeightLogsDto` | `{log}` / `{range, points, logs}` |
| `TrendPointDto` | `TrendPoint` |
| `DailyNutritionDto` (+`ConsumedTargetDto`) | `DailyNutrition` |
| `NutritionTrendsDto` | `GET /analytics/nutrition/trends` |
| `AiMetadataDto` | `AiMetadata` |
| `SlotEntryDto`, `PlanSlotDto`, `PlanDayDto`, `ProgressionRuleDto`, `TrainingPlanDto` | plan document types |
| `PlanEnvelopeDto` | `{plan}` |
| `ReadinessSignalDto`, `ReadinessAssessmentDto`, `ReadinessEnvelopeDto` | `ReadinessAssessment` / `{readiness}` |
| `SetLogDto`, `SessionExerciseDto`, `WorkoutSessionDto` | `SetLog`, `SessionExercise`, `WorkoutSession` |
| `TodayWorkoutEnvelopeDto` | `GET /workouts/today` envelope — typed ONCE per the plan's trap note; `resolved` kept as raw JSON |
| `WorkoutSessionEnvelopeDto` | `{session}` |
| `ConsistencyStatusDto` | `ConsistencyStatus` |
| `AchievementStatusDto`, `ProgressSummaryDto` | `ProgressSummary` |
| `ProgressInsightStatsDto`, `ProgressInsightChangeDto`, `ProgressInsightDto` | insight types |
| `ChatSessionDto`, `ChatMessageDto` (+`ChatToolCallDto`, `GuardrailDto`) | `ChatSession`, `ChatMessage` |
| `ChatSessionCreatedDto`, `ChatSessionsDto`, `ChatMessagesDto`, `ChatSendRequest` | chat route envelopes |
| `ChatMealMatchDto`, `ChatMealItemDto`, `ChatMealDraftDto` | `chat/mealDraft.ts` shapes |
| `CreateMealDraftRequest`, `MealDraftSelection`, `ConfirmMealDraftRequest`, `MealDraftEnvelopeDto`, `MealDraftsDto` | meal-draft routes (in `api/ChatApi.kt`) |
| `VisionPredictionDto`, `VisionJobDto`, `VisionJobEnvelopeDto`, `VisionConfirmRequest`, `VisionConfirmResponseDto` | `VisionPrediction`, `VisionJob`, vision routes |
| `CoachRankDto`, `XpBreakdownEntryDto`, `ExperienceStatusDto` | `gamification.ts` |
| `CoachEntitlementDto`, `CoachReactionDto`, `CoachRosterDto`, `ProgressionStatusDto` | coach payloads |
| `CoachSelectRequest`, `ReactionAckRequest` | coach routes |
| `BuddyChallengeMemberDto`, `BuddyChallengeDto`, envelopes, `CreateChallengeRequest`, `JoinChallengeRequest` | challenge types/routes |
| `MemoryFactSourceDto`, `MemoryFactDto`, `UserMemoryDto`, `MemoryEnvelopeDto`, `AddMemoryFactRequest`, `UpdateMemoryFactRequest` | memory types/routes |
| `MealRecommendationDto`, requests, `RecommendationEnvelopeDto` | `MealRecommendation` / recommendation routes |
| `ApiErrorEnvelope` | error envelope `{code, message, details?}` — `details` schemaless |
| `FoodsSearchDto`, `FoodEnvelopeDto`, `BarcodeLookupDto`, `RecipesDto`, `RecipeEnvelopeDto`, `ExerciseEnvelopeDto` | catalog route envelopes |

## Retrofit services (`core/network/api/`)

All paths are relative to `API_BASE_URL` (`…/api/v1`), matching the mounts in
`apps/api/src/modules/index.ts`.

| Service | Routes |
|---|---|
| `AuthApi` (authless client) | POST `auth/register`, `auth/login`, `auth/refresh`, `auth/logout`, `auth/password-reset/request`, `auth/password-reset/confirm` |
| `MeApi` | GET/PATCH/DELETE `me`, GET/PUT `me/profile`, GET `me/targets`, GET/PUT `me/consents`, GET `me/entitlements` |
| `LogsApi` | POST/GET `meal-logs`, PUT/DELETE `meal-logs/{id}`, POST `meal-logs/copy-previous`, POST/GET `water-logs`, POST/GET `weight-logs`, GET `analytics/nutrition/daily`, GET `analytics/nutrition/trends` |
| `FoodsApi` | GET `foods`, `foods/barcode/{code}`, `foods/{id}` |
| `ExercisesApi` | GET `exercises` (limit/offset REQUIRED), `exercises/{id}` |
| `RecipesApi` | GET `recipes`, `recipes/{id}` |
| `VisionApi` | POST `meal-photos` (multipart), GET `meal-photos/{jobId}`, POST `meal-photos/{jobId}/confirm` |
| `ChatApi` | POST/GET `chat/sessions`, GET `chat/sessions/{id}/messages`, DELETE `chat/sessions/{id}`, POST `chat/messages/{id}/report`, meal-draft routes under `chat/meal-drafts` |
| `PlansApi` | GET `plans/current`, GET `plans/readiness`, POST `plans/generate` |
| `WorkoutsApi` | GET `workouts/today`, `workouts/stats`, `workouts/exercises`, POST `workouts/{id}/complete`, `workouts/{id}/swap-exercise` |
| `ProgressApi` | GET `progress/summary`, `progress/insight` |
| `CoachesApi` | GET `coaches`, POST `coaches/select`, GET `coaches/progression`, POST `coaches/reactions/ack` (no purchase route on Android) |
| `ChallengesApi` | GET `challenges/peek/{code}`, GET/POST `challenges`, GET `challenges/{id}`, POST `challenges/join` |
| `RecommendationsApi` | POST `recommendations/meals`, `recommendations/{id}/log`, `recommendations/{id}/feedback` |
| `ExportApi` | GET `export/diary` (streaming) |

SSE: the streaming chat turn (`POST chat/sessions/{id}/messages`) goes through
`ChatStreamClient` (OkHttp SSE), emitting `ChatStreamEvent`
`Token | Done | Error(code) | TransportError` for frames
`{type: token|done|error}` with error codes
`SAFETY_INPUT | SAFETY_OUTPUT | AI_UNAVAILABLE`.

## Standing headers

Every request carries `X-Timezone` (IANA id), `User-Agent:
AquaZeroFit-Android/1.0.0`, `Accept-Language` (crisis-signpost localization)
and `Authorization: Bearer <access>` when signed in (`HeaderInterceptor`).
The three log POST creates additionally carry `Idempotency-Key` — the server
dedupes on `sha256(userId:method:path:key)` for 24h WITHOUT fingerprinting
the body, so a key is never reused with a different payload.

## Contract corrections found during the feature build

These four were caught by reading `apps/api` rather than trusting the Kotlin
side, and are fixed in the client. Each would have failed only at runtime.

| Call | Was | Server actually wants |
| --- | --- | --- |
| `POST /chat/meal-drafts/:id/confirm` | body field `selections` | field **`items`** — the Kotlin property keeps the clearer name and carries `@SerialName("items")` (`confirmMealDraftSchema`, `chat/router.ts`) |
| same | `MealDraftSelection.foodId: String?` | **non-null** `z.string().min(1)` — an unresolved line must be omitted, never sent with a null id |
| `POST /chat/meal-drafts` and its confirm | no `localDate` | optional but **must be sent**: omitted, the server keys the draft to *its* local day, so a late-evening draft can land on the wrong date |
| `POST /coaches/reactions/ack` | declared `ProgressionStatusDto` | route replies **`204 No Content`** — declaring a body type fails to decode; returns `Unit` |

The pattern worth carrying forward: the frozen `/api/v1` contract is defined by
the zod schemas in `apps/api/src/modules/**/router.ts`, not by the TypeScript
types in `packages/shared`. A request DTO that mirrors the shared *type* can
still be rejected by the *schema* that validates it.
