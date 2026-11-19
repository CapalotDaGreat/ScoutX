#!/usr/bin/env node
/**
 * Collects the platform and handler logs that identify where each probe was handled or rejected.
 *
 *   STAGING_CONFIG=staging.json node scripts/pilot-staging/collect-logs.mjs --since <ISO> out.json [--dry-run]
 *
 * Per queue: Cloud Tasks attempt logs (queue logging sampling must be 1.0 - action STG-03), Cloud Run request logs of
 * the task function's service (status, latency, serving revision) and container logs (handler executed or not).
 * Everything is redacted (tokens, signatures, e-mail addresses) before it is written.
 */
import fs from 'node:fs';
import { accessToken, loadConfig, redact } from './lib.mjs';

const cfg = loadConfig();
if (cfg.target !== 'staging') { console.error('collect-logs needs STAGING_CONFIG (the emulators have no Cloud Logging)'); process.exit(2); }
const args = process.argv.slice(2);
const since = args[args.indexOf('--since') + 1];
const out = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--since')[0] ?? 'staging-logs.json';
if (!since) { console.error('--since <ISO time> is required'); process.exit(2); }
const queues = ['extractTrackingSegmentTask', 'resolveTrackingTask', 'discoverTrackingTask', 'buildDataExport', cfg.authProbeQueue ?? 'stg-auth-probe',
  cfg.exhaustProbeQueue ?? 'stg-exhaust-probe'];
const services = ['extracttrackingsegmenttask', 'resolvetrackingtask', 'discovertrackingtask', 'builddataexport', 'startplayeranalysis', 'getmediaplaybackurl'];
const filters = {
  ...Object.fromEntries(queues.map((q) => [`tasks:${q}`, `resource.type="cloud_tasks_queue" AND resource.labels.queue_id="${q}" AND timestamp>="${since}"`])),
  ...Object.fromEntries(services.map((s) => [`requests:${s}`, `resource.type="cloud_run_revision" AND resource.labels.service_name="${s}" AND log_name="projects/${cfg.project}/logs/run.googleapis.com%2Frequests" AND timestamp>="${since}"`])),
  ...Object.fromEntries(services.map((s) => [`handler:${s}`, `resource.type="cloud_run_revision" AND resource.labels.service_name="${s}" AND NOT log_name="projects/${cfg.project}/logs/run.googleapis.com%2Frequests" AND timestamp>="${since}"`])),
};
if (args.includes('--dry-run')) { console.log(JSON.stringify(filters, null, 1)); process.exit(0); }

const token = await accessToken();
const result = {};
for (const [key, filter] of Object.entries(filters)) {
  const entries = [];
  let pageToken;
  do {
    const r = await fetch('https://logging.googleapis.com/v2/entries:list', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceNames: [`projects/${cfg.project}`], filter, orderBy: 'timestamp asc', pageSize: 500, pageToken }) });
    const j = await r.json();
    if (!r.ok) { entries.push({ error: j.error?.status ?? r.status }); break; }
    for (const e of j.entries ?? []) {
      entries.push({ timestamp: e.timestamp, severity: e.severity, revision: e.resource?.labels?.revision_name ?? null,
        status: e.httpRequest?.status ?? e.jsonPayload?.status ?? null, latency: e.httpRequest?.latency ?? null,
        taskName: e.jsonPayload?.taskName ?? null, attempt: e.jsonPayload?.dispatchCount ?? null, responseCount: e.jsonPayload?.responseCount ?? null,
        targetAddress: e.jsonPayload?.targetAddress ?? null, scheduleTime: e.jsonPayload?.scheduleTime ?? null, dispatchTime: e.jsonPayload?.dispatchTime ?? null,
        message: String(e.textPayload ?? e.jsonPayload?.message ?? '').slice(0, 300) });
    }
    pageToken = j.nextPageToken;
  } while (pageToken);
  result[key] = entries;
}
fs.writeFileSync(out, JSON.stringify(redact({ project: cfg.project, since, collectedAt: new Date().toISOString(), filters, result }), null, 1));
console.log(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length])));
