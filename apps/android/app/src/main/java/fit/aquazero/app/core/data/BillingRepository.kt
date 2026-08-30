package fit.aquazero.app.core.data

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClient.BillingResponseCode
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.android.billingclient.api.acknowledgePurchase
import com.android.billingclient.api.queryProductDetails
import com.android.billingclient.api.queryPurchasesAsync
import dagger.hilt.android.qualifiers.ApplicationContext
import fit.aquazero.app.core.database.UserDao
import fit.aquazero.app.core.model.ApiResult
import fit.aquazero.app.core.network.api.BillingApi
import fit.aquazero.app.core.network.api.PlayVerifyRequest
import fit.aquazero.app.core.network.safeCall
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * The purchase rules that do not need Play, Android or a network to decide.
 *
 * Pure by design, in the same spirit as [MealPhotoRules]: the one decision that
 * actually protects the user's money — *which* purchases still need the server
 * pass — is a plain function covered by JVM unit tests rather than something
 * only reachable by driving a billing sandbox.
 */
internal object PlayPurchaseRules {

    /** The single subscription product; a monthly base plan. */
    const val PREMIUM_PRODUCT_ID = "azf_premium_monthly"

    /**
     * Whether a purchase Play reported still has to go to our server.
     *
     * `acknowledged` is a reliable "the server has already granted this" marker
     * *only because* [BillingRepository] never acknowledges before the server
     * verifies. Reverse that order anywhere and this filter starts skipping
     * purchases that were paid for and never granted, which is the exact
     * failure the ordering exists to prevent.
     *
     * A `PENDING` purchase is excluded: no money has moved yet, so there is
     * nothing to verify and acknowledging it would be a lie to Google.
     */
    fun needsGranting(purchaseState: Int, acknowledged: Boolean): Boolean =
        purchaseState == Purchase.PurchaseState.PURCHASED && !acknowledged

    /**
     * Whether a purchase Play reported should be put to our server at all.
     *
     * Every `PURCHASED` purchase, acknowledged or not — which is the one place
     * this deliberately differs from [needsGranting]. Acknowledgement records
     * that *a* period was once granted; it says nothing about the period
     * running now. A subscription renews under the SAME purchase token, so an
     * acknowledged token whose renewal never reached us is exactly the case
     * where the user is still paying and the server still holds the first
     * month's expiry. Re-verifying is idempotent on the server, so the cost of
     * asking on every restore is one request, and the cost of not asking is a
     * paying subscriber silently dropped to free.
     */
    fun needsVerifying(purchaseState: Int): Boolean =
        purchaseState == Purchase.PurchaseState.PURCHASED

    /**
     * The account identifier handed to Play, derived from our account id.
     *
     * SHA-256, lowercase hex. This value has to match `obfuscatedAccountIdFor`
     * in `apps/api/src/modules/billing/play.ts` byte for byte: the server
     * compares what Google reports against its own recomputation, and rejects a
     * mismatch as somebody else's purchase. Drift here does not degrade
     * gracefully — it rejects EVERY purchase, on every device, from the first
     * one — and because the two sides are tested independently, nothing else
     * would notice.
     *
     * Extracted out of the repository purely so that invariant is reachable
     * from a JVM test. `PlayPurchaseRulesTest` pins it to a golden vector that
     * the API suite pins the server to as well, so a change on either side
     * fails on the side that changed.
     *
     * `%02x` on a Kotlin `Byte` is the subtle part: `Byte` is signed, and the
     * formatter is what masks each value back to eight bits. Getting that wrong
     * produces a plausible-looking string of the wrong length for exactly the
     * hashes containing a byte above 0x7f, which is most of them.
     */
    fun obfuscatedAccountIdFor(accountId: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(accountId.toByteArray(Charsets.UTF_8))
            .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xFF) }
}

/** The premium subscription as Google priced it for this user, in their currency. */
data class PremiumOffer(
    val productId: String,
    /** Play's own formatted price for the recurring phase, e.g. "£3.99". */
    val formattedPrice: String,
)

/** Why an attempt to buy or restore the subscription did not end in an entitlement. */
enum class BillingFailure {
    /** Play billing is unusable here — no Play services, or an account that cannot transact. */
    PLAY_UNAVAILABLE,

    /** Play has no such product, or no offer on it. Usually a Play Console configuration gap. */
    PRODUCT_UNAVAILABLE,

    /** `402 PURCHASE_INVALID` — Google rejected the token. Nothing to grant. */
    REJECTED,

    /** `503 BILLING_UNAVAILABLE` — the server cannot verify anything at the moment. */
    VERIFY_UNAVAILABLE,

    /** No connection reached either Play or our server. */
    OFFLINE,

    /** Anything else, including a malformed reply from the verify route. */
    UNKNOWN,
}

/** The outcome of one attempt to buy, or to settle an outstanding purchase. */
sealed interface BillingOutcome {
    /** The server verified the purchase. The caller must now re-read entitlements. */
    data object Verified : BillingOutcome

    /** The user backed out of Play's sheet. A decision, not a fault — never an error. */
    data object Cancelled : BillingOutcome

    /** No outstanding purchase on this account. */
    data object NothingToSettle : BillingOutcome

    /** Play accepted a slow payment method. Nothing is owed and nothing is granted yet. */
    data object AwaitingPayment : BillingOutcome

    data class Failed(val reason: BillingFailure) : BillingOutcome
}

/**
 * Google Play billing for the premium subscription.
 *
 * The client never decides it is premium. A purchase is worth exactly one
 * thing here: a token to send to `POST /billing/play/verify`. The tier the app
 * renders always comes from `GET /me/entitlements` afterwards, so a rooted
 * device that fakes a purchase gets a token the server rejects, not an
 * entitlement.
 *
 * **Coaches are not sold through this, or through anything else** — see
 * [CoachesRepository]. The premium subscription is the only product.
 */
@Singleton
class BillingRepository @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val billingApi: BillingApi,
    /** Source of the signed-in account id, for Play's own fraud signals. */
    private val userDao: UserDao,
) {

    /**
     * Own scope, in the manner of `SessionManager`. It exists for one case: a
     * purchase that completes after the screen that started it is gone. The
     * user is still charged, so the verify/acknowledge pass has to survive the
     * caller's coroutine being cancelled.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** The caller currently parked on [BillingClient.launchBillingFlow], if any. */
    private val purchaseWaiter = AtomicReference<CompletableDeferred<PurchaseSettlement>?>(null)

    /** One Play conversation at a time; in particular, never two billing flows. */
    private val playGate = Mutex()
    private val connectionGate = Mutex()

    private val listener = PurchasesUpdatedListener { result, purchases ->
        // Settling starts here, on the repository's own scope, and never on the
        // coroutine that opened the sheet. The user has been charged whatever
        // that caller does next, so the verify/acknowledge pass must outlive
        // it: a purchase that lands while the screen is being popped, or that
        // Play reports from outside the app entirely, is settled either way.
        // The waiter below only *observes* that work; cancelling the observer
        // cannot cancel it.
        val settlement = if (result.responseCode == BillingResponseCode.OK) {
            scope.async { settle(purchases.orEmpty()) }
        } else {
            null
        }
        purchaseWaiter.getAndSet(null)?.complete(PurchaseSettlement(result, settlement))
    }

    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener(listener)
        // `enableOneTimeProducts()` is not optional even though nothing here is
        // a one-time product: PendingPurchasesParams.Builder.build() throws
        // IllegalArgumentException("Pending purchases for one-time products
        // must be supported.") without it, which would take the app down in
        // this constructor — that is, at first injection, not at first purchase.
        // `enablePrepaidPlans()` is the half that is actually about
        // subscriptions, and covers a prepaid plan being added to the base plan
        // later without this line having to be remembered.
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .enablePrepaidPlans()
                .build(),
        )
        // Play's service dies routinely (updates, low memory). Without this the
        // first call after that returns SERVICE_DISCONNECTED and every
        // subsequent one does too, because nothing re-binds.
        .enableAutoServiceReconnection()
        .build()

    /**
     * What premium costs, or null when Play cannot quote a price right now.
     *
     * Null is rendered as "not available on this device", never as an error:
     * an emulator without Play services, a work profile, or a build that is not
     * yet published on a track all land here and none of them is the user's
     * problem.
     */
    suspend fun premiumOffer(): PremiumOffer? {
        if (connect().responseCode != BillingResponseCode.OK) return null
        val details = productDetails() ?: return null
        val offer = selectOffer(details) ?: return null
        // Last phase, not first: a base plan carrying a free trial or an
        // introductory price lists those first, and quoting "£0.00 a month"
        // for a subscription that renews at full price is the one price we
        // must not print.
        val recurring = offer.pricingPhases.pricingPhaseList.last()
        return PremiumOffer(
            productId = details.productId,
            formattedPrice = recurring.formattedPrice,
        )
    }

    /**
     * Buy premium. Suspends for as long as Play's sheet is open.
     *
     * On success the caller must re-fetch entitlements; this returns
     * [BillingOutcome.Verified] to say the server granted something, not to say
     * what it granted.
     */
    suspend fun purchasePremium(activity: Activity): BillingOutcome = playGate.withLock {
        val connection = connect()
        if (connection.responseCode != BillingResponseCode.OK) {
            return@withLock BillingOutcome.Failed(playFailure(connection))
        }
        val details = productDetails()
            ?: return@withLock BillingOutcome.Failed(BillingFailure.PRODUCT_UNAVAILABLE)
        val offerToken = selectOffer(details)?.offerToken
            ?: return@withLock BillingOutcome.Failed(BillingFailure.PRODUCT_UNAVAILABLE)

        // Read before the waiter is armed. It touches Room, and a suspension
        // point between arming and launching is a window where Play cannot yet
        // call anything back but this coroutine already looks parked.
        val accountId = obfuscatedAccountId()

        val waiter = CompletableDeferred<PurchaseSettlement>()
        // Armed before the launch, never after: Play can call the listener back
        // before launchBillingFlow has returned, and an update that arrives
        // with no waiter installed leaves this coroutine parked for ever.
        purchaseWaiter.set(waiter)
        val launched = client.launchBillingFlow(activity, flowParams(details, offerToken, accountId))
        if (launched.responseCode != BillingResponseCode.OK) {
            purchaseWaiter.compareAndSet(waiter, null)
            return@withLock outcomeFor(launched)
        }

        val settlement = try {
            waiter.await()
        } finally {
            // A cancelled caller must not leave its waiter armed. The next
            // purchase installs its own, and Play's callback for THIS one would
            // then complete that one with this result. Clearing it costs
            // nothing: the settlement belongs to `scope`, not to the waiter.
            purchaseWaiter.compareAndSet(waiter, null)
        }
        settlement.outcome?.await() ?: outcomeFor(settlement.result)
    }

    /**
     * Settle anything Play is still holding for this account.
     *
     * **Not optional, and not a nicety.** It is the only recovery path for
     * someone who paid and then closed the app — during the Play sheet, or
     * after it while verification was failing. Without this call their money is
     * taken, the subscription is never acknowledged, and Google silently
     * refunds it three days later while the app has spent that time showing
     * them the free tier and no explanation.
     *
     * Called on every start once a session exists (`PlayPurchaseRecovery`).
     */
    suspend fun restorePremiumPurchases(): BillingOutcome = playGate.withLock {
        val connection = connect()
        if (connection.responseCode != BillingResponseCode.OK) {
            return@withLock BillingOutcome.Failed(playFailure(connection))
        }
        val query = client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
        )
        if (query.billingResult.responseCode != BillingResponseCode.OK) {
            return@withLock BillingOutcome.Failed(playFailure(query.billingResult))
        }
        settleOnOwnScope(query.purchasesList.orEmpty())
    }

    // ----- the ordering that matters -----

    /**
     * Verify with our server, then — and only then — acknowledge to Google.
     *
     * Both orderings lose something when the pair does not complete, so the
     * choice is which loss is survivable:
     *
     *  - Acknowledge first, verify second: acknowledging tells Google to keep
     *    the money. If the verify then fails, the user is paying for a
     *    subscription the server never granted, with nothing left to reverse
     *    it — Google's auto-refund only applies to purchases that were *not*
     *    acknowledged. That is a charge for nothing, and the app cannot fix it.
     *  - Verify first, acknowledge second: if the acknowledge fails, the user
     *    has the entitlement and Google still holds an unacknowledged purchase.
     *    [restorePremiumPurchases] retries on the next start, well inside the
     *    three-day window; and in the worst case Google refunds a user who was
     *    given premium. Losing revenue is survivable. Taking money for nothing
     *    is not.
     */
    private suspend fun grant(purchase: Purchase): BillingOutcome {
        val verified = safeCall {
            billingApi.verifyPlayPurchase(
                PlayVerifyRequest(
                    purchaseToken = purchase.purchaseToken,
                    // The purchase's own product, not the constant: whatever
                    // Play actually sold is what the server has to check.
                    productId = purchase.products.firstOrNull()
                        ?: PlayPurchaseRules.PREMIUM_PRODUCT_ID,
                ),
            )
        }
        if (verified is ApiResult.Failure) return BillingOutcome.Failed(verifyFailure(verified))

        if (PlayPurchaseRules.needsGranting(purchase.purchaseState, purchase.isAcknowledged)) {
            client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder()
                    .setPurchaseToken(purchase.purchaseToken)
                    .build(),
            )
        }
        // The acknowledge result is deliberately not turned into a failure. The
        // server has already granted the entitlement, so telling the user the
        // purchase failed would be false; the purchase simply stays
        // unacknowledged and restorePremiumPurchases() picks it up again.
        return BillingOutcome.Verified
    }

    /**
     * Run [settle] on this repository's own scope and merely watch it.
     *
     * Callers are screens, and screens go away. Awaiting a job that belongs to
     * [scope] means a cancelled caller stops *waiting* for the settlement
     * rather than cancelling it half-done — which, between the verify and the
     * acknowledge, is the state that costs the user money.
     */
    private suspend fun settleOnOwnScope(purchases: List<Purchase>): BillingOutcome =
        scope.async { settle(purchases) }.await()

    /** Send every purchase Play reported through [grant], as far as it gets. */
    private suspend fun settle(purchases: List<Purchase>): BillingOutcome {
        val ours = purchases.filter { PlayPurchaseRules.PREMIUM_PRODUCT_ID in it.products }
        if (ours.isEmpty()) return BillingOutcome.NothingToSettle
        var outcome: BillingOutcome = BillingOutcome.NothingToSettle
        for (purchase in ours) {
            outcome = when {
                // Acknowledged purchases go too: this is the only thing that
                // notices a renewal our server was never told about.
                PlayPurchaseRules.needsVerifying(purchase.purchaseState) -> grant(purchase)
                purchase.purchaseState == Purchase.PurchaseState.PENDING ->
                    BillingOutcome.AwaitingPayment
                else -> BillingOutcome.NothingToSettle
            }
            if (outcome is BillingOutcome.Failed) return outcome
        }
        return outcome
    }

    // ----- Play plumbing -----

    private suspend fun connect(): BillingResult = connectionGate.withLock {
        if (client.isReady) return@withLock resultOf(BillingResponseCode.OK)
        suspendCancellableCoroutine { continuation ->
            client.startConnection(
                object : BillingClientStateListener {
                    override fun onBillingSetupFinished(result: BillingResult) {
                        if (continuation.isActive) continuation.resume(result)
                    }

                    override fun onBillingServiceDisconnected() {
                        // Not a retry hook — `enableAutoServiceReconnection`
                        // re-binds on its own. Resumed here only to cover the
                        // bind dying before setup ever reported, which would
                        // otherwise park this caller for ever.
                        if (continuation.isActive) {
                            continuation.resume(resultOf(BillingResponseCode.SERVICE_UNAVAILABLE))
                        }
                    }
                },
            )
        }
    }

    private suspend fun productDetails(): ProductDetails? {
        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(
                listOf(
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(PlayPurchaseRules.PREMIUM_PRODUCT_ID)
                        .setProductType(BillingClient.ProductType.SUBS)
                        .build(),
                ),
            )
            .build()
        val result = client.queryProductDetails(params)
        if (result.billingResult.responseCode != BillingResponseCode.OK) return null
        return result.productDetailsList.orEmpty()
            .firstOrNull { it.productId == PlayPurchaseRules.PREMIUM_PRODUCT_ID }
    }

    /**
     * The one offer this app sells, chosen the same way every time.
     *
     * This used to be two independent `firstOrNull()` calls — one to quote a
     * price, one to charge it — and Play promises no order. The moment a second
     * offer exists on the base plan (a launch promotion, a win-back), those two
     * picks can disagree and the screen advertises a price the sheet does not
     * charge. One deterministic choice, used by both, cannot.
     *
     * Cheapest recurring phase wins, since that is what the user pays every
     * month after any intro period. Ties go to the offer with more phases —
     * that is the one carrying the trial or introductory price, so it is
     * strictly better for them. The offer token is a final tiebreak purely to
     * make the result stable rather than order-dependent.
     */
    private fun selectOffer(details: ProductDetails): ProductDetails.SubscriptionOfferDetails? =
        details.subscriptionOfferDetails
            ?.filter { it.pricingPhases.pricingPhaseList.isNotEmpty() }
            ?.minWithOrNull(
                compareBy<ProductDetails.SubscriptionOfferDetails> {
                    it.pricingPhases.pricingPhaseList.last().priceAmountMicros
                }
                    .thenByDescending { it.pricingPhases.pricingPhaseList.size }
                    .thenBy { it.offerToken },
            )

    /**
     * A stable, non-reversible handle on the signed-in account, for Play.
     *
     * Google's own purchase-fraud signals key on this, and it is what lets the
     * server tell "this user bought this subscription" from "this user was
     * handed somebody else's purchase token". It must not be the account id
     * itself — Play stores it and shows it in the console — so the id is
     * hashed. SHA-256 hex is 64 characters, which is exactly Play's limit.
     *
     * Null when no account row is cached yet. The purchase still goes ahead:
     * refusing to sell to someone whose `/me` has not landed would be a worse
     * failure than a purchase Google cannot cross-reference.
     */
    private suspend fun obfuscatedAccountId(): String? =
        userDao.user().firstOrNull()?.id?.let(PlayPurchaseRules::obfuscatedAccountIdFor)

    private fun flowParams(
        details: ProductDetails,
        offerToken: String,
        obfuscatedAccountId: String?,
    ): BillingFlowParams =
        BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                listOf(
                    BillingFlowParams.ProductDetailsParams.newBuilder()
                        .setProductDetails(details)
                        // Mandatory for subscriptions: without an offer token
                        // Play refuses the flow with DEVELOPER_ERROR.
                        .setOfferToken(offerToken)
                        .build(),
                ),
            )
            .apply { obfuscatedAccountId?.let(::setObfuscatedAccountId) }
            .build()

    private suspend fun outcomeFor(result: BillingResult): BillingOutcome =
        when (result.responseCode) {
            // Backing out of Play's sheet is a decision, not a fault.
            BillingResponseCode.USER_CANCELED -> BillingOutcome.Cancelled
            // Already subscribed — on this account, or from another install.
            // The purchase exists, so the answer is to settle it, not to fail.
            BillingResponseCode.ITEM_ALREADY_OWNED -> settleOwned()
            else -> BillingOutcome.Failed(playFailure(result))
        }

    private suspend fun settleOwned(): BillingOutcome {
        val query = client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
        )
        if (query.billingResult.responseCode != BillingResponseCode.OK) {
            return BillingOutcome.Failed(playFailure(query.billingResult))
        }
        return settleOnOwnScope(query.purchasesList.orEmpty())
    }

    private fun playFailure(result: BillingResult): BillingFailure = when (result.responseCode) {
        BillingResponseCode.BILLING_UNAVAILABLE,
        BillingResponseCode.SERVICE_UNAVAILABLE,
        BillingResponseCode.FEATURE_NOT_SUPPORTED,
        -> BillingFailure.PLAY_UNAVAILABLE
        BillingResponseCode.ITEM_UNAVAILABLE -> BillingFailure.PRODUCT_UNAVAILABLE
        BillingResponseCode.NETWORK_ERROR -> BillingFailure.OFFLINE
        else -> BillingFailure.UNKNOWN
    }

    /**
     * The verify route's own vocabulary. `402` is a verdict on the purchase and
     * must not be retried; `503` is our outage and must be.
     */
    private fun verifyFailure(failure: ApiResult.Failure): BillingFailure = when {
        failure is ApiResult.Failure.Network -> BillingFailure.OFFLINE
        failure !is ApiResult.Failure.Api -> BillingFailure.UNKNOWN
        failure.httpStatus == HTTP_PAYMENT_REQUIRED -> BillingFailure.REJECTED
        failure.httpStatus == HTTP_SERVICE_UNAVAILABLE -> BillingFailure.VERIFY_UNAVAILABLE
        else -> BillingFailure.UNKNOWN
    }

    private fun resultOf(responseCode: Int): BillingResult =
        BillingResult.newBuilder().setResponseCode(responseCode).build()

    /**
     * What Play reported, and the settlement already running for it.
     *
     * [outcome] is null exactly when Play reported something other than OK —
     * a cancellation or an error — so there is nothing to settle and
     * [outcomeFor] reads the result instead.
     */
    private data class PurchaseSettlement(
        val result: BillingResult,
        val outcome: Deferred<BillingOutcome>?,
    )

    private companion object {
        /** `402 PURCHASE_INVALID`. */
        const val HTTP_PAYMENT_REQUIRED = 402

        /** `503 BILLING_UNAVAILABLE`. */
        const val HTTP_SERVICE_UNAVAILABLE = 503
    }
}
