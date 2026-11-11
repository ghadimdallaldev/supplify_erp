#!/usr/bin/env python3
"""HORECA Beirut 2026 QR generator.

Usage:
    BASE_URL=https://your-real-domain.com python qr/generate.py
    python qr/generate.py --base-url https://your-real-domain.com --campaign horeca-beirut-2026

Outputs (qr/out/): PNG, SVG, print-ready PDF (A5 and A4) and phone-display PNG for the variants
general, restaurant and supplier, plus manifest.json.

If BASE_URL is not a real public https domain (unset, localhost, *.invalid, *.example, ...), every file is
marked STAGING (file name prefix + banner on the PDFs and phone images). Do NOT print staging files.
Requires: pip install segno reportlab pillow
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode, urlparse

import segno
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, A5
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PAPER = "#F5F1EA"
INK = "#15121A"
VIOLET = "#5B21B6"
MUTED = "#57525E"

VARIANTS = {
    "general": {
        "label": "Scan to see Supplify",
        "headline": "Every order,\none line.",
        "sub": "Try the walkthrough and request a personal demo.",
        "role": None,
    },
    "restaurant": {
        "label": "For restaurants",
        "headline": "Every order,\none line.",
        "sub": "See how a restaurant orders, tracks and receives. Then request a personal demo.",
        "role": "restaurant",
    },
    "supplier": {
        "label": "For suppliers",
        "headline": "Every order,\none line.",
        "sub": "Keep the restaurants you serve ordering through one place. Request a personal demo.",
        "role": "supplier",
    },
}

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / "apps/web/static/demo/qr"


def is_staging(base_url: str | None) -> bool:
    if not base_url:
        return True
    u = urlparse(base_url)
    host = (u.hostname or "").lower()
    if u.scheme != "https":
        return True
    return (
        host in ("localhost", "")
        or host.startswith("127.")
        or host.endswith((".invalid", ".example", ".test", ".localhost", ".local"))
        or "example" in host
        or host.replace(".", "").isdigit()
        or "REPLACE" in base_url.upper()
    )


def build_url(base: str, campaign: str, variant: str) -> str:
    params = {
        "utm_source": "qr",
        "utm_medium": "horeca2026",
        "utm_campaign": campaign,
        "utm_content": variant,
    }
    role = VARIANTS[variant]["role"]
    if role:
        params["role"] = role
    return f"{base.rstrip('/')}/?{urlencode(params)}"


def register_fonts() -> tuple[str, str, str]:
    """Return (serif, sans, mono) reportlab font names, using system TTFs when found."""
    cands = {
        "serif": ["C:/Windows/Fonts/georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
        "sans": ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
        "sansb": ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    }
    found = {}
    for key, paths in cands.items():
        for p in paths:
            if Path(p).exists():
                name = f"HX-{key}"
                pdfmetrics.registerFont(TTFont(name, p))
                found[key] = (name, p)
                break
    serif = found.get("serif", ("Times-Roman", None))[0]
    sans = found.get("sans", ("Helvetica", None))[0]
    sansb = found.get("sansb", ("Helvetica-Bold", None))[0]
    return serif, sans, sansb


def pil_font(size: int, bold: bool = False, serif: bool = False):
    names = (
        ["C:/Windows/Fonts/georgia.ttf", "DejaVuSerif.ttf"]
        if serif
        else (["C:/Windows/Fonts/arialbd.ttf", "DejaVuSans-Bold.ttf"] if bold else ["C:/Windows/Fonts/arial.ttf", "DejaVuSans.ttf"])
    )
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            continue
    return ImageFont.load_default()


def make_qr(url: str):
    # Error correction Q: reliable on glossy print and phone screens, still a compact code.
    return segno.make(url, error="q", micro=False, mask=0)


def write_png_svg(qr, stem: str):
    qr.save(OUT / f"{stem}.png", scale=24, border=4, dark=INK, light="#FFFFFF")
    qr.save(OUT / f"{stem}.svg", scale=10, border=4, dark=INK, light="#FFFFFF", xmldecl=True)


def write_pdf(qr, variant: str, url: str, base: str, size, size_name: str, stem: str, staging: bool):
    serif, sans, sansb = register_fonts()
    path = OUT / f"{stem}_{size_name}.pdf"
    w, h = size
    c = canvas.Canvas(str(path), pagesize=size)
    c.setTitle(f"Supplify HORECA Beirut 2026 QR ({variant}, {size_name})" + (" STAGING" if staging else ""))
    c.setFillColor(PAPER)
    c.rect(0, 0, w, h, stroke=0, fill=1)
    m = w * 0.09
    # eyebrow
    c.setFillColor(MUTED)
    c.setFont(sans, w * 0.026)
    c.drawString(m, h - m - 4, "HORECA BEIRUT 2026")
    # headline (serif)
    c.setFillColor(INK)
    hl = VARIANTS[variant]["headline"].split("\n")
    fs = w * 0.128
    y = h - m - fs * 1.15
    c.setFont(serif, fs)
    for i, line in enumerate(hl):
        c.drawString(m, y - i * fs * 0.98, line)
    # violet order line under headline
    ly = y - len(hl) * fs * 0.98 + fs * 0.62
    c.setStrokeColor(VIOLET)
    c.setLineWidth(max(2, w * 0.006))
    c.line(m, ly, w - m, ly)
    c.setFillColor(VIOLET)
    for i in range(5):
        cx = m + (w - 2 * m) * i / 4
        c.circle(cx, ly, w * 0.011, stroke=0, fill=1)
    # sub copy
    c.setFillColor(INK)
    c.setFont(sans, w * 0.036)
    sub = VARIANTS[variant]["sub"]
    words, line, lines = sub.split(), "", []
    for wd in words:
        t = (line + " " + wd).strip()
        if c.stringWidth(t, sans, w * 0.036) > w - 2 * m:
            lines.append(line)
            line = wd
        else:
            line = t
    lines.append(line)
    sy = ly - w * 0.07
    for i, ln in enumerate(lines):
        c.drawString(m, sy - i * w * 0.05, ln)
    # QR in a white card
    qr_size = min(w * 0.5, h * 0.33)
    qx = (w - qr_size) / 2
    qy = m + w * 0.24
    pad = w * 0.03
    c.setFillColor("#FFFFFF")
    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.roundRect(qx - pad, qy - pad, qr_size + 2 * pad, qr_size + 2 * pad, 6, stroke=1, fill=1)
    tmp = OUT / f".tmp_{stem}.png"
    qr.save(tmp, scale=20, border=1, dark=INK, light="#FFFFFF")
    c.drawImage(ImageReader(str(tmp)), qx, qy, qr_size, qr_size)
    tmp.unlink(missing_ok=True)
    c.setFillColor(INK)
    c.setFont(sansb, w * 0.04)
    c.drawCentredString(w / 2, qy - pad - w * 0.05, VARIANTS[variant]["label"])
    # fallback URL (readable)
    c.setFont(sans, w * 0.03)
    c.setFillColor(MUTED)
    host = urlparse(base).netloc + (urlparse(base).path.rstrip("/") or "")
    c.drawCentredString(w / 2, qy - pad - w * 0.1, "Or visit " + host)
    c.setFont(sans, w * 0.022)
    c.setFillColor(MUTED)
    c.drawCentredString(w / 2, m * 0.55, "Supplify. Every order, one line.")
    if staging:
        c.setFillColor("#B91C1C")
        c.rect(0, h - w * 0.05, w, w * 0.05, stroke=0, fill=1)
        c.setFillColor("#FFFFFF")
        c.setFont(sansb, w * 0.028)
        c.drawCentredString(w / 2, h - w * 0.035, "STAGING - placeholder URL - DO NOT PRINT")
    c.showPage()
    c.save()


def write_phone(qr, variant: str, base: str, stem: str, staging: bool):
    W, H = 1080, 1920
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    d.text((90, 150), "HORECA BEIRUT 2026", font=pil_font(34, bold=True), fill=MUTED)
    f = pil_font(150, serif=True)
    d.text((90, 230), "Every order,", font=f, fill=INK)
    d.text((90, 410), "one line.", font=f, fill=INK)
    d.line([(90, 690), (W - 90, 690)], fill=VIOLET, width=8)
    for i in range(5):
        cx = 90 + (W - 180) * i // 4
        d.ellipse([cx - 14, 690 - 14, cx + 14, 690 + 14], fill=VIOLET)
    tmp = OUT / f".tmp_{stem}_phone.png"
    qr.save(tmp, scale=30, border=1, dark=INK, light="#FFFFFF")
    q = Image.open(tmp).convert("RGB")
    side = 780
    q = q.resize((side, side), Image.NEAREST)
    qx, qy = (W - side) // 2, 800
    d.rounded_rectangle([qx - 40, qy - 40, qx + side + 40, qy + side + 40], radius=24, fill="#FFFFFF", outline=INK, width=3)
    img.paste(q, (qx, qy))
    tmp.unlink(missing_ok=True)
    lab = VARIANTS[variant]["label"]
    d.text((W // 2, qy + side + 110), lab, font=pil_font(52, bold=True), fill=INK, anchor="mm")
    host = urlparse(base).netloc + (urlparse(base).path.rstrip("/") or "")
    d.text((W // 2, qy + side + 190), "Or visit " + host, font=pil_font(30), fill=MUTED, anchor="mm")
    if staging:
        d.rectangle([0, 0, W, 70], fill="#B91C1C")
        d.text((W // 2, 35), "STAGING - placeholder URL - DO NOT USE", font=pil_font(34, bold=True), fill="#FFFFFF", anchor="mm")
    img.save(OUT / f"{stem}_phone.png", optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-url", default=os.environ.get("BASE_URL"))
    ap.add_argument("--campaign", default=os.environ.get("QR_CAMPAIGN", "horeca-beirut-2026"))
    a = ap.parse_args()
    if not re.fullmatch(r"[\w\-.]{1,60}", a.campaign):
        print("campaign must match [\\w\\-.]{1,60}", file=sys.stderr)
        return 2
    staging = is_staging(a.base_url)
    base = a.base_url or "https://STAGING-REPLACE-WITH-REAL-DOMAIN.invalid"
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*supplify-horeca2026-*"):
        if old.is_file(): old.unlink()
    manifest = {"staging": staging, "base_url": base, "campaign": a.campaign, "files": []}
    prefix = "STAGING_" if staging else ""
    for v in VARIANTS:
        url = build_url(base, a.campaign, v)
        stem = f"{prefix}supplify-horeca2026-{v}"
        qr = make_qr(url)
        write_png_svg(qr, stem)
        write_pdf(qr, v, url, base, A5, "A5", stem, staging)
        write_pdf(qr, v, url, base, A4, "A4", stem, staging)
        write_phone(qr, v, base, stem, staging)
        manifest["files"].append({"variant": v, "url": url, "stem": stem})
        print(f"[qr] {v}: {url}")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"[qr] wrote {len(list(OUT.glob('*')))} files to {OUT} ({'STAGING - do not print' if staging else 'production'})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
