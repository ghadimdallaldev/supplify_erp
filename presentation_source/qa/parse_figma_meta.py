import re
from pathlib import Path

t = Path(
    r"C:\Users\ghadi.mdallal\.cursor\projects\c-myProjects-supplify-erp\agent-tools\0b98278a-f072-4679-b531-9d89f5b6c8de.txt"
).read_text(encoding="utf-8", errors="ignore")
frames = re.findall(
    r'<frame id="([^"]+)" name="([^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"',
    t,
)
print("total frames", len(frames))
phone = [f for f in frames if float(f[4]) >= 300 and float(f[4]) <= 500 and float(f[5]) >= 600]
print("\nphone-like:")
for f in phone:
    print(f"{f[0]}\t{f[1]}\tw={f[4]}\th={f[5]}\tx={f[2]}\ty={f[3]}")

print("\nunique interesting names:")
names = sorted(set(f[1] for f in frames))
keys = (
    "home",
    "order",
    "supplier",
    "cart",
    "shop",
    "catalog",
    "dashboard",
    "invoice",
    "receiv",
    "approv",
    "spend",
    "price",
    "fulfill",
    "delivery",
    "more",
    "login",
    "product",
    "list",
    "detail",
    "timeline",
    "inventory",
    "report",
    "deal",
    "quote",
    "tab bar",
    "browse",
    "search",
    "checkout",
    "notification",
)
for n in names:
    if any(k in n.lower() for k in keys):
        print(n)

# Also extract notable text labels for capability mapping
texts = re.findall(r'<text id="([^"]+)" name="([^"]+)"[^/]*/>', t)
# text content is not in metadata - only names. Look for text nodes with meaningful names
print("\ntext node names (sample):")
for tid, name in texts:
    if name not in ("Title", "Description", "Sample", "Usage", "Value", "Token", "Group title", "Label", "Caption"):
        if any(k in name.lower() for k in keys + ("weekly", "approval", "resume", "pending", "metric", "kpi", "status")):
            print(tid, name)
