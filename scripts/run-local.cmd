@echo off
REM Windows CMD entry point — no pnpm or bash required.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-local.ps1" %*
