#!/usr/bin/env node
/**
 * Assembles Supplify-Complete-Handbook.md from onboarding docs 01-20.
 * Run: node docs/onboarding/_assemble-handbook.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'Supplify-Complete-Handbook.md');
const COMMIT = 'ab5695e195079adde17df8b8082f193551daf2d8';
const GEN_DATE = '2026-06-17';

const TECH_FILES = new Set([
  '07-technical-architecture.md',
  '08-database-guide.md',
  '09-authentication-rbac.md',
  '10-subscriptions-and-plans.md',
  '11-api-and-workflow-reference.md',
]);

const FILES = [
  '01-executive-overview.md',
  '02-complete-product-guide.md',
  '03-supplier-onboarding.md',
  '04-restaurant-onboarding.md',
  '05-driver-onboarding.md',
  '06-admin-onboarding.md',
  '07-technical-architecture.md',
  '08-database-guide.md',
  '09-authentication-rbac.md',
  '10-subscriptions-and-plans.md',
  '11-api-and-workflow-reference.md',
  '12-demo-script.md',
  '13-acceptance-criteria.md',
  '14-troubleshooting.md',
  '15-security-review.md',
  '16-implementation-status.md',
  '17-glossary.md',
  '18-frequently-asked-questions.md',
  '19-onboarding-checklists.md',
  '20-source-evidence-index.md',
];

const PART_META = {
  '01-executive-overview.md': { roman: 'I', label: 'Executive Overview' },
  '02-complete-product-guide.md': { roman: 'II', label: 'Complete Product Guide' },
  '03-supplier-onboarding.md': { roman: 'III', label: 'Supplier Onboarding Guide' },
  '04-restaurant-onboarding.md': { roman: 'IV', label: 'Restaurant Onboarding Guide' },
  '05-driver-onboarding.md': { roman: 'V', label: 'Driver Onboarding Guide' },
  '06-admin-onboarding.md': { roman: 'VI', label: 'Platform Admin Onboarding Guide' },
  '07-technical-architecture.md': { roman: 'VII', label: 'Technical Architecture', tech: true },
  '08-database-guide.md': { roman: 'VIII', label: 'Database Guide', tech: true },
  '09-authentication-rbac.md': { roman: 'IX', label: 'Authentication & RBAC', tech: true },
  '10-subscriptions-and-plans.md': { roman: 'X', label: 'Subscriptions and Plans', tech: true },
  '11-api-and-workflow-reference.md': { roman: 'XI', label: 'API and Workflow Reference', tech: true },
  '12-demo-script.md': { roman: 'XII', label: 'Demo Scripts' },
  '13-acceptance-criteria.md': { roman: 'XIII', label: 'Acceptance Criteria' },
  '14-troubleshooting.md': { roman: 'XIV', label: 'Troubleshooting Guide' },
  '15-security-review.md': { roman: 'XV', label: 'Security Review', tech: true },
  '16-implementation-status.md': { roman: 'XVI', label: 'Implementation Status' },
  '17-glossary.md': { roman: 'XVII', label: 'Glossary' },
  '18-frequently-asked-questions.md': { roman: 'XVIII', label: 'Frequently Asked Questions' },
  '19-onboarding-checklists.md': { roman: 'XIX', label: 'Onboarding Checklists' },
  '20-source-evidence-index.md': { roman: 'XX', label: 'Source Evidence Index' },
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/\(internal technical reference\)/gi, '')
    .replace(/[`*_]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function demoteHeadings(markdown) {
  return markdown.replace(/^(#{1,6})\s/gm, (m) => '#' + m);
}

/** Inject explicit anchors before ###+ headings so TOC links resolve consistently. */
function injectHeadingAnchors(markdown) {
  return markdown.replace(/^(#{3,6})\s+(.+)$/gm, (full, hashes, title) => {
    const id = slugify(title.replace(/\*\*/g, ''));
    return `<a id="${id}"></a>\n\n${hashes} ${title}`;
  });
}

function processContent(raw) {
  let s = raw.replace(/^#\s+[^\n]+\n+/, '');
  s = s.replace(/\]\(\.\/(\d{2})-([a-z0-9-]+)\.md([^)]*)\)/g, (_, num, slug, hash) => {
    const key = `${num}-${slug}`;
    const meta = Object.entries(PART_META).find(([f]) => f.startsWith(num + '-'));
    if (meta) {
      const partSlug = partSlugForFile(meta[0]);
      return `](${hash ? partSlug + hash : partSlug})`;
    }
    return `](./${key}.md${hash || ''})`;
  });
  s = s.replace(/\n---\n\n\*Document version:[\s\S]*$/m, '');
  s = s.replace(/\n\*Document version:[\s\S]*$/m, '');
  return demoteHeadings(s.trim());
}

function partSlugForFile(file) {
  const meta = PART_META[file];
  const suffix = meta.tech ? '-internal-technical-reference' : '';
  return `part-${meta.roman.toLowerCase()}-${slugify(meta.label)}${suffix}`;
}

function partHeadingFor(file) {
  const meta = PART_META[file];
  const tech = meta.tech ? ' *(Internal Technical Reference)*' : '';
  return `Part ${meta.roman} — ${meta.label}${tech}`;
}

const featureSummary = `## Feature Inventory Summary

> **Generated:** ${GEN_DATE} · **Commit:** \`${COMMIT}\`  
> **Full inventory:** [00-feature-inventory.md](./00-feature-inventory.md) (127 rows — not duplicated here)

| Metric | Count |
|--------|------:|
| Inventory rows | **127** |
| Domains covered | **22** |
| API routes (discovered) | **554** |
| Frontend route entries | **80** |
| Permission keys | **52** |
| Subscription tiers | **4** × 2 tenant types |

### Status legend

| Status | Meaning |
|--------|---------|
| **Full** | End-to-end implemented and tested in code |
| **Partial** | Works with known gaps or doc/code drift |
| **UI-only** | Frontend without backend persistence |
| **Backend-only** | API without complete UI |
| **Deprecated** | Legacy path still present |
| **Unverified** | Could not confirm without running environment |

Domains in the full inventory include: Authentication & Tenancy; Ordering, Fulfillment & Delivery; Catalog, Inventory & Reorder; Finance, Deals & Onboarding; Staff, Reservations, Platform & Integrations. See the linked file for per-feature status, limitations, and evidence paths.

---`;

const tocEntries = [];
tocEntries.push({ level: 2, text: 'Disclaimer', slug: 'disclaimer' });
tocEntries.push({ level: 2, text: 'Feature Inventory Summary', slug: 'feature-inventory-summary' });

const parts = [];

for (const file of FILES) {
  const fp = path.join(__dirname, file);
  const raw = fs.readFileSync(fp, 'utf8');
  const partHeading = partHeadingFor(file);
  const partSlug = partSlugForFile(file);
  tocEntries.push({
    level: 2,
    text: partHeading.replace(/\s*\*\(Internal Technical Reference\)\*/g, ''),
    slug: partSlug,
    tech: PART_META[file].tech,
  });

  const body = injectHeadingAnchors(processContent(raw));

  // Collect ### headings (demoted from ##) for subsection TOC
  const subsectionRe = /^###\s+(.+)$/gm;
  let match;
  while ((match = subsectionRe.exec(body)) !== null) {
    const text = match[1].replace(/\*\*/g, '').trim();
    if (text.length < 3 || text.startsWith('Step ')) continue;
    // Skip very granular step headings in onboarding guides (optional: include Step N as level 4)
    const isStep = /^Step \d+/i.test(text);
    tocEntries.push({
      level: isStep ? 4 : 3,
      text,
      slug: slugify(text),
      parent: partSlug,
    });
  }

  parts.push(`## ${partHeading}\n\n<a id="${partSlug}"></a>\n\n${body}`);
}

function buildToc(entries) {
  const lines = [];
  let currentPart = null;
  for (const e of entries) {
    if (e.level === 2) {
      currentPart = e.slug;
      lines.push(`- [${e.text}](#${e.slug})`);
    } else if (e.level === 3) {
      lines.push(`  - [${e.text}](#${e.slug})`);
    } else if (e.level === 4) {
      lines.push(`    - [${e.text}](#${e.slug})`);
    }
  }
  return lines.join('\n');
}

const header = `# Supplify Complete Handbook

| | |
|---|---|
| **Title** | Supplify Complete Handbook |
| **Version** | 1.0 |
| **Generation date** | ${GEN_DATE} |
| **Source commit** | \`${COMMIT}\` |
| **Repository** | supplify_erp |

*Single-volume onboarding, product, operations, and technical reference assembled from \`docs/onboarding/01\`–\`20\`.*

---

## Disclaimer

This handbook describes Supplify **as implemented in the repository at the commit above**, not as a marketing promise. Capabilities marked **Partial**, **UI-only**, or **disabled by default** in the feature inventory and acceptance criteria may be incomplete, environment-gated, or absent from demo seeds.

**Implementation status (honest summary):**

- **Core B2B order flow** (cart → supplier fulfill → receive → invoice) is production-intent and well tested.
- **Admin platform**, **monetization/tiers**, and **hospitality add-ons** (reservations, B2C, staff) are shipped with varying demo polish.
- **Known gaps** include: supplier Settings Delivery Zones/Contacts tabs (UI-only, hidden); restaurant finance opening balance hardcoded \`0\`; delivery rollover cron disabled unless \`DELIVERY_ROLLOVER_ENABLED=true\`; driver Keycloak users not in \`seed:full\`; quote prices informational at checkout.
- **554 API routes** and **127 feature inventory rows** are code-verified; always re-run route discovery and tests after major releases.

For claim-level traceability, see [Part XX — Source Evidence Index](#part-xx-source-evidence-index). For pass/fail definitions, see [Part XIII — Acceptance Criteria](#part-xiii-acceptance-criteria). [Part XVI — Implementation Status](#part-xvi-implementation-status) expands the honest assessment.

**Audience:** Parts VII–XI and XV are marked *(Internal Technical Reference)* for engineers, DevOps, and implementation partners.

---

## Table of Contents

${buildToc(tocEntries)}

---

`;

const doc =
  header +
  featureSummary +
  '\n\n' +
  parts.join('\n\n---\n\n') +
  '\n\n---\n\n*End of Supplify Complete Handbook v1.0 · ' +
  GEN_DATE +
  ' · `' +
  COMMIT +
  '`*\n';

fs.writeFileSync(OUT, doc, 'utf8');
console.log('Wrote', OUT, '(' + doc.length + ' chars,', doc.split('\n').length, 'lines)');
console.log('TOC entries:', tocEntries.length);
