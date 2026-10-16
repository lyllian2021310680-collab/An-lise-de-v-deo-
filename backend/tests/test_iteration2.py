"""Iteration 2 backend tests: formations, archive, new action fields, rallies, AI."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    envp = "/app/frontend/.env"
    if os.path.exists(envp):
        for line in open(envp):
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def demo_video_id(s):
    r = s.get(f"{API}/videos")
    assert r.status_code == 200
    for v in r.json():
        if "demo" in (v.get("title") or "").lower():
            return v["id"]
    pytest.skip("No demo video found")


# ---- Formations ----
class TestFormations:
    def test_list_default_6(self, s):
        r = s.get(f"{API}/formations")
        assert r.status_code == 200
        data = r.json()
        names = [f["name"] for f in data]
        for p in ["P1", "P2", "P3", "P4", "P5", "P6"]:
            assert p in names, f"missing {p}"

    def test_crud(self, s):
        r = s.post(f"{API}/formations", json={"name": "TEST_FORM", "order": 99, "active": True})
        assert r.status_code == 200
        fid = r.json()["id"]
        r2 = s.put(f"{API}/formations/{fid}", json={"name": "TEST_FORM2", "order": 99, "active": True})
        assert r2.status_code == 200
        assert r2.json()["name"] == "TEST_FORM2"
        r3 = s.delete(f"{API}/formations/{fid}")
        assert r3.status_code == 200


# ---- Fundamentos extras ----
class TestExtraFundamentos:
    def test_has_new_fundamentos(self, s):
        r = s.get(f"{API}/fundamentos")
        assert r.status_code == 200
        names = [f["name"] for f in r.json()]
        for n in ["Contra-ataque", "Cobertura", "Continuidade"]:
            assert n in names, f"missing {n}"
        assert len(r.json()) >= 9


# ---- Archive ----
class TestArchive:
    def test_archive_fundamento_preserves_in_list(self, s):
        # create a test fundamento
        r = s.post(f"{API}/fundamentos", json={"name": "TEST_ARCH_F", "color": "#000"})
        fid = r.json()["id"]
        # archive
        r2 = s.patch(f"{API}/fundamentos/{fid}/archive", params={"archived": "true"})
        assert r2.status_code == 200
        assert r2.json()["archived"] is True
        # still returned by GET (history preserved)
        r3 = s.get(f"{API}/fundamentos")
        ids = [f["id"] for f in r3.json()]
        assert fid in ids
        # reactivate
        r4 = s.patch(f"{API}/fundamentos/{fid}/archive", params={"archived": "false"})
        assert r4.json()["archived"] is False
        s.delete(f"{API}/fundamentos/{fid}")

    def test_archive_classificacao(self, s):
        # pick any classificacao
        c = s.get(f"{API}/classificacoes").json()[0]
        r = s.patch(f"{API}/classificacoes/{c['id']}/archive", params={"archived": "true"})
        assert r.status_code == 200
        assert r.json()["archived"] is True
        # revert
        s.patch(f"{API}/classificacoes/{c['id']}/archive", params={"archived": "false"})


# ---- Actions new fields ----
class TestActionNewFields:
    def test_create_with_new_fields_and_persist(self, s, demo_video_id):
        payload = {
            "video_id": demo_video_id, "timestamp": 42.5,
            "fundamento_name": "Ataque", "classificacao_label": "Ponto",
            "athlete_ids": [],
            "set_number": 2, "formation": "P1",
            "result": "ponto", "phase": "K1",
            "court": {"zone": 4, "point": {"x": 0.3, "y": 0.5},
                      "arrow": {"x1": 0.1, "y1": 0.1, "x2": 0.9, "y2": 0.9}, "kind": "ataque"},
            "clip_start": 40.0, "clip_end": 48.0,
        }
        r = s.post(f"{API}/actions", json=payload)
        assert r.status_code == 200, r.text
        a = r.json()
        aid = a["id"]
        assert a["set_number"] == 2
        assert a["formation"] == "P1"
        assert a["result"] == "ponto"
        assert a["court"]["zone"] == 4
        assert a["clip_start"] == 40.0
        # verify via GET
        g = s.get(f"{API}/actions", params={"video_id": demo_video_id}).json()
        found = [x for x in g if x["id"] == aid][0]
        assert found["formation"] == "P1"
        assert found["court"]["point"]["x"] == 0.3
        # update
        payload["formation"] = "P4"
        payload["court"]["zone"] = 2
        u = s.put(f"{API}/actions/{aid}", json=payload)
        assert u.status_code == 200
        assert u.json()["formation"] == "P4"
        assert u.json()["court"]["zone"] == 2
        # cleanup
        s.delete(f"{API}/actions/{aid}")


# ---- Rallies ----
class TestRallies:
    def test_link_and_unlink(self, s, demo_video_id):
        # create two actions
        ids = []
        for ts in [200.0, 201.0]:
            r = s.post(f"{API}/actions", json={
                "video_id": demo_video_id, "timestamp": ts,
                "fundamento_name": "Ataque", "classificacao_label": "Ponto",
                "athlete_ids": [],
            })
            ids.append(r.json()["id"])
        # link
        r = s.post(f"{API}/rallies/link", json={
            "action_ids": ids, "situation": "K2",
            "label": "TEST_RALLY", "video_id": demo_video_id,
        })
        assert r.status_code == 200
        rid = r.json()["id"]
        # verify actions have rally_id and phase
        acts = s.get(f"{API}/actions", params={"video_id": demo_video_id}).json()
        linked = [a for a in acts if a["id"] in ids]
        assert all(a["rally_id"] == rid for a in linked)
        assert all(a["phase"] == "K2" for a in linked)
        # list rallies
        rl = s.get(f"{API}/rallies", params={"video_id": demo_video_id}).json()
        assert any(x["id"] == rid for x in rl)
        # phase filter
        pf = s.get(f"{API}/actions", params={"video_id": demo_video_id, "phase": "K2"}).json()
        assert all(a.get("phase") == "K2" for a in pf)
        # delete rally
        d = s.delete(f"{API}/rallies/{rid}")
        assert d.status_code == 200
        acts2 = s.get(f"{API}/actions", params={"video_id": demo_video_id}).json()
        for a in acts2:
            if a["id"] in ids:
                assert a["rally_id"] in (None, "")
        # cleanup
        for aid in ids:
            s.delete(f"{API}/actions/{aid}")


# ---- AI ----
class TestAI:
    def test_ai_analyze(self, s, demo_video_id):
        r = s.post(f"{API}/ai/analyze", json={
            "question": "Qual é o aproveitamento no ataque?",
            "video_ids": [demo_video_id],
        }, timeout=120)
        if r.status_code == 502:
            pytest.skip(f"AI env unavailable: {r.text}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "answer" in data and isinstance(data["answer"], str) and len(data["answer"]) > 10
        assert "n_actions" in data
        assert "stats" in data
        assert data["stats"]["total"] >= 1
