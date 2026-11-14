"""Scene-synced sound design for the anime short (all synthesised).

design(bus, place, helpers, rng) writes into the stereo ambience bus:
  shot 1  railway at dusk: higurashi cicadas (kana-kana), railway crossing bell, commuter train crossing L->R
          (bogie clacks, rumble, inverter whine), distant sparrows
  shot 2  vending machine under the overpass: compressor hum + bulb buzz, aburazemi sizzle, white-eye trills
  shot 3  flower garden: bush warbler (ho-hokekyo), sparrows, two passing bees, leaves in the breeze
  shot 4  field + farmhouse: wind through tall grass, kei truck 3-cyl engine pulling away (gear change),
          distant wind chime, sparrows, minmin-zemi
  shot 5  old shop-house: furin wind chime, paper lantern rustle, minmin-zemi, distant crow
  shot 6  vending machine row: compressor hum, cicadas, bicycle bell in the distance, sparrows
  shot 7  inside the car: idling cabin rumble, muffled train leaving overhead R->L, muffled crossing bell
  shot 8  meadow from above: wind over grass, skylark song, wing flaps synced to the birds, crow caws, egret croak
"""
import numpy as np


def design(bus, place, H, rng, CUTS):
    SR, lp, hp, bp = H['SR'], H['lp'], H['hp'], H['bp']
    db = lambda x: 10 ** (x / 20)

    def tt(d):
        return np.arange(int(d * SR)) / SR

    def fade(s, a=0.02, r=0.05):
        n = s.shape[-1]; t = np.arange(n) / SR
        return s * np.clip(t / a, 0, 1) * np.clip((n / SR - t) / r, 0, 1)

    def tone(fc, dur, harm=(1, 0.15, 0.04), vib=0.0, vr=6.0):
        """frequency-contoured whistle; fc can be callable f(t) or array."""
        t = tt(dur)
        f = fc(t) if callable(fc) else np.full(len(t), fc)
        f = f * (1 + vib * np.sin(2 * np.pi * vr * t))
        ph = 2 * np.pi * np.cumsum(f) / SR
        return sum(a * np.sin((k + 1) * ph) for k, a in enumerate(harm))

    def env(dur, a=0.01, r=0.03, shape=1.0):
        t = tt(dur)
        return (np.clip(t / a, 0, 1) * np.clip((dur - t) / r, 0, 1)) ** shape

    # ---------------- birds ----------------
    def uguisu(t0, vel, pan):            # bush warbler: "hoooo ... ho-ke-kyo"
        hoo = tone(lambda t: 1080 + 160 * (t / 0.95) ** 2, 0.95, vib=0.004) * env(0.95, 0.12, 0.08, 1.3)
        place(bus, hoo * vel, t0, pan)
        notes = [(0.09, lambda t: 1900 + 0 * t), (0.08, lambda t: 2650 - 400 * t / 0.08), (0.30, lambda t: 2100 + 1100 * np.clip(t / 0.12, 0, 1) - 300 * np.clip((t - 0.12) / 0.18, 0, 1))]
        tcur = t0 + 1.05
        for d, f in notes:
            place(bus, tone(f, d) * env(d, 0.008, 0.03) * vel * 0.9, tcur, pan); tcur += d + 0.035

    def sparrow(t0, vel, pan, n=None):  # chirp chirp
        n = n or int(rng.integers(3, 6)); tc = t0
        for _ in range(n):
            d = rng.uniform(0.05, 0.09); f0 = rng.uniform(3600, 4600)
            s = tone(lambda t: f0 + 900 * np.sin(np.pi * t / d) - 600 * t / d, d, harm=(1, 0.35, 0.12)) * env(d, 0.004, 0.02)
            s *= 0.8 + 0.2 * np.sin(2 * np.pi * 85 * tt(d))
            place(bus, s * vel * rng.uniform(0.7, 1.0), tc, pan + rng.uniform(-0.1, 0.1)); tc += rng.uniform(0.11, 0.24)

    def whiteeye(t0, vel, pan, dur=0.7):  # mejiro: rapid high twittering trill
        k = 0; tc = t0
        while tc < t0 + dur:
            d = 0.035; f = 4900 if k % 2 else 5700
            s = tone(lambda t: f - 500 * t / d, d, harm=(1, 0.2)) * env(d, 0.003, 0.012)
            place(bus, s * vel * (1 - 0.5 * (tc - t0) / dur), tc, pan); tc += 0.05; k += 1

    def crow(t0, vel, pan, n=2, f0=540):   # "kaa kaa"
        tc = t0
        for i in range(n):
            d = 0.34; t = tt(d)
            f = f0 * (1 + 0.08 * np.sin(np.pi * t / d)) * (1 - 0.06 * t / d)
            ph = 2 * np.pi * np.cumsum(f) / SR
            s = sum((0.9 ** k) * np.sin(k * ph) for k in range(1, 9))
            s = bp(s, 700, 2600, 2) + bp(rng.standard_normal(len(t)), 900, 2400, 2) * 0.35
            s *= (0.75 + 0.25 * np.sin(2 * np.pi * 70 * t)) * env(d, 0.02, 0.12, 1.2)
            place(bus, s * vel, tc, pan); tc += 0.48

    def egret(t0, vel, pan):            # low hoarse croak
        d = 0.28; t = tt(d); f = 260 * (1 - 0.15 * t / d)
        ph = 2 * np.pi * np.cumsum(f) / SR
        s = sum((0.8 ** k) * np.sin(k * ph) for k in range(1, 10)) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 38 * t)))
        place(bus, bp(s, 250, 1800, 2) * env(d, 0.015, 0.1) * vel, t0, pan)

    def skylark(t0, t1, vel, pan):      # hibari: continuous high warbling
        tc = t0
        while tc < t1 - 0.1:
            d = rng.uniform(0.04, 0.1); f0 = rng.uniform(3200, 6200); f1 = f0 + rng.uniform(-1200, 1200)
            s = tone(lambda t: f0 + (f1 - f0) * t / d, d, harm=(1, 0.18)) * env(d, 0.006, 0.02)
            place(bus, s * vel * rng.uniform(0.5, 1), tc, pan + rng.uniform(-0.15, 0.15)); tc += d + rng.uniform(0.01, 0.07)

    def flaps(t0, period, count, vel, pan0, pan1, phase=0.0):
        for i in range(count):
            d = 0.16; t = tt(d)
            s = bp(rng.standard_normal(len(t)), 180, 1400, 2) * np.sin(np.pi * t / d) ** 2
            s += lp(rng.standard_normal(len(t)), 220, 2) * np.sin(np.pi * t / d) ** 3 * 1.5
            k = i / max(1, count - 1)
            place(bus, s * vel * (1 - 0.65 * k), t0 + phase + i * period, pan0 + (pan1 - pan0) * k)

    # ---------------- insects ----------------
    def aburazemi(t0, t1, vel, pan=0.0):  # brown cicada: continuous sizzle
        t = tt(t1 - t0)
        s = bp(rng.standard_normal(len(t)), 3000, 7500, 2) * (0.8 + 0.2 * np.sin(2 * np.pi * 0.3 * t + rng.random() * 6))
        s *= 0.7 + 0.3 * np.abs(np.sin(2 * np.pi * 47 * t))
        place(bus, fade(s, 0.03, 0.03) * vel, t0, pan)

    def minmin(t0, vel, pan, calls=4):   # minmin-zemi: "miin-miin-miin"
        tc = t0
        for i in range(calls):
            d = 0.42; t = tt(d)
            f = 3900 + 350 * np.sin(np.pi * t / d)
            s = tone(lambda _t: f, d, harm=(1, 0.3, 0.1)) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 120 * t)))
            place(bus, s * env(d, 0.12, 0.1, 1.5) * vel, tc, pan); tc += 0.5

    def higurashi(t0, dur, vel, pan):    # evening cicada: descending "kana-kana-kana" pulses
        tc = t0; k = 0; n = int(dur / 0.105)
        while tc < t0 + dur:
            d = 0.07; f = 4900 - 900 * (k / n)
            s = tone(lambda t: f + 250 * np.sin(2 * np.pi * 14 * t), d, harm=(1, 0.25)) * env(d, 0.005, 0.03)
            place(bus, s * vel * (1 - 0.6 * k / n), tc, pan); tc += 0.105; k += 1

    def bee(t0, dur, vel, pan0, pan1, f0=215):
        t = tt(dur)
        dop = 1 + 0.03 * np.cos(np.pi * t / dur)
        ph = 2 * np.pi * np.cumsum(f0 * dop * (1 + 0.01 * np.sin(2 * np.pi * 9 * t))) / SR
        s = sum((0.75 ** k) * np.sin(k * ph) for k in range(1, 12))
        s = bp(s, 180, 3000, 2) * np.sin(np.pi * t / dur) ** 2
        n = len(s); pans = np.linspace(pan0, pan1, 8)
        for j in range(8):
            a, b = j * n // 8, (j + 1) * n // 8
            place(bus, s[a:b] * vel, t0 + a / SR, pans[j])

    # ---------------- mechanical / town ----------------
    def bell_partials(base, d, partials=((1, 1, 1.2), (2.76, 0.45, 0.6), (5.4, 0.25, 0.35), (8.9, 0.1, 0.2))):
        t = tt(d)
        return sum(a * np.sin(2 * np.pi * base * r * t + rng.random()) * np.exp(-t / dec) for r, a, dec in partials) * (1 - np.exp(-t * 2000))

    def crossing_bell(t0, t1, vel, pan, muffle=None):   # fumikiri "kan-kan"
        tc = t0; k = 0
        while tc < t1:
            s = bell_partials(740 if k % 2 else 790, 0.5, ((1, 1, 0.25), (2.4, 0.5, 0.12), (3.9, 0.25, 0.08)))
            if muffle: s = lp(s, muffle, 2)
            place(bus, s * vel, tc, pan); tc += 0.42; k += 1

    def furin(t0, vel, pan):            # glass wind chime
        place(bus, bell_partials(2350 * rng.uniform(0.97, 1.03), 2.2) * vel, t0, pan)

    def bike_bell(t0, vel, pan):
        for i in range(2):
            place(bus, bell_partials(3150, 0.6, ((1, 1, 0.3), (1.52, 0.6, 0.2), (2.6, 0.3, 0.1))) * vel, t0 + i * 0.13, pan)

    def hum(t0, t1, vel, pan=0.0, f0=50):
        t = tt(t1 - t0)
        s = sum(np.sin(2 * np.pi * f0 * k * t) / k ** 1.3 for k in (1, 2, 3, 4, 6))
        s += lp(rng.standard_normal(len(t)), 400, 2) * 0.6 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.6 * t))
        place(bus, fade(s, 0.03, 0.03) * vel, t0, pan)

    def buzz(t0, t1, vel, pan):          # fluorescent / bulb buzz
        t = tt(t1 - t0)
        s = hp(np.sign(np.sin(2 * np.pi * 100 * t)) * 0.5 + rng.standard_normal(len(t)) * 0.1, 900, 2)
        place(bus, fade(s, 0.03, 0.03) * vel, t0, pan)

    def wind(t0, t1, vel, lo=180, hi=1600, gust=0.21):
        t = tt(t1 - t0)
        g = 0.55 + 0.45 * np.sin(2 * np.pi * gust * t + rng.random() * 6) ** 2
        L = bp(rng.standard_normal(len(t)), lo, hi, 2) * g
        R = bp(rng.standard_normal(len(t)), lo, hi, 2) * np.roll(g, int(0.4 * SR))
        place(bus, fade(np.stack([L, R]), 0.03, 0.03) * vel, t0)

    def rustle(t0, t1, vel, pan=0.0):   # leaves / grass
        t = tt(t1 - t0)
        s = hp(rng.standard_normal(len(t)), 2500, 2) * (0.3 + 0.7 * lp(np.abs(rng.standard_normal(len(t))), 6, 1) * 4)
        place(bus, fade(s, 0.03, 0.03) * vel, t0, pan)

    def train(t0, t1, vel, pan0, pan1, muffle=4000, speed=13.6, start_in=0.6, whine=True, end_out=0.0):
        d = t1 - t0; t = tt(d); n = len(t)
        rumble = lp(rng.standard_normal(n), 260, 2) * 1.4 + bp(rng.standard_normal(n), 300, 1200, 2) * 0.5
        clack = np.zeros(n)
        car = 20.0 / speed
        offs = [0.0, 2.1 / speed, 14.0 / speed, 16.1 / speed]
        tc = 0.15
        while tc < d:
            for o in offs:
                i = int((tc + o) * SR); m = min(int(0.045 * SR), n - i)
                if 0 <= i < n and m > 0:
                    clack[i:i + m] += (bp(rng.standard_normal(m), 350, 3200, 2) + np.sin(2 * np.pi * 140 * np.arange(m) / SR) * 0.6) * np.exp(-np.arange(m) / SR * 70)
            tc += car
        s = rumble * 0.5 + clack * 1.3
        if whine:
            f = 760 + 220 * np.clip(t / d, 0, 1)
            ph = 2 * np.pi * np.cumsum(f) / SR
            s += (np.sin(ph) + 0.4 * np.sin(2 * ph) + 0.25 * np.sin(3.02 * ph)) * 0.05
        s = lp(s, muffle, 2)
        e = np.clip(t / start_in, 0, 1) ** 1.5
        if end_out: e *= np.clip((d - t) / end_out, 0, 1)
        s = fade(s * e, 0.01, 0.03)
        k = 10
        for j in range(k):
            a, b = j * n // k, (j + 1) * n // k
            place(bus, s[a:b] * vel, t0 + a / SR, pan0 + (pan1 - pan0) * (j + 0.5) / k)

    def kei_engine(t0, t1, vel, pan0, pan1):
        d = t1 - t0; t = tt(d); n = len(t)
        rpm = np.where(t < 1.15, 2600 + 1500 * t / 1.15, 2300 + 900 * np.clip((t - 1.15) / 1.6, 0, 1))  # gear change ~1.15 s
        fire = rpm / 60 * 1.5                                                                        # 3 cylinders
        ph = np.cumsum(fire) / SR
        pulses = np.exp(-((ph % 1.0) * 12)) - 0.08
        s = lp(pulses, 900, 2) * 1.2 + lp(rng.standard_normal(n), 500, 2) * 0.35
        s += 0.3 * np.sin(2 * np.pi * np.cumsum(fire * 2) / SR)
        dist = 1.0 / (1 + 1.6 * t / d)
        s = s * dist ** 1.6
        s = fade(s, 0.01, 0.05)
        k = 10
        for j in range(k):
            a, b = j * n // k, (j + 1) * n // k
            place(bus, lp(s[a:b], 2200 - 900 * j / k, 1) * vel, t0 + a / SR, pan0 + (pan1 - pan0) * (j + 0.5) / k)

    # ================= scene by scene =================
    S = CUTS
    # 1 railway at golden hour (train from ~1.2 s, moving left -> right)
    a, z = S[0], S[1]
    higurashi(a + 0.15, 2.6, db(-30), 0.55)
    crossing_bell(a + 0.0, z, db(-31), -0.65, muffle=3200)
    train(a + 0.9, z, db(-15), -0.85, 0.55, muffle=5200, start_in=0.9)
    sparrow(a + 2.6, db(-34), -0.4, 3)
    wind(a, z, db(-38))
    # 2 vending machine under the overpass
    a, z = S[1], S[2]
    hum(a, z, db(-30), 0.35, 50); buzz(a, z, db(-44), 0.4)
    aburazemi(a, z, db(-36), -0.3)
    whiteeye(a + 0.5, db(-29), -0.55, 0.8); whiteeye(a + 1.9, db(-33), 0.6, 0.5)
    rustle(a, z, db(-48), -0.5)
    # 3 flower garden
    a, z = S[2], S[3]
    uguisu(a + 0.25, db(-24), 0.45)
    sparrow(a + 1.7, db(-31), -0.5, 4)
    bee(a + 0.1, 1.8, db(-33), -0.7, 0.2, 218); bee(a + 1.4, 1.5, db(-36), 0.6, 0.1, 231)
    wind(a, z, db(-37), 300, 2600); rustle(a, z, db(-46), 0.2)
    # 4 field + farmhouse, kei truck pulling away to the left
    a, z = S[3], S[4]
    wind(a, z, db(-30), 220, 3000, 0.33); rustle(a, z, db(-42), 0.0)
    kei_engine(a, z, db(-17), 0.35, -0.6)
    furin(a + 1.6, db(-36), 0.7)
    sparrow(a + 0.6, db(-33), 0.6, 3)
    minmin(a + 0.2, db(-38), -0.7, 4)
    # 5 old shop-house in the shade
    a, z = S[4], S[5]
    furin(a + 0.3, db(-27), -0.55); furin(a + 1.25, db(-31), -0.5); furin(a + 2.3, db(-29), -0.6)
    minmin(a + 0.1, db(-31), 0.5, 5)
    crow(a + 1.6, db(-36), 0.75, 2)
    rustle(a, z, db(-46), 0.6); wind(a, z, db(-40))
    # 6 vending machine row
    a, z = S[5], S[6]
    hum(a, z, db(-33), 0.0, 50)
    aburazemi(a, z, db(-37), 0.5)
    bike_bell(a + 1.4, db(-33), 0.75)
    sparrow(a + 0.4, db(-32), -0.6, 4); sparrow(a + 2.1, db(-34), 0.4, 3)
    wind(a, z, db(-38))
    # 7 inside the car under the railway bridge (muffled), train leaving R -> L
    a, z = S[6], S[7]
    t = tt(z - a); cab = lp(rng.standard_normal(len(t)), 110, 2) * 1.2 + 0.4 * np.sin(2 * np.pi * 25 * t) + 0.2 * np.sin(2 * np.pi * 50 * t)
    place(bus, fade(cab, 0.02, 0.03) * db(-27), a)
    train(a, z, db(-16), 0.3, -0.9, muffle=700, start_in=0.05, end_out=1.0, whine=False)
    crossing_bell(a, z, db(-35), 0.5, muffle=900)
    # 8 meadow from above: wind, skylark, the two birds' wingbeats and calls
    a, z = S[7], S[8]
    wind(a, z, db(-27), 160, 2200, 0.18); rustle(a, z, db(-41), 0.0)
    skylark(a + 0.3, z - 0.8, db(-36), 0.4)
    flaps(a + 0.05, 1.333, 4, db(-21), -0.5, 0.15, 0.0)         # white egret (leads)
    flaps(a + 0.15, 1.333, 4, db(-24), -0.6, 0.05, 0.0)         # black bird ~0.1 s behind
    crow(a + 0.9, db(-25), -0.4, 2, 560); crow(a + 2.6, db(-31), 0.0, 1, 600)
    egret(a + 1.8, db(-29), -0.2)
    higurashi(a + 3.4, 2.5, db(-33), 0.5)          # evening cicadas return as the film ends
