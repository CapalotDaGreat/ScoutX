#!/usr/bin/env python3
"""Resumable single-owner L4 capacity search for PitchProof (GPU-3 envelope). One VM at most, never a duplicate.

  python3 gpu_search.py status                     # print state and remaining limits
  python3 gpu_search.py run --max-runtime-min 110  # attempt within the envelope; exits by itself (no orphan loop)
  python3 gpu_search.py stop "reason"              # durable stop: no further attempt by any controller
  python3 gpu_search.py resume                     # after a session is closed and verified empty: search again
  python3 gpu_search.py dry-run                    # full logic with the create call replaced (no cloud writes)

Everything durable lives next to this file: envelope.json (the approved limits, read-only to the controller),
state.json (attempts, next zone, session count), STOP (stop flag), lock (flock; single owner), attempts.jsonl.
The startup script is verified against the SHA-256 recorded in envelope.json before every create, so a moved branch
can never change what an unattended retry launches.
"""
import fcntl, hashlib, json, os, random, subprocess, sys, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

D = Path(__file__).resolve().parent
ENV, STATE, STOP, LOG = D / "envelope.json", D / "state.json", D / "STOP", D / "attempts.jsonl"
STOCKOUT = ("ZONE_RESOURCE_POOL_EXHAUSTED", "does not have enough resources", "currently unavailable", "STOCKOUT")
now = lambda: datetime.now(timezone.utc)
iso = lambda t: t.strftime("%Y-%m-%dT%H:%M:%SZ")


def gc(*args, timeout=300):
    env = {k: v for k, v in os.environ.items() if k != "CLOUDSDK_AUTH_ACCESS_TOKEN"}
    p = subprocess.run(["gcloud", *args, f"--project={E['project']}"], capture_output=True, text=True, timeout=timeout, env=env)
    return p.returncode, p.stdout, p.stderr


def load(p, default):
    return json.loads(p.read_text()) if p.exists() else default


def save_state(s):
    tmp = STATE.with_suffix(".tmp"); tmp.write_text(json.dumps(s, indent=1)); os.replace(tmp, STATE)


def log(rec):
    rec["at"] = iso(now())
    with LOG.open("a") as f: f.write(json.dumps(rec) + "\n")
    print(json.dumps(rec), flush=True)


def inventory():
    """All instances and disks in the project, plus unfinished operations. Any error -> treat as unknown (no create)."""
    r1, o1, e1 = gc("compute", "instances", "list", "--format=json")
    r2, o2, e2 = gc("compute", "disks", "list", "--format=json")
    r3, o3, e3 = gc("compute", "operations", "list", "--filter=status!=DONE", "--format=json")
    if r1 or r2 or r3:
        return None
    return {"instances": [i["name"] for i in json.loads(o1)], "disks": [d["name"] for d in json.loads(o2)],
            "pendingOps": [o.get("name") for o in json.loads(o3)]}


def limits_left(s):
    start = s.get("windowStart")
    end = (datetime.fromisoformat(start.replace("Z", "+00:00")) + timedelta(hours=E["searchWindowHours"])) if start else None
    return {"attemptsLeft": E["maxAttempts"] - s["attempts"], "sessionsLeft": E["maxBillableSessions"] - s["sessions"],
            "windowEnd": iso(end) if end else "starts at first attempt", "windowOver": bool(end and now() >= end),
            "spentUsdEstimate": s["spentUsdEstimate"], "budgetLeftUsd": round(E["aggregateCeilingUsd"] - s["spentUsdEstimate"], 2)}


def status():
    s = load(STATE, None); print(json.dumps({"envelope": E.get("id"), "approved": E.get("approved"), "state": s,
                                             "limits": limits_left(s) if s else None, "stopFlag": STOP.read_text() if STOP.exists() else None}, indent=1))


def run(max_minutes, dry):
    lockf = open(D / "lock", "w")
    try: fcntl.flock(lockf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: sys.exit("another controller owns the search (lock held); not starting a second one")
    lockf.write(f"{os.getpid()} {iso(now())}\n"); lockf.flush()
    if E.get("approved") is not True and not dry:
        sys.exit("envelope not approved; nothing attempted")
    s = load(STATE, {"attempts": 0, "rounds": 0, "nextZone": 0, "sessions": 0, "spentUsdEstimate": 0.0, "windowStart": None,
                     "lastAttemptAt": None, "outcome": "searching", "vm": None})
    if s["outcome"] not in ("searching",):
        sys.exit(f"state is {s['outcome']}; the controller only searches (resume after the session is closed)")
    deadline = time.time() + max_minutes * 60
    zones, gap, rgap, jit = E["zones"], E["minSpacingSec"], E["roundGapSec"], E["jitterSec"]
    while True:
        if STOP.exists(): log({"event": "stopped", "reason": STOP.read_text().strip()}); s["outcome"] = "stopped"; save_state(s); return
        L = limits_left(s)
        if L["windowOver"] or L["attemptsLeft"] <= 0 or L["sessionsLeft"] <= 0 or L["budgetLeftUsd"] < E["perSessionCeilingUsd"]:
            log({"event": "envelope_exhausted", **L}); s["outcome"] = "envelope_exhausted"; save_state(s); return
        # spacing: per attempt, and a longer pause after a complete round
        wait = gap + random.uniform(0, jit) + (rgap if s["nextZone"] == 0 and s["attempts"] else 0)
        if s["lastAttemptAt"]:
            due = datetime.fromisoformat(s["lastAttemptAt"].replace("Z", "+00:00")).timestamp() + wait
            if due - time.time() > 0:
                if due > deadline:
                    log({"event": "runtime_slice_over", "nextDueUtc": iso(datetime.fromtimestamp(due, timezone.utc)), **L}); save_state(s); return
                time.sleep(due - time.time()); continue  # re-check STOP and limits after sleeping
        if time.time() > deadline:
            log({"event": "runtime_slice_over", **L}); save_state(s); return
        inv = {"instances": [], "disks": [], "pendingOps": []} if dry else inventory()
        if inv is None or inv["instances"] or inv["pendingOps"]:
            log({"event": "precheck_blocked", "inventory": inv}); s["outcome"] = "blocked_needs_review"; save_state(s); return
        if inv["disks"]:
            log({"event": "precheck_blocked_disks", "inventory": inv}); s["outcome"] = "blocked_needs_review"; save_state(s); return
        zone = zones[s["nextZone"]]
        spec = E["startupScripts"][s["sessions"]]  # session 1 script, then session 2 script
        script = D / spec["file"]
        if hashlib.sha256(script.read_bytes()).hexdigest() != spec["sha256"]:
            log({"event": "startup_script_hash_mismatch"}); s["outcome"] = "blocked_needs_review"; save_state(s); return
        zscript = D / f"startup-{zone}.sh"; zscript.write_text(script.read_text().replace("__ZONE__", zone))
        s["windowStart"] = s["windowStart"] or iso(now()); s["attempts"] += 1; s["lastAttemptAt"] = iso(now())
        save_state(s)  # the attempt is counted before the call, so a crash mid-call cannot hide it
        args = ["compute", "instances", "create", E["vmName"], f"--zone={zone}", f"--machine-type={E['machine']}",
                "--accelerator=type=nvidia-l4,count=1", "--maintenance-policy=TERMINATE", "--provisioning-model=STANDARD",
                f"--image={E['image']}", "--image-project=deeplearning-platform-release", f"--boot-disk-size={E['diskGb']}GB",
                "--boot-disk-type=pd-balanced", "--boot-disk-auto-delete", "--scopes=cloud-platform",
                "--metadata=install-nvidia-driver=True", f"--metadata-from-file=startup-script={zscript}",
                f"--max-run-duration={E['maxLifetimeMin']}m", "--instance-termination-action=DELETE",
                f"--labels=purpose=pitchproof-gpu-validation,run={E['id']}"]
        if dry:
            rc, out, err = 1, "", "DRY RUN: ZONE_RESOURCE_POOL_EXHAUSTED (simulated)"
        else:
            try: rc, out, err = gc(*args, timeout=600)
            except subprocess.TimeoutExpired: rc, out, err = -1, "", "create call timed out"
        (D / "create-logs").mkdir(exist_ok=True)
        (D / "create-logs" / f"{s['attempts']:04d}-{zone}.txt").write_text(out + err)
        if rc == 0:
            s["outcome"] = "vm_created"; s["vm"] = {"name": E["vmName"], "zone": zone, "createdAt": iso(now())}; s["sessions"] += 1
            s["spentUsdEstimate"] = round(s["spentUsdEstimate"] + E["perSessionCeilingUsd"], 2)  # reserve the session ceiling
            log({"event": "created", "n": s["attempts"], "zone": zone}); save_state(s); return
        time.sleep(0 if dry else 20)
        inv2 = {"instances": [], "disks": [], "pendingOps": []} if dry else inventory()
        if inv2 is None or inv2["instances"] or inv2["disks"] or inv2["pendingOps"]:
            s["outcome"] = "ambiguous_needs_review"; log({"event": "ambiguous", "n": s["attempts"], "zone": zone, "rc": rc, "inventory": inv2})
            save_state(s); return
        err_code = next((k for k in STOCKOUT if k in err), None)
        if not err_code:
            s["outcome"] = "failed_other_needs_review"; log({"event": "create_failed_other", "n": s["attempts"], "zone": zone, "rc": rc, "error": err[-400:]})
            save_state(s); return
        log({"event": "stockout", "n": s["attempts"], "zone": zone, "providerError": err_code, "verifiedEmpty": True})
        s["nextZone"] = (s["nextZone"] + 1) % len(zones)
        if s["nextZone"] == 0: s["rounds"] += 1
        save_state(s)


if __name__ == "__main__":
    E = load(ENV, None) or sys.exit("envelope.json missing")
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status": status()
    elif cmd == "stop": STOP.write_text((" ".join(sys.argv[2:]) or "stopped by operator") + f" {iso(now())}\n"); print("stop flag written")
    elif cmd == "resume":
        st = load(STATE, None); inv = inventory()
        if not st or st["outcome"] != "vm_created": sys.exit("nothing to resume")
        if inv is None or inv["instances"] or inv["disks"] or inv["pendingOps"]: sys.exit(f"project not empty: {inv}")
        st["outcome"] = "searching"; st["vm"] = None; st["lastAttemptAt"] = iso(now()); save_state(st); log({"event": "resumed_after_session", "sessions": st["sessions"]})
    elif cmd in ("run", "dry-run"):
        m = float(sys.argv[sys.argv.index("--max-runtime-min") + 1]) if "--max-runtime-min" in sys.argv else 110
        run(m, cmd == "dry-run")
    else: sys.exit(__doc__)
