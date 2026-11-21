"""Run the staging deployment and tests under deadlines, then always attempt teardown."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

PROJECT = "pitchproof-stg-pilot2"

def run(argv, seconds):
    process = subprocess.Popen(argv)
    try:
        return process.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           timeout=15, check=False, stdout=subprocess.DEVNULL)
        else:
            process.kill()
        process.wait(timeout=15)
        return 124
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=15)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan")
    args = parser.parse_args()
    with open(args.plan, encoding="utf-8") as stream:
        plan = json.load(stream)
    if plan["project"] != PROJECT:
        parser.error("only pitchproof-stg-pilot2 is supported")
    steps = [(plan[name]["argv"], plan[name]["seconds"])
             for name in ("deploy", "test")]
    steps.append(([sys.executable, str(Path(__file__).with_name("teardown-pilot.py"))], 900))
    for (_, seconds), maximum in zip(steps, (1800, 5400, 900)):
        if not isinstance(seconds, int) or not 0 < seconds <= maximum:
            parser.error("deadline outside allowed range")
    tests_started = False
    try:
        status = run(*steps[0])
        if status == 0:
            tests_started = True
            status = run(*steps[1])
    finally:
        if tests_started:
            steps[2][0].append("--synthetic-data")
        cleanup = run(*steps[2])
        if cleanup:
            print(f"Teardown failed (exit {cleanup}). Check cloud resources immediately.",
                  file=sys.stderr)
    return cleanup or status

if __name__ == "__main__":
    raise SystemExit(main())
