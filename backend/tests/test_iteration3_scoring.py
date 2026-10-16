"""Iteration 3 backend tests — Scoring (close-point, rallies-full, winner recalc)."""
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
def video_id(s):
    """Create a dedicated test video so we don't pollute the demo set."""
    payload = {
        "title": "TEST_Iter3 Scoring Match",
        "opponent": "TEST_Adv",
        "team": "AVA",
        "source_type": "youtube",
        "youtube_id": "aqz-KE-bpKQ",
        "status": "em_analise",
    }
    r = s.post(f"{API}/videos", json=payload)
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    yield vid
    # cleanup: soft-delete video; also delete any rallies created
    s.delete(f"{API}/videos/{vid}")


def _make_action(s, video_id, ts, fund_name="Saque"):
    # fetch an existing fundamento id
    funds = s.get(f"{API}/fundamentos").json()
    fid = next((f["id"] for f in funds if f["name"] == fund_name), funds[0]["id"])
    body = {
        "video_id": video_id,
        "timestamp": float(ts),
        "fundamento_id": fid,
        "fundamento_name": fund_name,
        "athlete_ids": [],
        "clip_before": 5,
        "clip_after": 4,
        "annotations": [],
        "team": "nos",
    }
    r = s.post(f"{API}/actions", json=body)
    assert r.status_code == 200, r.text
    return r.json()


class TestScoring:
    def test_close_point_requires_valid_winner(self, s, video_id):
        r = s.post(
            f"{API}/rallies/close-point",
            json={"video_id": video_id, "winner": "x", "set_number": 1},
        )
        assert r.status_code == 400

    def test_close_point_increments_score(self, s, video_id):
        # action 1 -> close as point "nos"
        _make_action(s, video_id, 10)
        r1 = s.post(
            f"{API}/rallies/close-point",
            json={
                "video_id": video_id,
                "winner": "nos",
                "set_number": 1,
                "serving_team": "adv",
            },
        )
        assert r1.status_code == 200, r1.text
        rally1 = r1.json()
        assert rally1["winner"] == "nos"
        assert rally1["number"] == 1
        assert rally1["score_after"] == {"nos": 1, "adv": 0}
        assert rally1["score_before"] == {"nos": 0, "adv": 0}

        # action 2 -> point "adv"
        _make_action(s, video_id, 25)
        r2 = s.post(
            f"{API}/rallies/close-point",
            json={
                "video_id": video_id,
                "winner": "adv",
                "set_number": 1,
                "serving_team": "nos",
            },
        )
        assert r2.status_code == 200
        rally2 = r2.json()
        assert rally2["number"] == 2
        assert rally2["score_after"] == {"nos": 1, "adv": 1}

        # action 3 -> point "nos" set 2 (should restart per set)
        _make_action(s, video_id, 40)
        r3 = s.post(
            f"{API}/rallies/close-point",
            json={
                "video_id": video_id,
                "winner": "nos",
                "set_number": 2,
                "serving_team": "nos",
            },
        )
        assert r3.status_code == 200
        rally3 = r3.json()
        assert rally3["set_number"] == 2
        assert rally3["score_after"] == {"nos": 1, "adv": 0}

    def test_rallies_full_returns_actions_and_scores(self, s, video_id):
        r = s.get(f"{API}/videos/{video_id}/rallies-full")
        assert r.status_code == 200
        rallies = r.json()
        assert len(rallies) >= 3
        for rally in rallies:
            assert "actions" in rally
            assert "score_after" in rally
            assert "score_before" in rally
        assert rallies[0]["number"] == 1
        # ensure ordering
        nums = [r["number"] for r in rallies]
        assert nums == sorted(nums)

    def test_change_winner_recalcs_scores(self, s, video_id):
        rallies = s.get(f"{API}/videos/{video_id}/rallies-full").json()
        first = rallies[0]
        orig_winner = first["winner"]
        new_winner = "adv" if orig_winner == "nos" else "nos"
        r = s.put(
            f"{API}/rallies/{first['id']}/winner",
            json={"winner": new_winner},
        )
        assert r.status_code == 200
        updated = r.json()
        assert updated["winner"] == new_winner
        # verify set-1 scores recalculated. rally2 was in set 1 originally with winner adv.
        full = s.get(f"{API}/videos/{video_id}/rallies-full").json()
        set1 = [x for x in full if (x.get("set_number") or 1) == 1]
        # final set-1 score after both rallies
        if len(set1) >= 2:
            last_s1 = set1[-1]
            # Originally nos=1, adv=1. After flipping first to adv: adv=2, nos=0
            if new_winner == "adv":
                assert last_s1["score_after"]["adv"] == 2
                assert last_s1["score_after"]["nos"] == 0


class TestSuggestPhase:
    def test_suggest_saque_model_b(self, s):
        r = s.post(
            f"{API}/suggest-phase",
            json={"model": "B", "fundamento_name": "Saque", "team": "nos", "serving_team": "nos"},
        )
        assert r.status_code == 200
        assert r.json().get("phase") == "K0"

    def test_suggest_reception_receiving(self, s):
        r = s.post(
            f"{API}/suggest-phase",
            json={
                "model": "B",
                "fundamento_name": "Recepção",
                "team": "nos",
                "serving_team": "adv",
                "prior": [],
            },
        )
        assert r.status_code == 200
        assert r.json().get("phase") == "K1"
