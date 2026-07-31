package com.supplify.keycloak.emailotp;

import java.util.Locale;
import org.keycloak.Config;

final class EmailOtpConfig {
    final boolean enabled;
    final boolean driverLoginBypass;
    final int length;
    final long ttlSeconds;
    final int maxAttempts;
    final long resendCooldownSeconds;
    final String hmacSecret;
    final String mailUrl;
    final String mailSecret;

    EmailOtpConfig(Config.Scope scope) {
        enabled = bool("AUTH_EMAIL_OTP_ENABLED", scope, envBool("AUTH_EMAIL_OTP_ENABLED", false));
        driverLoginBypass = bool("AUTH_EMAIL_OTP_DRIVER_BYPASS", scope, envBool("AUTH_EMAIL_OTP_DRIVER_BYPASS", true));
        length = integer("AUTH_EMAIL_OTP_LENGTH", scope, envInt("AUTH_EMAIL_OTP_LENGTH", 6), 4, 10);
        ttlSeconds = integer("AUTH_EMAIL_OTP_TTL_SECONDS", scope, envInt("AUTH_EMAIL_OTP_TTL_SECONDS", 600), 30, 3600);
        maxAttempts = integer("AUTH_EMAIL_OTP_MAX_ATTEMPTS", scope, envInt("AUTH_EMAIL_OTP_MAX_ATTEMPTS", 5), 1, 20);
        resendCooldownSeconds = integer("AUTH_EMAIL_OTP_RESEND_COOLDOWN_SECONDS", scope, envInt("AUTH_EMAIL_OTP_RESEND_COOLDOWN_SECONDS", 60), 0, 3600);
        hmacSecret = value("AUTH_EMAIL_OTP_HMAC_SECRET", scope, System.getenv("AUTH_EMAIL_OTP_HMAC_SECRET"));
        mailUrl = value("SUPPLIFY_OTP_MAIL_URL", scope, System.getenv("SUPPLIFY_OTP_MAIL_URL"));
        mailSecret = value("SUPPLIFY_OTP_MAIL_SECRET", scope, System.getenv("SUPPLIFY_OTP_MAIL_SECRET"));
    }

    private static String value(String key, Config.Scope scope, String fallback) {
        String value = scope == null ? null : scope.get(key);
        return value == null || value.isEmpty() ? (fallback == null ? "" : fallback) : value;
    }
    private static boolean bool(String key, Config.Scope scope, boolean fallback) {
        return Boolean.parseBoolean(value(key, scope, Boolean.toString(fallback)).toLowerCase(Locale.ROOT));
    }
    private static int integer(String key, Config.Scope scope, int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
    private static int envInt(String key, int fallback) {
        try { return Integer.parseInt(System.getenv().getOrDefault(key, Integer.toString(fallback))); }
        catch (NumberFormatException ignored) { return fallback; }
    }
    private static boolean envBool(String key, boolean fallback) { return Boolean.parseBoolean(System.getenv().getOrDefault(key, Boolean.toString(fallback))); }
}
