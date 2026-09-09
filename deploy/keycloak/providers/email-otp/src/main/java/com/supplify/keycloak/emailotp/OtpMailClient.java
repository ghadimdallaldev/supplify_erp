package com.supplify.keycloak.emailotp;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.regex.Pattern;

final class OtpMailClient {
    private static final Pattern JSON_SAFE = Pattern.compile("[^\\u0020-\\u007e]");
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final EmailOtpConfig config;

    OtpMailClient(EmailOtpConfig config) { this.config = config; }

    void send(String email, String code, String purpose, String locale, String challengeId) {
        if (config.mailUrl.isEmpty() || config.mailSecret.isEmpty()) throw new IllegalStateException("OTP mail integration is not configured");
        String body = "{\"email\":\"" + json(email) + "\",\"code\":\"" + json(code) + "\",\"purpose\":\"" + json(purpose) + "\",\"locale\":\"" + json(locale) + "\",\"challengeId\":\"" + json(challengeId) + "\"}";
        HttpRequest request = HttpRequest.newBuilder(URI.create(config.mailUrl))
            .timeout(Duration.ofSeconds(8)).header("Content-Type", "application/json")
            .header("Authorization", "Bearer " + config.mailSecret).POST(HttpRequest.BodyPublishers.ofString(body)).build();
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) throw new IllegalStateException("OTP mail API returned " + response.statusCode());
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("OTP mail request interrupted", e); }
        catch (Exception e) { throw new IllegalStateException("OTP mail request failed", e); }
    }

    private static String json(String value) {
        String input = value == null ? "" : value;
        return JSON_SAFE.matcher(input.replace(String.valueOf((char) 92), String.valueOf((char) 92) + (char) 92).replace("\"", String.valueOf((char) 92) + "\"")).replaceAll("");
    }
}
