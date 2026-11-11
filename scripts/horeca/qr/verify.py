#!/usr/bin/env python3
"""Decode every generated QR (PNG, phone PNG and the PDFs rasterised) and check attribution params.

Usage: python qr/verify.py
Requires: pip install opencv-python-headless pymupdf
"""
import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cv2
import fitz  # PyMuPDF
import numpy as np

OUT = Path(__file__).resolve().parents[3] / "apps/web/static/demo/qr"


def decode_img(img) -> str:
    det = cv2.QRCodeDetector()
    val, _, _ = det.detectAndDecode(img)
    if val:
        return val
    # retry on a padded, upscaled copy
    big = cv2.copyMakeBorder(img, 60, 60, 60, 60, cv2.BORDER_CONSTANT, value=(255, 255, 255))
    val, _, _ = det.detectAndDecode(big)
    return val


def main() -> int:
    manifest = json.loads((OUT / "manifest.json").read_text())
    ok = True
    for f in manifest["files"]:
        expected = f["url"]
        stem = f["stem"]
        targets = [OUT / f"{stem}.png", OUT / f"{stem}_phone.png"]
        for pdf in (OUT / f"{stem}_A5.pdf", OUT / f"{stem}_A4.pdf"):
            doc = fitz.open(pdf)
            pix = doc[0].get_pixmap(dpi=200)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR if pix.n == 3 else cv2.COLOR_RGBA2BGR)
            targets.append((pdf.name, img))
        for t in targets:
            if isinstance(t, Path):
                name, img = t.name, cv2.imread(str(t))
            else:
                name, img = t
            got = decode_img(img)
            q = parse_qs(urlparse(got).query)
            good = got == expected and q.get("utm_source") == ["qr"] and q.get("utm_medium") == ["horeca2026"] and q.get("utm_content") == [f["variant"]]
            ok &= good
            print(("OK   " if good else "FAIL ") + f"{name}: {got}")
    print("ALL DECODED AND VERIFIED" if ok else "VERIFICATION FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
