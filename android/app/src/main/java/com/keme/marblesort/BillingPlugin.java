package com.keme.marblesort;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin native bridge over the Google Play Billing Library (v7). All product
 * catalog, reward-granting and entitlement logic lives in JS (BillingService);
 * this class only talks to Play: connect, query products, launch the purchase
 * flow, query owned purchases (restore), acknowledge and consume.
 *
 * Purchase results arrive asynchronously via the PurchasesUpdatedListener and
 * are forwarded to JS through the "purchasesUpdated" event.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private static final String TAG = "BillingPlugin";

    private BillingClient billingClient;
    private boolean connected = false;

    // Cache of ProductDetails keyed by product id — needed to launch a flow.
    private final Map<String, ProductDetails> productDetailsCache = new HashMap<>();

    // ── Lifecycle ────────────────────────────────────────────────────────────
    @Override
    public void load() {
        billingClient = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder()
                                .enableOneTimeProducts()
                                .build())
                .build();
    }

    // ── initialize(): connect to Play ──────────────────────────────────────────
    @PluginMethod
    public void initialize(final PluginCall call) {
        if (billingClient == null) {
            load();
        }
        if (connected && billingClient.isReady()) {
            JSObject ret = new JSObject();
            ret.put("connected", true);
            call.resolve(ret);
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                boolean ok = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                connected = ok;
                Log.i(TAG, "Billing setup finished: code=" + result.getResponseCode() + " ok=" + ok);
                if (ok) {
                    JSObject ret = new JSObject();
                    ret.put("connected", true);
                    call.resolve(ret);
                } else {
                    call.reject("Billing setup failed: " + result.getDebugMessage(),
                            String.valueOf(result.getResponseCode()));
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                connected = false;
                Log.w(TAG, "Billing service disconnected");
                JSObject ev = new JSObject();
                ev.put("connected", false);
                notifyListeners("billingDisconnected", ev);
            }
        });
    }

    // ── getProducts(): query INAPP + SUBS ProductDetails ───────────────────────
    @PluginMethod
    public void getProducts(final PluginCall call) {
        if (!ensureReady(call)) return;

        final JSArray inappIds = call.getArray("inAppProductIds", new JSArray());
        final JSArray subsIds = call.getArray("subscriptionProductIds", new JSArray());
        final JSArray results = new JSArray();

        // Query subs first, then inapp, then resolve with the combined list.
        queryOneType(BillingClient.ProductType.SUBS, jsArrayToList(subsIds), results, () ->
                queryOneType(BillingClient.ProductType.INAPP, jsArrayToList(inappIds), results, () -> {
                    JSObject ret = new JSObject();
                    ret.put("products", results);
                    call.resolve(ret);
                }));
    }

    private void queryOneType(final String productType, final List<String> ids,
                              final JSArray accumulator, final Runnable done) {
        if (ids.isEmpty()) {
            done.run();
            return;
        }
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) {
            products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(productType)
                    .build());
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(products)
                .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsList) -> {
            if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                for (ProductDetails pd : productDetailsList) {
                    productDetailsCache.put(pd.getProductId(), pd);
                    accumulator.put(serializeProduct(pd));
                }
            } else {
                Log.w(TAG, "queryProductDetails(" + productType + ") failed: "
                        + billingResult.getResponseCode() + " " + billingResult.getDebugMessage());
            }
            done.run();
        });
    }

    // ── purchase({ productId }) ─────────────────────────────────────────────────
    @PluginMethod
    public void purchase(final PluginCall call) {
        if (!ensureReady(call)) return;
        final String productId = call.getString("productId");
        if (productId == null) {
            call.reject("Missing productId");
            return;
        }
        final ProductDetails pd = productDetailsCache.get(productId);
        if (pd == null) {
            call.reject("Unknown product (not loaded): " + productId, "PRODUCT_NOT_FOUND");
            return;
        }

        BillingFlowParams.ProductDetailsParams.Builder pdParams =
                BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd);

        // Subscriptions require an offer token.
        if (BillingClient.ProductType.SUBS.equals(pd.getProductType())) {
            List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) {
                call.reject("Subscription has no offers: " + productId, "NO_OFFER");
                return;
            }
            pdParams.setOfferToken(offers.get(0).getOfferToken());
        }

        List<BillingFlowParams.ProductDetailsParams> list = new ArrayList<>();
        list.add(pdParams.build());
        final BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(list)
                .build();

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("No foreground activity to host the billing flow");
            return;
        }
        activity.runOnUiThread(() -> {
            BillingResult r = billingClient.launchBillingFlow(activity, flowParams);
            if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                // The actual outcome is delivered via onPurchasesUpdated.
                JSObject ret = new JSObject();
                ret.put("launched", true);
                call.resolve(ret);
            } else {
                call.reject("launchBillingFlow failed: " + r.getDebugMessage(),
                        String.valueOf(r.getResponseCode()));
            }
        });
    }

    // ── queryPurchases(): owned purchases for restore ───────────────────────────
    @PluginMethod
    public void queryPurchases(final PluginCall call) {
        if (!ensureReady(call)) return;
        final JSArray out = new JSArray();
        queryOwned(BillingClient.ProductType.SUBS, out, () ->
                queryOwned(BillingClient.ProductType.INAPP, out, () -> {
                    JSObject ret = new JSObject();
                    ret.put("purchases", out);
                    call.resolve(ret);
                }));
    }

    private void queryOwned(final String productType, final JSArray accumulator, final Runnable done) {
        billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(productType).build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        for (Purchase p : purchases) {
                            accumulator.put(serializePurchase(p));
                        }
                    } else {
                        Log.w(TAG, "queryPurchases(" + productType + ") failed: "
                                + billingResult.getResponseCode());
                    }
                    done.run();
                });
    }

    // ── acknowledge({ purchaseToken }) ──────────────────────────────────────────
    @PluginMethod
    public void acknowledge(final PluginCall call) {
        if (!ensureReady(call)) return;
        final String token = call.getString("purchaseToken");
        if (token == null) {
            call.reject("Missing purchaseToken");
            return;
        }
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(token)
                .build();
        billingClient.acknowledgePurchase(params, billingResult -> {
            boolean ok = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
            Log.i(TAG, "acknowledge: code=" + billingResult.getResponseCode());
            JSObject ret = new JSObject();
            ret.put("acknowledged", ok);
            ret.put("responseCode", billingResult.getResponseCode());
            call.resolve(ret);
        });
    }

    // ── consume({ purchaseToken }) ──────────────────────────────────────────────
    @PluginMethod
    public void consume(final PluginCall call) {
        if (!ensureReady(call)) return;
        final String token = call.getString("purchaseToken");
        if (token == null) {
            call.reject("Missing purchaseToken");
            return;
        }
        ConsumeParams params = ConsumeParams.newBuilder()
                .setPurchaseToken(token)
                .build();
        billingClient.consumeAsync(params, (billingResult, outToken) -> {
            boolean ok = billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK;
            Log.i(TAG, "consume: code=" + billingResult.getResponseCode());
            JSObject ret = new JSObject();
            ret.put("consumed", ok);
            ret.put("responseCode", billingResult.getResponseCode());
            call.resolve(ret);
        });
    }

    // ── PurchasesUpdatedListener ────────────────────────────────────────────────
    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        JSObject ev = new JSObject();
        ev.put("responseCode", billingResult.getResponseCode());
        ev.put("debugMessage", billingResult.getDebugMessage());
        JSArray arr = new JSArray();
        if (purchases != null) {
            for (Purchase p : purchases) {
                arr.put(serializePurchase(p));
            }
        }
        ev.put("purchases", arr);
        Log.i(TAG, "purchasesUpdated: code=" + billingResult.getResponseCode()
                + " count=" + (purchases == null ? 0 : purchases.size()));
        notifyListeners("purchasesUpdated", ev);
    }

    // ── Serialization helpers ───────────────────────────────────────────────────
    private JSObject serializeProduct(ProductDetails pd) {
        JSObject o = new JSObject();
        o.put("productId", pd.getProductId());
        o.put("type", pd.getProductType());
        o.put("title", pd.getTitle());
        o.put("name", pd.getName());
        o.put("description", pd.getDescription());

        if (BillingClient.ProductType.INAPP.equals(pd.getProductType())) {
            ProductDetails.OneTimePurchaseOfferDetails one = pd.getOneTimePurchaseOfferDetails();
            if (one != null) {
                o.put("price", one.getFormattedPrice());
                o.put("priceAmountMicros", one.getPriceAmountMicros());
                o.put("currency", one.getPriceCurrencyCode());
            }
        } else {
            List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
            if (offers != null && !offers.isEmpty()) {
                ProductDetails.SubscriptionOfferDetails offer = offers.get(0);
                List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                if (!phases.isEmpty()) {
                    ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                    o.put("price", phase.getFormattedPrice());
                    o.put("priceAmountMicros", phase.getPriceAmountMicros());
                    o.put("currency", phase.getPriceCurrencyCode());
                    o.put("billingPeriod", phase.getBillingPeriod());
                }
                o.put("offerToken", offer.getOfferToken());
            }
        }
        return o;
    }

    private JSObject serializePurchase(Purchase p) {
        JSObject o = new JSObject();
        JSArray ids = new JSArray();
        for (String id : p.getProducts()) {
            ids.put(id);
        }
        o.put("productIds", ids);
        o.put("productId", p.getProducts().isEmpty() ? null : p.getProducts().get(0));
        o.put("purchaseToken", p.getPurchaseToken());
        o.put("orderId", p.getOrderId());
        o.put("purchaseTime", p.getPurchaseTime());
        o.put("purchaseState", p.getPurchaseState()); // 1=PURCHASED, 2=PENDING
        o.put("acknowledged", p.isAcknowledged());
        o.put("autoRenewing", p.isAutoRenewing());
        return o;
    }

    // ── Utilities ────────────────────────────────────────────────────────────────
    private boolean ensureReady(PluginCall call) {
        if (billingClient == null || !billingClient.isReady()) {
            call.reject("Billing client not ready — call initialize() first", "NOT_READY");
            return false;
        }
        return true;
    }

    private List<String> jsArrayToList(JSArray arr) {
        List<String> out = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                out.add(arr.getString(i));
            }
        } catch (org.json.JSONException e) {
            Log.w(TAG, "jsArrayToList error", e);
        }
        return out;
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
        super.handleOnDestroy();
    }
}
