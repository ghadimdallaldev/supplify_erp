<#import "template.ftl" as layout>
<#assign mobileClient = ((client.clientId)!"") == "supplify-mobile">
<#assign emailOnly = realm.loginWithEmailAllowed && realm.registrationEmailAsUsername>
<#assign invalid = messagesPerField.existsError("username")>
<@layout.registrationLayout displayInfo=!mobileClient displayMessage=!invalid; section>
  <#if section = "header">
    <#if mobileClient>${msg("supplifyResetTitle")}<#else>${msg("emailForgotTitle")}</#if>
  <#elseif section = "form">
    <form id="kc-reset-password-form"
          class="<#if mobileClient>supplify-mobile-reset<#else>${properties.kcFormClass!}</#if>"
          action="${url.loginAction}" method="post">
      <#if mobileClient>
        <p id="supplify-reset-instruction">${msg("supplifyResetInstruction")}</p>
      </#if>
      <div class="${properties.kcFormGroupClass!}">
        <div class="${properties.kcLabelWrapperClass!}">
          <label for="username" class="${properties.kcLabelClass!}">
            <#if !realm.loginWithEmailAllowed>${msg("username")}<#elseif emailOnly>${msg("email")}<#else>${msg("usernameOrEmail")}</#if>
          </label>
        </div>
        <div class="${properties.kcInputWrapperClass!}">
          <input id="username" name="username" class="${properties.kcInputClass!}"
                 type="<#if emailOnly>email<#else>text</#if>" autocomplete="username" autofocus
                 value="${(auth.attemptedUsername)!''}"
                 aria-invalid="<#if invalid>true<#else>false</#if>"
                 <#if invalid>aria-describedby="input-error-username"<#elseif mobileClient>aria-describedby="supplify-reset-instruction"</#if> />
          <#if invalid>
            <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
              ${kcSanitize(messagesPerField.get("username"))?no_esc}
            </span>
          </#if>
        </div>
      </div>
      <#if mobileClient>
        <p class="supplify-reset-security">${msg("supplifyResetSecurity")}</p>
        <a class="supplify-reset-back" href="${url.loginUrl}">${msg("supplifyResetBack")}</a>
        <button id="kc-login" type="submit">${msg("supplifyResetSend")}</button>
      <#else>
        <div class="${properties.kcFormGroupClass!} ${properties.kcFormSettingClass!}">
          <div id="kc-form-options" class="${properties.kcFormOptionsClass!}">
            <a href="${url.loginUrl}">${kcSanitize(msg("backToLogin"))?no_esc}</a>
          </div>
          <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
            <input type="submit" value="${msg("doSubmit")}"
                   class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" />
          </div>
        </div>
      </#if>
    </form>
  <#elseif section = "info">
    <#if realm.duplicateEmailsAllowed>${msg("emailInstructionUsername")}<#else>${msg("emailInstruction")}</#if>
  </#if>
</@layout.registrationLayout>
