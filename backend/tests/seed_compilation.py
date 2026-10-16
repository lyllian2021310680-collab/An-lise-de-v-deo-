# Seed helper for compilation UI testing: uploads a small video, creates an 'upload' video + 3 short actions. Usage: python seed_compilation.py <file> | cleanup
import os, sys, json, requests
API = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
LUCAS, BRUNO = "50a692cf-4fbb-4864-a492-4f10d9b27b3a", "0b10d3e1-5903-47d8-a8fa-d3a5ba3df378"
REC, ATQ, BLQ = "34d0792b-cd9e-4994-9d9f-00259364ea82", "d2996ee4-a698-405a-8ef4-3964ebd12d68", "99bec3bc-7697-4e98-8b75-0a73968a31df"

if sys.argv[1] == "cleanup":
    for v in requests.get(f"{API}/videos").json():
        if v["title"].startswith("TEST_Comp"):
            for a in requests.get(f"{API}/actions", params={"video_id": v["id"]}).json():
                requests.delete(f"{API}/actions/{a['id']}")
            requests.delete(f"{API}/videos/{v['id']}")
    print("cleaned"); sys.exit()

f = sys.argv[1]
ctype = "video/webm" if f.endswith("webm") else "video/mp4"
up = requests.post(f"{API}/upload", files={"file": (os.path.basename(f), open(f, "rb"), ctype)}, data={"kind": "video"}).json()
v = requests.post(f"{API}/videos", json={"title": "TEST_Comp " + ctype, "opponent": "TEST_Adv", "source_type": "upload", "storage_path": up["storage_path"], "duration": 20, "match_date": "2026-01-10"}).json()
ids = []
for fund, name, ts, aths in [(REC, "Recepção", 3, [LUCAS]), (ATQ, "Ataque", 8, [LUCAS, BRUNO]), (BLQ, "Bloqueio", 14, [BRUNO])]:
    a = requests.post(f"{API}/actions", json={"video_id": v["id"], "timestamp": ts, "fundamento_id": fund, "fundamento_name": name, "athlete_ids": aths, "clip_before": 1, "clip_after": 1, "team": "nos"}).json()
    ids.append(a["id"])
print(json.dumps({"video_id": v["id"], "storage_path": up["storage_path"], "actions": ids}))
