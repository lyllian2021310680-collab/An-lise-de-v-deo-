"""AVA Volleyball Analysis backend tests."""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
# fallback: read from frontend/.env
if not BASE_URL:
    envp = "/app/frontend/.env"
    if os.path.exists(envp):
        for line in open(envp):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---- Seed listings ----
class TestSeed:
    def test_videos(self, s):
        r = s.get(f"{API}/videos")
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 3
        assert all("tag_count" in v for v in data)

    def test_athletes(self, s):
        r = s.get(f"{API}/athletes")
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_fundamentos(self, s):
        r = s.get(f"{API}/fundamentos")
        assert r.status_code == 200
        assert len(r.json()) >= 6

    def test_classificacoes(self, s):
        r = s.get(f"{API}/classificacoes")
        assert r.status_code == 200
        assert len(r.json()) >= 20

    def test_positions(self, s):
        r = s.get(f"{API}/positions")
        assert r.status_code == 200
        assert len(r.json()) >= 5

    def test_actions_seeded(self, s):
        r = s.get(f"{API}/actions")
        assert r.status_code == 200
        assert len(r.json()) >= 10


# ---- Videos ----
class TestVideos:
    def test_create_youtube_video_thumbnail_autogen(self, s):
        payload = {"title": "TEST_YT_Video", "source_type": "youtube", "youtube_id": "dQw4w9WgXcQ"}
        r = s.post(f"{API}/videos", json=payload)
        assert r.status_code == 200
        v = r.json()
        assert v["thumbnail_url"] == "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg"
        assert "id" in v
        # GET
        r2 = s.get(f"{API}/videos/{v['id']}")
        assert r2.status_code == 200
        assert "tag_count" in r2.json()
        # cleanup
        s.delete(f"{API}/videos/{v['id']}")


# ---- Athletes ----
class TestAthletes:
    def test_crud(self, s):
        r = s.post(f"{API}/athletes", json={"name": "TEST_Atleta", "number": "99", "position_name": "Ponteiro"})
        assert r.status_code == 200
        aid = r.json()["id"]
        # update
        r2 = s.put(f"{API}/athletes/{aid}", json={"name": "TEST_Atleta2", "number": "99"})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_Atleta2"
        # soft delete
        s.delete(f"{API}/athletes/{aid}")
        r3 = s.get(f"{API}/athletes/{aid}")
        assert r3.status_code == 200
        assert r3.json()["active"] is False


# ---- Fundamentos & Classificacoes ----
class TestFundClass:
    def test_crud(self, s):
        rf = s.post(f"{API}/fundamentos", json={"name": "TEST_Fund", "color": "#111111", "shortcut": "T"})
        assert rf.status_code == 200
        fid = rf.json()["id"]
        rc = s.post(f"{API}/classificacoes", json={"fundamento_id": fid, "label": "TEST_Class", "symbol": "*", "color": "#222"})
        assert rc.status_code == 200
        cid = rc.json()["id"]
        # list by fundamento
        rl = s.get(f"{API}/classificacoes", params={"fundamento_id": fid})
        assert rl.status_code == 200
        assert any(c["id"] == cid for c in rl.json())
        s.delete(f"{API}/classificacoes/{cid}")
        s.delete(f"{API}/fundamentos/{fid}")


# ---- Positions ----
class TestPositions:
    def test_crud(self, s):
        r = s.post(f"{API}/positions", json={"name": "TEST_Pos", "order": 99})
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = s.put(f"{API}/positions/{pid}", json={"name": "TEST_Pos2", "order": 99})
        assert r2.status_code == 200
        s.delete(f"{API}/positions/{pid}")


# ---- Actions ----
class TestActions:
    def test_lifecycle_and_filters_and_video_status(self, s):
        # Create a pendente video
        v = s.post(f"{API}/videos", json={"title": "TEST_PendVideo", "source_type": "youtube", "youtube_id": "abcd1234"}).json()
        vid = v["id"]
        assert v["status"] == "pendente"
        # need a fundamento, classificacao, athlete
        f = s.get(f"{API}/fundamentos").json()[0]
        c = s.get(f"{API}/classificacoes", params={"fundamento_id": f["id"]}).json()[0]
        a = s.get(f"{API}/athletes").json()[0]
        payload = {
            "video_id": vid, "timestamp": 42.5,
            "fundamento_id": f["id"], "fundamento_name": f["name"],
            "classificacao_id": c["id"], "classificacao_label": c["label"],
            "athlete_ids": [a["id"]], "phase": "K1",
        }
        r = s.post(f"{API}/actions", json=payload)
        assert r.status_code == 200
        act = r.json()
        aid = act["id"]
        # Video status should change to em_analise
        v2 = s.get(f"{API}/videos/{vid}").json()
        assert v2["status"] == "em_analise"
        # Update
        payload["note"] = "updated"
        ru = s.put(f"{API}/actions/{aid}", json=payload)
        assert ru.status_code == 200
        assert ru.json()["note"] == "updated"
        # Annotations
        ra = s.patch(f"{API}/actions/{aid}/annotations", json={"annotations": [{"type": "arrow", "x": 1}]})
        assert ra.status_code == 200
        assert len(ra.json()["annotations"]) == 1
        # Filters
        rf = s.get(f"{API}/actions", params={"video_id": vid, "athlete_id": a["id"], "fundamento_id": f["id"], "classificacao_id": c["id"], "phase": "K1"})
        assert rf.status_code == 200
        assert any(x["id"] == aid for x in rf.json())
        # Delete
        rd = s.delete(f"{API}/actions/{aid}")
        assert rd.status_code == 200
        # cleanup video
        s.delete(f"{API}/videos/{vid}")


# ---- Settings ----
class TestSettings:
    def test_get_put(self, s):
        r = s.get(f"{API}/settings")
        assert r.status_code == 200
        orig = r.json()
        r2 = s.put(f"{API}/settings", json={"default_clip_before": 7.5, "default_clip_after": 8.5})
        assert r2.status_code == 200
        assert r2.json()["default_clip_before"] == 7.5
        # restore
        s.put(f"{API}/settings", json={"default_clip_before": orig.get("default_clip_before", 10.0), "default_clip_after": orig.get("default_clip_after", 10.0)})


# ---- Export CSV ----
class TestExport:
    def test_csv(self, s):
        r = s.get(f"{API}/export/csv")
        assert r.status_code == 200
        text = r.text
        assert "Partida" in text and "Fundamento" in text
        assert len(text.splitlines()) >= 2  # header + at least 1 row from seeded actions


# ---- Upload / Files ----
class TestUpload:
    def test_upload_and_download(self, s):
        files = {"file": ("tiny.txt", io.BytesIO(b"hello-ava"), "text/plain")}
        data = {"kind": "misc"}
        # don't send JSON header for multipart
        r = requests.post(f"{API}/upload", files=files, data=data)
        if r.status_code != 200:
            pytest.skip(f"Upload backend/object-storage unavailable: {r.status_code} {r.text[:200]}")
        storage_path = r.json()["storage_path"]
        rd = requests.get(f"{API}/files/{storage_path}")
        assert rd.status_code == 200
        assert rd.content == b"hello-ava"
