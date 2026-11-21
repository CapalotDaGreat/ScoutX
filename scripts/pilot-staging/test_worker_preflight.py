import importlib.util
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


if __name__ == "__main__":
    unittest.main()
