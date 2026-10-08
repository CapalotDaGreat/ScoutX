# Reference image for Cloud Run with an NVIDIA L4 GPU. NOT DEPLOYED.
# Model weights are downloaded at build time so no network fetch happens per request.
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/models \
    EASYOCR_MODULE_PATH=/opt/models/easyocr \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3.11 python3-pip ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt .
RUN python3.11 -m pip install --no-cache-dir -r requirements.txt

RUN python3.11 -c "from transformers import AutoImageProcessor, RTDetrForObjectDetection as M; m='PekingU/rtdetr_r50vd_coco_o365'; AutoImageProcessor.from_pretrained(m); M.from_pretrained(m)" \
    && python3.11 -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=False)"

COPY app ./app

# Runs as an unprivileged user; the container has no writable media volume.
RUN useradd --uid 10001 --no-create-home worker
USER worker

CMD ["sh", "-c", "python3.11 -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
