package com.supplify.keycloak.emailotp;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.keycloak.email.EmailException;
import static org.junit.jupiter.api.Assertions.*;

class HttpEmailSenderProviderTest {
    @Test void sendsRenderedLinksAndSharedSecretThroughTheApi() throws Exception {
        AtomicReference<String> body = new AtomicReference<>();
        AtomicReference<String> auth = new AtomicReference<>();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/internal/auth/keycloak/email", exchange -> {
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            auth.set(exchange.getRequestHeaders().getFirst("Authorization"));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        try {
            new HttpEmailSenderProvider("http://127.0.0.1:" + server.getAddress().getPort() + "/api/internal/auth/otp/email", "test-secret")
                .send(Map.of(), "owner@example.com", "Reset \"password\"", "Private reset link", "<a href=\"https://example.com/reset?key=private\">Reset</a>");
            assertEquals("Bearer test-secret", auth.get());
            assertTrue(body.get().contains("key=private"));
            assertTrue(body.get().contains("Reset \\\"password\\\""));
        } finally { server.stop(0); }
    }

    @Test void rejectsFailureWithoutEchoingSensitiveContent() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth/keycloak/email", exchange -> { exchange.sendResponseHeaders(503, -1); exchange.close(); });
        server.start();
        try {
            HttpEmailSenderProvider sender = new HttpEmailSenderProvider("http://127.0.0.1:" + server.getAddress().getPort() + "/auth/otp/email", "private-secret");
            EmailException error = assertThrows(EmailException.class, () -> sender.send(Map.of(), "owner@example.com", "Reset", "private-link", null));
            assertEquals("Keycloak mail API returned 503", error.getMessage());
        } finally { server.stop(0); }
    }
}
