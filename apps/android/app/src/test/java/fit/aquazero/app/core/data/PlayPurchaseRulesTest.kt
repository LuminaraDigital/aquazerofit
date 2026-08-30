package fit.aquazero.app.core.data

import com.android.billingclient.api.Purchase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The filter that decides which Play purchases still owe the user an
 * entitlement.
 *
 * It reads as trivia and is not: it is what makes the recovery pass on app
 * start correct, and it is only correct because acknowledgement happens
 * strictly after server verification. These cases pin that invariant so
 * reordering the pair breaks a test rather than a subscription.
 */
class PlayPurchaseRulesTest {

    @Test
    fun `the product id is the monthly base plan the server verifies against`() {
        assertEquals("azf_premium_monthly", PlayPurchaseRules.PREMIUM_PRODUCT_ID)
    }

    @Test
    fun `a fresh purchase still needs the server pass`() {
        assertTrue(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.PURCHASED,
                acknowledged = false,
            ),
        )
    }

    @Test
    fun `an acknowledged purchase was already granted and is left alone`() {
        assertFalse(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.PURCHASED,
                acknowledged = true,
            ),
        )
    }

    @Test
    fun `a pending purchase is never granted - no money has moved yet`() {
        assertFalse(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.PENDING,
                acknowledged = false,
            ),
        )
        assertFalse(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.PENDING,
                acknowledged = true,
            ),
        )
    }

    @Test
    fun `an unspecified state is not treated as a purchase`() {
        assertFalse(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.UNSPECIFIED_STATE,
                acknowledged = false,
            ),
        )
    }

    /*
     * Verification and acknowledgement deliberately disagree on one case, and
     * it is the case that decides whether a renewing subscriber keeps premium.
     * A subscription renews under the SAME purchase token, so the only purchase
     * a second month ever presents is an acknowledged one. Skipping those — the
     * obvious reading of "already settled" — is what left renewals depending
     * entirely on the RTDN webhook, with no way for the app to notice a
     * notification that never arrived.
     */
    @Test
    fun `an acknowledged purchase is still re-verified, because renewals reuse the token`() {
        assertTrue(
            PlayPurchaseRules.needsVerifying(purchaseState = Purchase.PurchaseState.PURCHASED),
        )
        assertFalse(
            PlayPurchaseRules.needsGranting(
                purchaseState = Purchase.PurchaseState.PURCHASED,
                acknowledged = true,
            ),
        )
    }

    @Test
    fun `nothing unpaid is ever sent for verification`() {
        assertFalse(
            PlayPurchaseRules.needsVerifying(purchaseState = Purchase.PurchaseState.PENDING),
        )
        assertFalse(
            PlayPurchaseRules.needsVerifying(
                purchaseState = Purchase.PurchaseState.UNSPECIFIED_STATE,
            ),
        )
    }

    /*
     * CROSS-PLATFORM GOLDEN VECTOR.
     *
     * The same account id and the same expected digest are asserted in the API
     * suite (apps/api/src/__tests__/playBilling.integration.test.ts). The
     * server rejects a purchase whose Play-reported account identifier does not
     * equal its own recomputation, so if these two implementations ever drift
     * the result is not a degraded feature — it is every purchase on every
     * device being refused as somebody else's, from the first one.
     *
     * Neither side's own tests would catch that, because each is correct in
     * isolation. Only a shared constant catches it, and it fails on whichever
     * side was changed.
     *
     * This particular digest contains bytes above 0x7f (fc, a8, c1, d2, c2,
     * f7, f9, cd), which is deliberate: Kotlin's Byte is signed, and a hex
     * conversion that fails to mask back to eight bits is correct for exactly
     * the vectors that do not.
     */
    @Test
    fun `obfuscated account id matches the server byte for byte`() {
        assertEquals(
            "362811fc7da81200c1d26e362d5036c27cf74c52f9356f0b5ccd864658524e4f",
            PlayPurchaseRules.obfuscatedAccountIdFor("usr_golden"),
        )
    }

    @Test
    fun `the digest is 64 lowercase hex characters, which is Play's limit`() {
        val id = PlayPurchaseRules.obfuscatedAccountIdFor("usr_any_account_id")
        assertEquals(64, id.length)
        assertTrue(id.all { it in '0'..'9' || it in 'a'..'f' })
    }
}
