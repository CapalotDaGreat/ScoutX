# Staging-only stand-in for the GPU worker (contract v3). Private Cloud Run service (IAM invoker), no GPU, no models.
# Build context: repository root.  gcloud run deploy stg-fake-worker --source . (see docs/release/staging-verification-plan)
FROM node:22-slim
WORKDIR /app
COPY scripts/pilot-rehearsal/fakeWorker.mjs ./fakeWorker.mjs
ENV FAKE_WORKER_HOST=0.0.0.0 FAKE_WORKER_ALLOW_GCS=1 FAKE_WORKER_VERSION=football-cv/0.7.0-staging \
    FAKE_WORKER_MODELS='{"detector":"yolox-staging","ocr":"parseq-staging"}'
USER node
CMD ["node", "fakeWorker.mjs"]
