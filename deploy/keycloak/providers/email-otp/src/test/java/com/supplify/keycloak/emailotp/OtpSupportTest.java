package com.supplify.keycloak.emailotp;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class OtpSupportTest {
    @Test void codeHasRequestedLength() { assertEquals(6, OtpSupport.generateCode(6).length()); }
    @Test void digestIsPurposeAndEmailBound() {
        String a = OtpSupport.hmac("secret", "login_email_mfa", "a@example.com", "123456");
        assertTrue(OtpSupport.matches(a, OtpSupport.hmac("secret", "login_email_mfa", "a@example.com", "123456")));
        assertFalse(OtpSupport.matches(a, OtpSupport.hmac("secret", "signup_email_verification", "a@example.com", "123456")));
    }
}
