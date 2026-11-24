"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRACKING_STORAGE_ENCODING = void 0;
exports.encodeTrackingStorage = encodeTrackingStorage;
exports.decodeTrackingStorage = decodeTrackingStorage;
/** Mirrored app/server storage boundary; tuple arrays remain the in-memory/worker contract. */
exports.TRACKING_STORAGE_ENCODING = 'pitchproof.tracking.tuples.v1';
const STATES = ['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE', 'AMBIGUOUS', 'OFF_CAMERA', 'CONFIRMED_OFF_PITCH', 'NON_MATCH_PERIOD', 'UNKNOWN'];
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
function rows(value, kind, encode) {
    if (!Array.isArray(value))
        throw new Error(`Invalid tracking ${kind}`);
    return value.map((row) => {
        const keys = kind === 'indicator' ? ['t', 'x', 'y', 'w', 'h'] : ['start', 'end', 'state'];
        let tuple;
        if (Array.isArray(row))
            tuple = row;
        else if (!encode && object(row) && Object.keys(row).length === keys.length && keys.every((key) => key in row)) {
            tuple = keys.map((key) => row[key]);
        }
        else
            throw new Error(`Invalid tracking ${kind} row`);
        if (tuple.length !== keys.length || (kind === 'indicator'
            ? !tuple.every(finite)
            : !finite(tuple[0]) || !finite(tuple[1]) || !STATES.includes(String(tuple[2])) || typeof tuple[2] !== 'string')) {
            throw new Error(`Invalid tracking ${kind} tuple`);
        }
        return encode ? Object.fromEntries(keys.map((key, index) => [key, tuple[index]])) : [...tuple];
    });
}
function moments(value, encode) {
    if (!Array.isArray(value))
        throw new Error('Invalid tracking moments');
    return value.map((moment) => {
        if (!object(moment))
            throw new Error('Invalid tracking moment');
        return { ...moment, ...('indicator' in moment ? { indicator: rows(moment.indicator, 'indicator', encode) } : {}) };
    });
}
function convert(input, encode) {
    if (!object(input))
        throw new Error('Invalid tracking document');
    if (input.tupleEncoding !== undefined && input.tupleEncoding !== exports.TRACKING_STORAGE_ENCODING)
        throw new Error('Unknown tracking tuple encoding');
    const out = { ...input };
    if (object(input.report)) {
        out.report = { ...input.report,
            ...('stateStrip' in input.report ? { stateStrip: rows(input.report.stateStrip, 'stateStrip', encode) } : {}),
            ...('moments' in input.report ? { moments: moments(input.report.moments, encode) } : {}) };
    }
    if ('moments' in input)
        out.moments = moments(input.moments, encode);
    if (encode)
        out.tupleEncoding = exports.TRACKING_STORAGE_ENCODING;
    else
        delete out.tupleEncoding;
    return out;
}
/** Encode only validated target reports/discovery at the Firestore write boundary. Never mutates inputs. */
function encodeTrackingStorage(input) {
    return convert(input, true);
}
/** Supports both new object rows and legacy tuple rows; malformed/future encodings fail closed. */
function decodeTrackingStorage(input) {
    return convert(input, false);
}
//# sourceMappingURL=trackingStorage.js.map