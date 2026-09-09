<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true; section>
  <#if section = "header">${msg("emailOtpTitle", "Verify your email")}
  <#elseif section = "form">
    <form id="kc-otp-form" action="${url.loginAction}" method="post">
      <p id="otp-help">${msg("emailOtpInstruction", "Enter the one-time code sent to your email address.")}</p>
      <label for="otp">${msg("emailOtpCode", "Verification code")}</label>
      <input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${otpLength!6}}" maxlength="${otpLength!6}" required autofocus aria-describedby="otp-help" />
      <p>${msg("emailOtpExpiry", "The code expires in ten minutes.")}</p>
      <button type="submit">${msg("doContinue", "Continue")}</button>
    </form>
    <form action="${url.loginAction}" method="post"><button name="resend" value="1" type="submit">${msg("emailOtpResend", "Resend code")}</button></form>
  </#if>
</@layout.registrationLayout>
