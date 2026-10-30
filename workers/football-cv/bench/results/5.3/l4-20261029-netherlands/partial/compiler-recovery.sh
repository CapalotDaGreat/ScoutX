set -e
sudo kill -STOP 1108
sudo docker kill --signal=INT 49698790a3aa
sudo docker wait 49698790a3aa || true
sudo mv /data/out/gpu /data/out/gpu_failed_attempt1
sudo mv /data/out/cpu /data/out/cpu_interrupted_attempt1
sudo mkdir -p /data/out/gpu /data/out/cpu
sudo cp /data/out/prices.json /data/out/gpu/prices.json
sudo cp /data/out/prices.json /data/out/cpu/prices.json
cat > /tmp/Dockerfile.compiler <<'EOF'
FROM pitchproof-tracker-gpu:5.2
USER root
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
LABEL org.pitchproof.runtime-patch=883229e
USER worker
EOF
sudo cp /tmp/Dockerfile.compiler /data/out/Dockerfile.compiler
sudo docker build -f /tmp/Dockerfile.compiler -t pitchproof-tracker-gpu:5.2 /tmp > /tmp/compiler-build.log 2>&1
sudo cp /tmp/compiler-build.log /data/out/compiler-build.log
sudo docker run --rm --gpus all pitchproof-tracker-gpu:5.2 gcc --version | head -1
sudo docker image inspect pitchproof-tracker-gpu:5.2 --format '{{.Id}} {{json .Config.Labels}}'
