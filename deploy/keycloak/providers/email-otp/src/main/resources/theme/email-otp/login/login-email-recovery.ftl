<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
  <#if section = "header">${msg("emailRecoveryTitle", "Add your email")}
  <#elseif section = "form">
    <form id="kc-email-recovery-form" action="${url.loginAction}" method="post">
      <p id="email-recovery-help">${msg("emailRecoveryInstruction", "Add the email address you want to use for sign-in. We will send a verification code next.")}</p>
      <label for="email">${msg("email", "Email")}</label>
      <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required autofocus aria-describedby="email-recovery-help" />
      <button type="submit">${msg("doContinue", "Continue")}</button>
    </form>
  </#if>
</@layout.registrationLayout>
