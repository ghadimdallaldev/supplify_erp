package com.supplify.keycloak.emailotp;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Proxy;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.keycloak.models.UserModel;

class OtpSupportTest {
    @Test void codeHasRequestedLength() { assertEquals(6, OtpSupport.generateCode(6).length()); }
    @Test void digestIsPurposeAndEmailBound() {
        String a = OtpSupport.hmac("secret", "login_email_mfa", "a@example.com", "123456");
        assertTrue(OtpSupport.matches(a, OtpSupport.hmac("secret", "login_email_mfa", "a@example.com", "123456")));
        assertFalse(OtpSupport.matches(a, OtpSupport.hmac("secret", "signup_email_verification", "a@example.com", "123456")));
    }
    @Test void signupAndLoginPurposesMustNotCollide() {
        String signup = OtpSupport.hmac("secret", "signup_email_verification", "user@example.com", "654321");
        String login = OtpSupport.hmac("secret", "login_email_mfa", "user@example.com", "654321");
        assertFalse(OtpSupport.matches(signup, login));
    }
    @Test void emailResolutionFallsBackToAnEmailUsername() {
        UserModel user = userWith(null, "Legacy.User@Example.com", null);
        assertEquals("legacy.user@example.com", EmailOtpAuthenticator.resolveEmail(user));
    }
    @Test void usernameOnlyAccountQueuesProfileAndOtpRecovery() {
        Set<String> requiredActions = new HashSet<>();
        UserModel user = userWith(null, "legacy-user", requiredActions);

        assertNull(EmailOtpAuthenticator.resolveEmail(user));
        EmailOtpAuthenticator.requireEmailRecovery(user);

        assertTrue(requiredActions.contains(UserModel.RequiredAction.UPDATE_PROFILE.name()));
        assertTrue(requiredActions.contains(EmailOtpRequiredActionFactory.ID));
    }
    private static UserModel userWith(String email, String username, Set<String> requiredActions) {
        return (UserModel) Proxy.newProxyInstance(
            UserModel.class.getClassLoader(),
            new Class<?>[]{UserModel.class},
            (proxy, method, args) -> {
                if (method.getName().equals("getEmail")) return email;
                if (method.getName().equals("getUsername")) return username;
                if (method.getName().equals("addRequiredAction") && requiredActions != null) {
                    requiredActions.add(String.valueOf(args[0]));
                    return null;
                }
                Class<?> type = method.getReturnType();
                if (type == boolean.class) return false;
                if (type == long.class) return 0L;
                if (type == int.class) return 0;
                return null;
            }
        );
    }
}
