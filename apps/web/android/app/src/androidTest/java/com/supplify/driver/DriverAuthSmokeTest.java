package com.supplify.driver;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.webkit.CookieManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class DriverAuthSmokeTest {

    private static final long PAGE_TIMEOUT_MS = 30_000;

    @Test
    public void signInOpensConfiguredAuthHost() throws Exception {
        verifyAuthEntry(
            "(() => { const button = document.querySelector('[data-testid=\"login-button\"]');" +
            " if (!button) return false; button.click(); return true; })()",
            "/protocol/openid-connect/auth"
        );
    }

    @Test
    public void registerOpensConfiguredAuthHost() throws Exception {
        verifyAuthEntry(
            "(() => { const button = Array.from(document.querySelectorAll('button'))" +
            ".find((element) => element.textContent && element.textContent.trim() === 'Create account');" +
            " if (!button) return false; button.click(); return true; })()",
            "/registrations"
        );
    }

    private void verifyAuthEntry(String clickScript, String expectedPath) throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        JSONObject config = readCapacitorConfig(context);
        JSONObject server = config.optJSONObject("server");
        String hostedAppUrl = server == null ? "" : server.optString("url", "");
        List<String> trustedAuthHosts = readTrustedHosts(server);

        Assume.assumeTrue("Hosted Android profile is required for this smoke test", !hostedAppUrl.isEmpty());
        assertTrue("At least one trusted auth host must be configured", !trustedAuthHosts.isEmpty());

        String expectedAppHost = URI.create(hostedAppUrl).getHost();
        AtomicReference<WebView> webViewRef = new AtomicReference<>();

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                WebView webView = activity.getBridge().getWebView();
                webViewRef.set(webView);
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                webView.loadUrl(hostedAppUrl + "/login");
            });

            WebView webView = webViewRef.get();
            assertNotNull("Capacitor WebView was not created", webView);

            waitForUrl(webView, url -> expectedAppHost.equals(URI.create(url).getHost()));
            waitForJavaScript(webView, clickScript);

            String authUrl = waitForUrl(
                webView,
                url -> trustedAuthHosts.contains(URI.create(url).getHost())
            );
            assertTrue(
                "Expected auth path " + expectedPath + " but was " + authUrl,
                URI.create(authUrl).getPath().contains(expectedPath)
            );
        }
    }

    private static JSONObject readCapacitorConfig(Context context) throws Exception {
        try (InputStream stream = context.getAssets().open("capacitor.config.json")) {
            return new JSONObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static List<String> readTrustedHosts(JSONObject server) {
        List<String> hosts = new ArrayList<>();
        if (server == null) return hosts;
        JSONArray entries = server.optJSONArray("allowNavigation");
        if (entries == null) return hosts;
        for (int index = 0; index < entries.length(); index++) {
            String host = entries.optString(index, "").trim();
            if (!host.isEmpty()) hosts.add(host);
        }
        return hosts;
    }

    private static String waitForUrl(WebView webView, Predicate<String> predicate) throws Exception {
        long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            AtomicReference<String> urlRef = new AtomicReference<>("");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(
                () -> urlRef.set(webView.getUrl())
            );
            String url = urlRef.get();
            if (url != null && !url.isEmpty() && predicate.test(url)) return url;
            Thread.sleep(250);
        }
        throw new AssertionError("Timed out waiting for WebView navigation");
    }

    private static void waitForJavaScript(WebView webView, String script) throws Exception {
        long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
        while (System.currentTimeMillis() < deadline) {
            CountDownLatch latch = new CountDownLatch(1);
            AtomicReference<String> resultRef = new AtomicReference<>("false");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(
                () -> webView.evaluateJavascript(script, result -> {
                    resultRef.set(result);
                    latch.countDown();
                })
            );
            assertTrue("JavaScript callback timed out", latch.await(2, TimeUnit.SECONDS));
            if ("true".equals(resultRef.get())) return;
            Thread.sleep(250);
        }
        throw new AssertionError("Timed out waiting for the auth button");
    }
}
