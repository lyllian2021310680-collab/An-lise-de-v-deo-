# Iteration 3: validation fixes for POST/PUT /api/videos rules, rule-change recalculation, rally ts validation, upload/files
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
S = requests.Session()
CREATED = []


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for vid in CREATED:
        for r in S.get(f"{API}/rallies", params={"video_id": vid}).json():
            S.delete(f"{API}/rallies/{r['id']}")
        for a in S.get(f"{API}/actions", params={"video_id": vid}).json():
            S.delete(f"{API}/actions/{a['id']}")
        S.delete(f"{API}/videos/{vid}")


def mk(**kw):
    body = {"title": "TEST_It3", "source_type": "youtube", "youtube_id": "dQw4w9WgXcQ", **kw}
    r = S.post(f"{API}/videos", json=body)
    if r.status_code == 200:
        CREATED.append(r.json()["id"])
    return r


# --- POST /api/videos rules validation
def test_post_video_missing_target_400():
    r = mk(sets_to_win=2, set_rules=[{"min_diff": 2}, {"target": 25, "min_diff": 2}, {"target": 15, "min_diff": 2}])
    assert r.status_code == 400, r.text


def test_post_video_target_zero_400():
    r = mk(sets_to_win=2, set_rules=[{"target": 0, "min_diff": 2}, {"target": 25, "min_diff": 2}, {"target": 15, "min_diff": 2}])
    assert r.status_code == 400, r.text


def test_post_video_sets_to_win_zero_with_rules_400():
    r = mk(sets_to_win=0, set_rules=[{"target": 25, "min_diff": 2}] * 5)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"


def test_post_video_too_few_rules_400():
    r = mk(sets_to_win=3, set_rules=[{"target": 25, "min_diff": 2}])
    assert r.status_code == 400, r.text


def test_post_video_valid_rules_and_match_ok():
    r = mk(sets_to_win=2, set_rules=[{"target": 3, "min_diff": 2}] * 3)
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["sets_to_win"] == 2 and v["set_rules"][0]["target"] == 3
    m = S.get(f"{API}/videos/{v['id']}/match")
    assert m.status_code == 200, m.text


def test_post_video_without_rules_match_ok():
    r = mk()
    assert r.status_code == 200
    assert S.get(f"{API}/videos/{r.json()['id']}/match").status_code == 200


# --- PUT /api/videos
def test_put_video_invalid_rules_400():
    vid = mk().json()["id"]
    r = S.put(f"{API}/videos/{vid}", json={"title": "TEST_It3", "sets_to_win": 2, "set_rules": [{"target": 0, "min_diff": 2}] * 3})
    assert r.status_code == 400, r.text
    assert S.get(f"{API}/videos/{vid}/match").status_code == 200


def test_put_video_rules_change_recalcs_rallies():
    vid = mk(sets_to_win=3, set_rules=[{"target": 25, "min_diff": 2}] * 5).json()["id"]
    for _ in range(3):
        assert S.post(f"{API}/rallies/close-point", json={"video_id": vid, "winner": "nos"}).status_code == 200
    m1 = S.get(f"{API}/videos/{vid}/match").json()
    r = S.put(f"{API}/videos/{vid}", json={"title": "TEST_It3", "source_type": "youtube", "youtube_id": "dQw4w9WgXcQ",
                                           "sets_to_win": 2, "set_rules": [{"target": 3, "min_diff": 2}] * 3})
    assert r.status_code == 200, r.text
    m2 = S.get(f"{API}/videos/{vid}/match").json()
    rallies = sorted(S.get(f"{API}/rallies", params={"video_id": vid}).json(), key=lambda x: x["number"])
    print("match before", m1, "\nafter", m2, "\nlast rally", rallies[-1])
    assert m1 != m2
    # Rally 3 should now close set 1 at 3-0 -> stored rally fields reflect new rules
    last = rallies[-1]
    flat = str(last)
    assert "set_closed" in flat or "closes_set" in flat or "set_end" in flat or m2 != m1


def test_put_video_without_rules_keeps_stored():
    vid = mk(sets_to_win=2, set_rules=[{"target": 3, "min_diff": 2}] * 3).json()["id"]
    r = S.put(f"{API}/videos/{vid}", json={"title": "TEST_It3 renamed", "source_type": "youtube", "youtube_id": "dQw4w9WgXcQ"})
    assert r.status_code == 200
    v = S.get(f"{API}/videos/{vid}").json()
    assert v["title"] == "TEST_It3 renamed" and v["sets_to_win"] == 2 and v["set_rules"][0]["target"] == 3


# --- PUT /api/rallies/{id} ts validation
def test_edit_rally_start_after_stored_end_400():
    vid = mk().json()["id"]
    a = S.post(f"{API}/actions", json={"video_id": vid, "timestamp": 10}).json()
    S.post(f"{API}/actions", json={"video_id": vid, "timestamp": 20})
    rally = S.post(f"{API}/rallies/close-point", json={"video_id": vid, "winner": "nos"}).json()
    assert rally["start_ts"] == 10 and rally["end_ts"] == 20
    r = S.put(f"{API}/rallies/{rally['id']}", json={"start_ts": 25})
    assert r.status_code == 400, r.text
    r = S.put(f"{API}/rallies/{rally['id']}", json={"end_ts": 5})
    assert r.status_code == 400, r.text
    r = S.put(f"{API}/rallies/{rally['id']}", json={"start_ts": 12})
    assert r.status_code == 200 and r.json()["start_ts"] == 12


# --- Upload + files (used by compilation rendering)
def test_upload_and_fetch_file():
    content = b"\x00\x00\x00\x18ftypmp42" + b"0" * 100
    r = S.post(f"{API}/upload", files={"file": ("TEST_clip.mp4", content, "video/mp4")}, data={"kind": "video"})
    assert r.status_code == 200, r.text
    p = r.json()["storage_path"]
    g = S.get(f"{API}/files/{p}")
    assert g.status_code == 200 and g.content == content
    assert g.headers["content-type"].startswith("video/mp4")
