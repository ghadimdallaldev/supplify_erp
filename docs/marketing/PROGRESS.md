# HORECA Launch Experience: Progress Log

Plan: `C:\Users\ghadi.mdallal\.claude\plans\vectorized-greeting-mccarthy.md`
Video project: `C:\myProjects\video-studio` (Remotion, HyperFrames, GSAP, agent skills)
Rule: nothing is marked done until the artifact has been rendered/run and inspected.

## Main-app integration and complete release (2026-11-11)

- The campaign now ships inside the existing `apps/web` Vite build at `/demo/`; `/horeca` preserves attribution while redirecting. Main API campaign routes and migration 0231 replace the separate Next.js server/database. Campaign lead review reuses Supplify admin auth and ADMIN_GROWTH. The former standalone directory is a local ignored archive.
- Android and iOS contain matching public request/event types and anonymous API clients. Both native typechecks pass. No native operational screen, new auth behavior, environment key or feature key is introduced.
- Verified: main web build/typecheck; **585 web tests**; **2,542 API tests** (controlled four-worker rerun after one high-concurrency setup timeout); **95 focused campaign/admin permission tests**; **10 main-build browser tests**, including video byte ranges/playback, both full phone walkthroughs, all six screenshots at five widths, guest-safe submission and admin sign-in.
- Production QR assets are bundled at `/demo/qr/` and point to `https://app.supplifyerp.com/demo/`. All **12 PNG/phone/PDF decodes pass** after selecting a scan-tested QR mask. No separate domain or Cookie Dough Solutions service is used.
- Release scope is the full dev runtime tree and prior dev commits across ERP, Android and iOS, promoted dev → preprod → prod. Promotion uses isolated release checkouts to preserve local ignored worktrees and authoring files; pruning validates workspace paths and handles the current `allowE2eRoutes()` guard.
- Deployment baseline: dev web/API reachable; preprod and production services are offline and their public URLs return Railway 404. Automatic approval review rejected redeploying preprod Postgres/Redis because the release request did not explicitly authorize shared infrastructure restarts. Application/branch work continues; database/cache restarts require explicit approval if still needed after application deployment. Live promotion is not considered verified until ready/health/public URL checks pass.
- Current implementation and deployment instructions: `docs/features/demo-experience.md`, `docs/marketing/railway-deployment.md`, `scripts/horeca/qr/README.md`.
- Live dev verification confirmed API readiness, campaign migration/event persistence, public validation/honeypot responses and anonymous admin rejection. Nine browser checks passed; the alias check exposed Nginx absolute redirects using the internal HTTP port behind Railway TLS. Demo aliases now emit relative `Location` headers, with browser assertions for all three aliases and environment-aware session-cookie coverage.
- Full Android/iOS runtime trees were promoted through preprod to prod (Android `c147756` / `43f03e0`; iOS `31d6399` / `9aa4a79`). Source/assets/build configuration match their tested dev runtime trees. ERP preprod `786af167` is pushed; web is online while API/auth are waiting on offline infrastructure. No native binary or store submission was requested.

## Business messaging and image fit (2026-11-11)

- Added supplier product promotion through Deals/Boosts, separate business workspaces, protected sign-in/team permissions/activity logs, and a **40+ features** demo invitation with more to discover and a few surprises. Six capability cards now present these themes, with matching FAQ answers and hero/final CTA copy.
- `feature-coverage.md` records 44 distinct supplier/restaurant capabilities and source paths, plus the limits of promotion, tenancy and security claims. This supports the requested marketing copy without promising every feature on every account or a security certification.
- Gallery screenshots now preserve their proportions, fit the available width on phones, and stay within a 520px display-height limit on desktop. A consistent title bar frames each screen; full-size enlargement remains available. Removed the false hero carousel counter and aligned capability-card footers.
- Verification: app and root `pnpm typecheck` pass; `pnpm build` passes. Production Playwright suite: **25 passed, 1 skipped** (authenticated admin test requires `E2E_ADMIN_PASSWORD`). Additional production checks cover all **six screenshots at five widths** (1440/1024/820/390/360), image loading/containment, zero page errors/overflow, new demo CTA, enlargement/Escape and accessibility, including expanded FAQs. Browser artifacts: local `qa/business-*` files.
- Web-only mobile skip documented. No ERP API, authentication behavior, permission, feature-key, notification, shared client type or environment-variable contract changed. No remote deployment performed.

## Demo UI refresh (2026-11-11)

- Reference: user-requested [Cartify](https://www.cartifyapp.ai/) layout, inspected in a browser. Implemented paired audience actions in the hero, staggered real product previews, centered feature cards, responsive navigation, refined audience cards and walkthrough framing, and a rounded demo-request banner. Supplify branding, sample-data disclosures, existing walkthrough actions and lead contracts are preserved.
- Production verification: `pnpm build` passes without compilation warnings. App `pnpm typecheck` and repository-root `pnpm typecheck` pass. Existing unit suite: **18 passed**. Existing Playwright suite against the current production build: **25 passed, 1 skipped**; the authenticated admin-edit/export test requires `E2E_ADMIN_PASSWORD`, which was not set.
- Additional browser review: **1440, 1024, 820, 390 and 360px** layouts; zero page errors or horizontal overflow in either role. WCAG A/AA scans pass on the landing page at all five widths and on both walkthroughs at desktop/phone widths. Hero role shortcuts, mobile menu navigation/Escape, keyboard accent selection (arrows/Home/End), screen enlargement/Escape and real film playback were exercised.
- Local test server used isolated port **3102** because an older production process on **3100** held the original page in memory. Final handoff refreshes that existing app server with the current production build. Tests used the existing local campaign database with migration execution and outgoing lead email disabled; no remote deployment was performed.
- Screenshots and browser-review results: `apps/horeca-experience/qa/refresh-*` (local, gitignored). Creative direction updated; web-only mobile skip recorded in `docs/mobile/MOBILE_FEATURE_PARITY.md`. No package, ERP API, auth, RBAC, shared type, notification, feature-key or environment-variable changes.

## Original toolchain (2026-11-10)

| Tool                                                                                              | Status                                        |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| FFmpeg 9.0.2, ffprobe, ImageMagick, yt-dlp                                                        | installed (winget)                            |
| WhisperX 3.8.6 (CPU)                                                                              | installed (`uv tool`)                         |
| Earshot 1.2.2, kokoro-onnx 0.6.1, soundfile, pyloudnorm, segno, qrcode                            | installed (pip)                               |
| Remotion 4.0.542 + captions/transitions/media-utils/lottie/three, GSAP 3.15.1, HyperFrames 0.9.30 | installed in video-studio                     |
| Kokoro model files                                                                                | NOT yet downloaded                            |
| Playwright browsers                                                                               | not yet verified                              |
| auto-editor, Manim, GPU                                                                           | not installed, not needed                     |
| "Brag", "Real Sound"                                                                              | unidentified, no package found; not installed |

## Phases

- [x] 1 Discovery -> `docs/marketing/product-knowledge.md` (code audit; re-verify in running demo)
- [ ] 2 Demo environment verification + screenshots (BLOCKED, see below)
- [x] 3 Creative direction -> `creative-direction.md` (The Order Line)
- [x] 4 Microsite (English only per user scope change) -> `apps/horeca-experience`
- [x] 5 Backend, admin, analytics (campaign Postgres, leads, events, /admin, CSV, Resend gate)
- [x] 6 Film (16:9, 9:16, web, loop): rendered and frame-QA'd 2026-11-11, see "Film and audio (2026-11-11)"
- [x] 7 Audio (VO, music, SFX, mix): English only, local TTS; measured -16.0 LUFS / -1.8 dBTP
- [x] 8 QR assets (STAGING until real domain; `apps/horeca-experience/qr`)
- [x] 9 Railway readiness (not deployed) -> `railway-deployment.md`
- [x] 10 QA loop for the microsite (visual QA, axe, Lighthouse, e2e); film integration pending media files
- [ ] 11 Docs + parity entry + final report

## Phase 2 findings (2026-11-11)

- Local infra is the Docker stack: Postgres is on **5433** (`apps/api/.env.docker-sync`). `apps/api/.env` says 5432, which is a different Postgres on this machine (password auth fails). Always layer `.env.docker-sync` over `.env`.
- Local DB already holds other seed data (43 restaurants, 45 suppliers, 554 orders, 282 invoices) but no HORECA tenants. API (4000) and web (5173) are not running.
- Ran `pnpm db:migrate` on the local Docker DB (applied pending migrations; local only).
- `apps/api/scripts/seed-horeca-demo.mjs` (untracked) was run with `--with-keycloak --only=identity,catalog` against localhost:5433. Effects so far: Keycloak users created in the LOCAL realm (port 8180) and 47 `app_user` rows inserted. It then failed: its `INSERT INTO supplier` uses columns that do not exist in this repo's schema (`legal_name`, `tax_id`, `sales_contact_email`, `subscription_tier`, `account_status`, ...). `restaurant` has `tax_id`; `supplier` does not.
- The seed also has no orders/invoices/history section (`seed/horeca-sections.mjs` missing).
- Nothing was run against Railway or any non-local DB.

## Correction (2026-11-11, from user): the HORECA demo is seeded on the Railway DEV environment, not local

- Demo environment of record: web `https://app-dev.supplifyerp.com`, API `https://api-dev.supplifyerp.com`, Keycloak `https://keycloak-dev.supplifyerp.com`. All reachable (200).
- The earlier local seed attempt is obsolete. Local DB only has partial residue (47 `app_user` rows, local Keycloak users). Ignore the local stack for screenshots; do not write to dev.
- Verified: login as Cedar Fresh owner works on dev (lands on Command Center). Orders Inbox shows orders in every status for Riviera Beirut Hotel and Hamra Bistro. Command Center shows real counts.
- Capture tooling: `C:\myProjects\video-studio\scripts\capture-supplier.mjs` (Playwright, env `HORECA_USER`/`HORECA_PASS`/`ROUTES`), output in `video-studio/shots/`. Password is read from `seed/horeca-data.mjs` into the process only. Quote routes without a leading slash issue in Git Bash (use PowerShell or `MSYS_NO_PATHCONV=1`).
- Screenshot notes: Orders Inbox lists a DRAFT order in the supplier view and an "ITEMS:" header typo; crop or avoid. Command Center GPS card shows "0 Live / 8 Stale"; avoid that card in hero shots.

## Microsite build (2026-11-11)

- App: `apps/horeca-experience` (Next.js 15, TypeScript, standalone, excluded from the pnpm workspace). Run: `pnpm install --ignore-workspace && pnpm build && pnpm start` (port 3100, migrates first).
- Verified by running: 18 unit tests (vitest), 22 Playwright e2e tests against the production build (both journeys, form validation, DB persistence, dedupe, honeypot, rate limit, admin auth + CSV, QR attribution landing, axe a11y, reduced motion, 360px overflow), QR decode check (12/12), range requests (206) with a synthetic clip, Lighthouse mobile run.
- Real screenshots used: supplier Command Center, Orders inbox, My restaurants, Inventory; restaurant Orders inbox, Ordering lists. Cropped to avoid emails, DRAFT rows, GPS card, truncated names and glitches.
- Open: final film files in `public/media/` (names: `supplify-film-web.mp4`, `supplify-film-poster.jpg`, `supplify-hero-loop.mp4`, `supplify-film-captions.en.vtt`), real domain + QR regeneration, Resend key/recipient, deployment.

## Blockers / authorizations needed

- None for demo data. Remaining: Resend key/recipient, production domain.
- Resend API key and recipient (not available in this environment)
- Production domain (final QR codes)

## Film and audio (2026-11-11)

Project: `C:\myProjects\video-studio` (Remotion 4.0.542). README there has the full reproducible steps. English only.

- Outputs in `video-studio/out/`: `supplify-film-landscape-1920x1080.mp4` (60.00 s, 11.0 MB), `supplify-film-portrait-1080x1920.mp4` (60.00 s, 12.7 MB, true vertical recomposition, captions in safe area), `supplify-film-web.mp4` (1280x720, 60.00 s, 12.3 MB, 1.64 Mbps, faststart) + `supplify-film-poster.jpg`, `supplify-hero-loop.mp4` (10 s, silent, 266 KB, seamless: wrap-frame diff equals normal frame diff), EN `.srt`/`.vtt`, 3 thumbnails, audio stems and mix in `out/audio/`.
- Web copies (no other edits there): `apps/horeca-experience/public/media/` has web mp4, poster, hero loop, vtt/srt, social thumb.
- Real UI: supplier, restaurant and driver screens are real dev-demo screenshots (tight crops, no totals/emails/GPS card/DRAFT rows/typos). Real Settings (Company Logo, Brand colors) captured read-only. Coded, not real: lifecycle chips, toasts/pills, problem-scene fragments, the fictional "Olive & Ember" brand preview (labelled ILLUSTRATION).
- Added beat (user request): "Your colours. Your logo. Same line." Accent swaps violet, crimson, teal, back, with a fictional logo dropping in. Claim limited to accent colour and logo being configurable in Settings.
- Voiceover: local Kokoro `af_heart` (open TTS, not a studio voice; no listening check was possible, selection by Kokoro grade + WhisperX round-trip). Captions from WhisperX forced alignment of the exact script (122/122 words aligned).
- Measured: mix -16.0 LUFS integrated (also on the MP4 AAC track via ffmpeg ebur128), true peak -1.8 dBTP, 0 clipped samples. Earshot VAD: all 122 word onsets inside speech, no speech uncovered by captions, median caption lead 0.06 s; music ducks 10 dB under speech.
- Frame QA done on rendered MP4s (landscape every 3 s, portrait every 3 s, caption-boundary frames, brand-beat swap frames). Not done: listening by ear, playback on real phones.
- Arabic: out of scope per user.
