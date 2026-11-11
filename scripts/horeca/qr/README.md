# Production demo QR codes

The public demo is part of the existing Supplify app at https://app.supplifyerp.com/demo/.

Generate from the repo root:

```powershell
python scripts/horeca/qr/generate.py --base-url https://app.supplifyerp.com/demo
python scripts/horeca/qr/verify.py
```

Output: `apps/web/static/demo/qr/`, published at `/demo/qr/` by the main web build. There are general, restaurant and supplier variants, each with a PNG, SVG, 1080x1920 phone-display PNG, and print-ready A5/A4 PDFs. `manifest.json` records the exact destination URLs.

Every code retains QR attribution and role-specific landing. Error correction remains Q or stronger; the mask is pinned to the pattern verified at PNG and PDF sizes. The verifier decodes the PNG, phone PNG and both PDFs for every variant. Do not print/share until all twelve checks pass and production `/demo/`, video and both walkthroughs have been verified.

Prerequisites: `segno`, `reportlab`, `pillow` for generation; `opencv-python-headless`, `pymupdf`, `numpy` for verification. Invalid placeholder domains still produce clearly marked STAGING assets.
