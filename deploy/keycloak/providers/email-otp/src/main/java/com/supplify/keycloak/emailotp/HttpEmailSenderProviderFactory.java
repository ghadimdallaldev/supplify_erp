package com.supplify.keycloak.emailotp;

import org.keycloak.Config;
import org.keycloak.email.DefaultEmailSenderProviderFactory;
import org.keycloak.email.EmailSenderProvider;
import org.keycloak.models.KeycloakSession;

/** Preserve native SMTP for installations without the Supplify API mail channel. */
public final class HttpEmailSenderProviderFactory extends DefaultEmailSenderProviderFactory {
    private EmailOtpConfig config;

    @Override public void init(Config.Scope scope) {
        super.init(scope);
        config = new EmailOtpConfig(scope);
    }

    @Override public int order() { return 100; }

    @Override public EmailSenderProvider create(KeycloakSession session) {
        if (config.mailUrl.isEmpty()) return super.create(session);
        return new HttpEmailSenderProvider(config.mailUrl, config.mailSecret);
    }
}
