import importlib.util
import json
import tempfile
import os
from pathlib import Path
import subprocess
import sys
import unittest
from urllib.error import HTTPError
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("staging_pilot", Path(__file__).with_name("staging-pilot.py"))
pilot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pilot)


class WatchdogPreflightTest(unittest.TestCase):
    def setUp(self):
        self.worker = {
            "metadata": {"name": pilot.WORKER},
            "spec": {"template": {"spec": {"containers": [{"image": pilot.WORKER_IMAGE}]}}},
            "status": {"conditions": [{"type": "Ready", "status": "True"}]},
        }

    def assert_refuses(self, responses, message):
        with (patch.dict(os.environ, {}, clear=False),
              patch.object(sys, "argv", ["staging-pilot.py", "watchdog"]),
              patch.object(pilot, "load_config", return_value=Path("staging.json")),
              patch.object(pilot, "cloud_json", side_effect=responses),
              patch.object(pilot.tempfile, "TemporaryDirectory") as directory,
              patch.object(pilot, "step") as step):
            with self.assertRaisesRegex(RuntimeError, message):
                pilot.main()
            directory.assert_not_called()
            step.assert_not_called()

    def test_missing_worker(self):
        not_found = subprocess.CalledProcessError(1, ["gcloud"], stderr="NOT_FOUND")
        self.assert_refuses([not_found], "worker is missing")

    def test_missing_invoker_binding(self):
        self.assert_refuses([self.worker, {"bindings": []}], "does not exactly match")

    def test_public_invoker(self):
        members = sorted(pilot.WORKER_INVOKERS | {"allUsers"})
        self.assert_refuses(
            [self.worker, {"bindings": [{"role": "roles/run.invoker", "members": members}]}],
            "does not exactly match",
        )

    def test_exact_private_invokers(self):
        policy = {"bindings": [{"role": "roles/run.invoker", "members": sorted(pilot.WORKER_INVOKERS)}]}
        with patch.object(pilot, "cloud_json", side_effect=[self.worker, policy]) as cloud:
            pilot.verify_private_worker()
            self.assertEqual([call.args[2] for call in cloud.call_args_list], ["describe", "get-iam-policy"])


class RepositoryAndQueueTest(unittest.TestCase):
    def test_absence_formats(self):
        from artifact_repository import resource_absent
        cases = ["ERROR: Cannot find service [stg-fake-worker]",
                 "ERROR: NOT_FOUND", "urllib.error.HTTPError: HTTP Error 404: Not Found",
                 "HTTP 404", "HTTP/1.1 404 Not Found", "object not found: 404."]
        for message in cases:
            with self.subTest(message=message):
                self.assertTrue(resource_absent(message))
        self.assertFalse(resource_absent("HTTP Error 403: Forbidden"))

    def test_probe_queues_are_unique_and_persisted_before_creation(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "staging.json"
            config.write_text("{}", encoding="utf-8")
            def verify_command(command):
                saved = json.loads(config.read_text(encoding="utf-8"))
                self.assertIn(command[5], [saved["authProbeQueue"], saved["exhaustProbeQueue"]])
            with (patch.dict(os.environ, {"STAGING_GCLOUD_PY": "gcloud.py"}),
                  patch.object(pilot, "load_config", return_value=config),
                  patch.object(pilot, "step", side_effect=verify_command) as step):
                pilot.provision_probe_queues()
                first = json.loads(config.read_text(encoding="utf-8"))
                pilot.provision_probe_queues()
                second = json.loads(config.read_text(encoding="utf-8"))
            self.assertEqual(step.call_count, 4)
            self.assertNotEqual(first["authProbeQueue"], second["authProbeQueue"])
            self.assertNotEqual(first["exhaustProbeQueue"], second["exhaustProbeQueue"])


class StructuredTeardownTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("teardown_pilot", Path(__file__).with_name("teardown-pilot.py"))
        self.teardown = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.teardown)
        self.url = "https://artifactregistry.googleapis.com/v1/projects/staging/locations/us/repositories/example"

    def test_404_is_absent_regardless_of_message(self):
        def missing(*args, **kwargs):
            raise HTTPError(self.url, 404, "a different message", {}, None)
        self.assertFalse(self.teardown.resource_present(self.url, "fake", opener=missing))

    def test_403_and_500_do_not_count_as_absence(self):
        for status in (403, 500):
            with self.subTest(status=status):
                def denied(*args, **kwargs):
                    raise HTTPError(self.url, status, "NOT_FOUND", {}, None)
                with self.assertRaises(HTTPError) as raised:
                    self.teardown.resource_present(self.url, "fake", opener=denied)
                self.assertEqual(raised.exception.code, status)

    def test_delete_is_followed_by_exact_readback(self):
        calls = []
        values = iter((True, False))
        def exists(url):
            calls.append(("GET", url))
            return next(values)
        self.teardown.check_exact_resource(
            lambda *args: calls.append(("DELETE", args)), exists, self.url, ("exact", "name")
        )
        self.assertEqual(calls, [("GET", self.url), ("DELETE", ("exact", "name")), ("GET", self.url)])

    def test_resource_still_present_fails(self):
        with self.assertRaisesRegex(RuntimeError, "still exists"):
            self.teardown.check_exact_resource(lambda *args: None, lambda url: True, self.url, ("exact", "name"))


if __name__ == "__main__":
    unittest.main()
