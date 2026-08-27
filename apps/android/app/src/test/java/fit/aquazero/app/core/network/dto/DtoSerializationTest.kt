package fit.aquazero.app.core.network.dto

import fit.aquazero.app.core.model.AzfJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Decodes realistic API payloads (shapes copied from the live routers /
 * shared TS types) and asserts the tolerant-Json posture: unknown fields
 * ignored, optionals defaulted, enums mapped by their TS string values.
 */
class DtoSerializationTest {

    @Test
    fun `auth response decodes with user projection`() {
        val json = """
            {
              "accessToken": "eyJhbGciOi.header.payload",
              "refreshToken": "rt.0123456789abcdef",
              "user": {
                "id": "u-1", "email": "swim@aquazero.fit", "displayName": "Swim",
                "role": "user", "tier": "free", "emailVerified": false,
                "hasProfile": true, "telegramLinked": false, "hasPassword": true,
                "timezone": "Australia/Sydney", "createdAt": "2026-08-01T00:00:00.000Z",
                "someFutureField": {"nested": true}
              }
            }
        """.trimIndent()
        val decoded = AzfJson.decodeFromString(AuthResponseDto.serializer(), json)
        assertEquals("u-1", decoded.user.id)
        assertTrue(decoded.user.hasProfile)
        assertEquals(UserTier.FREE, decoded.user.tier)
        assertEquals("Australia/Sydney", decoded.user.timezone)
    }

    @Test
    fun `daily nutrition decodes meals keyed by meal type`() {
        val json = """
            {
              "date": "2026-08-27",
              "kcalTarget": 2000, "kcalConsumed": 1520.5, "kcalBurned": 250,
              "kcalNet": 1270.5, "kcalRemaining": 479.5,
              "proteinG": {"consumed": 92.1, "target": 140},
              "carbsG": {"consumed": 180, "target": 220},
              "fatG": {"consumed": 44.2, "target": 70},
              "waterMl": {"consumed": 1500, "target": 2500},
              "meals": {
                "breakfast": [{
                  "id": "ml-1", "userId": "u-1", "type": "mealLog",
                  "mealType": "breakfast",
                  "items": [{"name": "Oats", "grams": 80, "kcal": 303,
                             "proteinG": 10.6, "carbsG": 54.2, "fatG": 5.5}],
                  "totalKcal": 303, "totalProteinG": 10.6, "totalCarbsG": 54.2,
                  "totalFatG": 5.5, "source": "manual",
                  "loggedAt": "2026-08-27T07:30:00.000Z", "localDate": "2026-08-27"
                }],
                "lunch": [], "dinner": [], "snack": []
              }
            }
        """.trimIndent()
        val decoded = AzfJson.decodeFromString(DailyNutritionDto.serializer(), json)
        assertEquals(1520.5, decoded.kcalConsumed, 1e-9)
        assertEquals(1, decoded.meals.getValue(MealType.BREAKFAST).size)
        assertEquals("Oats", decoded.meals.getValue(MealType.BREAKFAST)[0].items[0].name)
        assertEquals(MealLogSource.MANUAL, decoded.meals.getValue(MealType.BREAKFAST)[0].source)
    }

    @Test
    fun `progress summary decodes consistency without a broken state`() {
        val json = """
            {
              "currentWeightKg": 81.2, "startWeightKg": 84.0, "targetWeightKg": 78.0,
              "weightSeries": [{"date": "2026-08-25", "value": 81.6},
                               {"date": "2026-08-27", "value": 81.2}],
              "streakDays": 6,
              "consistency": {"currentDays": 6, "bestDays": 14, "activeDays": 21,
                              "windowDays": 28, "graceRemaining": 1,
                              "state": "building", "lastActiveDate": "2026-08-27"},
              "workoutsCompleted": 12, "totalKcalBurned": 4620,
              "achievements": [{
                "definition": {"id": "a-1", "type": "achievementDefinition",
                               "name": "First splash", "description": "Log a meal",
                               "icon": "droplet",
                               "rule": {"kind": "firstAction", "action": "mealLog"}},
                "earnedAt": "2026-08-14T10:00:00.000Z"
              }]
            }
        """.trimIndent()
        val decoded = AzfJson.decodeFromString(ProgressSummaryDto.serializer(), json)
        assertEquals(ConsistencyState.BUILDING, decoded.consistency.state)
        assertEquals(2, decoded.weightSeries.size)
        assertEquals("First splash", decoded.achievements[0].definition.name)
    }

    @Test
    fun `food decodes with off enrichment and unknown nutriscore tolerated`() {
        val json = """
            {
              "id": "f-1", "type": "food", "name": "Greek yogurt", "brand": "Farm",
              "category": "dairy",
              "per100g": {"kcal": 59, "proteinG": 10.2, "carbsG": 3.6, "fatG": 0.4},
              "commonServings": [{"label": "1 tub", "grams": 170}],
              "allergens": ["milk"], "source": "off", "licence": "ODbL",
              "barcode": "9300601234567", "nutriscore": "a", "isVegetarian": true
            }
        """.trimIndent()
        val decoded = AzfJson.decodeFromString(FoodDto.serializer(), json)
        assertEquals(Nutriscore.A, decoded.nutriscore)
        assertEquals(listOf(Allergen.MILK), decoded.allergens)
        assertEquals(170.0, decoded.commonServings[0].grams, 1e-9)
    }

    @Test
    fun `error envelope decodes with schemaless details`() {
        val json = """
            {"code": "CONFLICT", "message": "Job already confirmed.",
             "details": {"mealLogId": "ml-42"}}
        """.trimIndent()
        val decoded = AzfJson.decodeFromString(ApiErrorEnvelope.serializer(), json)
        assertEquals("CONFLICT", decoded.code)
        assertTrue(decoded.details.toString().contains("ml-42"))
    }

    @Test
    fun `envelope without details decodes to null details`() {
        val decoded = AzfJson.decodeFromString(
            ApiErrorEnvelope.serializer(),
            """{"code": "NOT_FOUND", "message": "Food not found"}""",
        )
        assertNull(decoded.details)
    }
}
