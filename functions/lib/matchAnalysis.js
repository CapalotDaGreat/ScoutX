"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMatchFootage = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
const openRouterApiKey = (0, params_1.defineSecret)('OPENROUTER_API_KEY');
const MATCH_COLLECTION = 'matchAnalysisJobs';
function extractJsonFromModelText(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? trimmed;
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('AI response was not a JSON object.');
    }
    return parsed;
}
function asNumber(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function asStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => typeof item === 'string');
}
function normalizeReport(raw, modelId) {
    const statsRaw = raw.estimatedStats && typeof raw.estimatedStats === 'object' && !Array.isArray(raw.estimatedStats)
        ? raw.estimatedStats
        : {};
    const passesAttempted = Math.max(0, Math.round(asNumber(statsRaw.passesAttempted)));
    const passesCompleted = Math.max(0, Math.min(passesAttempted, Math.round(asNumber(statsRaw.passesCompleted))));
    const passCompletionPct = passesAttempted > 0
        ? Math.round((passesCompleted / passesAttempted) * 100)
        : Math.max(0, Math.min(100, Math.round(asNumber(statsRaw.passCompletionPct))));
    const shots = Math.max(0, Math.round(asNumber(statsRaw.shots)));
    const shotsOnTarget = Math.max(0, Math.min(shots, Math.round(asNumber(statsRaw.shotsOnTarget))));
    const moments = Array.isArray(raw.moments)
        ? raw.moments
            .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }
            const row = item;
            return {
                timestampSec: Math.max(0, Math.round(asNumber(row.timestampSec))),
                label: typeof row.label === 'string' ? row.label : 'Moment',
                detail: typeof row.detail === 'string' ? row.detail : '',
            };
        })
            .filter(Boolean)
        : [];
    return {
        headline: typeof raw.headline === 'string' ? raw.headline : 'Match analysis complete',
        strengths: asStringArray(raw.strengths).slice(0, 6),
        improvements: asStringArray(raw.improvements).slice(0, 6),
        coachingNotes: typeof raw.coachingNotes === 'string'
            ? raw.coachingNotes
            : 'Focus on decision speed in the final third.',
        estimatedStats: {
            minutesPlayed: Math.max(0, Math.round(asNumber(statsRaw.minutesPlayed, 90))),
            goals: Math.max(0, Math.round(asNumber(statsRaw.goals))),
            assists: Math.max(0, Math.round(asNumber(statsRaw.assists))),
            shots,
            shotsOnTarget,
            passesAttempted,
            passesCompleted,
            passCompletionPct,
            keyPasses: Math.max(0, Math.round(asNumber(statsRaw.keyPasses))),
            tackles: Math.max(0, Math.round(asNumber(statsRaw.tackles))),
            duelsWon: Math.max(0, Math.round(asNumber(statsRaw.duelsWon))),
            duelsLost: Math.max(0, Math.round(asNumber(statsRaw.duelsLost))),
            foulsCommitted: Math.max(0, Math.round(asNumber(statsRaw.foulsCommitted))),
            yellowCards: Math.max(0, Math.round(asNumber(statsRaw.yellowCards))),
            redCards: Math.max(0, Math.round(asNumber(statsRaw.redCards))),
            matchRating: Math.max(1, Math.min(10, Number(asNumber(statsRaw.matchRating, 6.5).toFixed(1)))),
            cleanSheet: Boolean(statsRaw.cleanSheet),
        },
        moments,
        confidence: Math.max(0, Math.min(1, asNumber(raw.confidence, 0.5))),
        methodology: typeof raw.methodology === 'string'
            ? raw.methodology
            : 'Vision model reviewed evenly sampled frames and counted only events clearly involving the nominated jersey.',
        modelId,
        generatedAt: new Date().toISOString(),
    };
}
async function fetchFrameAsDataUrl(downloadUrl) {
    try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
            return null;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        // Keep payload manageable for multimodal APIs
        if (buffer.byteLength > 1.8 * 1024 * 1024) {
            return null;
        }
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
    catch (error) {
        firebase_functions_1.logger.warn('Failed to download frame', { error, downloadUrl });
        return null;
    }
}
exports.analyzeMatchFootage = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({
    secrets: [openRouterApiKey],
    timeoutSeconds: 300,
    memory: '1GiB',
}), async (request) => {
    if (!request.auth?.uid) {
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    }
    const jobId = request.data?.jobId;
    if (!jobId || typeof jobId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'jobId is required.');
    }
    const apiKey = openRouterApiKey.value();
    if (!apiKey) {
        throw new https_1.HttpsError('failed-precondition', 'OpenRouter API key is not configured.');
    }
    const jobRef = (0, firestore_1.getFirestore)().collection(MATCH_COLLECTION).doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', 'Match analysis job not found.');
    }
    const job = snap.data();
    if (job.playerId !== request.auth.uid) {
        throw new https_1.HttpsError('permission-denied', 'You can only analyze your own footage.');
    }
    await jobRef.set({ status: 'processing', updatedAt: new Date().toISOString(), error: null }, { merge: true });
    const model = process.env.OPENROUTER_VISION_MODEL?.trim() ||
        process.env.OPENROUTER_MODEL?.trim() ||
        'google/gemini-2.0-flash-001';
    const baseUrl = process.env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
    const frameSamples = (job.frames ?? []).slice(0, 18);
    const imageContents = [];
    for (const frame of frameSamples) {
        const dataUrl = await fetchFrameAsDataUrl(frame.downloadUrl);
        if (dataUrl) {
            imageContents.push({ type: 'image_url', image_url: { url: dataUrl } });
        }
    }
    // Touch Storage API so the dependency is kept for deploy packaging
    void (0, storage_1.getStorage)();
    if (imageContents.length < 3) {
        await jobRef.set({
            status: 'failed',
            error: 'Not enough readable frames to analyze.',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        throw new https_1.HttpsError('failed-precondition', 'Not enough readable frames to analyze.');
    }
    const frameIndexGuide = frameSamples
        .map((frame, index) => `Image ${index + 1}: ~${frame.timestampSec}s into the match`)
        .join('\n');
    const systemPrompt = [
        'You are ScoutX Match Analyst, a professional football coach and performance analyst.',
        'You ONLY evaluate ONE nominated player visible in the provided still frames from a match film.',
        'Ignore all other players except when they interact directly with the target.',
        'Never invent events you cannot reasonably infer from the frames and context.',
        'When uncertain, under-count rather than over-count.',
        'Return STRICT JSON only.',
    ].join(' ');
    const userText = [
        'Analyze this amateur/prosumer match footage for ONE player only.',
        `Target jersey number: #${job.targeting.jerseyNumber}`,
        `Kit colors: primary ${job.targeting.kitPrimaryColor}, secondary ${job.targeting.kitSecondaryColor}`,
        `Team side hint: ${job.targeting.teamSide ?? 'unknown'}`,
        `Match: vs ${job.match.opponent} (${job.match.competition}) on ${job.match.date}`,
        `Video duration seconds: ${job.durationSec}`,
        job.targeting.notes ? `Player notes: ${job.targeting.notes}` : '',
        '',
        'Frame timeline guide:',
        frameIndexGuide,
        '',
        'Tasks:',
        '1) Locate #jersey using kit colors whenever possible.',
        '2) Estimate countable match stats for THAT player only across the whole match (use frames as sparse evidence + football priors; mark lower confidence when frames are sparse).',
        '3) Produce coaching feedback specific to that player.',
        '',
        'JSON schema:',
        JSON.stringify({
            headline: 'string',
            strengths: ['string'],
            improvements: ['string'],
            coachingNotes: 'string',
            estimatedStats: {
                minutesPlayed: 0,
                goals: 0,
                assists: 0,
                shots: 0,
                shotsOnTarget: 0,
                passesAttempted: 0,
                passesCompleted: 0,
                passCompletionPct: 0,
                keyPasses: 0,
                tackles: 0,
                duelsWon: 0,
                duelsLost: 0,
                foulsCommitted: 0,
                yellowCards: 0,
                redCards: 0,
                matchRating: 6.5,
                cleanSheet: false,
            },
            moments: [{ timestampSec: 0, label: 'string', detail: 'string' }],
            confidence: 0.0,
            methodology: 'string',
        }),
    ]
        .filter(Boolean)
        .join('\n');
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://scoutx.app',
            'X-Title': 'ScoutX Match Analysis',
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [{ type: 'text', text: userText }, ...imageContents],
                },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
        }),
    });
    const payload = (await response.json());
    if (!response.ok) {
        firebase_functions_1.logger.error('OpenRouter vision request failed', { status: response.status, payload });
        await jobRef.set({
            status: 'failed',
            error: payload.error?.message ?? `Vision request failed (${response.status})`,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        throw new https_1.HttpsError('internal', payload.error?.message ?? `Vision request failed (${response.status}).`);
    }
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
        await jobRef.set({
            status: 'failed',
            error: 'Empty vision model response',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        throw new https_1.HttpsError('internal', 'Vision model returned an empty response.');
    }
    try {
        const report = normalizeReport(extractJsonFromModelText(content), model);
        await jobRef.set({
            status: 'complete',
            report,
            completedAt: report.generatedAt,
            updatedAt: new Date().toISOString(),
            error: null,
        }, { merge: true });
        return {
            jobId,
            status: 'complete',
        };
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to parse match analysis JSON', { error, content });
        await jobRef.set({
            status: 'failed',
            error: 'AI response could not be parsed',
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        throw new https_1.HttpsError('internal', 'AI response could not be parsed.');
    }
});
//# sourceMappingURL=matchAnalysis.js.map