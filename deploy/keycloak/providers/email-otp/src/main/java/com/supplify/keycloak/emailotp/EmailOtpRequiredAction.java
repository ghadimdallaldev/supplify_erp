package com.supplify.keycloak.emailotp;

import jakarta.ws.rs.core.MultivaluedMap;
import java.util.Locale;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.UserModel;

public final class EmailOtpRequiredAction implements RequiredActionProvider {
    private final EmailOtpConfig config;
    private final OtpMailClient mail;
    EmailOtpRequiredAction(KeycloakSession session, EmailOtpConfig config) { this.config = config; this.mail = new OtpMailClient(config); }
    public void evaluateTriggers(RequiredActionContext context) {}
    public void requiredActionChallenge(RequiredActionContext context) {
        if (!config.enabled) { context.success(); return; }
        String email = normalizeEmail(context.getUser().getEmail());
        if (email == null) { challengeForEmail(context, null); return; }
        if (context.getUser().isEmailVerified()) { context.success(); return; }
        issue(context, email, false);
    }
    public void processAction(RequiredActionContext context) {
        if (!config.enabled) { context.success(); return; }
        MultivaluedMap<String, String> form = context.getHttpRequest().getDecodedFormParameters();
        UserModel user = context.getUser();
        String email = normalizeEmail(user.getEmail());
        if (email == null) {
            email = normalizeEmail(form.getFirst("email"));
            if (email == null) { challengeForEmail(context, "Enter a valid email address."); return; }
            UserModel owner = context.getSession().users().getUserByEmail(context.getRealm(), email);
            if (owner != null && !owner.getId().equals(user.getId())) {
                challengeForEmail(context, "That email address is already in use.");
                return;
            }
            user.setEmail(email);
            user.setEmailVerified(false);
            issue(context, email, false);
            return;
        }
        if (user.isEmailVerified()) { context.success(); return; }
        if (form.containsKey("resend")) { issue(context, email, true); return; }
        String purpose = "signup_email_verification";
        String code = form.getFirst("otp");
        String expected = context.getAuthenticationSession().getAuthNote(OtpSupport.CODE_NOTE);
        long expires = parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.EXPIRES_NOTE));
        int attempts = (int) parseLong(context.getAuthenticationSession().getAuthNote(OtpSupport.ATTEMPTS_NOTE));
        if (expected == null || expires < System.currentTimeMillis()) { challenge(context, "The code expired. Request a new code."); return; }
        if (attempts >= config.maxAttempts) { challenge(context, "Too many attempts. Request a new code."); return; }
        context.getAuthenticationSession().setAuthNote(OtpSupport.ATTEMPTS_NOTE, Integer.toString(attempts + 1));
        String actual = OtpSupport.hmac(config.hmacSecret, purpose, email, code == null ? "" : code.trim());
        if (OtpSupport.matches(expected, actual)) {
            user.setEmailVerified(true);
            clear(context);
            context.success();
        } else challenge(context, "That code is not valid.");
    }
    private void issue(RequiredActionContext context, String email, boolean resend) {
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
    private void challengeForEmail(RequiredActionContext context, String error) {
        var form = context.form();
        if (error != null) form.setError(error);
        context.challenge(form.createForm("login-email-recovery.ftl"));
    }
    static String normalizeEmail(String raw) {
        if (raw == null) return null;
        String email = raw.trim().toLowerCase(Locale.ROOT);
        if (email.isEmpty() || email.length() > 254 || email.chars().anyMatch(Character::isWhitespace)) return null;
        int at = email.indexOf('@');
        if (at <= 0 || at != email.lastIndexOf('@') || at == email.length() - 1) return null;
        String domain = email.substring(at + 1);
        if (!domain.contains(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
        return email;
    }
    private static long parseLong(String raw) { try { return Long.parseLong(raw == null ? "0" : raw); } catch (NumberFormatException ignored) { return 0; } }
    private static void clear(RequiredActionContext context) { for (String n : new String[]{OtpSupport.CODE_NOTE, OtpSupport.PURPOSE_NOTE, OtpSupport.EXPIRES_NOTE, OtpSupport.ATTEMPTS_NOTE, OtpSupport.SENT_NOTE}) context.getAuthenticationSession().removeAuthNote(n); }
    public void close() {}
}
