package com.supplify.keycloak.emailotp;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.keycloak.email.EmailException;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.util.JsonSerialization;

/** Uses the existing authenticated API mail channel for Keycloak-rendered links. */
final class HttpEmailSenderProvider implements EmailSenderProvider {
    private static final String OTP_SUFFIX = "/auth/otp/email";
    private final String endpoint;
    private final String secret;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();

    HttpEmailSenderProvider(String otpUrl, String secret) {
        if (!otpUrl.endsWith(OTP_SUFFIX) || secret == null || secret.isBlank()) {
            throw new IllegalArgumentException("Keycloak HTTP mail integration is not configured");
        }
        this.endpoint = otpUrl.substring(0, otpUrl.length() - OTP_SUFFIX.length()) + "/auth/keycloak/email";
        this.secret = secret;
    }

    @Override
    public void send(Map<String, String> config, String address, String subject, String textBody, String htmlBody) throws EmailException {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("email", address);
        body.put("subject", subject);
        body.put("text", textBody);
        body.put("html", htmlBody);
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + secret)
                .POST(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(body)))
                .build();
            HttpResponse<Void> response = client.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new EmailException("Keycloak mail API returned " + response.statusCode());
            }
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new EmailException("Keycloak mail request interrupted");
        } catch (EmailException error) {
            throw error;
        } catch (Exception error) {
            // Do not include rendered links, recipients, or credentials in logs.
            throw new EmailException("Keycloak HTTP mail delivery failed");
        }
    }

    @Override public void close() {}
}
