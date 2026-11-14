#!/usr/bin/env python3
"""Original score for the anime short: a nostalgic 90s-console / J-RPG field theme.

101.48 BPM so that 12 bars of 4/4 last exactly 28.375 s (the film length). Key: G major.
Royal-road style progression, FM electric piano, warm strings, Karplus-Strong koto/harp arpeggio,
celesta sparkle, flute lead, fretless bass, soft brushed drums, lo-fi 90s sampler grit + tape wobble,
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
    vib = 0.006 * np.sin(2 * np.pi * 5.4 * t) * np.clip((t - 0.18) / 0.3, 0, 1)
    f = np.full(n, freq)
    if prev:  # short portamento from the previous note
        g = np.clip(t / 0.06, 0, 1); f = prev + (freq - prev) * (1 - (1 - g) ** 2)
    ph = 2 * np.pi * np.cumsum(f * (1 + vib)) / SR
    tone = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    breath = bp(rng.standard_normal(n), min(freq * 1.5, 8000), min(freq * 4, 15000), 2) * 0.12
    e = np.clip(t / 0.045, 0, 1) * np.clip(1 - (t - dur) / 0.18, 0, 1)
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
CH = {  # pad / EP voicings, bass root (MIDI)
    'Cmaj9': ([64, 67, 71, 74], 36), 'D69': ([66, 69, 71, 76], 38), 'Bm7': ([66, 69, 71, 74], 35),
    'Em9': ([67, 71, 74, 78], 40), 'E7': ([68, 71, 74, 76], 40), 'Am9': ([67, 71, 72, 76], 33),
    'D7': ([66, 69, 72, 76], 38), 'Gmaj9': ([71, 74, 78, 81], 31),
}
# (bar, beat offset, chord, beats)
PROG = [(0, 0, 'Cmaj9', 4), (1, 0, 'D69', 4), (2, 0, 'Bm7', 4), (3, 0, 'Em9', 4),
        (4, 0, 'Cmaj9', 4), (5, 0, 'D69', 4), (6, 0, 'Bm7', 4), (7, 0, 'Em9', 2), (7, 2, 'E7', 2),
        (8, 0, 'Am9', 4), (9, 0, 'Bm7', 4), (10, 0, 'Cmaj9', 2), (10, 2, 'D7', 2), (11, 0, 'Gmaj9', 4)]

# melody: (bar, 8th-step, midi, length in 8ths)
MEL = [(3, 6, 71, 1), (3, 7, 74, 1),
       (4, 0, 76, 3), (4, 3, 74, 1), (4, 4, 76, 2), (4, 6, 79, 2),
       (5, 0, 78, 3), (5, 3, 76, 1), (5, 4, 74, 2), (5, 6, 69, 1), (5, 7, 71, 1),
       (6, 0, 74, 3), (6, 3, 76, 1), (6, 4, 78, 3), (6, 7, 76, 1),
       (7, 0, 76, 4), (7, 4, 74, 1), (7, 5, 71, 1), (7, 6, 68, 2),
       (8, 0, 69, 2), (8, 2, 72, 1), (8, 3, 76, 3), (8, 6, 74, 1), (8, 7, 72, 1),
       (9, 0, 71, 2), (9, 2, 74, 1), (9, 3, 78, 3), (9, 6, 81, 2),
       (10, 0, 79, 3), (10, 3, 78, 1), (10, 4, 76, 1), (10, 5, 78, 1), (10, 6, 81, 2),
       (11, 0, 79, 8)]

T = lambda bar, beat=0.0: bar * BAR + beat * BEAT


def render():
    b = {k: buf() for k in ['pad', 'ep', 'pluck', 'bell', 'lead', 'bass', 'drums', 'amb']}
    sends = {'pad': 0.35, 'ep': 0.25, 'pluck': 0.3, 'bell': 0.55, 'lead': 0.32, 'bass': 0.0, 'drums': 0.12}

    for bar, beat, name, beats in PROG:
        voic, root = CH[name]
        t0, dur = T(bar, beat), beats * BEAT
        pv = 0.11 if bar < 2 else (0.15 if bar < 8 else 0.18)
        place(b['pad'], pad([mtof(m) for m in voic], dur + 0.05, pv * 1.7), t0)
        if bar >= 8:  # strings an octave up for the lift
            place(b['pad'], pad([mtof(m + 12) for m in voic[1:]], dur + 0.05, 0.07), t0)
        # EP comp: syncopated stabs
        hits = [(0, 2, 0.5)] if bar < 2 else [(0, 2, 0.55), (3, 1, 0.35), (5, 2, 0.42)]
        for st, ln, v in hits:
            if st * 0.5 < beats:
                for m in voic[:3]:
                    place(b['ep'], ep(mtof(m), ln * STEP8 * 0.95, v * 0.33), t0 + st * STEP8, gain=1.0)
        # koto/harp arpeggio from bar 1
        if bar >= 1 and bar < 11:
            tones = sorted(voic) + [voic[0] + 12, voic[1] + 12]
            pat = [0, 1, 2, 3, 4, 3, 2, 1]
            for st in range(int(beats * 2)):
                m = tones[pat[(st + int(beat * 2)) % 8] % len(tones)]
                v = 0.42 if st % 2 == 0 else 0.3
                place(b['pluck'], pluck(mtof(m), STEP8 * 1.6, v * 1.35, 0.55 if st % 4 else 0.7), t0 + st * STEP8 + rng.normal(0, 0.004), pan=-0.3)
        # bass from bar 2
        if 2 <= bar < 11:
            pat = [(0, 3, root), (3, 1, root + 12), (4, 2, root + 7), (6, 2, root)] if beats == 4 else [(0, 3, root), (3, 1, root + 7)]
            for st, ln, m in pat:
                place(b['bass'], bass(mtof(m + 12), ln * STEP8 * 0.92, 0.26), t0 + st * STEP8)
        if bar == 11:  # final chord: deep root + arpeggiated harp roll
            place(b['bass'], bass(mtof(root + 12), 3.4, 0.3), t0)
            place(b['bass'], bass(mtof(root), 3.4, 0.16), t0)
            for i, m in enumerate(sorted(voic) + [voic[0] + 12, voic[2] + 12]):
                place(b['pluck'], pluck(mtof(m - 12 if i < 2 else m), 2.6, 0.45, 0.5), t0 + i * 0.07, pan=-0.2 + 0.1 * i)

    # celesta sparkle: intro + doubling the melody softly + final cascade
    for bar, notes in [(0, [79, 83, 86, 88]), (1, [88, 83, 81, 78]), (2, [86, 83]), (3, [83, 86])]:
        for i, m in enumerate(notes):
            place(b['bell'], bell(mtof(m), 0.2), T(bar) + (4 + i) * STEP8, pan=0.35)
    for bar, st, m, ln in MEL[2:-1]:
        place(b['bell'], bell(mtof(m + 12), 0.06), T(bar) + st * STEP8, pan=0.4)
    for i, m in enumerate([93, 90, 86, 83, 81, 79, 78, 74]):
        place(b['bell'], bell(mtof(m), 0.17 - i * 0.012), T(11) + i * STEP8 * 0.75, pan=0.45 - i * 0.08)

    # flute lead
    prev = None
    for bar, st, m, ln in MEL:
        dur = ln * STEP8 * (0.98 if ln > 1 else 0.9) + (1.6 if bar == 11 else 0)
        v = 0.25 if bar < 8 else 0.29
        place(b['lead'], flute(mtof(m), dur, v, prev), T(bar) + st * STEP8, pan=0.05)
        prev = mtof(m)

    # drums
    swing = 0.035 * BEAT
    for bar in range(2, 12):
        for st in range(16):
            t = T(bar) + st * STEP16 + (swing if st % 4 == 2 else 0)
            full = bar >= 4 and bar < 11
            if bar == 11:
                if st == 0: place(b['drums'], kick(0.45), t); place(b['drums'], crash(0.32, 3.5), t, pan=0.2)
                continue
            if st in (0,) or (full and st in (6, 10)) or (bar == 3 and st == 10):
                place(b['drums'], kick(0.42 if st == 0 else 0.3), t)
            if (full or bar == 3) and st in (4, 12) and not (bar == 3 and st == 4):
                place(b['drums'], snare(0.38), t, pan=0.05)
            if (full or (bar == 3 and st >= 8)) and st % 2 == 0:
                place(b['drums'], hat(0.16 if st % 4 == 0 else 0.11, open_=(st == 14 and bar % 2 == 1)), t, pan=0.25)
            if st % 1 == 0 and (bar >= 2):
                place(b['drums'], shaker(0.07 if st % 2 else 0.05), t, pan=-0.35)
        if bar in (3, 7):
            for st in (13, 14, 15): place(b['drums'], snare(0.18 + 0.06 * (st - 13)), T(bar) + st * STEP16, pan=0.1)
        if bar == 10:
            for st in range(8, 16): place(b['drums'], snare(0.1 + 0.035 * (st - 8)), T(bar) + st * STEP16, pan=0.1)
            place(b['drums'], swell(BAR * 0.5, 0.2), T(10, 2), pan=0.0)
        if bar == 8: place(b['drums'], crash(0.22, 2.6), T(8), pan=-0.2)

    # ------------------------------------------------------------ ambience (cut-synced)
    amb = b['amb']
    def seg(i):
        return CUTS[i], CUTS[i + 1]
    def cicadas(t0, t1, vel, pan=0.0, fc=5200):
        n = int((t1 - t0) * SR); t = np.arange(n) / SR
        s = bp(rng.standard_normal(n), fc * 0.85, fc * 1.18, 3)
        am = (0.55 + 0.45 * np.sin(2 * np.pi * 31 * t)) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.35 * t + rng.random() * 6))
        e = np.clip(t / 0.03, 0, 1) * np.clip((t1 - t0 - t) / 0.03, 0, 1)
        place(amb, s * am * e * vel, t0, pan=pan)
    def wind(t0, t1, vel, lo=200, hi=1800):
        n = int((t1 - t0) * SR); t = np.arange(n) / SR
        s = bp(rng.standard_normal(n), lo, hi, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.23 * t + 1.3))
        e = np.clip(t / 0.04, 0, 1) * np.clip((t1 - t0 - t) / 0.04, 0, 1)
        place(amb, np.stack([s * e * vel, np.roll(s, 900) * e * vel]), t0)
    def chirp(t0, vel=0.05, pan=0.4):
        for k in range(rng.integers(2, 4)):
            n = int(0.07 * SR); t = np.arange(n) / SR
            f = 3300 + 1700 * (t / 0.07) + 300 * np.sin(2 * np.pi * 60 * t)
            place(amb, np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.07) * vel, t0 + k * 0.11, pan=pan)
    def train(t0, t1, vel, muffle=900, start=0.0):
        n = int((t1 - t0) * SR); t = np.arange(n) / SR
        rumble = lp(rng.standard_normal(n), muffle, 2) * 0.6
        clack = np.zeros(n)
        for k in np.arange(start, t1 - t0, 0.21):
            i = int(k * SR); m = min(int(0.03 * SR), n - i)
            if m > 0: clack[i:i + m] += bp(rng.standard_normal(m), 400, 2500) * np.exp(-np.arange(m) / SR * 90) * (1.0 if int(k / 0.21) % 2 else 0.7)
        e = np.clip((t - start) / 0.6, 0, 1) * np.clip((t1 - t0 - t) / 0.03, 0, 1)
        place(amb, (rumble + lp(clack, muffle * 2, 1)) * e * vel, t0)
    def hum(t0, t1, vel, f0=60):
        n = int((t1 - t0) * SR); t = np.arange(n) / SR
        s = sum(np.sin(2 * np.pi * f0 * k * t) / k for k in (1, 2, 3, 5))
        place(amb, s * vel * np.clip(t / 0.03, 0, 1) * np.clip((t1 - t0 - t) / 0.03, 0, 1), t0)

    a, z = seg(0); cicadas(a, z, 0.010, 0.2); train(a + 1.2, z, 0.05, 700, 0.0); wind(a, z, 0.006)      # railway at dusk + passing train
    a, z = seg(1); cicadas(a, z, 0.016, -0.3, 5600); hum(a, z, 0.004, 50)                                # vending machine hum
    a, z = seg(2); wind(a, z, 0.008, 300, 2500); [chirp(a + d, 0.03, p) for d, p in [(0.4, 0.5), (1.3, -0.4), (2.2, 0.3)]]
    a, z = seg(3); wind(a, z, 0.012, 250, 3000); cicadas(a, z, 0.008, -0.5)
    n = int((z - a) * SR); tt = np.arange(n) / SR                                                         # kei truck pulling away
    eng = (np.sin(2 * np.pi * 38 * tt) + 0.5 * np.sin(2 * np.pi * 76 * tt + 0.3) + 0.25 * lp(rng.standard_normal(n), 300)) * np.exp(-tt * 0.45)
    place(amb, eng * 0.02 * np.clip((z - a - tt) / 0.03, 0, 1), a, pan=-0.3 - 0.0)
    a, z = seg(4); cicadas(a, z, 0.013, 0.4, 4800); wind(a, z, 0.005)
    a, z = seg(5); cicadas(a, z, 0.011, 0.2, 5400); hum(a, z, 0.005, 50); wind(a, z, 0.006)
    a, z = seg(6); train(a, z, 0.045, 450, 0.0); hum(a, z, 0.003, 30)                                  # inside the car: muffled
    a, z = seg(7); wind(a, z, 0.016, 200, 2200); [chirp(a + d, 0.025, p) for d, p in [(0.6, -0.5), (1.9, 0.5)]]

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

    mix = hp(mus, 32, 2) + b['amb'] * 4.5 + hiss
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
