"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readableSourceFor = readableSourceFor;
const storage_1 = require("firebase-admin/storage");
/**
 * Short-lived read URL for ffprobe/ffmpeg, so large videos are streamed instead of copied to
 * the function's disk. The emulator accepts the admin bearer token instead of a signature.
 */
async function readableSourceFor(path, ttlMs = 15 * 60 * 1000) {
    const bucket = (0, storage_1.getStorage)().bucket();
    const emulator = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
    if (emulator) {
        return {
            url: `http://${emulator}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media`,
            headers: 'Authorization: Bearer owner\r\n',
        };
    }
    const [url] = await bucket.file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlMs });
    return { url, headers: null };
}
//# sourceMappingURL=mediaSource.js.map