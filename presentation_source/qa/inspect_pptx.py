import re
import shutil
import zipfile
from pathlib import Path

src = Path(r"c:\myProjects\supplify_erp\SUPPLIFY_Stakeholder_Presentation.pptx")
out = Path(r"c:\myProjects\supplify_erp\presentation_source\qa\unpack-stakeholder")
if out.exists():
    shutil.rmtree(out)
out.mkdir(parents=True)
with zipfile.ZipFile(src) as z:
    z.extractall(out)

pres = (out / "ppt" / "presentation.xml").read_text(encoding="utf-8")
m = re.search(r"<p:presentation[^>]*>(.*)</p:presentation>", pres, re.S)
body = m.group(1)
seen = re.findall(r"\n  <p:([A-Za-z0-9]+)", "\n" + body)
print("presentation child tags order:")
print(seen)
print("notesMasterIdLst present:", "notesMasterIdLst" in pres)
print("notesMasters dir:", list((out / "ppt").glob("notesMasters/*")))
print("\n--- content types notes ---")
ct = (out / "[Content_Types].xml").read_text(encoding="utf-8")
for line in ct.splitlines():
    if "notes" in line.lower():
        print(line.strip())
print("\n--- presentation rels ---")
print((out / "ppt" / "_rels" / "presentation.xml.rels").read_text(encoding="utf-8"))

patterns = {
    "8digit_srgb": re.compile(r'srgbClr val="[0-9A-Fa-f]{8}"'),
    "neg_off": re.compile(r'off="-\d+"'),
    "hash_color": re.compile(r'val="#[0-9A-Fa-f]+"'),
    "outEnd": re.compile(r"outEnd"),
    "schemeClr": re.compile(r"schemeClr"),
}
root = out / "ppt"
for name, pat in patterns.items():
    hits = []
    for p in root.rglob("*.xml"):
        t = p.read_text(encoding="utf-8", errors="ignore")
        if pat.search(t):
            hits.append(str(p.relative_to(out)))
    print(f"{name}: {len(hits)} files", hits[:12])

slides = sorted((out / "ppt" / "slides").glob("slide*.xml"))
notes_dir = out / "ppt" / "notesSlides"
notes = sorted(notes_dir.glob("notesSlide*.xml")) if notes_dir.exists() else []
print(f"slides={len(slides)} notes={len(notes)}")

for s in slides:
    rel = out / "ppt" / "slides" / "_rels" / f"{s.name}.rels"
    relt = rel.read_text(encoding="utf-8") if rel.exists() else ""
    for t in re.findall(r'Target="([^"]+)"', relt):
        target = (s.parent / t).resolve()
        if not target.exists():
            print("MISSING REL", s.name, t, "->", target)

# Compare theme / notesMaster from minimal-notes
mini = Path(r"c:\myProjects\supplify_erp\presentation_source\qa\supplify-minimal-notes.pptx")
mout = out.parent / "unpack-minimal-notes"
if mout.exists():
    shutil.rmtree(mout)
mout.mkdir()
with zipfile.ZipFile(mini) as z:
    z.extractall(mout)
mpres = (mout / "ppt" / "presentation.xml").read_text(encoding="utf-8")
mbody = re.search(r"<p:presentation[^>]*>(.*)</p:presentation>", mpres, re.S).group(1)
print("\nminimal-notes child tags:", re.findall(r"\n  <p:([A-Za-z0-9]+)", "\n" + mbody))
print("minimal notesMasters:", list((mout / "ppt").glob("notesMasters/*")))

# Look at slide1 for unusual attrs
s1 = (out / "ppt" / "slides" / "slide1.xml").read_text(encoding="utf-8")
print("\nslide1 size chars", len(s1))
print("slide1 has spTree", "<p:spTree" in s1)
# find invalid EMUs or huge coords
coords = re.findall(r'(?:x|y|cx|cy)="(-?\d+)"', s1)
bad = [c for c in coords if int(c) < 0 or int(c) > 20000000]
print("slide1 extreme coords count", len(bad), bad[:20])

# Check all slides for extreme coords (LAYOUT_WIDE is 13.333x7.5 in = 12192000 x 6858000 EMU roughly)
# 13.333*914400 ≈ 12,191,000; 7.5*914400=6,858,000
for s in slides:
    t = s.read_text(encoding="utf-8")
    for attr, val in re.findall(r'\b(x|y|cx|cy)="(-?\d+)"', t):
        v = int(val)
        if v < -500000 or v > 15000000:
            print("extreme", s.name, attr, v)
            break
