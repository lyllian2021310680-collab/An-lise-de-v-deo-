"""Tests for the new additive features: athlete external_id and integration layer."""
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


class TestAthleteExternalId:
    def test_create_with_external_id_and_persist(self, s):
        payload = {"name": "TEST_ExtIdAtleta", "number": "88", "external_id": "EXT-123"}
        r = s.post(f"{API}/athletes", json=payload)
        assert r.status_code == 200
        a = r.json()
        aid = a["id"]
        assert a.get("external_id") == "EXT-123"
        # GET
        g = s.get(f"{API}/athletes/{aid}")
        assert g.status_code == 200
        assert g.json().get("external_id") == "EXT-123"
        # Update external_id
        u = s.put(f"{API}/athletes/{aid}", json={"name": "TEST_ExtIdAtleta", "number": "88", "external_id": "EXT-456"})
        assert u.status_code == 200
        assert u.json().get("external_id") == "EXT-456"
        # cleanup
        s.delete(f"{API}/athletes/{aid}")

    def test_create_without_external_id_is_optional(self, s):
        r = s.post(f"{API}/athletes", json={"name": "TEST_NoExt", "number": "77"})
        assert r.status_code == 200
        a = r.json()
        # field exists (None/null) or missing — both acceptable for optional
        assert a.get("external_id") in (None, "", "null")
        s.delete(f"{API}/athletes/{a['id']}")


class TestIntegrationLayer:
    def test_status(self, s):
        r = s.get(f"{API}/integration/status")
        assert r.status_code == 200
        d = r.json()
        assert d.get("enabled") is False
        assert d.get("mode") == "local"

    def test_pull_athletes_noop(self, s):
        r = s.post(f"{API}/integration/pull-athletes", json={})
        assert r.status_code == 200
        d = r.json()
        # No-op shape: shouldn't 500
        assert isinstance(d, dict)

    def test_push_analyses_noop(self, s):
        # fetch any athlete to use
        aths = s.get(f"{API}/athletes").json()
        assert aths, "need at least 1 athlete seeded"
        r = s.post(f"{API}/integration/push-analyses", json={"athlete_id": aths[0]["id"]})
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)
        assert d.get("pushed") is False
        assert d.get("connected") is False
