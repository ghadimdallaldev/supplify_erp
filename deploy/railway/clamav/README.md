# Railway private ClamAV service

The API fails closed in preprod and production unless ClamAV is reachable and ready. Create one private ClamAV service per Railway environment using image `clamav/clamav:1.4.3_base`. Railway service names are project-wide; when preprod and production share one project, use `clamav` for preprod and `clamav-prod` for production, and set each API's `MALWARE_SCAN_HOST` to the matching private service name.

Configure the service with at least 1 GiB memory and 1 vCPU. Do not add a public TCP port. The API and ClamAV service must share the same Railway private network; use the service's private DNS name for `MALWARE_SCAN_HOST` and port `3310`.

Set these API variables in each hosted environment:

```env
MALWARE_SCAN_BYPASS=false
MALWARE_SCAN_HOST=clamav
MALWARE_SCAN_PORT=3310
MALWARE_SCAN_TIMEOUT_MS=15000
MALWARE_SCAN_MAX_SIGNATURE_AGE_HOURS=72
MALWARE_SCAN_REQUIRE_SIGNATURE_DATE=true
```

After deployment, confirm the API logs report scanner readiness and verify `GET /health` from the private/public API entry point. If ClamAV is unavailable, the API process must stop rather than accept unscanned uploads.
