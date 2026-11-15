#!/usr/bin/env python3
"""陽炎 KAGERŌ — original opening theme (dark 2000s J-rock OP), fully synthesised with numpy/scipy.

160 BPM, 4/4, D minor, 32 bars = 48.000 s exactly (1 bar = 1.5 s, cuts land on beats, see opening/BRIEF.md).

  bars  1-4   COLD OPEN  crossing bell "kan-kan" (on the beat), higurashi cicadas, lonely music-box motif, train pass L->R
  bars  5-8   WORLD      FM piano arpeggio + strings, building toms -> snare roll, riser + reverse cymbal,
                         cicadas cut on the last beat, half-beat of total silence before the drop
  bars  9-12  DROP       title-slam impact, double-tracked distorted power chords (L/R), 8th bass, rock kit,
                         soaring supersaw hook, stripe-wipe whooshes on bars 10/11/12
  bars 13-20  THE TURN   half-time breakdown, bII (Eb) and tritone (Ab) colour, formant choir, glitch stutters,
                         ghost train + slowed crossing bell, eye "shing" + heartbeat + sub drop (bars 17-18)
  bars 21-28  CLASH      double-time kit, tremolo lead, gang "Hey!" shouts, risers, impacts every 2 beats in bars 25-28
  bars 29-32  OUTRO      hard cut: music box motif + strings, wind, birds (white egret / black crow), final chord rings out

Progression:  Dm Bb Gm A | Dm Bb C A7 | Dm Bb C A | Dm Eb Dm Ab Dm Dm Eb A | Dm C Bb A Gm Bb C A | Dm Bb Dm(add9)

usage: python3 opening/compose_theme.py [out.wav] [--spec spectrogram.png] [--no-sfx] [--no-music]
"""
import os
import sys
import importlib.util
import numpy as np
from scipy.signal import lfilter, fftconvolve, resample_poly
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('cs', os.path.join(HERE, '..', 'tools', 'compose_score.py'))
cs = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(cs)   # reuse FM piano / strings pad / bell / hats
lp, hp, bp, mtof = cs.lp, cs.hp, cs.bp, cs.mtof

SR = 44100
BPM = 160.0
BEAT = 60 / BPM              # 0.375 s
BAR = 4 * BEAT               # 1.5 s
S8, S16 = BEAT / 2, BEAT / 4
LEN = 32 * BAR               # 48.0 s
NOUT = int(round(LEN * SR))  # 2 116 800 samples
N = NOUT + 2 * SR
rng = np.random.default_rng(1644)
cs.rng = np.random.default_rng(444)
TARGET_LUFS = -12.0
CEIL = 10 ** (-1.2 / 20)     # limiter ceiling -1.2 dBFS (true-peak aware, ~-1 dBTP)


def T(bar, beat=0.0):        # bars are 1-indexed like the brief
    return (bar - 1) * BAR + beat * BEAT


def tt(d):
    return np.arange(int(d * SR)) / SR


def db(x):
    return 10 ** (x / 20)


def buf():
    return np.zeros((2, N))


def place(bus, sig, t0, pan=0.0, gain=1.0):
    i0 = int(round(t0 * SR))
    if i0 >= N or i0 < 0:
        return
    s = sig[..., : N - i0] * gain
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    if s.ndim == 1:
        bus[0, i0:i0 + len(s)] += s * l; bus[1, i0:i0 + len(s)] += s * r
    else:
        bus[0, i0:i0 + s.shape[1]] += s[0] * l; bus[1, i0:i0 + s.shape[1]] += s[1] * r


def place_pan(bus, s, t0, pan0, pan1, k=12):
    n = len(s)
    for j in range(k):
        a, b = j * n // k, (j + 1) * n // k
        place(bus, s[a:b], t0 + a / SR, pan0 + (pan1 - pan0) * (j + 0.5) / k)


def fade(s, a=0.005, r=0.02):
    n = s.shape[-1]; t = np.arange(n) / SR
    return s * np.clip(t / a, 0, 1) * np.clip((n / SR - t) / r, 0, 1)


def saw(f, t0=0.0):
    """polyBLEP band-limited saw; f = scalar or per-sample array."""
    f = np.broadcast_to(np.asarray(f, float), np.shape(f) if np.ndim(f) else (1,))
    ph = (np.cumsum(f) / SR + t0) % 1.0
    dt = np.clip(f / SR, 1e-6, 0.5)
    y = 2 * ph - 1
    m = ph < dt; x = ph[m] / dt[m]; y[m] -= x + x - x * x - 1
    m = ph > 1 - dt; x = (ph[m] - 1) / dt[m]; y[m] -= x * x + x + x + 1
    return y


def ir(dur, decay, lpf=6500, pre=0.02, seed=0):
    r = np.random.default_rng(seed); n = int(dur * SR); t = np.arange(n) / SR
    h = np.stack([lp(r.standard_normal(n), lpf, 1) * np.exp(-t * decay) for _ in range(2)])
    h[:, : int(pre * SR)] = 0
    return h / np.sqrt((h ** 2).sum(axis=1, keepdims=True)) * 0.5


def conv(x, h):
    return np.stack([fftconvolve(x[0], h[0])[:N], fftconvolve(x[1], h[1])[:N]])


# ===================================================================== instruments
def kick(vel=1.0):
    t = tt(0.45)
    f = 48 + 110 * np.exp(-t * 38) + 900 * np.exp(-t * 400)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    s += hp(rng.standard_normal(len(t)), 2500, 2) * np.exp(-t * 180) * 0.5        # beater click
    return np.tanh(s * 1.8) * vel


def snare(vel=0.8, tone=190):
    t = tt(0.45)
    body = (np.sin(2 * np.pi * tone * t) + 0.5 * np.sin(2 * np.pi * tone * 1.6 * t)) * np.exp(-t * 28)
    wires = bp(rng.standard_normal(len(t)), 1500, 9000, 2) * np.exp(-t * 13)
    crack = hp(rng.standard_normal(len(t)), 3000, 2) * np.exp(-t * 90)
    return np.tanh((body * 0.7 + wires * 1.1 + crack * 0.6) * 1.4) * vel


def tom(midi, vel=0.7):
    t = tt(0.6); f0 = mtof(midi)
    f = f0 * (1 + 0.6 * np.exp(-t * 25))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) + bp(rng.standard_normal(len(t)), 300, 3000) * np.exp(-t * 40) * 0.3
    return np.tanh(s * 1.3) * vel


def hat(vel=0.25, open_=False):
    return cs.hat(vel, open_)


def crash(vel=0.4, dur=3.0):
    t = tt(dur)
    s = hp(rng.standard_normal(len(t)), 3800, 2) + 0.5 * bp(rng.standard_normal(len(t)), 600, 3800, 1) * np.exp(-t * 6)
    return s * np.exp(-t * 1.5) * (1 - np.exp(-t * 3000)) * vel


def china(vel=0.3):
    t = tt(1.2)
    s = bp(rng.standard_normal(len(t)), 2000, 9000, 2)
    s = np.tanh(s * 3) * (0.6 + 0.4 * np.sin(2 * np.pi * 410 * t))
    return s * np.exp(-t * 4.5) * vel


def heartbeat(vel=1.0):
    out = np.zeros(int(0.6 * SR))
    for off, a in [(0.0, 1.0), (0.17, 0.7)]:
        t = tt(0.3); f = 34 + 40 * np.exp(-t * 30)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * (1 - np.exp(-t * 300))
        i = int(off * SR); out[i:i + len(s)] += s * a
    return np.tanh(lp(out, 180, 2) * 2.0) * vel


def guitar_note(midis, dur, vel=1.0, mute=False, detune_seed=0):
    """clean DI of a power chord: 3 detuned saws + 1 pulse per string, pick noise; distorted later on the bus."""
    r = np.random.default_rng(detune_seed)
    d = dur + (0.03 if mute else 0.08); t = tt(d); n = len(t)
    x = np.zeros(n)
    for m in midis:
        f0 = mtof(m)
        for c in (-7, 0, 6):
            f = f0 * 2 ** ((c + r.normal(0, 1.5)) / 1200)
            x += saw(np.full(n, f), r.random())
        p = r.random(); fp = np.full(n, f0 * 1.002)
        x += 0.7 * (saw(fp, p) - saw(fp, (p + 0.42) % 1))     # pulse = difference of two saws
    x /= len(midis) * 4
    x += bp(r.standard_normal(n), 1500, 6000) * np.exp(-t * 120) * 0.6        # pick
    if mute:
        e = np.exp(-t * 22) * (1 - np.exp(-t * 2000)); x = lp(x, 900, 2)
    else:
        e = (1 - np.exp(-t * 2000)) * (0.55 + 0.45 * np.exp(-t * 3))
    e *= np.clip((d - t) / 0.03, 0, 1)
    return x * e * vel


def distort(x, drive=14.0, bias=0.28):
    """2x oversampled: asymmetric tanh -> foldback -> tanh; then cab sim (mid scoop, LP 4.5 kHz, HP 75 Hz)."""
    u = resample_poly(hp(x, 95, 2), 2, 1)
    y = np.tanh(drive * u + bias) - np.tanh(bias)
    y = y * 1.35; th = 0.95
    y = np.where(np.abs(y) > th, np.sign(y) * (2 * th - np.abs(y)), y)         # foldback
    y = np.tanh(2.2 * y)
    y = resample_poly(y, 1, 2)[: len(x)]
    y = y - 0.35 * bp(y, 320, 650, 2) + 0.25 * bp(y, 1800, 3200, 2)
    return lp(hp(y, 75, 2), 4500, 4) * 0.5


def bass_note(midi, dur, vel=0.6):
    d = dur + 0.04; t = tt(d); f = mtof(midi)
    s = 0.7 * saw(np.full(len(t), f)) + np.sin(2 * np.pi * f * t) * 0.9
    s = lp(np.tanh(s * 2.2), 1100, 2) + np.sin(2 * np.pi * f * t) * 0.5
    e = (1 - np.exp(-t * 900)) * (0.7 + 0.3 * np.exp(-t * 10)) * np.clip((d - t) / 0.025, 0, 1)
    s[: int(0.004 * SR)] += rng.uniform(-0.3, 0.3, int(0.004 * SR))          # pick click
    return s * e * vel


def line(notes, bar0, span_bars, glide=0.035, vib=0.012, trem=False, gap=0.9):
    """monophonic line -> (freq, amp) arrays from T(bar0), notes = [(bar, step8, midi, len8)]."""
    n = int(span_bars * BAR * SR) + SR
    f = np.zeros(n); a = np.zeros(n); t = np.arange(n) / SR
    prev = None
    for bar, st, m, ln in notes:
        i0 = int((T(bar) + st * S8 - T(bar0)) * SR); i1 = i0 + int(ln * S8 * gap * SR)
        seg = np.arange(i1 - i0) / SR; ft = mtof(m)
        if prev is None:
            fs = np.full(len(seg), ft)
        else:
            g = np.clip(seg / glide, 0, 1); fs = prev + (ft - prev) * (1 - (1 - g) ** 3)
        f[i0:i1] = fs * (1 + vib * np.sin(2 * np.pi * 5.6 * seg) * np.clip((seg - 0.18) / 0.25, 0, 1))
        a[i0:i1] = np.clip(seg / 0.012, 0, 1) * np.clip((len(seg) / SR - seg) / 0.02, 0, 1)
        if len(seg): f[i1:] = fs[-1]
        prev = ft
    if trem:   # 16th-note tremolo picking
        a *= 0.35 + 0.65 * (1 - ((t * BPM / 60 * 4) % 1.0)) ** 1.6
    return f, a


def supersaw(f, a, voices=5, spread=0.011, cutoff=5200, drive=1.6):
    L = np.zeros(len(f)); R = np.zeros(len(f))
    for k in range(voices):
        det = 1 + spread * (k - (voices - 1) / 2) / ((voices - 1) / 2)
        s = saw(f * det, rng.random())
        w = 1.0 if k == voices // 2 else 0.7
        if k % 2: L += s * w
        else: R += s * w
        if k == voices // 2: L += s * w
    sub = np.sin(2 * np.pi * np.cumsum(f * 0.5) / SR) * 0.5
    out = []
    for ch in (L, R):
        y = np.tanh((ch / voices + sub * 0.3) * drive)
        out.append(lp(hp(y, 180, 2), cutoff, 2) * a)
    return np.stack(out)


def choir(midis, dur, vel=0.2, vowel='ah'):
    t = tt(dur + 1.2); n = len(t)
    F = {'ah': [(700, 1.0, 90), (1150, 0.6, 110), (2650, 0.25, 160)],
         'oo': [(330, 1.0, 70), (800, 0.45, 90), (2400, 0.12, 150)]}[vowel]
    out = []
    for ch in range(2):
        src = np.zeros(n)
        for m in midis:
            for v in range(3):
                f = mtof(m) * 2 ** (rng.normal(0, 9) / 1200) * (1 + 0.006 * np.sin(2 * np.pi * (5.0 + rng.random()) * t + rng.random() * 6))
                src += saw(f, rng.random())
        src += bp(rng.standard_normal(n), 2000, 7000) * 0.4                 # breath
        y = sum(g * bp(src, fc - bw, fc + bw, 2) for fc, g, bw in F)
        out.append(y)
    e = np.clip(t / 0.45, 0, 1) ** 1.5 * np.clip(1 - (t - dur) / 1.1, 0, 1)
    return np.stack(out) * e * vel / len(midis)


def music_box(midi, vel=0.2):
    s = cs.bell(mtof(midi), vel)
    t = np.arange(len(s)) / SR
    s += np.sin(2 * np.pi * mtof(midi) * 4.0 * t) * np.exp(-t * 18) * vel * 0.2   # tine ping
    return s


def gang_hey(vel=0.5):
    """'Hey!' = 6 voices (glottal saws + noise) through formants gliding e -> i."""
    d = 0.32; t = tt(d); n = len(t)
    src = np.zeros(n)
    for v in range(6):
        f0 = rng.uniform(150, 230) * (1 + 0.12 * np.exp(-t * 12)) * (1 - 0.05 * t / d)
        src += saw(f0, rng.random()) * rng.uniform(0.7, 1.0)
    src = src / 6 + rng.standard_normal(n) * (0.25 + 0.9 * np.exp(-t * 40))   # breathy "h" onset
    k = np.clip((t - 0.09) / 0.12, 0, 1)
    E = sum(g * bp(src, fc - bw, fc + bw, 2) for fc, g, bw in [(560, 1.0, 110), (1850, 0.7, 180), (2500, 0.35, 200)])
    I = sum(g * bp(src, fc - bw, fc + bw, 2) for fc, g, bw in [(300, 1.0, 80), (2250, 0.6, 200), (3000, 0.35, 220)])
    y = E * (1 - k) + I * k
    e = np.clip(t / 0.012, 0, 1) * np.exp(-np.clip(t - 0.16, 0, None) * 18)
    return np.tanh(y * e * 4) * vel


# ===================================================================== SFX (tools/sfx.py style)
def bell_partials(base, d, partials):
    t = tt(d)
    return sum(a * np.sin(2 * np.pi * base * r * t + rng.random()) * np.exp(-t / dec) for r, a, dec in partials) * (1 - np.exp(-t * 2000))


def crossing_bell(bus, t0, t1, vel, pan, period=BEAT, rate=1.0, muffle=None):   # fumikiri "kan-kan", A5 / Bb5
    tc = t0; k = 0
    while tc < t1 - 0.01:
        s = bell_partials((880 if k % 2 else 932) * rate, 0.55, ((1, 1, 0.25), (2.4, 0.5, 0.12), (3.9, 0.25, 0.08)))
        if muffle: s = lp(s, muffle, 2)
        place(bus, s * vel, tc, pan); tc += period; k += 1


def higurashi(bus, t0, dur, vel, pan):
    tc = t0; k = 0; n = int(dur / 0.105)
    while tc < t0 + dur:
        d = 0.07; f = 4900 - 900 * (k / n); t = tt(d)
        ph = 2 * np.pi * np.cumsum(f + 250 * np.sin(2 * np.pi * 14 * t)) / SR
        s = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * fade(np.ones(len(t)), 0.005, 0.03)
        place(bus, s * vel * (1 - 0.6 * k / n), tc, pan); tc += 0.105; k += 1


def aburazemi(dur, vel):           # brown cicada sizzle (stereo)
    t = tt(dur)
    out = []
    for c in range(2):
        s = bp(rng.standard_normal(len(t)), 3000, 7500, 2) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.3 * t + rng.random() * 6))
        out.append(s * (0.7 + 0.3 * np.abs(np.sin(2 * np.pi * (47 + 3 * c) * t))))
    return np.stack(out) * vel


def train(dur, speed=13.6, muffle=5000, start_in=0.8, end_out=1.0, whine=True, pitch=1.0):
    t = tt(dur); n = len(t)
    s = lp(rng.standard_normal(n), 260, 2) * 0.7 + bp(rng.standard_normal(n), 300, 1200, 2) * 0.25
    clack = np.zeros(n); car = 20.0 / speed; tc = 0.1
    while tc < dur:
        for o in (0.0, 2.1 / speed, 14.0 / speed, 16.1 / speed):
            i = int((tc + o) * SR); m = min(int(0.045 * SR), n - i)
            if 0 <= i < n and m > 0:
                mm = np.arange(m) / SR
                clack[i:i + m] += (bp(rng.standard_normal(m), 350, 3200, 2) + np.sin(2 * np.pi * 140 * pitch * mm) * 0.6) * np.exp(-mm * 70)
        tc += car
    s += clack * 1.3
    if whine:
        ph = 2 * np.pi * np.cumsum((760 + 220 * t / dur) * pitch) / SR
        s += (np.sin(ph) + 0.4 * np.sin(2 * ph)) * 0.05
    s = lp(s, muffle, 2)
    return s * np.clip(t / start_in, 0, 1) ** 1.5 * np.clip((dur - t) / end_out, 0, 1)


def impact(vel=1.0, sub=1.0, tail=1.6, ring=0.0):
    t = tt(tail); n = len(t)
    f = 30 + 70 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6) * sub
    crack = bp(rng.standard_normal(n), 150, 5000, 2) * np.exp(-t * 22)
    air = hp(rng.standard_normal(n), 5000, 2) * np.exp(-t * 6) * 0.25
    air += ring * sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in [(1175, 9), (1773, 12), (2794, 16), (3557, 20)]) * 0.25
    s = np.tanh((boom * 1.4 + crack * 0.9 + air) * 1.6)
    return np.stack([s, np.roll(s, 40) * 0.98]) * vel


def whoosh(pre=0.35, post=0.3, vel=0.5, up=True):
    d = pre + post; t = tt(d)
    e = np.where(t < pre, (t / pre) ** 2.5, np.exp(-(t - pre) * 11))
    nz = rng.standard_normal(len(t))
    k = np.clip(t / pre, 0, 1) if up else 1 - np.clip(t / pre, 0, 1)
    s = lp(nz, 900, 2) * (1 - k) * 1.4 + bp(nz, 1500, 7000, 2) * k
    return s * e * vel


def riser(dur, vel=0.4, f0=180, f1=2400):
    t = tt(dur); x = t / dur
    f = f0 * (f1 / f0) ** (x ** 1.4)
    tone_ = saw(f) * 0.25 + saw(f * 1.5, 0.3) * 0.12
    nz = hp(rng.standard_normal(len(t)), 1200, 2) * x ** 2
    return (lp(tone_, 6000, 2) * x ** 1.8 + nz * 0.8) * vel


def rev_cymbal(dur, vel=0.4):
    return crash(vel, dur)[::-1].copy()


def shing(vel=0.5):                 # glass / eye glint
    t = tt(1.8)
    s = sum(a * np.sin(2 * np.pi * f * (1 + 0.02 * t) * t + rng.random() * 6) * np.exp(-t * dk)
            for f, a, dk in [(2637, 1.0, 2.2), (3951, 0.7, 2.8), (5274, 0.6, 3.4), (7040, 0.45, 4.5), (9397, 0.3, 6)])
    s += hp(rng.standard_normal(len(t)), 6000, 2) * np.exp(-t * 30) * 0.8
    s *= 1 - np.exp(-t * 3000)
    return np.stack([s, np.roll(s, 220)]) * vel


def sub_drop(dur=2.6, vel=0.8):
    t = tt(dur); f = 62 * (28 / 62) ** (t / dur)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.clip(t / 0.01, 0, 1) * np.clip((dur - t) / 0.6, 0, 1) * vel


def sparrow(bus, t0, vel, pan, n=4):
    tc = t0
    for _ in range(n):
        d = rng.uniform(0.05, 0.09); f0 = rng.uniform(3600, 4600); t = tt(d)
        ph = 2 * np.pi * np.cumsum(f0 + 900 * np.sin(np.pi * t / d) - 600 * t / d) / SR
        s = (np.sin(ph) + 0.35 * np.sin(2 * ph)) * fade(np.ones(len(t)), 0.004, 0.02)
        place(bus, s * vel * rng.uniform(0.7, 1.0), tc, pan + rng.uniform(-0.1, 0.1)); tc += rng.uniform(0.11, 0.24)


def crow(bus, t0, vel, pan, n=2, f0=540):
    tc = t0
    for _ in range(n):
        d = 0.34; t = tt(d)
        ph = 2 * np.pi * np.cumsum(f0 * (1 + 0.08 * np.sin(np.pi * t / d)) * (1 - 0.06 * t / d)) / SR
        s = sum((0.9 ** k) * np.sin(k * ph) for k in range(1, 9))
        s = bp(s, 700, 2600, 2) + bp(rng.standard_normal(len(t)), 900, 2400, 2) * 0.35
        place(bus, s * (0.75 + 0.25 * np.sin(2 * np.pi * 70 * t)) * fade(np.ones(len(t)), 0.02, 0.12) * vel, tc, pan); tc += 0.48


def flaps(bus, t0, period, count, vel, pan0, pan1):
    for i in range(count):
        d = 0.16; t = tt(d)
        s = bp(rng.standard_normal(len(t)), 180, 1400, 2) * np.sin(np.pi * t / d) ** 2
        s += lp(rng.standard_normal(len(t)), 220, 2) * np.sin(np.pi * t / d) ** 3 * 1.5
        k = i / max(1, count - 1)
        place(bus, s * vel * (1 - 0.6 * k), t0 + i * period, pan0 + (pan1 - pan0) * k)


def wind(dur, vel, lo=180, hi=1600, gust=0.21):
    t = tt(dur)
    g = 0.55 + 0.45 * np.sin(2 * np.pi * gust * t + rng.random() * 6) ** 2
    return np.stack([bp(rng.standard_normal(len(t)), lo, hi, 2) * g,
                     bp(rng.standard_normal(len(t)), lo, hi, 2) * np.roll(g, int(0.4 * SR))]) * vel


# ===================================================================== harmony & melody
CH = {  # voicing (pad / piano), bass root, power chord (guitar)
    'Dm':   ([62, 65, 69, 74], 38, [50, 57, 62]),   'Dm9': ([62, 64, 65, 69, 74], 38, [50, 57, 62]),
    'Bb':   ([58, 62, 65, 70], 34, [46, 53, 58]),   'Gm':  ([55, 58, 62, 67], 31, [43, 50, 55]),
    'A':    ([57, 61, 64, 69], 33, [45, 52, 57]),   'A7':  ([57, 61, 64, 67], 33, [45, 52, 57]),
    'C':    ([55, 60, 64, 67], 36, [48, 55, 60]),   'Eb':  ([55, 58, 63, 67], 39, [39, 46, 51]),
    'Ab':   ([56, 60, 63, 68], 32, [44, 51, 56]),   'DmL': ([62, 65, 69, 74], 38, [38, 45, 50]),
    'AL':   ([57, 61, 64, 69], 33, [45, 52, 57]),
}
PROG = {1: 'Dm', 2: 'Bb', 3: 'Gm', 4: 'A', 5: 'Dm', 6: 'Bb', 7: 'C', 8: 'A7', 9: 'Dm', 10: 'Bb', 11: 'C', 12: 'A',
        13: 'DmL', 14: 'Eb', 15: 'DmL', 16: 'Ab', 17: 'DmL', 18: 'DmL', 19: 'Eb', 20: 'AL',
        21: 'Dm', 22: 'C', 23: 'Bb', 24: 'A', 25: 'Gm', 26: 'Bb', 27: 'C', 28: 'A', 29: 'Dm', 30: 'Bb', 31: 'Dm9', 32: 'Dm9'}

# (bar, 8th step, midi, length in 8ths)
MOTIF = [(1, 0, 81, 2), (1, 2, 77, 2), (1, 4, 76, 1), (1, 5, 74, 3),
         (2, 0, 77, 2), (2, 2, 74, 2), (2, 4, 72, 1), (2, 5, 74, 3),
         (3, 0, 82, 2), (3, 2, 79, 2), (3, 4, 77, 1), (3, 5, 76, 1), (3, 6, 74, 2),
         (4, 0, 73, 2), (4, 2, 76, 2), (4, 4, 81, 4)]
HOOK = [(9, 0, 74, 2), (9, 2, 77, 1), (9, 3, 81, 3), (9, 6, 79, 1), (9, 7, 77, 1),
        (10, 0, 77, 2), (10, 2, 74, 1), (10, 3, 77, 1), (10, 4, 82, 3), (10, 7, 81, 1),
        (11, 0, 79, 3), (11, 3, 76, 1), (11, 4, 72, 2), (11, 6, 76, 1), (11, 7, 79, 1),
        (12, 0, 81, 3), (12, 3, 79, 1), (12, 4, 76, 2), (12, 6, 73, 1), (12, 7, 76, 1)]
TURN = [(13, 0, 74, 6), (13, 6, 75, 2), (14, 0, 74, 4), (14, 4, 70, 4),
        (15, 0, 69, 6), (15, 6, 68, 2), (16, 0, 68, 4), (16, 4, 63, 4),
        (19, 0, 70, 4), (19, 4, 75, 4), (20, 0, 76, 4), (20, 4, 73, 2), (20, 6, 76, 2)]
CLASH = [(21, 0, 81, 4), (21, 4, 77, 4), (22, 0, 79, 4), (22, 4, 76, 4), (23, 0, 77, 4), (23, 4, 74, 4),
         (24, 0, 76, 4), (24, 4, 73, 2), (24, 6, 76, 2), (25, 0, 82, 4), (25, 4, 81, 2), (25, 6, 79, 2),
         (26, 0, 82, 2), (26, 2, 86, 6), (27, 0, 88, 4), (27, 4, 86, 2), (27, 6, 84, 2), (28, 0, 85, 4), (28, 4, 88, 4)]
OUTRO = [(29, 0, 81, 2), (29, 2, 77, 2), (29, 4, 76, 1), (29, 5, 74, 3),
         (30, 0, 77, 2), (30, 2, 74, 2), (30, 4, 72, 1), (30, 5, 74, 3)]


def shift(notes, d):
    return [(b, s, m + d, l) for b, s, m, l in notes]


# ===================================================================== arrangement
def render():
    B = {k: buf() for k in ['keys', 'pad', 'gtr', 'bass', 'lead', 'choir', 'drums', 'snare', 'fx', 'amb', 'outro']}
    gL, gR = np.zeros(N), np.zeros(N)                   # guitar DI tracks (double-tracked)

    def gtr(bar, st, chord, ln, vel=1.0, mute=False, oct_=True):
        pc = CH[chord][2]
        notes = pc + ([pc[0] - 12] if oct_ and pc[0] >= 45 else [])
        t0 = T(bar) + st * S8
        for trk, seed, dt in ((gL, 11, 0.0), (gR, 23, 0.011)):
            s = guitar_note(notes, ln * S8 * 0.96, vel, mute, seed + bar * 37 + int(st * 4))
            i0 = int((t0 + dt + rng.normal(0, 0.002)) * SR); trk[i0:i0 + len(s)] += s[: N - i0]

    # ---------------- 1-4 cold open: music box + soft low piano
    for bar, st, m, ln in MOTIF:
        place(B['keys'], music_box(m + 12, 0.20), T(bar) + st * S8 + rng.normal(0, 0.004), pan=0.25)
    for bar in range(1, 5):
        v, root = CH[PROG[bar]][0], CH[PROG[bar]][1]
        place(B['keys'], cs.ep(mtof(root + 12), BAR * 0.95, 0.10), T(bar), pan=-0.15)
        place(B['keys'], cs.ep(mtof(v[1]), BAR * 0.9, 0.05), T(bar, 1), pan=-0.1)
    # ---------------- 5-8 world: piano 8th arpeggio + strings
    for bar in range(5, 9):
        v, root, _ = CH[PROG[bar]]
        tones = sorted(v) + [v[1] + 12]
        for st, ti in enumerate([0, 2, 4, 1, 3, 2, 4, 3]):
            place(B['keys'], cs.ep(mtof(tones[ti]), S8 * 1.6, 0.16 + 0.03 * (st % 2 == 0) + 0.01 * (bar - 5)), T(bar) + st * S8, pan=-0.2)
        place(B['keys'], cs.ep(mtof(root + 12), BAR * 0.95, 0.14), T(bar), pan=0.0)
        place(B['pad'], cs.pad([mtof(m) for m in v], BAR + 0.02, 0.16 + 0.04 * (bar - 5)), T(bar))
        place(B['bass'], bass_note(root, BAR * 0.95, 0.20 + 0.05 * (bar - 5)), T(bar))
    for bar, st, m, ln in MOTIF[:8]:                         # motif answers on music box in bars 7-8
        place(B['keys'], music_box(m + 12, 0.08), T(bar + 6) + st * S8, pan=0.4)

    # ---------------- 9-12 drop
    for bar in range(9, 13):
        c = PROG[bar]; v, root, _ = CH[c]
        if bar == 9:
            gtr(9, 0, c, 4, 1.0); [gtr(9, s, c, 1, 0.9, True) for s in (4, 5)]; gtr(9, 6, c, 2, 1.0)
        else:
            for s, ln, mu in [(0, 3, False), (3, 1, True), (4, 1, True), (5, 1, False), (6, 1, True), (7, 1, False)]:
                gtr(bar, s, c, ln, 1.0 if not mu else 0.9, mu)
        for s in range(8):
            place(B['bass'], bass_note(root + (12 if s == 7 else 0), S8 * 0.85, 0.55 if s % 2 == 0 else 0.45), T(bar) + s * S8)
        place(B['pad'], cs.pad([mtof(m + 12) for m in v[1:]], BAR + 0.02, 0.18), T(bar))
        place(B['pad'], cs.pad([mtof(m) for m in v], BAR + 0.02, 0.18), T(bar))
    f, a = line(HOOK, 9, 4, glide=0.04)
    place(B['lead'], supersaw(f, a) * 0.42, T(9))
    place(B['lead'], supersaw(f * 2, a, 3, 0.006, 7000) * 0.10, T(9), pan=0.2)       # octave sparkle
    for bar, st, m, ln in HOOK:
        place(B['keys'], music_box(m + 24, 0.035), T(bar) + st * S8, pan=-0.45)

    # ---------------- 13-20 the turn (half-time)
    for bar in range(13, 21):
        c = PROG[bar]; v, root, _ = CH[c]
        if bar in (17, 18):
            place(B['choir'], choir([62, 65, 69], BAR, 0.20, 'oo'), T(bar))
            if bar == 17:
                place(B['bass'], np.sin(2 * np.pi * mtof(26) * tt(2 * BAR)) * fade(np.ones(int(2 * BAR * SR)), 0.3, 0.4) * 0.25, T(17))
            continue
        gtr(bar, 0, c, 4 if bar == 20 else 6, 1.0, oct_=False)
        if bar == 20:
            for s in range(6, 8): gtr(bar, s, c, 1, 0.95, True, False)
            [gtr(bar, s, c, 1, 0.95, True, False) for s in range(4, 6)]
        else:
            gtr(bar, 6, c, 1, 0.9, True, False); gtr(bar, 7, c, 1, 0.9, True, False)
        place(B['bass'], bass_note(root, BAR * 0.9, 0.62), T(bar))
        place(B['choir'], choir(v[:3], BAR, 0.24, 'ah'), T(bar))
        place(B['pad'], cs.pad([mtof(m - 12) for m in v[:3]], BAR, 0.14), T(bar))
    f, a = line(TURN, 13, 8, glide=0.09, vib=0.02)
    place(B['lead'], supersaw(f, a, 5, 0.018, 2600, 2.4) * 0.30, T(13))
    for bar, st, m, ln in [(14, 4, 87, 1), (14, 5, 86, 1), (16, 4, 80, 1), (16, 5, 75, 1), (18, 0, 81, 2), (18, 2, 77, 2),
                           (18, 4, 76, 1), (18, 5, 74, 3)]:    # broken music box (detuned) over the eye close-up
        place(B['keys'], music_box(m + 12 + 0.3, 0.06), T(bar) + st * S8, pan=0.5)

    # ---------------- 21-28 clash
    for bar in range(21, 29):
        c = PROG[bar]; v, root, _ = CH[c]
        gtr(bar, 0, c, 1, 1.0)
        for s16 in range(2, 16):                              # 16th chug, open accents on the 8th offbeats of beat 3
            if s16 in (8, 12):
                gtr(bar, s16 / 2, c, 1, 1.0)
            elif s16 not in (9, 13):
                gtr(bar, s16 / 2, c, 0.5, 0.85, True)
        for s in range(8):
            place(B['bass'], bass_note(root + (12 if s % 2 else 0), S8 * 0.8, 0.55), T(bar) + s * S8)
        place(B['pad'], cs.pad([mtof(m + 12) for m in v[1:]], BAR + 0.02, 0.2), T(bar))
        place(B['choir'], choir([m + 12 for m in v[:3]], BAR, 0.1, 'ah'), T(bar))
    f, a = line(CLASH, 21, 8, glide=0.03, trem=True, gap=0.97)
    place(B['lead'], supersaw(f, a, 5, 0.012, 6000, 2.0) * 0.40, T(21))
    place(B['lead'], supersaw(f / 2, a, 3, 0.008, 3500, 2.0) * 0.18, T(21), pan=-0.2)

    # ---------------- drums
    D, SN = B['drums'], B['snare']
    for bar in range(5, 9):                                   # building toms -> roll
        if bar == 5:
            for b_ in (0, 2): place(D, tom(43, 0.3), T(bar, b_), pan=0.2)
        elif bar == 6:
            place(D, kick(0.45), T(bar))
            for b_ in range(4): place(D, tom(43 if b_ % 2 else 47, 0.32), T(bar, b_), pan=0.2 - 0.3 * (b_ % 2))
        elif bar == 7:
            for b_ in (0, 1.5, 2): place(D, kick(0.55), T(bar, b_))
            for s in range(8): place(D, tom([47, 45, 43, 40][s % 4], 0.3 + 0.03 * s), T(bar) + s * S8, pan=0.4 - 0.25 * (s % 4))
        else:
            place(D, kick(0.8), T(bar)); place(D, kick(0.8), T(bar, 2))
            hits = [i * S16 for i in range(8)] + [BEAT * 2 + i * S16 / 2 for i in range(12)]   # 16ths -> 32nds
            for i, h in enumerate(hits):
                if h < BEAT * 3.5 - 0.01:
                    place(SN, snare(0.25 + 0.55 * h / (BEAT * 3.5)), T(bar) + h, pan=rng.uniform(-0.1, 0.1))
    for bar in range(9, 13):                                  # rock beat
        place(D, crash(0.5 if bar > 9 else 0.65), T(bar), pan=-0.4 if bar % 2 else 0.4)
        for b_ in (0, 1.5, 2, 2.75 if bar % 2 == 0 else 3.5): place(D, kick(1.0), T(bar, b_))
        for b_ in (1, 3): place(SN, snare(0.9), T(bar, b_))
        for s in range(8): place(D, hat(0.22 if s % 2 else 0.3, s == 7), T(bar) + s * S8, pan=0.35)
    for i in range(4): place(SN, snare(0.5 + 0.12 * i), T(12, 3) + i * S16)      # fill into the turn
    for bar in range(13, 21):                                 # half-time
        if bar in (17, 18):
            for b_ in (0, 2): place(D, heartbeat(1.0), T(bar, b_))
            continue
        place(D, crash(0.45) if bar in (13, 15, 19) else china(0.35), T(bar), pan=0.4)
        for b_ in (0, 1.5, 3.5) if bar != 20 else (0, 1.5): place(D, kick(1.0), T(bar, b_))
        place(SN, snare(1.0, 170), T(bar, 2))
        for b_ in range(4): place(D, hat(0.28, True), T(bar, b_), pan=-0.35)
    for i in range(8): place(D, tom([50, 47, 45, 43, 50, 47, 43, 40][i], 0.6), T(20, 2) + i * S16, pan=0.4 - 0.1 * i)
    for bar in range(21, 29):                                 # double-time
        place(D, crash(0.55), T(bar), pan=0.45 if bar % 2 else -0.45)
        for b_ in range(4): place(D, kick(1.0), T(bar, b_))
        if bar >= 25:
            for s in range(16):
                if s % 4: place(D, kick(0.55), T(bar) + s * S16)
        for b_ in (0.5, 1.5, 2.5, 3.5): place(SN, snare(0.85), T(bar, b_))
        for s in range(16): place(D, hat(0.16 if s % 2 else 0.22), T(bar) + s * S16, pan=0.35)
    for i in range(8): place(SN, snare(0.6 + 0.05 * i), T(28, 2) + i * S16)

    # ---------------- glitch stutter snares (the turn)
    for bar, beat, reps, rate in [(14, 3.0, 8, 1.06), (16, 2.5, 12, 1.08), (20, 3.5, 6, 1.12)]:
        for i in range(reps):
            s = snare(0.7, 170)[: int(S16 / 2 * SR * 0.9)]
            s = resample_poly(s, 100, int(100 * rate ** i))       # pitch climbs each repeat
            s = np.round(s * 24) / 24                              # bit crush
            place(SN, fade(s, 0.001, 0.004), T(bar, beat) + i * S16 / 2, pan=(-1) ** i * 0.5)

    # ---------------- FX layer (risers, impacts, whooshes, shouts)
    FX = B['fx']
    place(FX, riser(2 * BAR - BEAT / 2, 0.35), T(7))
    place(FX, rev_cymbal(BAR, 0.55), T(8, 3.5) - BAR, pan=0.0)
    place(FX, impact(1.0, 1.2, 2.4), T(9))                                      # title slam
    place(FX, rev_cymbal(BAR * 0.66, 0.3), T(13) - BAR * 0.66)
    place(FX, impact(0.6, 1.0, 2.0), T(13))
    for bar in (10, 11, 12):                                                    # stripe wipes
        place_pan(FX, whoosh(0.32, 0.28, 1.6), T(bar) - 0.32, -0.8, 0.8)
    place(FX, shing(1.3), T(17))
    place(FX, sub_drop(2.6, 0.9), T(17))
    place(FX, impact(0.8, 1.2, 2.0), T(21))
    place(FX, riser(BAR * 2, 0.32, 300, 3500), T(19))
    place(FX, riser(BAR, 0.3, 400, 3000), T(24))
    place(FX, riser(BAR * 2, 0.36, 300, 4200), T(27))
    for k in range(8):                                                          # impacts every 2 beats, bars 25-28
        place(FX, impact(1.0 + 0.05 * k, 0.8, 0.7, 1.0), T(25) + k * 2 * BEAT, pan=(-1) ** k * 0.25)
    for bar, beat in [(22, 3.5), (24, 3.5), (26, 3.0), (26, 3.5), (28, 2.0), (28, 3.0)]:
        place(FX, gang_hey(1.3), T(bar, beat), pan=-0.3); place(FX, gang_hey(1.2), T(bar, beat) + 0.012, pan=0.3)
    for bar in (23, 27): place_pan(FX, whoosh(0.3, 0.25, 0.4), T(bar) - 0.3, 0.8, -0.8)

    # ---------------- outro: hard cut to quiet
    O = B['outro']
    for bar, st, m, ln in OUTRO:
        place(O, music_box(m + 12, 0.2), T(bar) + st * S8 + rng.normal(0, 0.004), pan=0.25)
    for i, m in enumerate([62, 69, 74, 76, 77, 81, 86]):                         # final chord roll, rings out
        place(O, music_box(m + 12, 0.16 - 0.01 * i), T(31) + i * S8 * 0.75, pan=0.4 - 0.12 * i)
    place(O, cs.ep(mtof(50), 4.0, 0.14), T(31)); place(O, cs.ep(mtof(57), 4.0, 0.09), T(31) + 0.05)
    for bar in (29, 30):
        place(O, cs.pad([mtof(m) for m in CH[PROG[bar]][0]], BAR + 0.05, 0.14), T(bar))
    place(O, cs.pad([mtof(m) for m in CH['Dm9'][0]], 4.2, 0.16), T(31))
    place(O, cs.pad([mtof(m + 12) for m in [65, 69, 74]], 4.2, 0.06), T(31))

    # ---------------- ambience / SFX
    A = B['amb']
    crossing_bell(A, T(1), T(4, 3), db(-20), -0.55, muffle=5200)
    cic = aburazemi(T(8, 3) - 0.4, db(-26)); tc_ = 0.4 + np.arange(cic.shape[1]) / SR
    cic *= db(np.clip((tc_ - T(7)) / (T(8, 3) - T(7)), 0, 1) * 12)       # cicada swell through bars 7-8
    place(A, fade(cic, 0.3, 0.002), 0.4)                                       # ... hard cut on bar 8 beat 4
    higurashi(A, 0.2, 3.0, db(-28), 0.55); higurashi(A, 7.0, 2.6, db(-32), -0.5)
    place_pan(A, train(4.6, muffle=6000, start_in=1.0, end_out=1.4), T(2), -0.9, 0.85, 14)
    place(A, wind(6.0, db(-38)), 0.0)
    place_pan(A, train(3.0, speed=9.0, muffle=900, start_in=0.6, end_out=0.8, pitch=0.7) * db(4), T(15), 0.8, -0.8, 10)   # ghost train
    crossing_bell(A, T(15), T(17), db(-18), 0.5, period=BEAT * 2, rate=0.84, muffle=2600)          # gate arms, slowed bell
    place(A, wind(6.0, db(-23), 160, 2200, 0.18), T(29))
    sparrow(A, T(29, 1), db(-22), -0.5, 4); sparrow(A, T(31, 0.5), db(-25), 0.5, 3)
    flaps(A, T(29, 0.2), 0.5, 5, db(-15), -0.2, -0.75)                           # white bird flies off left
    flaps(A, T(29, 0.5), 0.5, 5, db(-17), 0.1, 0.75)                             # black bird flies off right
    crow(A, T(30, 1), db(-21), 0.6, 2, 560)
    t = tt(0.5); crt = np.sin(2 * np.pi * np.cumsum(15700 - 14000 * t / 0.5) / SR) * np.exp(-t * 6) * 0.3
    crt[:300] += rng.uniform(-1, 1, 300) * np.exp(-np.arange(300) / 60)        # CRT power-off "thup"
    place(A, crt * db(-30), LEN - 0.75)
    return B, gL, gR


def mix_and_master(B, gL, gR, no_music=False, no_sfx=False):
    t = np.arange(N) / SR
    B['gtr'][0] += distort(gL) * 1.2; B['gtr'][1] += distort(gR) * 1.2
    B['bass'] = np.tanh(B['bass'] * 1.2)
    gains = {'keys': -8.0, 'pad': -2.0, 'gtr': -6.0, 'bass': -7.0, 'lead': 4.0, 'choir': 0.0, 'drums': -6.0, 'snare': 0.0, 'fx': -2.0}
    band = sum(B[k] * db(g) for k, g in gains.items() if k not in ('fx',))
    # sidechain-ish duck of guitars/bass/pad under the kick-heavy sections is left to the bus compressor
    send = (B['keys'] * 0.45 + B['pad'] * 0.35 + B['lead'] * 0.35 + B['choir'] * 0.6 + B['snare'] * 0.55 + B['fx'] * 0.25 + B['drums'] * 0.08)
    wet = conv(send, ir(2.6, 2.2, 7000, 0.025, 1))
    music = hp(band + B['fx'] * db(gains['fx']) + wet * 0.55, 28, 2)

    # glitch stutter edits on the music bus (repeat a 32nd slice) in the turn
    for bar, beat, dur in [(16, 3.0, BEAT), (20, 2.75, BEAT * 0.75)]:
        i0 = int(T(bar, beat) * SR); sl = int(S16 / 2 * SR); n = int(dur * SR)
        piece = music[:, i0:i0 + sl].copy() * np.hanning(sl)[None, :] ** 0.2
        music[:, i0:i0 + n] = np.tile(piece, (1, n // sl + 1))[:, :n]

    # hard cut at bar 29 (band and its reverb tail), and the half-beat silence before the drop
    cut = np.ones(N)
    i29 = int(T(29) * SR); cut[i29:] = 0; cut[i29 - 220:i29] = np.linspace(1, 0, 220)
    g0, g1 = int(T(8, 3.5) * SR), int(T(9) * SR) - 1
    cut[g0:g1] = 0; cut[g0 - 120:g0] = np.linspace(1, 0, 120)
    music *= cut

    # outro bus with its own (longer, softer) room so the hard cut stays clean
    O = B['outro']
    O = hp(O + conv(O * 0.5, ir(3.2, 1.6, 6000, 0.03, 2)) * 0.8, 28, 2)
    music += O * db(-7)
    if no_music: music *= 0

    amb = B['amb']
    if no_sfx: amb *= 0
    amb = hp(amb + conv(amb * 0.25, ir(1.4, 3.5, 5000, 0.02, 3)) * 0.5, 28, 2)
    mix = music + amb * db(-8.0)
    mix[:, g0:g1] = 0                                          # total silence gap (also cuts cicadas/train)

    # bus compressor (RMS, 2:1 above threshold), cold open / outro mostly untouched
    rms = np.sqrt(lfilter([0.002], [1, -0.998], (mix ** 2).mean(axis=0)) + 1e-12)
    thr = 0.3
    mix *= np.where(rms > thr, (thr / rms) ** 0.5, 1.0)
    mix = mix[:, :NOUT]
    tq = np.arange(NOUT) / SR
    mix *= np.clip(tq / 0.004, 0, 1) * np.clip((LEN - tq) / 0.35, 0, 1) ** 1.5   # clean start / end at 48.0 s

    gain_db = 0.0
    for _ in range(8):                                         # loudness target through the limiter
        out = limiter(mix * db(gain_db))
        L = lufs(out)
        if abs(TARGET_LUFS - L) < 0.05:
            break
        gain_db += (TARGET_LUFS - L) * 1.3
    pre = mix * db(gain_db)
    print(f'  master: pre-limiter gain {gain_db:+.1f} dB, limiter GR max {20 * np.log10(np.abs(pre).max() / np.abs(out).max()):.1f} dB')
    return out, music[:, :NOUT]


def limiter(x, ceil=CEIL, look=0.003, rel=0.08, blk=32):
    """look-ahead brickwall: per-block release smoothing + min filter + moving average (no overshoot)."""
    up = np.abs(resample_poly(x, 4, 1, axis=1)).max(axis=0)          # 4x oversampled (true-peak) detection
    pk = np.maximum(np.abs(x).max(axis=0), up[: 4 * x.shape[1]].reshape(-1, 4).max(axis=1))
    g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
    nb = int(np.ceil(len(g) / blk)); gp = np.pad(g, (0, nb * blk - len(g)), constant_values=1)
    gb = gp.reshape(nb, blk).min(axis=1)
    a = np.exp(-blk / (rel * SR)); out = np.empty(nb); cur = 1.0
    for i in range(nb):
        cur = gb[i] if gb[i] < cur else gb[i] + (cur - gb[i]) * a
        out[i] = cur
    gs = np.repeat(out, blk)[: len(g)]
    L = int(look * SR)
    gs = minimum_filter1d(gs, 2 * L + 1)
    gs = uniform_filter1d(gs, L + 1)
    y = x * gs
    return np.clip(y, -ceil, ceil)


def _biquad_k(fs):
    # BS.1770 K-weighting (RBJ forms as in pyloudnorm)
    G, Q, fc = 4.0, 1 / np.sqrt(2), 1500.0
    A = 10 ** (G / 40); w0 = 2 * np.pi * fc / fs; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b1 = [A * ((A + 1) + (A - 1) * c + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * np.sqrt(A) * al)]
    a1 = [(A + 1) - (A - 1) * c + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * np.sqrt(A) * al]
    Q, fc = 0.5, 38.0; w0 = 2 * np.pi * fc / fs; al = np.sin(w0) / (2 * Q); c = np.cos(w0)
    b2 = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a2 = [1 + al, -2 * c, 1 - al]
    return (b1, a1), (b2, a2)


def kweight(x):
    (b1, a1), (b2, a2) = _biquad_k(SR)
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=-1), axis=-1)


def lufs(x, gated=True):
    y = kweight(x); blk = int(0.4 * SR); hop = int(0.1 * SR)
    if y.shape[1] < blk:
        return -0.691 + 10 * np.log10((y ** 2).mean(axis=1).sum() + 1e-12)
    idx = np.arange(0, y.shape[1] - blk + 1, hop)
    cs2 = np.concatenate([np.zeros((2, 1)), np.cumsum(y ** 2, axis=1)], axis=1)
    z = ((cs2[:, idx + blk] - cs2[:, idx]) / blk).sum(axis=0)
    l = -0.691 + 10 * np.log10(z + 1e-12)
    if not gated:
        return -0.691 + 10 * np.log10(z.mean() + 1e-12)
    z = z[l > -70]
    rel = -0.691 + 10 * np.log10(z.mean()) - 10
    z = z[-0.691 + 10 * np.log10(z) > rel]
    return -0.691 + 10 * np.log10(z.mean())


def true_peak(x):
    return 20 * np.log10(np.abs(resample_poly(x, 4, 1, axis=1)).max() + 1e-12)


SECTIONS = [('COLD OPEN', 1, 5), ('WORLD', 5, 9), ('DROP+TITLE', 9, 13), ('THE TURN', 13, 21), ('CLASH', 21, 29), ('OUTRO', 29, 33)]


def chroma(x, t0, t1):
    m = x[:, int(t0 * SR):int(t1 * SR)].mean(axis=0)
    spec = np.abs(np.fft.rfft(m * np.hanning(len(m))))
    fr = np.fft.rfftfreq(len(m), 1 / SR)
    ok = (fr > 60) & (fr < 2000)
    pcs = (np.round(12 * np.log2(fr[ok] / 440)) + 69) % 12
    c = np.bincount(pcs.astype(int), weights=spec[ok] ** 2, minlength=12)
    return c / c.max()


def report(out, music):
    names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    print(f'duration {out.shape[1] / SR:.4f} s ({out.shape[1]} samples), {SR} Hz stereo, {BPM:.0f} BPM')
    print(f'integrated {lufs(out):.2f} LUFS | sample peak {20 * np.log10(np.abs(out).max()):.2f} dBFS | true peak {true_peak(out):.2f} dBTP')
    for nm, b0, b1 in SECTIONS:
        seg = out[:, int(T(b0) * SR):int(T(b1) * SR)]
        print(f'  {nm:<11} bars {b0:>2}-{b1 - 1:<2} RMS {20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-12):6.1f} dBFS  '
              f'loudness {lufs(seg, False):6.1f} LUFS')
    g0, g1 = int(T(8, 3.5) * SR), int(T(9) * SR) - 1
    print(f'  pre-drop gap 11.8125-12.0 s peak {20 * np.log10(np.abs(out[:, g0 + 5:g1]).max() + 1e-12):.1f} dBFS; '
          f'last 10 ms peak {20 * np.log10(np.abs(out[:, -441:]).max() + 1e-12):.1f} dBFS')
    # key: Krumhansl-Kessler profiles on the music bus
    maj = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    mnr = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    c = chroma(music, 0, T(29)) + chroma(music, T(29), LEN)
    best = max(((np.corrcoef(np.roll(p, k), c)[0, 1], names[k] + (' major' if p is maj else ' minor')) for p in (maj, mnr) for k in range(12)))
    print(f'  key estimate: {best[1]} (r={best[0]:.2f})')
    hits = 0; rows = []
    for bar in range(1, 31):
        ch = chroma(music, T(bar) + 0.02, T(bar + 1) - 0.02)
        want = {(m % 12) for m in CH[PROG[bar]][0]}
        top = set(np.argsort(ch)[-3:])
        ok = len(top & want) >= 2; hits += ok
        rows.append(f'{bar}:{PROG[bar]}{"" if ok else "?"}')
    print(f'  chord check (>=2 of top-3 chroma in chord): {hits}/30  ' + ' '.join(rows))


def spectrogram_png(x, path, w=1600, h=480):
    from PIL import Image
    m = x.mean(axis=0); nfft = 2048; hop = len(m) // w
    frames = np.stack([np.abs(np.fft.rfft(m[i * hop:i * hop + nfft] * np.hanning(nfft))) for i in range(w - 1)], axis=1)
    fr = np.fft.rfftfreq(nfft, 1 / SR)
    rows = np.geomspace(30, 18000, h)[::-1]
    img = np.stack([np.interp(rows, fr, frames[:, j]) for j in range(frames.shape[1])], axis=1)
    img = 20 * np.log10(img + 1e-6); img = np.clip((img - img.max() + 80) / 80, 0, 1)
    rgb = np.stack([img ** 0.7, img ** 1.6, img ** 3.5], axis=-1) * 255
    for bar in range(1, 33):                                   # bar lines; section starts brighter
        j = int(T(bar) / LEN * (w - 1)); rgb[:, min(j, w - 2), :] = 255 if bar in (1, 5, 9, 13, 21, 29) else 70
    Image.fromarray(rgb.astype(np.uint8)).save(path)
    print(f'  spectrogram -> {path}')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    spec = None
    if '--spec' in args:
        i = args.index('--spec'); spec = args[i + 1]; del args[i:i + 2]
    flags = {a for a in args if a.startswith('--')}
    pos = [a for a in args if not a.startswith('--')]
    out_path = pos[0] if pos else os.path.join(HERE, 'audio', 'theme.wav')
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    B, gL, gR = render()
    out, music = mix_and_master(B, gL, gR, '--no-music' in flags, '--no-sfx' in flags)
    import wave
    pcm = (np.clip(out.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f'wrote {out_path}')
    report(out, music)
    if spec:
        spectrogram_png(out, spec)
