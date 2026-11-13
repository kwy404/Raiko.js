# Original 120 BPM synth track for the launch video, stdlib only. 40.5 s, 44.1 kHz mono 16 bit.
import math, random, struct, wave
SR, DUR, BPM = 44100, 42.5, 120
N = int(SR * DUR)
beat = 60 / BPM
buf = [0.0] * N
random.seed(7)

def add(start, samples, gain=1.0):
    i0 = int(start * SR)
    for j, v in enumerate(samples):
        if 0 <= i0 + j < N:
            buf[i0 + j] += v * gain

def kick():
    out = []
    for j in range(int(0.28 * SR)):
        t = j / SR
        f = 45 + 110 * math.exp(-t * 28)
        out.append(math.sin(2 * math.pi * f * t) * math.exp(-t * 9))
    return out

def hat():
    return [(random.random() * 2 - 1) * math.exp(-(j / SR) * 60) * 0.5 for j in range(int(0.05 * SR))]

def bass(freq, length):
    out = []
    for j in range(int(length * SR)):
        t = j / SR
        saw = 2 * ((freq * t) % 1) - 1
        out.append(saw * 0.5 * min(1, t * 80) * math.exp(-t * 3))
    return out

def zap(length=0.35):
    out = []
    for j in range(int(length * SR)):
        t = j / SR
        f = 2400 * math.exp(-t * 9) + 180
        out.append(math.sin(2 * math.pi * f * t) * math.exp(-t * 7) * 0.6)
    return out

def pad(freqs, start, length):
    for j in range(int(length * SR)):
        t = j / SR
        env = min(1, t / 0.4) * min(1, (length - t) / 0.4)
        v = sum(math.sin(2 * math.pi * f * (start + t)) for f in freqs) / len(freqs)
        i = int((start + t) * SR)
        if i < N:
            buf[i] += v * env * 0.12

KICK, HAT = kick(), hat()
PROG = [(55.0, [220, 277.2, 329.6]), (43.65, [174.6, 220, 261.6]), (65.4, [261.6, 329.6, 392]), (49.0, [196, 246.9, 293.7])]
bar = beat * 4
t = 0.0
i = 0
while t < DUR:
    root, chord = PROG[(i // 1) % 4]
    intro = t < 2.2
    for b in range(4):
        bt = t + b * beat
        if not intro or b == 0:
            add(bt, KICK, 0.9)
        add(bt + beat / 2, HAT, 0.5)
        if not intro:
            add(bt + beat / 2, bass(root, beat / 2), 0.35)
    pad(chord, t, bar)
    t += bar
    i += 1
for s in [2.2, 4.4, 9.6, 14.6, 19.4, 25.2, 31, 35, 38.5]:
    add(s - 0.05, zap(), 0.7)

peak = max(abs(v) for v in buf) or 1
fade = int(1.2 * SR)
with wave.open('som.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    frames = bytearray()
    for j, v in enumerate(buf):
        g = 0.9 / peak
        if j > N - fade:
            g *= (N - j) / fade
        frames += struct.pack('<h', int(max(-1, min(1, v * g)) * 32767))
    w.writeframes(bytes(frames))
print('som.wav ok')
