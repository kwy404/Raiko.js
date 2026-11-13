#!/bin/bash
set -e
H=/tmp/claude-0/-root/873d3f38-ef4a-44a6-91b6-e15eb4ccbf84/scratchpad/h/node_modules
cd /root/raiko/video
docker run --rm -v /root/raiko/video:/v -v $H:/v/node_modules:ro -w /v mcr.microsoft.com/playwright:v1.64.1-noble node render.mjs
docker run --rm -v /root/raiko/video:/v -w /v jrottenberg/ffmpeg:6-alpine -y -loglevel error -framerate 30 -i frames/f%04d.jpg -i som.wav -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -profile:v high -c:a aac -b:a 192k -ar 48000 -movflags +faststart -shortest raiko.mp4
docker run --rm -v /root/raiko/video:/v -w /v jrottenberg/ffmpeg:6-alpine -y -loglevel error -ss 41 -i raiko.mp4 -frames:v 1 -q:v 3 poster.jpg
echo VIDEO_OK
