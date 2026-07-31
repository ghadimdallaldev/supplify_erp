package com.supplify.keycloak.emailotp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Stateless OTP primitives. Authentication-session notes hold only the digest. */
final class OtpSupport {
    static final String CODE_NOTE = "supplify.otp.code.hmac";
    static final String EXPIRES_NOTE = "supplify.otp.expiresAt";
    static final String ATTEMPTS_NOTE = "supplify.otp.attempts";
    static final String SENT_NOTE = "supplify.otp.sentAt";
    static final String PURPOSE_NOTE = "supplify.otp.purpose";
    static final SecureRandom RANDOM = new SecureRandom();

    private OtpSupport() {}

    static String generateCode(int length) {
        StringBuilder code = new StringBuilder(length);
        for (int i = 0; i < length; i++) code.append(RANDOM.nextInt(10));
        return code.toString();
    }

    static String hmac(String secret, String purpose, String email, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal((purpose + "\n" + email + "\n" + code).getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
        } catch (Exception e) {
            throw new IllegalStateException("Unable to hash OTP", e);
        }
    }

    static boolean matches(String expected, String actual) {
        if (expected == null || actual == null) return false;
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }
}
