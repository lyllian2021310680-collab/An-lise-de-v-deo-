"""Iteration 4 backend tests — remove-point (reopen/detach/delete), reattach, video original."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    for line in open("/app/frontend/.env"):
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture
def video_id(s):
    r = s.post(f"{API}/videos", json={"title": "TEST_Iter4 RemovePoint", "opponent": "TEST_Adv", "team": "AVA",
                                      "source_type": "youtube", "youtube_id": "aqz-KE-bpKQ", "status": "em_analise"})
    assert r.status_code == 200, r.text
    vid = r.json()["id"]
    yield vid
    for a in s.get(f"{API}/actions", params={"video_id": vid}).json():
        s.delete(f"{API}/actions/{a['id']}")
    for rl in s.get(f"{API}/rallies", params={"video_id": vid}).json():
        s.delete(f"{API}/rallies/{rl['id']}")
    s.delete(f"{API}/videos/{vid}")


def mk_action(s, vid, ts):
    funds = s.get(f"{API}/fundamentos").json()
    r = s.post(f"{API}/actions", json={"video_id": vid, "timestamp": float(ts), "fundamento_id": funds[0]["id"],
                                       "fundamento_name": funds[0]["name"], "athlete_ids": [], "clip_before": 5,
                                       "clip_after": 4, "annotations": [], "team": "nos"})
    assert r.status_code == 200, r.text
    return r.json()


def close(s, vid, winner):
    r = s.post(f"{API}/rallies/close-point", json={"video_id": vid, "winner": winner, "set_number": 1})
    assert r.status_code == 200, r.text
    return r.json()


def actions(s, vid):
    return {a["id"]: a for a in s.get(f"{API}/actions", params={"video_id": vid}).json()}


def rallies(s, vid):
    return s.get(f"{API}/videos/{vid}/rallies-full").json()


# remove-point: 404 / invalid mode
def test_remove_unknown_404(s):
    r = s.post(f"{API}/rallies/does-not-exist/remove-point", json={"actions_mode": "reopen"})
    assert r.status_code == 404


def test_remove_invalid_mode_400(s, video_id):
    rl = close(s, video_id, "nos")
    r = s.post(f"{API}/rallies/{rl['id']}/remove-point", json={"actions_mode": "xxx"})
    assert r.status_code == 400


# remove-point reopen + renumber/recalc
def test_remove_reopen_and_renumber(s, video_id):
    a1 = mk_action(s, video_id, 10)
    r1 = close(s, video_id, "nos")
    r2 = close(s, video_id, "adv")
    r3 = close(s, video_id, "nos")
    res = s.post(f"{API}/rallies/{r1['id']}/remove-point", json={"actions_mode": "reopen"})
    assert res.status_code == 200, res.text
    j = res.json()
    assert j["removed_number"] == 1 and j["n_actions"] == 1
    a = actions(s, video_id)[a1["id"]]
    assert a["rally_id"] is None and a.get("detached") is False
    rs = rallies(s, video_id)
    assert [x["number"] for x in rs] == [1, 2]
    assert [x["id"] for x in rs] == [r2["id"], r3["id"]]
    assert rs[0]["score_before"] == {"nos": 0, "adv": 0} and rs[0]["score_after"] == {"nos": 0, "adv": 1}
    assert rs[1]["score_after"] == {"nos": 1, "adv": 1}
    assert rs[0]["label"] == "Rally 1"
    # reopened action is absorbed by next close-point
    r4 = close(s, video_id, "adv")
    assert a1["id"] in r4["action_ids"]
    assert r4["number"] == 3


# remove-point detach: not absorbed by next close-point; attach resets
def test_remove_detach_and_reattach(s, video_id):
    a1 = mk_action(s, video_id, 20)
    r1 = close(s, video_id, "nos")
    res = s.post(f"{API}/rallies/{r1['id']}/remove-point", json={"actions_mode": "detach"})
    assert res.status_code == 200
    a = actions(s, video_id)[a1["id"]]
    assert a["rally_id"] is None and a["detached"] is True
    r2 = close(s, video_id, "adv")
    assert a1["id"] not in r2["action_ids"]
    assert r2["number"] == 1 and r2["score_after"] == {"nos": 0, "adv": 1}
    at = s.patch(f"{API}/actions/{a1['id']}/attach")
    assert at.status_code == 200 and at.json()["detached"] is False
    r3 = close(s, video_id, "nos")
    assert a1["id"] in r3["action_ids"]


# remove-point delete needs confirmation
def test_remove_delete_requires_confirm(s, video_id):
    a1 = mk_action(s, video_id, 30)
    r1 = close(s, video_id, "nos")
    res = s.post(f"{API}/rallies/{r1['id']}/remove-point", json={"actions_mode": "delete"})
    assert res.status_code == 409
    assert a1["id"] in actions(s, video_id)
    assert len(rallies(s, video_id)) == 1
    res = s.post(f"{API}/rallies/{r1['id']}/remove-point", json={"actions_mode": "delete", "confirm_delete": True})
    assert res.status_code == 200
    assert a1["id"] not in actions(s, video_id)
    assert rallies(s, video_id) == []


def test_remove_delete_no_actions_no_confirm_ok(s, video_id):
    r1 = close(s, video_id, "nos")
    res = s.post(f"{API}/rallies/{r1['id']}/remove-point", json={"actions_mode": "delete"})
    assert res.status_code == 200
    assert rallies(s, video_id) == []


# attach / original 404 + set original
def test_attach_unknown_404(s):
    assert s.patch(f"{API}/actions/nope/attach").status_code == 404


def test_set_video_original(s, video_id):
    r = s.patch(f"{API}/videos/{video_id}/original", json={"storage_path": "TEST/path.mp4"})
    assert r.status_code == 200 and r.json()["original_storage_path"] == "TEST/path.mp4"
    g = s.get(f"{API}/videos/{video_id}").json()
    assert g["original_storage_path"] == "TEST/path.mp4"
    assert s.patch(f"{API}/videos/nope/original", json={"storage_path": "x"}).status_code == 404
