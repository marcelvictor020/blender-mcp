#!/usr/bin/env python3
"""Original score for the anime short: a sad, nostalgic 90s-console / J-RPG theme in E minor.

101.48 BPM so that 12 bars of 4/4 last exactly 28.375 s (the film length), played in a half-time feel. Key: E minor.
i-VI-iv-V progression, soft FM piano, strings, Karplus-Strong koto/harp arpeggio, music box,
breathy flute lead, long bass tones, brushes, lo-fi 90s sampler grit + tape wobble,
and scene-synced ambience (cicadas, trains, birds, wind) that changes on the picture cuts.

usage: python3 tools/compose_score.py out/score.wav
"""
import sys
import numpy as np
from scipy.signal import lfilter, butter, sosfilt, fftconvolve, resample_poly

SR = 44100
LEN = 28.375
BPM = 48 * 60 / LEN            # 12 bars x 4 beats
BEAT = 60 / BPM
BAR = 4 * BEAT
STEP8 = BEAT / 2
STEP16 = BEAT / 4
N = int(LEN * SR) + SR * 3     # tail room, trimmed at the end
CUTS = [0.0, 3.958, 6.958, 10.0, 13.125, 16.167, 19.208, 22.25, 28.375]
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def buf():
    return np.zeros((2, N))


def place(bus, sig, t0, pan=0.0, gain=1.0):
    i0 = int(round(t0 * SR))
    if i0 >= N:
        return
    s = sig[: N - i0] * gain
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    if s.ndim == 1:
        bus[0, i0:i0 + len(s)] += s * l * 1.414
        bus[1, i0:i0 + len(s)] += s * r * 1.414
    else:
        bus[0, i0:i0 + s.shape[1]] += s[0] * l * 1.414
        bus[1, i0:i0 + s.shape[1]] += s[1] * r * 1.414


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'low', output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc / (SR / 2), 'high', output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)


def env_ar(n, a, r_start, r):
    t = np.arange(n) / SR
    e = np.clip(t / max(a, 1e-4), 0, 1)
    e *= np.clip(1 - (t - r_start) / max(r, 1e-4), 0, 1)
    return e


# ------------------------------------------------------------------ instruments
def ep(freq, dur, vel=0.6):
    n = int((dur + 1.2) * SR); t = np.arange(n) / SR
    idx = 1.6 * np.exp(-t * 3.5) + 0.22
    car = np.sin(2 * np.pi * freq * t + idx * np.sin(2 * np.pi * freq * t))
    tine = 0.16 * np.sin(2 * np.pi * freq * 14 * t) * np.exp(-t * 28) if freq * 14 < 15000 else 0
    e = (1 - np.exp(-t * 400)) * np.exp(-t * 1.25) * np.clip(1 - (t - dur) / 0.25, 0, 1)
    s = (car + tine) * e * vel
    trem = 0.5 + 0.5 * np.sin(2 * np.pi * 4.2 * t)
    return np.stack([s * (0.65 + 0.35 * trem), s * (0.65 + 0.35 * (1 - trem))])


def pad(freqs, dur, vel=0.18):
    n = int((dur + 1.4) * SR); t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    for f in freqs:
        for k, (det, side) in enumerate([(-0.0045, 0), (0.0, 2), (0.0047, 1)]):
            ph = (f * (1 + det) * t + rng.random()) % 1.0
            saw = 2 * ph - 1
            if side in (0, 2): L += saw * (0.8 if side == 2 else 1)
            if side in (1, 2): R += saw * (0.8 if side == 2 else 1)
        L += 0.6 * np.sin(2 * np.pi * f / 2 * t); R += 0.6 * np.sin(2 * np.pi * f / 2 * t)
    e = np.clip(t / 0.7, 0, 1) ** 1.5 * np.clip(1 - (t - dur) / 1.2, 0, 1)
    cut = 1400 + 500 * np.sin(2 * np.pi * 0.2 * t)
    out = []
    for ch in (L, R):
        a = lp(ch, 1900, 2) * 0.5 + lp(ch, 900, 2) * 0.5
        out.append(a * e * vel / len(freqs))
    return np.stack(out)


def pluck(freq, dur, vel=0.5, bright=0.6):
    n = int((dur + 1.6) * SR)
    Np = max(2, int(round(SR / freq - 0.5)))
    exc = rng.uniform(-1, 1, Np) * vel
    exc = lfilter([bright, 1 - bright], [1], exc)
    x = np.zeros(n); x[:Np] = exc
    g = 0.996 if freq < 500 else 0.993
    a = np.zeros(Np + 2); a[0] = 1; a[Np] = -g * 0.5; a[Np + 1] = -g * 0.5
    y = lfilter([1], a, x)
    y *= np.clip(1 - (np.arange(n) / SR - dur) / 0.3, 0, 1)
    return lp(y, 5200, 1)


def bell(freq, vel=0.25):
    dur = 2.2; n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for ratio, amp, dec in [(1, 1, 1.4), (2.0, 0.35, 0.9), (3.01, 0.22, 0.55), (4.17, 0.14, 0.35), (5.43, 0.06, 0.2)]:
        if freq * ratio < 16000:
            s += amp * np.sin(2 * np.pi * freq * ratio * t + rng.random()) * np.exp(-t / dec)
    return s * (1 - np.exp(-t * 900)) * vel


def flute(freq, dur, vel=0.32, prev=None):
    n = int((dur + 0.25) * SR); t = np.arange(n) / SR
    vib = 0.008 * np.sin(2 * np.pi * 4.8 * t) * np.clip((t - 0.25) / 0.4, 0, 1)
    f = np.full(n, freq)
    if prev:  # short portamento from the previous note
        g = np.clip(t / 0.06, 0, 1); f = prev + (freq - prev) * (1 - (1 - g) ** 2)
    ph = 2 * np.pi * np.cumsum(f * (1 + vib)) / SR
    tone = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    breath = bp(rng.standard_normal(n), min(freq * 1.5, 8000), min(freq * 4, 15000), 2) * 0.12
    e = np.clip(t / 0.08, 0, 1) * np.clip(1 - (t - dur) / 0.25, 0, 1)
    e *= 0.9 + 0.1 * np.sin(2 * np.pi * 0.7 * t)
    return (tone + breath * (0.6 + 0.4 * np.exp(-t * 8))) * e * vel


def bass(freq, dur, vel=0.5):
    n = int((dur + 0.2) * SR); t = np.arange(n) / SR
    ph = 2 * np.pi * freq * t
    s = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    e = (1 - np.exp(-t * 120)) * (0.75 + 0.25 * np.exp(-t * 6)) * np.clip(1 - (t - dur) / 0.08, 0, 1)
    return lp(np.tanh(s * 1.3) * e * vel, 1200, 2)


def kick(vel=0.9):
    n = int(0.4 * SR); t = np.arange(n) / SR
    f = 46 + 80 * np.exp(-t * 32)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5)
    s[: int(0.003 * SR)] += rng.uniform(-0.4, 0.4, int(0.003 * SR))
    return np.tanh(s * 1.4) * vel


def snare(vel=0.5):
    n = int(0.3 * SR); t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1300, 7000) * np.exp(-t * 20)
    tone = np.sin(2 * np.pi * 195 * t) * np.exp(-t * 35) * 0.5
    return (noise * 0.8 + tone) * vel


def hat(vel=0.25, open_=False):
    n = int((0.35 if open_ else 0.08) * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500, 2) * np.exp(-t * (9 if open_ else 55)) * vel


def shaker(vel=0.12):
    n = int(0.09 * SR); t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 3800, 9500) * (np.clip(t / 0.012, 0, 1) * np.exp(-t * 40)) * vel


def crash(vel=0.35, dur=2.8):
    n = int(dur * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4200, 2) * np.exp(-t * 1.6) * vel


def swell(dur, vel=0.25):
    n = int(dur * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 3500, 2) * (t / dur) ** 3 * vel


# ------------------------------------------------------------------ harmony
CH = {  # pad / piano voicings, bass root (MIDI) — E minor, bittersweet
    'Em9': ([67, 71, 74, 78], 40), 'Cmaj9': ([64, 67, 71, 74], 36), 'Am9': ([67, 71, 72, 76], 33),
    'B7sus4': ([64, 66, 69, 71], 35), 'B7': ([63, 66, 69, 71], 35), 'D/F#': ([66, 69, 74, 76], 42),
    'Bm7': ([66, 69, 71, 74], 35), 'Am7': ([67, 69, 72, 76], 33),
}
# (bar, beat offset, chord, beats)   i - VI - iv - V   |   i - VI - iv - III/5   |   VI - v i - iv V - i
PROG = [(0, 0, 'Em9', 4), (1, 0, 'Cmaj9', 4), (2, 0, 'Am9', 4), (3, 0, 'B7sus4', 2), (3, 2, 'B7', 2),
        (4, 0, 'Em9', 4), (5, 0, 'Cmaj9', 4), (6, 0, 'Am9', 4), (7, 0, 'D/F#', 4),
        (8, 0, 'Cmaj9', 4), (9, 0, 'Bm7', 2), (9, 2, 'Em9', 2), (10, 0, 'Am7', 2), (10, 2, 'B7', 2), (11, 0, 'Em9', 4)]

# melody: (bar, 8th-step, midi, length in 8ths) — long, sighing notes (half-time feel)
MEL = [(3, 6, 66, 1), (3, 7, 67, 1),
       (4, 0, 71, 3), (4, 3, 69, 1), (4, 4, 71, 2), (4, 6, 76, 2),
       (5, 0, 74, 3), (5, 3, 72, 1), (5, 4, 71, 4),
       (6, 0, 72, 3), (6, 3, 71, 1), (6, 4, 69, 2), (6, 6, 76, 2),
       (7, 0, 78, 4), (7, 4, 76, 2), (7, 6, 74, 2),
       (8, 0, 76, 3), (8, 3, 74, 1), (8, 4, 76, 2), (8, 6, 79, 2),
       (9, 0, 78, 3), (9, 3, 76, 1), (9, 4, 74, 2), (9, 6, 71, 2),
       (10, 0, 72, 3), (10, 3, 71, 1), (10, 4, 69, 2), (10, 6, 75, 2),
       (11, 0, 76, 8)]

T = lambda bar, beat=0.0: bar * BAR + beat * BEAT


def render():
    b = {k: buf() for k in ['pad', 'ep', 'pluck', 'bell', 'lead', 'bass', 'drums', 'amb']}
    sends = {'pad': 0.42, 'ep': 0.38, 'pluck': 0.4, 'bell': 0.65, 'lead': 0.42, 'bass': 0.0, 'drums': 0.2}

    for bar, beat, name, beats in PROG:
        voic, root = CH[name]
        t0, dur = T(bar, beat), beats * BEAT
        pv = 0.14 if bar < 4 else (0.17 if bar < 8 else 0.21)
        place(b['pad'], pad([mtof(m) for m in voic], dur + 0.05, pv * 1.9), t0)
        if bar >= 8:  # strings an octave up for the swell
            place(b['pad'], pad([mtof(m + 12) for m in voic[1:]], dur + 0.05, 0.09), t0)
        # soft piano: whole/half-bar chords, gently rolled
        hits = [(0, 8, 0.42)] if bar == 0 else ([(0, 4, 0.42), (4, 4, 0.28)] if beats == 4 else [(0, 4, 0.38)])
        for st, ln, v in hits:
            if st * 0.5 < beats:
                for k, m in enumerate(voic[:3]):
                    place(b['ep'], ep(mtof(m), min(ln * STEP8, dur) * 0.98, v * 0.3), t0 + st * STEP8 + k * 0.03)
        # harp: slow quarter-note arpeggio, bars 2..10
        if 2 <= bar < 11:
            tones = sorted(voic) + [voic[0] + 12, voic[1] + 12]
            pat = [0, 2, 1, 3, 4, 3, 2, 1]
            for st in range(0, int(beats * 2), 2):
                m = tones[pat[((st + int(beat * 2)) // 2) % 8] % len(tones)]
                place(b['pluck'], pluck(mtof(m), STEP8 * 3, 0.5 if st % 4 == 0 else 0.36, 0.45), t0 + st * STEP8 + rng.normal(0, 0.006), pan=-0.3)
        # bass: long tones from bar 2
        if 2 <= bar < 11:
            place(b['bass'], bass(mtof(root + 12), dur * 0.97, 0.2), t0)
        if bar == 11:  # final chord: deep root + slow harp roll down to silence
            place(b['bass'], bass(mtof(root + 12), 3.6, 0.22), t0)
            for i, m in enumerate(sorted(voic) + [voic[0] + 12, voic[2] + 12]):
                place(b['pluck'], pluck(mtof(m - 12 if i < 2 else m), 3.0, 0.42, 0.42), t0 + i * 0.11, pan=-0.25 + 0.1 * i)

    # music box: falling sighs in the intro, faint doubling at the climax, slow cascade at the end
    for bar, notes in [(0, [83, 79, 78, 76]), (1, [86, 83, 79, 76]), (2, [84, 83, 81, 76]), (3, [78, 75])]:
        for i, m in enumerate(notes):
            place(b['bell'], bell(mtof(m), 0.19 - 0.02 * i), T(bar) + (4 + i) * STEP8, pan=0.35)
    for bar, st, m, ln in MEL:
        if 8 <= bar <= 10:
            place(b['bell'], bell(mtof(m + 12), 0.05), T(bar) + st * STEP8, pan=0.4)
    for i, m in enumerate([88, 83, 79, 78, 76, 71, 67, 66]):
        place(b['bell'], bell(mtof(m), 0.15 - i * 0.011), T(11) + 0.4 + i * STEP8 * 1.1, pan=0.45 - i * 0.08)

    # flute lead (breathy, slow vibrato feel comes from the long notes)
    prev = None
    for bar, st, m, ln in MEL:
        dur = ln * STEP8 * (0.99 if ln > 1 else 0.92) + (1.9 if bar == 11 else 0)
        v = 0.23 if bar < 8 else 0.27
        place(b['lead'], flute(mtof(m), dur, v, prev), T(bar) + st * STEP8, pan=0.05)
        prev = mtof(m)

    # brushes only: half-time heartbeat (kick on 1, soft rim on 3), quiet shaker; bars 4..10
    for bar in range(4, 11):
        place(b['drums'], kick(0.26), T(bar))
        place(b['drums'], snare(0.16), T(bar, 2), pan=0.05)
        for st in range(0, 16, 2):
            place(b['drums'], shaker(0.035 if st % 4 else 0.045), T(bar) + st * STEP16, pan=-0.35)
        if bar == 7: place(b['drums'], swell(BAR * 0.5, 0.12), T(7, 2))
        if bar == 10: place(b['drums'], swell(BAR * 0.5, 0.14), T(10, 2))
    place(b['drums'], crash(0.12, 3.0), T(8), pan=-0.2)
    place(b['drums'], crash(0.1, 3.6), T(11), pan=0.2)

    # ------------------------------------------------------------ sound design (cut-synced, see tools/sfx.py)
    import os, importlib.util
    spec = importlib.util.spec_from_file_location('sfx', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx.py'))
    sfx = importlib.util.module_from_spec(spec); spec.loader.exec_module(sfx)
    sfx.design(b['amb'], place, {'SR': SR, 'lp': lp, 'hp': hp, 'bp': bp}, rng, CUTS)

    # ------------------------------------------------------------ mix
    mus = sum(b[k] for k in ['pad', 'ep', 'pluck', 'bell', 'lead', 'bass', 'drums'])
    send = sum(b[k] * v for k, v in sends.items())
    ir_n = int(2.2 * SR); it = np.arange(ir_n) / SR
    ir = np.stack([lp(rng.standard_normal(ir_n), 6000, 1) * np.exp(-it * 3.0), lp(rng.standard_normal(ir_n), 6000, 1) * np.exp(-it * 3.0)])
    ir[:, : int(0.022 * SR)] = 0
    ir /= np.abs(ir).sum(axis=1, keepdims=True) ** 0.5 * 9
    wet = np.stack([fftconvolve(send[0], ir[0])[:N], fftconvolve(send[1], ir[1])[:N]])
    mus = mus + wet * 0.9

    # 90s sampler grit: 32 kHz, 13-bit with TPDF dither, then back
    lo = resample_poly(mus, 320, 441, axis=1)
    q = 2 ** 12
    lo = np.round(lo * q + (rng.random(lo.shape) - rng.random(lo.shape))) / q
    grit = resample_poly(lo, 441, 320, axis=1)[:, :N]
    mus = 0.55 * mus + 0.45 * grit
    # tape wobble (slow pitch drift via modulated delay)
    t = np.arange(N) / SR
    d = (0.0025 + 0.0012 * np.sin(2 * np.pi * 0.45 * t) + 0.0004 * np.sin(2 * np.pi * 5.1 * t)) * SR
    idx = np.clip(np.arange(N) - d, 0, N - 1)
    i0 = np.floor(idx).astype(int); fr = idx - i0; i1 = np.minimum(i0 + 1, N - 1)
    mus = mus[:, i0] * (1 - fr) + mus[:, i1] * fr
    mus = lp(mus, 14500, 2)  # gentle 90s top end
    hiss = hp(rng.standard_normal((2, N)), 3000, 1) * 0.0018

    # per-scene SFX level (dB), short crossfades at the cuts
    sfx_db = [7.5, 8.0, 8.0, 7.0, 9.5, 13.0, 12.0, 8.0]
    g = np.zeros(N)
    for i, gd in enumerate(sfx_db):
        a_, z_ = int(CUTS[i] * SR), int(CUTS[i + 1] * SR) if i < 7 else N
        g[a_:z_] = 10 ** (gd / 20)
    g = lfilter([0.002], [1, -0.998], g) / 1.0
    b['amb'] = b['amb'] * g
    mix = hp(mus, 32, 2) * (1.0 if '--no-music' not in sys.argv else 0.0) + b['amb'] * (0.0 if '--no-sfx' in sys.argv else 1.0) + hiss
    # bus compression (RMS, slow) + soft clip limiter
    rms = np.sqrt(lfilter([0.0015], [1, -0.9985], (mix ** 2).mean(axis=0)) + 1e-9)
    thr = 0.12
    gain = np.where(rms > thr, (thr / rms) ** 0.45, 1.0)
    mix = mix * gain
    mix = mix[:, : int(LEN * SR)]
    tt = np.arange(mix.shape[1]) / SR
    mix *= np.clip(tt / 0.25, 0, 1) * np.clip((LEN - tt) / 1.4, 0, 1) ** 1.3
    mix /= np.abs(mix).max() / 0.89
    mix = np.tanh(mix * 1.15) / np.tanh(1.15)
    return mix


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'out/score.wav'
    import wave
    m = render()
    pcm = (np.clip(m.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f'wrote {out}: {m.shape[1] / SR:.3f}s at {BPM:.2f} BPM')
