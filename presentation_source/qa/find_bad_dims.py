import re
from pathlib import Path

root = Path(r"c:\myProjects\supplify_erp\presentation_source\qa\unpack-stakeholder\ppt\slides")
for s in sorted(root.glob("slide*.xml")):
    t = s.read_text(encoding="utf-8")
    for m in re.finditer(r'<a:off[^/]*/>|<a:ext[^/]*/>|<a:off[^>]*>.*?</a:off>|<a:xfrm[^>]*>.*?</a:xfrm>', t, re.S):
        pass
    for m in re.finditer(r'<a:xfrm[^>]*>.*?</a:xfrm>', t, re.S):
        block = m.group(0)
        offs = re.findall(r'<a:off[^/]*x="(-?\d+)"[^/]*y="(-?\d+)"', block)
        exts = re.findall(r'<a:ext[^/]*cx="(-?\d+)"[^/]*cy="(-?\d+)"', block)
        for x, y in offs:
            if int(x) < 0 or int(y) < 0:
                print(f"{s.name} NEG OFF x={x} y={y}")
        for cx, cy in exts:
            if int(cx) < 0 or int(cy) < 0:
                print(f"{s.name} NEG EXT cx={cx} cy={cy}")
                # print surrounding shape for context
                start = max(0, m.start() - 200)
                print(t[start:m.end() + 80].replace("\n", " ")[:300])
                print("---")
