# Owner / Claude price refresh (2026-11-09)

**Source:** Google Cloud read-only inventory from the Claude cloud workspace (not Cursor’s shell).  
**Project:** `scoutx-230b0`  
**Instances / disks:** 0 / 0 at refresh time.  
**Currency:** USD list, before tax. Estimate is not a billing cap.

## Hourly all-in for g2-standard-8 + 1× L4 + disk (as reported)

| Region | Price per hour |
|---|---:|
| europe-west4 (Netherlands) | $0.93 |
| europe-west1 (Belgium) | ~$0.98 |
| europe-west2 (London) | $1.01 |
| europe-west3 (Frankfurt) | $1.04 |
| europe-west6 (Zurich) | $1.21 |

At **300 minutes**, the most expensive approved region (west6) is about **$6.10** for the VM+GPU+disk envelope before egress/cross-region copy.  
Bucket is in **west4**; runs outside west4 add a few cents to copy footage/results and place footage in that region for the run.

Cursor must refresh again immediately before create if Cursor is the operator; Claude must refresh again immediately before create if Claude is the operator.
