"use strict";
/**
 * "Import from link": server-side ingestion of a direct HTTPS video link into the SAME quarantine
 * path a device upload uses (quarantine/{uid}/{uploadId}/source). From there the existing
 * quarantine trigger performs size, integrity, magic-byte, ffprobe, plan-limit and scanner checks
 * and promotes the video - link imports get no shortcut.
 *
 * Safety:
 *  - Only links that `inspectSource` marks `ready`: https, port 443, no URL credentials, a video
 *    content type and a declared Content-Length within the plan limit. Provider pages (Veo) are
 *    never fetched - they require the official export.
 *  - DNS pinning: every connection resolves the host itself and refuses unless ALL addresses are
 *    public unicast, then connects to the address it validated (no check-then-fetch rebinding gap).
 *    Redirects are followed manually (max 3) and each hop is validated again.
 *  - Streams with hard limits: exact Content-Length, the plan byte limit, an idle and an overall
 *    deadline; MP4/MOV magic bytes are checked on the first bytes.
 *  - CRC32C is computed while streaming and declared before the object is finalised, so the
 *    quarantine integrity verdict compares it with the hash Cloud Storage computed.
 *  - Cancellation (cancelUploadSession, job cancel, consent withdrawal) is observed between
 *    chunks; the partial object is deleted.
 *  - The source URL may contain access tokens: it is stored server-only (mediaImportSources,
 *    no client access) and deleted when the import ends.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMPORT_SOURCES_COLLECTION = exports.LINK_IMPORT_LIMITS = void 0;
exports.pinnedLookup = pinnedLookup;
exports.httpsOpener = httpsOpener;
exports.downloadToQuarantine = downloadToQuarantine;
exports.linkFingerprint = linkFingerprint;
exports.importContentType = importContentType;
const node_crypto_1 = require("node:crypto");
const node_https_1 = require("node:https");
const videoProviders_1 = require("../analysis/videoProviders");
const crc32c_1 = require("./crc32c");
const probe_1 = require("./probe");
exports.LINK_IMPORT_LIMITS = {
    maxRedirects: 3,
    /** Abort when no byte arrives for this long. */
    idleTimeoutMs: 60_000,
    /** Whole download (the task deadline is 30 min; leave time for cleanup). */
    overallTimeoutMs: 25 * 60_000,
    /** Re-check cancellation at most this often while streaming. */
    cancelCheckBytes: 32 * 1024 * 1024,
};
exports.IMPORT_SOURCES_COLLECTION = 'mediaImportSources';
/**
 * A `lookup` for node:https that only ever hands back validated public addresses, so the socket
 * connects to exactly what was checked. Throws for any private, loopback, link-local or metadata
 * address, even if only one of several records is private.
 */
function pinnedLookup(resolve = videoProviders_1.defaultResolver) {
    return ((hostname, options, callback) => {
        const cb = (typeof options === 'function' ? options : callback);
        const wantAll = typeof options === 'object' && options !== null && options.all === true;
        resolve(hostname)
            .then((addresses) => {
            if (addresses.length === 0 || !addresses.every(videoProviders_1.isPublicAddress)) {
                const error = new Error('Destination address is not allowed.');
                error.code = 'EPRIVATEADDR';
                cb(error);
                return;
            }
            const records = addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
            if (wantAll)
                cb(null, records);
            else
                cb(null, records[0].address, records[0].family);
        })
            .catch((error) => cb(error));
    });
}
/** Production opener: one HTTPS GET with the pinned lookup, no automatic redirects. */
function httpsOpener(resolve = videoProviders_1.defaultResolver) {
    const lookup = pinnedLookup(resolve);
    return (url, signal) => new Promise((resolvePromise, reject) => {
        const req = (0, node_https_1.request)(url, {
            method: 'GET',
            lookup,
            signal,
            headers: { 'user-agent': 'PitchProof-LinkImport/1.0', accept: 'video/*,application/octet-stream' },
        }, (res) => {
            const headers = {};
            for (const [key, value] of Object.entries(res.headers)) {
                headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
            }
            resolvePromise({ status: res.statusCode ?? 0, headers, body: res, destroy: () => res.destroy() });
        });
        req.on('error', reject);
        req.end();
    });
}
/**
 * Streams the link into `sink`. Never throws for remote problems: returns a failure reason so the
 * caller can reject the upload with a translatable code. The sink is aborted on every failure.
 */
async function downloadToQuarantine(options) {
    const limits = { ...exports.LINK_IMPORT_LIMITS, ...options.limits };
    const resolve = options.resolve ?? videoProviders_1.defaultResolver;
    const open = options.open ?? httpsOpener(resolve);
    const now = options.now ?? Date.now;
    const started = now();
    const controller = new AbortController();
    const fail = async (reason, hop) => {
        hop?.destroy();
        controller.abort();
        await options.sink.abort().catch(() => undefined);
        return { ok: false, reason };
    };
    const first = (0, videoProviders_1.parseUrl)(options.url);
    if (!first)
        return fail('invalid_url');
    let current = first;
    let hop = null;
    for (let redirects = 0;; redirects += 1) {
        const blocked = await (0, videoProviders_1.checkFetchable)(current, resolve);
        if (blocked)
            return fail(blocked === 'private_address' ? 'private_address' : 'invalid_url');
        try {
            hop = await open(current, controller.signal);
        }
        catch (error) {
            const code = error?.code;
            return fail(code === 'EPRIVATEADDR' ? 'private_address' : 'unreachable');
        }
        if (hop.status >= 300 && hop.status < 400) {
            const location = hop.headers.location;
            hop.destroy();
            if (redirects >= limits.maxRedirects)
                return fail('too_many_redirects');
            let next = null;
            try {
                next = location ? (0, videoProviders_1.parseUrl)(new URL(location, current).toString()) : null;
            }
            catch {
                next = null;
            }
            if (!next)
                return fail('unreachable');
            current = next;
            continue;
        }
        break;
    }
    if (hop.status !== 200)
        return fail('http_status', hop);
    const declared = Number(hop.headers['content-length'] ?? NaN);
    if (!Number.isFinite(declared) || declared !== options.expectedBytes)
        return fail('size_mismatch', hop);
    if (declared > options.maxBytes)
        return fail('too_large', hop);
    let bytes = 0;
    let crc = 0;
    let head = new Uint8Array(0);
    let headChecked = false;
    let nextCancelCheck = limits.cancelCheckBytes;
    const iterator = hop.body[Symbol.asyncIterator]();
    for (;;) {
        if (now() - started > limits.overallTimeoutMs)
            return fail('timeout', hop);
        let idleTimer;
        const idle = new Promise((resolveIdle) => {
            idleTimer = setTimeout(() => resolveIdle('idle'), limits.idleTimeoutMs);
        });
        let step;
        try {
            step = await Promise.race([iterator.next(), idle]);
        }
        catch {
            clearTimeout(idleTimer);
            return fail('unreachable', hop);
        }
        finally {
            clearTimeout(idleTimer);
        }
        if (step === 'idle')
            return fail('timeout', hop);
        if (step.done)
            break;
        const chunk = step.value instanceof Uint8Array ? step.value : new Uint8Array(step.value);
        bytes += chunk.length;
        if (bytes > declared || bytes > options.maxBytes)
            return fail(bytes > options.maxBytes ? 'too_large' : 'size_mismatch', hop);
        if (!headChecked) {
            head = concat(head, chunk.subarray(0, Math.max(0, 16 - head.length)));
            if (head.length >= 16 || bytes >= declared) {
                if (!(0, probe_1.hasVideoMagicBytes)(head))
                    return fail('not_video', hop);
                headChecked = true;
            }
        }
        crc = (0, crc32c_1.crc32cUpdate)(crc, chunk);
        await options.sink.write(chunk);
        if (bytes >= nextCancelCheck) {
            nextCancelCheck = bytes + limits.cancelCheckBytes;
            if (await options.isCancelled())
                return fail('cancelled', hop);
            await options.onProgress?.(bytes);
        }
    }
    if (bytes !== declared)
        return fail('size_mismatch', hop);
    if (!headChecked)
        return fail('not_video', hop);
    if (await options.isCancelled())
        return fail('cancelled', hop);
    const crc32c = (0, crc32c_1.crc32cToBase64)(crc);
    await options.sink.beforeEnd(crc32c, bytes);
    await options.sink.end();
    return { ok: true, bytes, crc32c, finalHost: current.hostname };
}
function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}
/** Dedup key for a link: the same owner importing the same URL into the same job reuses it. */
function linkFingerprint(uid, jobId, url) {
    return (0, node_crypto_1.createHash)('sha256').update(`${uid}\n${jobId}\n${url}`).digest('hex');
}
/** Content type recorded on the upload doc; quarantine re-derives the real container via ffprobe. */
function importContentType(headerValue) {
    return (headerValue ?? '').toLowerCase().startsWith('video/quicktime') ? 'video/quicktime' : 'video/mp4';
}
//# sourceMappingURL=linkImport.js.map