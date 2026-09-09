package com.supplify.keycloak.emailotp;

import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import jakarta.ws.rs.core.MultivaluedMap;

public final class EmailOtpAuthenticator implements Authenticator {
    private final KeycloakSession session;
    private final EmailOtpConfig config;
    private final OtpMailClient mail;
    EmailOtpAuthenticator(KeycloakSession session, EmailOtpConfig config) { this.session = session; this.config = config; this.mail = new OtpMailClient(config); }

    public void authenticate(AuthenticationFlowContext context) {
        if (!config.enabled) { context.success(); return; }
        UserModel user = context.getUser();
        if (user == null) {
            // Restart with a fresh execution URL. Rendering the password form from this
            // already-consumed OTP execution makes its Register link immediately expire.
            context.resetFlow();
            return;
        }
        String email = resolveEmail(user);
        if (email == null) {
            // Legacy username-only accounts must be recoverable without weakening MFA.
            // Our required action captures, persists, and verifies an email in one flow.
            requireEmailRecovery(user);
            context.success();
            return;
        }
        // Drivers open the operational app frequently. The API sets this attribute only while
        // the user has a current supplier Driver assignment; never trust a browser-supplied value.
        if (config.driverLoginBypass && "true".equalsIgnoreCase(user.getFirstAttribute("supplify_driver_login"))) {
            context.success();
            return;
        }
        // Unverified users must complete signup email OTP (required action) only.
        // Do not also issue login_email_mfa — purposes are HMAC-bound and dual codes strand users.
        if (!user.isEmailVerified()) {
            user.addRequiredAction(EmailOtpRequiredActionFactory.ID);
            context.success();
            return;
        }
        issue(context, user, email, false);
    }
    public void action(AuthenticationFlowContext context) {
        if (!config.enabled) { context.success(); return; }
        UserModel user = context.getUser();
        if (user == null) {
            context.resetFlow();
            return;
        }
        String email = resolveEmail(user);
        if (email == null) {
            requireEmailRecovery(user);
            context.resetFlow();
            return;
        }
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        if (form.containsKey("resend")) { issue(context, user, email, true); return; }
        String code = form.getFirst("otp");
        String expected = context.getAuthenticationSession().getAuthNote(OtpSupport.CODE_NOTE);
        String purpose = context.getAuthenticationSession().getAuthNote(OtpSupport.PURPOSE_NOTE);
        long expires = parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.EXPIRES_NOTE));
        int attempts = (int) parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.ATTEMPTS_NOTE));
        if (!"login_email_mfa".equals(purpose) || expected == null || expires < System.currentTimeMillis()) { fail(context, "The code expired. Request a new code."); return; }
        if (attempts >= config.maxAttempts) { fail(context, "Too many attempts. Request a new code."); return; }
        context.getAuthenticationSession().setAuthNote(OtpSupport.ATTEMPTS_NOTE, Integer.toString(attempts + 1));
        String actual = OtpSupport.hmac(config.hmacSecret, purpose, email, code == null ? "" : code.trim());
        if (OtpSupport.matches(expected, actual)) { clear(context); context.success(); return; }
        fail(context, "That code is not valid.");
    }
    private void issue(AuthenticationFlowContext context, UserModel user, String email, boolean resend) {
        long lastSent = parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.SENT_NOTE));
        if (resend && System.currentTimeMillis() - lastSent < config.resendCooldownSeconds * 1000L) { fail(context, "Please wait before requesting another code."); return; }
        String code = OtpSupport.generateCode(config.length);
        String purpose = "login_email_mfa";
        String challengeId = context.getAuthenticationSession().getParentSession().getId();
        context.getAuthenticationSession().setAuthNote(OtpSupport.CODE_NOTE, OtpSupport.hmac(config.hmacSecret, purpose, email, code));
        context.getAuthenticationSession().setAuthNote(OtpSupport.PURPOSE_NOTE, purpose);
        context.getAuthenticationSession().setAuthNote(OtpSupport.EXPIRES_NOTE, Long.toString(System.currentTimeMillis() + config.ttlSeconds * 1000L));
        context.getAuthenticationSession().setAuthNote(OtpSupport.ATTEMPTS_NOTE, "0");
        context.getAuthenticationSession().setAuthNote(OtpSupport.SENT_NOTE, Long.toString(System.currentTimeMillis()));
        try { mail.send(email, code, purpose, OtpSupport.languageTag(context.getSession(), user), challengeId); }
        catch (RuntimeException e) { clear(context); context.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, context.form().setError("We could not send a verification code. Try again later.").createForm("login-otp.ftl")); return; }
        context.challenge(context.form().setAttribute("otpLength", config.length).setAttribute("otpTtlSeconds", config.ttlSeconds).createForm("login-otp.ftl"));
    }
    /** Prefer Keycloak email; fall back to username when it looks like an email. */
    static String resolveEmail(UserModel user) {
        if (user == null) return null;
        if (user.getEmail() != null && !user.getEmail().trim().isEmpty()) {
            return user.getEmail().trim().toLowerCase();
        }
        String username = user.getUsername();
        if (username != null && username.contains("@")) {
            return username.trim().toLowerCase();
        }
        return null;
    }
    static void requireEmailRecovery(UserModel user) {
        // Legacy imports can contain the impossible state email=null + verified=true.
        // Fail closed so the required action captures and verifies a real address.
        user.setEmailVerified(false);
        user.addRequiredAction(EmailOtpRequiredActionFactory.ID);
    }
    private void fail(AuthenticationFlowContext context, String message) { context.challenge(context.form().setError(message).createForm("login-otp.ftl")); }
    private static long parseLong(String raw) { try { return Long.parseLong(raw == null ? "0" : raw); } catch (NumberFormatException ignored) { return 0; } }
    private static void clear(AuthenticationFlowContext context) { for (String n : new String[]{OtpSupport.CODE_NOTE, OtpSupport.PURPOSE_NOTE, OtpSupport.EXPIRES_NOTE, OtpSupport.ATTEMPTS_NOTE, OtpSupport.SENT_NOTE}) context.getAuthenticationSession().removeAuthNote(n); }
    public boolean requiresUser() { return true; }
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) { return true; }
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}
    public void close() {}
}
