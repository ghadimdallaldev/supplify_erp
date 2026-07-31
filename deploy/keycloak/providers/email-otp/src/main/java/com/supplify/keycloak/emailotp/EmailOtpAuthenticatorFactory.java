package com.supplify.keycloak.emailotp;

import java.util.Collections;
import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public final class EmailOtpAuthenticatorFactory implements AuthenticatorFactory {
    public static final String ID = "email-otp-login";
    private EmailOtpConfig config;
    public String getId() { return ID; }
    public String getReferenceCategory() { return "email-otp"; }
    public boolean isConfigurable() { return false; }
    public boolean isUserSetupAllowed() { return false; }
    public AuthenticationExecutionModel.Requirement[] getRequirementChoices() { return new AuthenticationExecutionModel.Requirement[] { AuthenticationExecutionModel.Requirement.REQUIRED, AuthenticationExecutionModel.Requirement.DISABLED }; }
    public String getDisplayType() { return "Email OTP (Supplify login)"; }
    public String getHelpText() { return "Sends and verifies a one-time email code after password login."; }
    public List<ProviderConfigProperty> getConfigProperties() { return Collections.emptyList(); }
    public Authenticator create(KeycloakSession session) { return new EmailOtpAuthenticator(session, config); }
    public void init(Config.Scope scope) { config = new EmailOtpConfig(scope); }
    public void postInit(KeycloakSessionFactory factory) {}
    public void close() {}
}
