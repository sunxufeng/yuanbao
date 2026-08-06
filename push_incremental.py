#!/usr/bin/env python3
"""Incremental push of changed/new files to GitHub via Git Database API.

Strategy: take current remote main HEAD as base, create blobs for changed/new
local files, build a tree with base_tree=base (only changed entries listed),
create a commit on top of base, then PATCH the ref.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

ROOT = "/Users/sunxufeng/WorkBuddy/2026-08-06-23-06-57"
REPO = "sunxufeng/yuanbao"
API = "https://api.github.com"
PROXY = "http://127.0.0.1:7897"
TOKEN = os.environ["GH_TOKEN"]

opener = urllib.request.build_opener(urllib.request.ProxyHandler({"https": PROXY}))


def req(method, path, data=None, retries=6):
    url = API + path
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "yuanbao-push",
    }
    last = None
    for i in range(retries):
        try:
            r = urllib.request.Request(url, data=body, headers=headers, method=method)
            with opener.open(r) as resp:
                raw = resp.read().decode("utf-8", "replace")
                return resp.status, (json.loads(raw) if raw else {})
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                last = (e.code, json.loads(raw))
            except Exception:
                last = (e.code, {"message": raw})
            if e.code in (502, 503, 429):
                time.sleep(2 + i * 2)
                continue
            return last
        except Exception as e:  # network blip
            last = (-1, {"message": str(e)})
            time.sleep(2 + i * 2)
    return last


# 1) remote base
st, base = req("GET", f"/repos/{REPO}/git/refs/heads/main")
assert st == 200, (st, base)
base_sha = base["object"]["sha"]
print("[base] main =", base_sha)

st, base_commit = req("GET", f"/repos/{REPO}/git/commits/{base_sha}")
assert st == 200, (st, base_commit)
base_tree = base_commit["tree"]["sha"]
print("[base] tree =", base_tree)

# 2) changed + new local files
changed = subprocess.check_output(
    ["git", "-C", ROOT, "diff", "--name-only", "HEAD"], text=True
).splitlines()
changed = [c.strip() for c in changed if c.strip()]
new = subprocess.check_output(
    ["git", "-C", ROOT, "ls-files", "--others", "--exclude-standard"], text=True
).splitlines()
new = [n.strip() for n in new if n.strip()]
files = sorted(set(changed) | set(new))
print(f"[files] changed={len(changed)} new={len(new)} total={len(files)}")
for f in files:
    print("   -", f)

# 3) create blobs + tree entries
entries = []
ok = 0
for f in files:
    p = os.path.join(ROOT, f)
    if not os.path.isfile(p):
        print("   skip (not file):", f)
        continue
    with open(p, "rb") as fh:
        b64 = base64.b64encode(fh.read()).decode("ascii")
    st, blob = req("POST", f"/repos/{REPO}/git/blobs", {"content": b64, "encoding": "base64"})
    if st != 201:
        print("   BLOB FAIL", f, st, blob)
        sys.exit(1)
    entries.append({"path": f, "mode": "100644", "type": "blob", "sha": blob["sha"]})
    ok += 1

# 4) new tree (based on base)
st, tree = req("POST", f"/repos/{REPO}/git/trees", {"base_tree": base_tree, "tree": entries})
assert st == 201, (st, tree)
print("[tree] created", tree["sha"], "entries=", len(entries))

# 5) commit
msg = "feat: 快捷键命令接线(Alt+1翻译/Alt+2总结) + 埋点analytics(PRD§7) + 密钥清除"
st, commit = req("POST", f"/repos/{REPO}/git/commits",
                 {"message": msg, "tree": tree["sha"], "parents": [base_sha]})
assert st == 201, (st, commit)
print("[commit] created", commit["sha"])

# 6) patch ref
st, ref = req("PATCH", f"/repos/{REPO}/git/refs/heads/main", {"sha": commit["sha"]})
assert st == 200, (st, ref)
print(f"[push] done: {ok} files, commit {commit['sha'][:10]} -> main")
print(f"[url] https://github.com/{REPO}/commit/{commit['sha']}")
