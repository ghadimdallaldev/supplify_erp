# Onboarding Documentation Generation

This document describes how to regenerate the Supplify onboarding package, including PDF and PowerPoint outputs.

## Prerequisites

| Tool                | Purpose         | Install                                              |
| ------------------- | --------------- | ---------------------------------------------------- |
| Node.js 18+         | Scripts         | Already in repo                                      |
| pnpm 8+             | Package manager | `pnpm setup`                                         |
| Playwright Chromium | PDF generation  | `npx playwright install chromium` (once per machine) |
| `marked`            | Markdown → HTML | Root `devDependencies`                               |
| `pptxgenjs`         | PowerPoint      | Root `devDependencies`                               |

## Current status

| Output                           | Path                                               | Regenerate                           |
| -------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Handbook (Markdown)              | `Supplify-Complete-Handbook.md`                    | `pnpm docs:onboarding:handbook`      |
| Handbook (PDF)                   | `output/Supplify-Complete-Handbook.pdf`            | `pnpm docs:onboarding:pdf`           |
| Handbook (HTML)                  | `output/Supplify-Complete-Handbook.html`           | Created with PDF step                |
| Demo deck (PPTX)                 | `output/Supplify-Onboarding-and-Product-Demo.pptx` | `pnpm docs:onboarding:pptx`          |
| **Customer presentation (PDF)**  | `output/Supplify-Customer-Presentation.pdf`        | `pnpm docs:onboarding:customer-pdf`  |
| **Customer presentation (PPTX)** | `output/Supplify-Customer-Presentation.pptx`       | `pnpm docs:onboarding:customer-pptx` |
| **Both customer assets**         | PDF + customer PPTX                                | `pnpm docs:onboarding:customer`      |
| Internal demo deck               | `output/Supplify-Onboarding-and-Product-Demo.pptx` | `pnpm docs:onboarding:pptx`          |
| Internal handbook                | `output/Supplify-Complete-Handbook.pdf`            | `pnpm docs:onboarding:pdf`           |

### Customer PDF design

Premium layout: full-bleed cover with logo, stats strip, section dividers, pillar cards, caramel-themed Mermaid diagrams, and closing CTA page. Source: `Supplify-Customer-Presentation.md` + `styles/customer-presentation-premium.css`.

### Customer PPTX design

18 slides, 18 speaker-note slides: cover, quote, problem, before/after, pillars, restaurant/supplier value, timeline, day-in-life story, plans, security, CTA. Caramel/cream branding throughout. **Use this deck for customer meetings** (not the 38-slide internal deck).

## Quick commands

```powershell
cd c:\myProjects\supplify_erp
pnpm docs:onboarding:all
```

Individual steps:

```powershell
pnpm docs:onboarding:handbook   # assemble markdown from 01-20
pnpm docs:onboarding:pdf        # PDF + HTML from handbook
pnpm docs:onboarding:pptx       # sales/onboarding slide deck
pnpm docs:onboarding:customer-pdf  # customer leave-behind PDF (no technical detail)
```

## PDF pipeline

1. Read `docs/onboarding/Supplify-Complete-Handbook.md`
2. Convert to HTML with `marked` (`scripts/onboarding/md-to-html.mjs`)
3. Render Mermaid diagrams in headless Chromium (CDN)
4. Print to A4 PDF with cream/caramel theme (`docs/onboarding/styles/handbook-print.css`)

**Fallback:** Open `output/Supplify-Complete-Handbook.html` in Chrome → Print → Save as PDF.

## PowerPoint pipeline

`scripts/generate-onboarding-pptx.mjs` builds **38 slides** with speaker notes (main message, narration, business value, Q&A, transitions). Theme: cream background, caramel accents.

## Validation

```powershell
pnpm docs:diagrams:check
node apps/api/scripts/discover-routes.mjs
pnpm verify:tier-matrix   # requires running Postgres
```

Verify PPTX structure (PowerShell):

```powershell
Expand-Archive docs/onboarding/output/Supplify-Onboarding-and-Product-Demo.pptx -DestinationPath _pptx_check -Force
(Get-ChildItem _pptx_check/ppt/slides/slide*.xml).Count
(Get-ChildItem _pptx_check/ppt/notesSlides/notesSlide*.xml).Count
```

## Secrets policy

Never commit real credentials. Demo passwords in slides/handbook are for **local seed accounts only** — do not distribute production secrets. Sanitize before external customer distribution.
