"""
Backend tests for AVA Volleyball Analysis — iteration 3.
Covers: categorias/equipes CRUD, video context (equipe/categoria/season/comp_phase),
action inheritance, update-video propagation, stats filters, athlete summary,
compare, AI analyze, and sanity-check of legacy endpoints.
"""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL is required"
API = f"{BASE}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# -------------------- Legacy sanity --------------------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200


@pytest.mark.parametrize("path", [
    "/fundamentos", "/classificacoes", "/athletes", "/videos",
    "/actions", "/rallies", "/saved-filters", "/settings", "/positions",
    "/formations",
])
def test_list_endpoints(s, path):
    r = s.get(f"{API}{path}")
    assert r.status_code == 200
    assert isinstance(r.json(), (list, dict))


# -------------------- Categorias --------------------
class TestCategorias:
    def test_seed_8_default(self, s):
        r = s.get(f"{API}/categorias")
        assert r.status_code == 200
        data = r.json()
        names = {c["name"] for c in data}
        expected = {"Mirim Masculina", "Mirim Feminina", "Infantil Masculina",
                    "Infantil Feminina", "Juvenil Masculina", "Juvenil Feminina",
                    "Adulta Masculina", "Adulta Feminina"}
        assert expected.issubset(names), f"missing: {expected - names}"

    def test_crud_archive_reactivate(self, s):
        # create
        r = s.post(f"{API}/categorias", json={"name": "TEST_Cat_X", "base": "Adulta", "gender": "Masculina", "order": 99})
        assert r.status_code == 200
        c = r.json()
        assert c["name"] == "TEST_Cat_X"
        cid = c["id"]
        # update
        r = s.put(f"{API}/categorias/{cid}", json={"name": "TEST_Cat_X2", "base": "Adulta", "gender": "Masculina", "order": 99})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Cat_X2"
        # archive
        r = s.patch(f"{API}/categorias/{cid}/archive", params={"archived": "true"})
        assert r.status_code == 200
        assert r.json()["archived"] is True
        # reactivate
        r = s.patch(f"{API}/categorias/{cid}/archive", params={"archived": "false"})
        assert r.status_code == 200
        assert r.json()["archived"] is False
        # soft-delete
        r = s.delete(f"{API}/categorias/{cid}")
        assert r.status_code == 200


# -------------------- Equipes --------------------
class TestEquipes:
    def test_ava_seeded(self, s):
        r = s.get(f"{API}/equipes")
        assert r.status_code == 200
        names = {e["name"] for e in r.json()}
        assert "AVA" in names

    def test_crud(self, s):
        r = s.post(f"{API}/equipes", json={"name": "TEST_Equipe", "order": 50})
        assert r.status_code == 200
        eid = r.json()["id"]
        r = s.put(f"{API}/equipes/{eid}", json={"name": "TEST_Equipe2", "order": 50})
        assert r.status_code == 200 and r.json()["name"] == "TEST_Equipe2"
        r = s.patch(f"{API}/equipes/{eid}/archive", params={"archived": "true"})
        assert r.status_code == 200 and r.json()["archived"] is True
        r = s.delete(f"{API}/equipes/{eid}")
        assert r.status_code == 200


# -------------------- Videos with new fields --------------------
@pytest.fixture(scope="session")
def ctx(s):
    cats = s.get(f"{API}/categorias").json()
    eqs = s.get(f"{API}/equipes").json()
    funds = s.get(f"{API}/fundamentos").json()
    classes = s.get(f"{API}/classificacoes").json()
    aths = s.get(f"{API}/athletes").json()
    return {"cats": cats, "eqs": eqs, "funds": funds, "classes": classes, "aths": aths}


@pytest.fixture()
def test_video(s, ctx):
    cat = next(c for c in ctx["cats"] if c["name"] == "Juvenil Feminina")
    eq = next(e for e in ctx["eqs"] if e["name"] == "AVA")
    r = s.post(f"{API}/videos", json={
        "title": "TEST_V3_video", "source_type": "youtube", "youtube_id": "aqz-KE-bpKQ",
        "categoria_id": cat["id"], "categoria_name": cat["name"],
        "equipe_id": eq["id"], "equipe_name": eq["name"],
        "competition": "TEST_Camp", "season": "2026", "comp_phase": "Semifinal",
        "match_date": "2026-07-10",
    })
    assert r.status_code == 200
    v = r.json()
    yield v
    s.delete(f"{API}/videos/{v['id']}")


class TestVideos:
    def test_video_persists_fields(self, s, test_video):
        vid = test_video["id"]
        r = s.get(f"{API}/videos/{vid}")
        assert r.status_code == 200
        v = r.json()
        assert v["categoria_name"] == "Juvenil Feminina"
        assert v["equipe_name"] == "AVA"
        assert v["season"] == "2026"
        assert v["comp_phase"] == "Semifinal"

    def test_video_in_list(self, s, test_video):
        r = s.get(f"{API}/videos")
        ids = [v["id"] for v in r.json()]
        assert test_video["id"] in ids


# -------------------- Actions inherit video meta --------------------
class TestActionInheritance:
    def test_action_inherits_video_context(self, s, ctx, test_video):
        fund = next(f for f in ctx["funds"] if f["name"] == "Saque")
        cls = next(c for c in ctx["classes"] if c["fundamento_id"] == fund["id"] and c["label"] == "Ace")
        r = s.post(f"{API}/actions", json={
            "video_id": test_video["id"], "timestamp": 10.0,
            "fundamento_id": fund["id"], "fundamento_name": fund["name"],
            "classificacao_id": cls["id"], "classificacao_label": cls["label"],
            "athlete_ids": [], "phase": "K1", "formation": "P1",
        })
        assert r.status_code == 200
        a = r.json()
        assert a["categoria_name"] == "Juvenil Feminina"
        assert a["equipe_name"] == "AVA"
        assert a["season"] == "2026"
        assert a["competition"] == "TEST_Camp"
        assert a["comp_phase"] == "Semifinal"

        # verify via GET
        r = s.get(f"{API}/actions", params={"video_id": test_video["id"]})
        assert r.status_code == 200
        acts = r.json()
        assert len(acts) >= 1
        assert acts[0]["categoria_name"] == "Juvenil Feminina"
        s.delete(f"{API}/actions/{a['id']}")

    def test_update_video_propagates_to_actions(self, s, ctx, test_video):
        fund = next(f for f in ctx["funds"] if f["name"] == "Ataque")
        r = s.post(f"{API}/actions", json={
            "video_id": test_video["id"], "timestamp": 20.0,
            "fundamento_id": fund["id"], "fundamento_name": fund["name"],
            "athlete_ids": [],
        })
        aid = r.json()["id"]
        # change video category
        new_cat = next(c for c in ctx["cats"] if c["name"] == "Adulta Masculina")
        r = s.put(f"{API}/videos/{test_video['id']}", json={
            **{k: test_video.get(k) for k in ["title", "source_type", "youtube_id", "equipe_id", "equipe_name",
                                              "competition", "season", "comp_phase", "match_date", "status"]},
            "categoria_id": new_cat["id"], "categoria_name": new_cat["name"],
        })
        assert r.status_code == 200
        # verify action updated
        r = s.get(f"{API}/actions", params={"video_id": test_video["id"]})
        acts = r.json()
        assert any(a["id"] == aid and a["categoria_name"] == "Adulta Masculina" for a in acts)
        s.delete(f"{API}/actions/{aid}")


# -------------------- Stats --------------------
class TestStats:
    def test_stats_shape(self, s):
        r = s.get(f"{API}/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "por_fundamento", "por_situacao", "por_formacao",
                  "por_atleta", "por_categoria", "zonas_quadra", "partidas"]:
            assert k in d, f"missing {k}"

    def test_stats_filter_categoria(self, s):
        r = s.get(f"{API}/stats", params={"categoria_name": "Mirim Masculina"})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1  # demo seeded
        # all categories in por_categoria should be the filtered one (or '—')
        keys = set(d["por_categoria"].keys())
        assert keys.issubset({"Mirim Masculina"})

    def test_stats_filter_season(self, s):
        r = s.get(f"{API}/stats", params={"season": "2025"})
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1


# -------------------- Athlete summary --------------------
class TestAthleteSummary:
    def test_summary_shape(self, s, ctx):
        if not ctx["aths"]:
            pytest.skip("no athletes seeded")
        aid = ctx["aths"][0]["id"]
        r = s.get(f"{API}/athletes/{aid}/summary")
        assert r.status_code == 200
        d = r.json()
        for k in ["athlete", "categorias", "por_categoria", "evolucao", "geral"]:
            assert k in d
        assert isinstance(d["evolucao"], list)
        assert isinstance(d["categorias"], list)


# -------------------- Compare --------------------
class TestCompare:
    def test_compare_two_categories(self, s):
        r = s.post(f"{API}/compare", json={"groups": [
            {"label": "Adulto", "filters": {"categoria_name": "Adulto"}},
            {"label": "Mirim M", "filters": {"categoria_name": "Mirim Masculina"}},
        ]})
        assert r.status_code == 200
        d = r.json()
        assert "groups" in d and len(d["groups"]) == 2
        for g in d["groups"]:
            assert "stats" in g and "total" in g["stats"]


# -------------------- AI analyze --------------------
class TestAI:
    def test_ai_analyze_portuguese(self, s):
        r = s.post(f"{API}/ai/analyze", json={
            "question": "Como está o aproveitamento no saque?",
            "filters": {"categoria_name": "Adulto"},
        }, timeout=60)
        if r.status_code == 502:
            pytest.skip("AI unavailable (502)")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "answer" in d and isinstance(d["answer"], str) and len(d["answer"]) > 20
        assert "n_actions" in d
        assert "stats" in d and "total" in d["stats"]
