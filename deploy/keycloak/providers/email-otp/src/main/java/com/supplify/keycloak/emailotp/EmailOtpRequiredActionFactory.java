package com.supplify.keycloak.emailotp;

import java.util.Collections;
import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public final class EmailOtpRequiredActionFactory implements RequiredActionFactory {
    public static final String ID = "email-otp-verify-email";
    private EmailOtpConfig config;
    public String getId() { return ID; }
    public String getDisplayText() { return "Verify email with Supplify OTP"; }
    public RequiredActionProvider create(KeycloakSession session) { return new EmailOtpRequiredAction(session, config); }
    public void init(Config.Scope scope) { config = new EmailOtpConfig(scope); }
    public void postInit(KeycloakSessionFactory factory) {}
    public void close() {}
    public boolean isOneTimeAction() { return true; }
    public List<ProviderConfigProperty> getConfigMetadata() { return Collections.emptyList(); }
}
