# Supplify — Supply, simplified.

Original English / Arabic flyer, 11 November 2026.

The visual identity is warm ivory, deep ink and citrus, with Supplify violet confined to the brand and the connected illustration. It uses an editorial headline, an original hospitality scene and one shared demo invitation. The supplied competitor photographs are reference context only; none of their imagery, branding, copy or card layouts is included.

## Which file to use

| File                                                       | Use                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------- |
| `supplify-flyer-A5.pdf`                                    | Recommended handout: 148 × 210 mm, English front / Arabic back      |
| `supplify-flyer-press-A5-3mm-bleed.pdf`                    | Commercial printer: A5 trim, 3 mm bleed, crop marks, embedded fonts |
| `supplify-flyer-A4.pdf`                                    | Larger display or A4 printer: 210 × 297 mm, two language pages      |
| `supplify-flyer-english-A5.pdf`                            | English only                                                        |
| `supplify-flyer-arabic-A5.pdf`                             | Arabic only                                                         |
| `supplify-flyer-english.jpg` / `supplify-flyer-arabic.jpg` | 1080-pixel phone and WhatsApp previews                              |
| `preview/*-300dpi.png`                                     | High-resolution page previews                                       |

For office printing, choose the matching paper size, **actual size / 100%**, double-sided, **flip on the long edge**. Page 1 is English and page 2 is Arabic. For a print shop, send the press PDF and specify **148 × 210 mm finished size, 3 mm bleed, two-sided, no scaling**. Matte or silk stock works well; keep the QR area free of reflective finishes. The press file has a 166 × 228 mm media sheet around the crop marks, a 154 × 216 mm BleedBox and a 148 × 210 mm TrimBox. Artwork is RGB; the printer can apply its press ICC conversion.

## QR codes

Each 27 mm QR includes its full white quiet zone and opens the existing public Supplify demo. English and Arabic sides use `utm_source=flyer-en` and `utm_source=flyer-ar` respectively. The destination has the product film, interactive sample walkthroughs and personal-demo request. No sign-in is required. The printed language does not promise a translated version of the public campaign page.

Both PDF pages were decoded at 300 and 150 dpi, the share JPEGs were decoded, and the final press version was checked separately. The actual live destination is checked before handoff. Check results are in `print-checks.json`.

## Editable design and artwork provenance

Open `source/flyer.html` in Chrome to view the bilingual design. Edit text in the HTML and layout/colour in `source/flyer.css`. All fonts, the actual Supplify mark, QR assets and illustration are bundled locally under `source/assets/`; no online font service is required when opening the source.

The original illustration was generated with the **built-in image generation tool**, then composited with deterministic vector typography and real QR codes. Its final generation prompt is saved in `source/artwork-prompt.txt`. The AI tool did not generate the QR codes or the final printed text. Font licences are included in the assets folder.

Rebuild from the repository root:

```powershell
node scripts/horeca/flyer/render.mjs
python scripts/horeca/flyer/finish.py
```

The existing Playwright, PyMuPDF, OpenCV, NumPy and Pillow installations are used. No ERP API, authentication, permissions, feature flags, native app contracts or environment keys changed.
