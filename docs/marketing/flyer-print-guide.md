# Original Supplify bilingual flyer

Updated 2026-11-11. Deliverables are in `output/horeca-flyer/`; the primary handout is `supplify-flyer-A5.pdf` (English front, Arabic back). A4, individual-language PDFs, phone JPEGs, 300 dpi previews and an A5 press file with 3 mm bleed/crop marks are included. `PRINT-README.md` in that folder is the printer and editing brief.

The user explicitly requested a visual direction distinct from the supplied Cartify photographs. This design uses ivory/ink/citrus, oversized editorial typography, a bespoke restaurant–supplier–delivery illustration, stacked audience benefits and one QR invitation. Supplify's existing mark is preserved. No competitor art, brand, copy or split-card layout is used.

Copy highlights ordering, stock, fulfilment, supplier promotion, 40+ capabilities across the two audiences, separate business workspaces and protected team access. Feature availability is qualified by business/plan. These claims follow `docs/marketing/feature-coverage.md`; no pricing, customer counts, savings, integrations or security certification is invented.

QRs open `https://app.supplifyerp.com/demo/?utm_source=flyer-en` / `flyer-ar`. They use existing campaign attribution and no new API contract. Fonts are embedded as TrueType, text/QRs remain vector, image proportions are preserved, and Arabic uses the bundled IBM Plex Sans Arabic with native shaping. The press file records actual TrimBox/BleedBox dimensions; it uses RGB artwork for printer-side profile conversion.

Reproducible sources: `scripts/horeca/flyer/render.mjs`, `scripts/horeca/flyer/finish.py` and `output/horeca-flyer/source/`. The final image-generation prompt and open-font licences are included. Verification includes page geometry, font embedding, visible artwork, layout overflow, QR decoding from 150/300 dpi PDFs and phone JPEGs, and live destination checks. No application runtime change or deployment is needed for these local print deliverables.

Mobile parity is intentionally skipped for this marketing-only asset generation; the dated record is in `docs/mobile/MOBILE_FEATURE_PARITY.md`. The existing unrelated `docs/marketing/PROGRESS.md` working changes are preserved.
