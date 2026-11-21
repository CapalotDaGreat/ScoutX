import importlib.util
import json
import tempfile
import os
from pathlib import Path
import subprocess
import sys
import unittest
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


if __name__ == "__main__":
    unittest.main()
