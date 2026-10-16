# Iteration 2: configurable per-set scoring rules, match summary, review flags, rally editing
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()


def mk_video(title="TEST_SetRules"):
    r = S.post(f"{API}/videos", json={"title": title, "source_type": "youtube", "youtube_id": "dQw4w9WgXcQ", "opponent": "TEST_Adv"})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def pt(vid, winner, **kw):
    r = S.post(f"{API}/rallies/close-point", json={"video_id": vid, "winner": winner, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def match(vid):
    r = S.get(f"{API}/videos/{vid}/match")
    assert r.status_code == 200, r.text
    return r.json()


def rules(vid, stw, sets):
    return S.put(f"{API}/videos/{vid}/rules", json={"sets_to_win": stw, "set_rules": sets})


def score(vid, nos, adv):
    """Play nos then adv points in an interleaved way (no early close), ending with desired score."""
    seq = []
    a, b = 0, 0
    while a < nos or b < adv:
        if a < nos and (a <= b or b >= adv):
            seq.append("nos"); a += 1
        else:
            seq.append("adv"); b += 1
    return seq


@pytest.fixture
def vid():
    v = mk_video()
    yield v
    S.delete(f"{API}/videos/{v}")


R18 = [{"target": 18, "min_diff": 2}, {"target": 21, "min_diff": 2}, {"target": 18, "min_diff": 2}]


# ---- rules validation ----
class TestRulesValidation:
    def test_invalid_target(self, vid):
        assert rules(vid, 2, [{"target": 0, "min_diff": 2}] * 3).status_code == 400

    def test_invalid_min_diff(self, vid):
        assert rules(vid, 2, [{"target": 18, "min_diff": 0}] * 3).status_code == 400

    def test_fewer_sets_than_stw(self, vid):
        assert rules(vid, 3, [{"target": 18, "min_diff": 2}] * 2).status_code == 400

    def test_nonexistent_video(self):
        assert rules("nope-xyz", 2, R18).status_code == 404

    def test_valid_and_persisted(self, vid):
        r = rules(vid, 2, R18)
        assert r.status_code == 200, r.text
        assert r.json()["sets_to_win"] == 2
        m = match(vid)
        assert m["set_rules"] == R18 and m["sets_to_win"] == 2
        assert m["current_set"] == 1 and m["review_count"] == 0 and m["proposal_count"] == 0
        assert m["match_winner"] is None

    def test_default_rules(self, vid):
        m = match(vid)
        assert m["sets_to_win"] == 3 and len(m["set_rules"]) == 5
        assert m["set_rules"][0]["target"] == 25 and m["set_rules"][4]["target"] == 15


# ---- set end detection ----
class TestSetEnd:
    def test_18_16_closes(self, vid):
        rules(vid, 2, R18)
        for w in score(vid, 18, 16)[:-1]:
            pt(vid, w)
        # now 17x16 -> last point nos makes 18x16
        last = pt(vid, "nos")
        assert last["closes_set"] is True and last["set_number"] == 1
        m = match(vid)
        assert m["sets"][0]["finished"] and m["sets"][0]["winner"] == "nos"
        assert m["current_set"] == 2
        nxt = pt(vid, "adv")
        assert nxt["set_number"] == 2 and nxt["set_manual"] is False

    def test_18_17_continues_19_17_closes(self, vid):
        rules(vid, 2, R18)
        seq = score(vid, 17, 17)
        for w in seq:
            pt(vid, w)
        r = pt(vid, "nos")  # 18x17
        assert r["closes_set"] is False
        assert match(vid)["current_set"] == 1
        r = pt(vid, "nos")  # 19x17
        assert r["closes_set"] is True
        assert match(vid)["current_set"] == 2

    def test_20_20_continues(self, vid):
        rules(vid, 2, R18)
        for w in score(vid, 17, 17):
            pt(vid, w)
        for w in ["nos", "adv", "nos", "adv", "nos", "adv"]:  # 18-17,18-18,19-18,19-19,20-19,20-20
            r = pt(vid, w)
            assert r["closes_set"] is False
        m = match(vid)
        assert m["sets"][0]["nos"] == 20 and m["sets"][0]["adv"] == 20 and m["current_set"] == 1

    def test_pending_counts_no_point(self, vid):
        rules(vid, 2, R18)
        pt(vid, "nos")
        r = pt(vid, "pendente")
        assert r["needs_review"] is True
        assert r["score_after"] == {"nos": 1, "adv": 0}
        m = match(vid)
        assert m["review_count"] == 1 and m["sets"][0]["nos"] == 1

    def test_invalid_winner(self, vid):
        r = S.post(f"{API}/rallies/close-point", json={"video_id": vid, "winner": "xx"})
        assert r.status_code == 400


# ---- match winner ----
class TestMatchWinner:
    def test_best_of_3_winner_and_after_flag(self, vid):
        small = [{"target": 3, "min_diff": 2}] * 3
        assert rules(vid, 2, small).status_code == 200
        for _ in range(3):
            pt(vid, "nos")
        assert match(vid)["current_set"] == 2
        for _ in range(3):
            r = pt(vid, "nos")
        assert r["set_number"] == 2 and r["closes_set"]
        m = match(vid)
        assert m["sets_won"] == {"nos": 2, "adv": 0}
        assert m["match_winner"] == "nos" and m["match_finished"] is True
        extra = pt(vid, "adv")
        assert extra["needs_review"] is True
        assert any("fim da partida" in x for x in extra["review_reasons"]), extra["review_reasons"]


# ---- rules change after processing: flag, do not move ----
class TestRulesChangeAndReview:
    def _setup(self, vid):
        rules(vid, 2, [{"target": 3, "min_diff": 2}] * 3)
        for _ in range(3):
            pt(vid, "nos")  # set 1 closes 3x0
        a = pt(vid, "adv")  # set 2
        b = pt(vid, "adv")
        assert a["set_number"] == 2 and b["set_number"] == 2
        # change so set 1 needs 5 -> set 1 no longer finished
        r = rules(vid, 2, [{"target": 5, "min_diff": 2}] * 3)
        assert r.status_code == 200
        return a, b

    def _full(self, vid):
        return {x["number"]: x for x in S.get(f"{API}/videos/{vid}/rallies-full").json()}

    def test_flag_without_moving(self, vid):
        self._setup(vid)
        rs = self._full(vid)
        assert rs[4]["set_number"] == 2 and rs[4]["proposed_set"] == 1 and rs[4]["needs_review"]
        m = match(vid)
        assert m["proposal_count"] == 2 and m["review_count"] >= 2
        assert m["sets"][0]["finished"] is False

    def test_apply_proposed_sets(self, vid):
        self._setup(vid)
        r = S.post(f"{API}/videos/{vid}/apply-proposed-sets")
        assert r.status_code == 200
        assert r.json()["moved"] == 2
        rs = self._full(vid)
        assert rs[4]["set_number"] == 1 and rs[5]["set_number"] == 1
        m = match(vid)
        assert m["proposal_count"] == 0 and m["sets"][0]["nos"] == 3 and m["sets"][0]["adv"] == 2

    def test_keep_set_manual(self, vid):
        self._setup(vid)
        rs = self._full(vid)
        r = S.put(f"{API}/rallies/{rs[4]['id']}", json={"set_manual": True})
        assert r.status_code == 200
        d = r.json()
        assert d["set_manual"] is True and d["set_number"] == 2
        assert not any("pertence ao set" in x for x in d["review_reasons"])

    def test_set_number_edit_and_times(self, vid):
        self._setup(vid)
        rs = self._full(vid)
        r = S.put(f"{API}/rallies/{rs[1]['id']}", json={"set_number": 3})
        assert r.status_code == 200 and r.json()["set_number"] == 3 and r.json()["set_manual"] is True
        r = S.put(f"{API}/rallies/{rs[2]['id']}", json={"start_ts": 10.5, "end_ts": 20})
        assert r.status_code == 200 and r.json()["start_ts"] == 10.5 and r.json()["end_ts"] == 20
        r = S.put(f"{API}/rallies/{rs[2]['id']}", json={"start_ts": 30, "end_ts": 20})
        assert r.status_code == 400

    def test_edit_rally_404(self):
        assert S.put(f"{API}/rallies/nope-xyz", json={"note": "x"}).status_code == 404


# ---- winner edit ----
class TestWinnerEdit:
    def test_winner_change_recalc(self, vid):
        rules(vid, 2, R18)
        a = pt(vid, "nos")
        pt(vid, "nos")
        r = S.put(f"{API}/rallies/{a['id']}/winner", json={"winner": "adv"})
        assert r.status_code == 200 and r.json()["winner"] == "adv"
        m = match(vid)
        assert m["sets"][0]["nos"] == 1 and m["sets"][0]["adv"] == 1
        r = S.put(f"{API}/rallies/{a['id']}/winner", json={"winner": "pendente"})
        assert r.status_code == 200
        m = match(vid)
        assert m["sets"][0]["nos"] == 1 and m["sets"][0]["adv"] == 0 and m["review_count"] == 1
        assert S.put(f"{API}/rallies/{a['id']}/winner", json={"winner": "zz"}).status_code == 400
