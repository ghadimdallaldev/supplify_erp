package com.supplify.keycloak.emailotp;

import jakarta.ws.rs.core.MultivaluedMap;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;

public final class EmailOtpRequiredAction implements RequiredActionProvider {
    private final EmailOtpConfig config;
    private final OtpMailClient mail;
    EmailOtpRequiredAction(KeycloakSession session, EmailOtpConfig config) { this.config = config; this.mail = new OtpMailClient(config); }
    public void evaluateTriggers(RequiredActionContext context) {}
    public void requiredActionChallenge(RequiredActionContext context) {
        if (!config.enabled || context.getUser().isEmailVerified()) { context.success(); return; }
        issue(context, false);
    }
    public void processAction(RequiredActionContext context) {
        if (!config.enabled) { context.success(); return; }
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        if (form.containsKey("resend")) { issue(context, true); return; }
        String purpose = "signup_email_verification";
        String code = form.getFirst("otp");
        String expected = context.getAuthenticationSession().getAuthNote(OtpSupport.CODE_NOTE);
        long expires = parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.EXPIRES_NOTE));
        int attempts = (int) parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.ATTEMPTS_NOTE));
        if (expected == null || expires < System.currentTimeMillis()) { challenge(context, "The code expired. Request a new code."); return; }
        if (attempts >= config.maxAttempts) { challenge(context, "Too many attempts. Request a new code."); return; }
        context.getAuthenticationSession().setAuthNote(OtpSupport.ATTEMPTS_NOTE, Integer.toString(attempts + 1));
        String email = context.getUser().getEmail().trim().toLowerCase();
        String actual = OtpSupport.hmac(config.hmacSecret, purpose, email, code == null ? "" : code.trim());
        if (OtpSupport.matches(expected, actual)) {
            context.getUser().setEmailVerified(true);
            clear(context);
            context.success();
        } else challenge(context, "That code is not valid.");
    }
    private void issue(RequiredActionContext context, boolean resend) {
        String email = context.getUser().getEmail().trim().toLowerCase();
        long lastSent = parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.SENT_NOTE));
        if (resend && System.currentTimeMillis() - lastSent < config.resendCooldownSeconds * 1000L) { challenge(context, "Please wait before requesting another code."); return; }
        String purpose = "signup_email_verification";
        String code = OtpSupport.generateCode(config.length);
        context.getAuthenticationSession().setAuthNote(OtpSupport.CODE_NOTE, OtpSupport.hmac(config.hmacSecret, purpose, email, code));
        context.getAuthenticationSession().setAuthNote(OtpSupport.PURPOSE_NOTE, purpose);
        context.getAuthenticationSession().setAuthNote(OtpSupport.EXPIRES_NOTE, Long.toString(System.currentTimeMillis() + config.ttlSeconds * 1000L));
        context.getAuthenticationSession().setAuthNote(OtpSupport.ATTEMPTS_NOTE, "0");
        context.getAuthenticationSession().setAuthNote(OtpSupport.SENT_NOTE, Long.toString(System.currentTimeMillis()));
        try { mail.send(email, code, purpose, OtpSupport.languageTag(context.getSession(), context.getUser()), context.getAuthenticationSession().getParentSession().getId()); }
        catch (RuntimeException e) { clear(context); challenge(context, "We could not send a verification code. Try again later."); return; }
        challenge(context, null);
    }
    private void challenge(RequiredActionContext context, String error) {
        var form = context.form().setAttribute("otpLength", config.length).setAttribute("otpTtlSeconds", config.ttlSeconds);
        if (error != null) form.setError(error);
        context.challenge(form.createForm("login-otp.ftl"));
    }
    private static long parseLong(String raw) { try { return Long.parseLong(raw == null ? "0" : raw); } catch (NumberFormatException ignored) { return 0; } }
    private static void clear(RequiredActionContext context) { for (String n : new String[]{OtpSupport.CODE_NOTE, OtpSupport.PURPOSE_NOTE, OtpSupport.EXPIRES_NOTE, OtpSupport.ATTEMPTS_NOTE, OtpSupport.SENT_NOTE}) context.getAuthenticationSession().removeAuthNote(n); }
    public void close() {}
}
