"""Finish and verify the Supplify bilingual flyer after render.mjs.

Requires the existing PyMuPDF, Pillow, NumPy and OpenCV installations.
All final typography and QR geometry remain vector PDF content.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
import pymupdf as pdf

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'output/horeca-flyer'
MM = 72 / 25.4
PAPER = tuple(v / 255 for v in (246, 244, 234))
LANGUAGES = ['en', 'ar']
NAMES = {'en': 'english', 'ar': 'arabic'}
MANIFEST = json.loads((OUT / 'source/assets/qr-manifest.json').read_text(encoding='utf-8'))
LAYOUT = json.loads((OUT / 'source/layout-check.json').read_text(encoding='utf-8'))


def set_metadata(document: pdf.Document, label: str) -> None:
    document.set_metadata({
        'title': f'Supplify — Supply, simplified. | {label}',
        'author': 'Supplify',
        'subject': 'Restaurant and supplier platform — English / Arabic flyer',
        'keywords': 'Supplify, HORECA, restaurants, suppliers, flyer',
        'creator': 'Supplify print artwork',
    })


def qr_rect(language: str, offset_x: float = 0, offset_y: float = 0, scale: float = 1) -> pdf.Rect:
    page_layout = next(x for x in LAYOUT['layout'] if x['language'] == language)
    qr = next(x for x in page_layout['items'] if x['type'] == 'qr')
    return pdf.Rect(
        offset_x + qr['x'] * .75 * scale,
        offset_y + qr['y'] * .75 * scale,
        offset_x + (qr['x'] + qr['width']) * .75 * scale,
        offset_y + (qr['y'] + qr['height']) * .75 * scale,
    )


def add_link(page: pdf.Page, language: str, **kwargs) -> None:
    page.insert_link({'kind': pdf.LINK_URI, 'from': qr_rect(language, **kwargs), 'uri': MANIFEST[language]['url']})


def save(document: pdf.Document, name: str, label: str) -> Path:
    set_metadata(document, label)
    target = OUT / name
    document.save(target, garbage=4, deflate=True)
    print(target.relative_to(ROOT))
    return target


def trim_page(document: pdf.Document, language: str) -> pdf.Page:
    source = pdf.open(OUT / f'source/{language}-bleed.pdf')
    page = document.new_page(width=148 * MM, height=210 * MM)
    page.draw_rect(page.rect, fill=PAPER, color=None)
    page.show_pdf_page(page.rect, source, 0, clip=pdf.Rect(3 * MM, 3 * MM, 151 * MM, 213 * MM), keep_proportion=False)
    add_link(page, language)
    return page


def crop_marks(page: pdf.Page) -> None:
    for y in (9, 219):
        for start, end in ((.7, 4.8), (161.2, 165.3)):
            page.draw_line((start * MM, y * MM), (end * MM, y * MM), color=(0,), width=.25)
    for x in (9, 157):
        for start, end in ((.7, 4.8), (223.2, 227.3)):
            page.draw_line((x * MM, start * MM), (x * MM, end * MM), color=(0,), width=.25)


def main() -> None:
    trimmed = pdf.open()
    for language in LANGUAGES:
        trim_page(trimmed, language)
    a5_path = save(trimmed, 'supplify-flyer-A5.pdf', 'A5 · English front / Arabic back')

    for i, language in enumerate(LANGUAGES):
        single = pdf.open()
        single.insert_pdf(trimmed, from_page=i, to_page=i)
        save(single, f'supplify-flyer-{NAMES[language]}-A5.pdf', f'A5 · {NAMES[language]}')

    a4 = pdf.open()
    scale = 297 / 210
    left = (210 - 148 * scale) * MM / 2
    for i, language in enumerate(LANGUAGES):
        page = a4.new_page(width=210 * MM, height=297 * MM)
        page.draw_rect(page.rect, fill=PAPER, color=None)
        rect = pdf.Rect(left, 0, left + 148 * MM * scale, 297 * MM)
        page.show_pdf_page(rect, trimmed, i)
        add_link(page, language, offset_x=left, scale=scale)
    save(a4, 'supplify-flyer-A4.pdf', 'A4 · English front / Arabic back')

    press = pdf.open()
    for language in LANGUAGES:
        source = pdf.open(OUT / f'source/{language}-bleed.pdf')
        page = press.new_page(width=166 * MM, height=228 * MM)
        page.draw_rect(page.rect, fill=PAPER, color=None)
        page.show_pdf_page(pdf.Rect(6 * MM, 6 * MM, 160 * MM, 222 * MM), source, 0, keep_proportion=False)
        crop_marks(page)
        page.set_trimbox(pdf.Rect(9 * MM, 9 * MM, 157 * MM, 219 * MM))
        page.set_bleedbox(pdf.Rect(6 * MM, 6 * MM, 160 * MM, 222 * MM))
        add_link(page, language, offset_x=9 * MM, offset_y=9 * MM)
    save(press, 'supplify-flyer-press-A5-3mm-bleed.pdf', 'A5 press · 3 mm bleed · crop marks')

    checks = []
    detector = cv2.QRCodeDetector()
    for i, language in enumerate(LANGUAGES):
        page = trimmed[i]
        pixmap = page.get_pixmap(dpi=300, alpha=False)
        pixmap.save(OUT / f'preview/supplify-flyer-{NAMES[language]}-300dpi.png')
        image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
        pixels_per_mm = pixmap.width / 148
        art_pixels = image[int(82*pixels_per_mm):int(134*pixels_per_mm),int(10*pixels_per_mm):int(138*pixels_per_mm),:3]
        assert np.sum(art_pixels.mean(axis=2) < 160) > art_pixels.shape[0]*art_pixels.shape[1]*.08, f'{language}: artwork absent from full-page export'
        decoded, _, _ = detector.detectAndDecode(cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
        assert decoded == MANIFEST[language]['url'], f'{language}: printed QR failed to decode'
        lower = page.get_pixmap(dpi=150, alpha=False)
        low_image = np.frombuffer(lower.samples, dtype=np.uint8).reshape(lower.height, lower.width, lower.n)
        low_decoded, _, _ = detector.detectAndDecode(cv2.cvtColor(low_image, cv2.COLOR_RGB2BGR))
        assert low_decoded == decoded, f'{language}: low-resolution QR failed to decode'
        # Save a comfortable phone/share image from the actual print artwork.
        share = page.get_pixmap(matrix=pdf.Matrix(1080 / page.rect.width, 1080 / page.rect.width), alpha=False)
        share.pil_save(OUT / f'supplify-flyer-{NAMES[language]}.jpg', format='JPEG', quality=95, subsampling=0)
        share_image = cv2.imread(str(OUT / f'supplify-flyer-{NAMES[language]}.jpg'))
        share_decoded, _, _ = detector.detectAndDecode(share_image)
        assert share_decoded == decoded, f'{language}: share-image QR failed to decode'
        fonts = page.get_fonts(full=True)
        embedded = all(bool(trimmed.extract_font(font[0])[3]) for font in fonts)
        assert embedded, f'{language}: unembedded font'
        # Verify that the illustration is visible on each final PDF page.
        art_clip = pdf.Rect(10 * MM, 80 * MM, 138 * MM, 137 * MM)
        art_pix = page.get_pixmap(matrix=pdf.Matrix(1, 1), clip=art_clip, alpha=False)
        art_rgb = np.frombuffer(art_pix.samples, dtype=np.uint8).reshape(art_pix.height, art_pix.width, art_pix.n)
        dark_pixels = int(np.sum(art_rgb[:, :, :3].mean(axis=2) < 160))
        assert dark_pixels > 2000, f'{language}: illustration missing from PDF'
        checks.append({'language': language, 'qr_300dpi': True, 'qr_150dpi': True, 'qr_share_jpeg': True, 'url': decoded, 'fonts_embedded': embedded, 'artwork_present': True, 'page_mm': [148, 210]})

    # Check the exact press geometry and QR after bleed/mark assembly.
    for i, page in enumerate(press):
        assert abs(page.trimbox.width / MM - 148) < .01
        assert abs(page.trimbox.height / MM - 210) < .01
        assert abs((page.trimbox.x0 - page.bleedbox.x0) / MM - 3) < .01
        pix = page.get_pixmap(dpi=200, alpha=False)
        array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        decoded, _, _ = detector.detectAndDecode(cv2.cvtColor(array, cv2.COLOR_RGB2BGR))
        assert decoded == MANIFEST[LANGUAGES[i]]['url'], 'Press QR did not decode'
    (OUT / 'print-checks.json').write_text(json.dumps({'trim_pdf': str(a5_path.relative_to(ROOT)), 'checks': checks, 'press_geometry_verified': True, 'press_qrs_verified': True, 'colour_space': 'RGB; printer converts with their press ICC profile'}, indent=2), encoding='utf-8')
    print('PASS: both languages, embedded fonts, artwork, 150/300 dpi QR decoding and 3 mm press bleed.')


if __name__ == '__main__':
    main()
