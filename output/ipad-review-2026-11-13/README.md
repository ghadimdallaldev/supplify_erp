# iPad desktop-mode review artifacts

Source and release notes: `docs/operations/IPAD_WEB_REVIEW_2026-11-13.md`.

- `webkit-results.json` / `chromium-results.json`: loaded-screen layout checks at
  768, 1024, and 1194 CSS pixels; runtime errors; control measurements; PDF download,
  expired-deal focus refresh, reorder quantity handoff, and uncertain checkout retry.
- Engine-prefixed PNGs: screenshots of the actual React components with synthetic
  restaurant, supplier, reservation, menu, invoice, and reward data.
- The neighboring `output/ipad-*.log` files contain full API/web/native verification,
  lint/typecheck/build output, and the real SQL drill's six successful checks.
- `scripts/qa/verify-ipad-data.mjs` is the reusable local SQL drill. It rejects any
  target except `localhost:55439/ipad_qa`; never point it at a customer database.

Browsers used desktop mode with touch enabled. Windows WebKit does not reproduce
all physical iPadOS native date-picker or download-sheet behavior. API fixtures are
synthetic and do not demonstrate a live deployment. The SQL drill used an isolated
PostgreSQL container with synthetic data, then removed the container and its volume.
