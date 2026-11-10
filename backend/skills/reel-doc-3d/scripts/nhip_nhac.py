# -*- coding: utf-8 -*-
"""Phan tich nhac nen da chuan bi (chuan_bi_nhac.py): tempo, nhip (beat), nhip manh dau o (downbeat),
do soi dong theo thoi gian, "tinh chat" bai (cham/nhanh, em/soi dong, tram/sang) -> nhac\\<ten>_nhip.json
Dung cho montage_engine.py (cat canh dung nhip) va de AI chon bai hop voi canh quay.
   python nhip_nhac.py <ten>        |   python nhip_nhac.py --all   (moi bai chua co _nhip.json)
Chi can numpy + thu vien chuan."""
import json, sys, wave
from pathlib import Path
import numpy as np

NHAC = Path(__file__).resolve().parent.parent / "nhac"
HOP, NFFT = 256, 1024


def load(name):
    with wave.open(str(NHAC / (name + "_full.wav")), "rb") as w:
        sr, ch = w.getframerate(), w.getnchannels()
        a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
    a = a.reshape(-1, ch).mean(1)
    f = max(1, sr // 11025)                       # ha mau ~11-12 kHz (du cho nhip, nhanh hon nhieu)
    a = a[: len(a) // f * f].reshape(-1, f).mean(1)
    return a, sr / f


def spectrum(a, sr):
    win = np.hanning(NFFT).astype(np.float32)
    fr = np.lib.stride_tricks.sliding_window_view(a, NFFT)[::HOP] * win
    S = np.abs(np.fft.rfft(fr, axis=1)).astype(np.float32)
    return S, np.fft.rfftfreq(NFFT, 1 / sr)


def onset_env(S, freqs):
    # Gop thanh ~24 dai tan so cach deu theo thang log -> trong (kick) nang ngang hi-hat/nhieu dai cao,
    # tranh bat nhip lech nua phach theo tieng hi-hat.
    edges = np.geomspace(40, min(5000, freqs[-1]), 25)
    bands = np.stack([S[:, (freqs >= lo) & (freqs < hi)].sum(1) for lo, hi in zip(edges[:-1], edges[1:])
                      if ((freqs >= lo) & (freqs < hi)).any()], axis=1)
    L = np.log1p(10 * bands)
    w = np.linspace(1.6, 0.8, L.shape[1])          # nhan nhe dai tram (trong la xuong song cua nhip)
    d = (np.maximum(0, np.diff(L, axis=0)) * w).sum(1)
    k = 21                                         # tru trung binh truot ~0.5s -> chi giu "cu dap"
    d = d - np.convolve(d, np.ones(k) / k, "same")
    d = np.maximum(d, 0)
    return d / (d.std() + 1e-9)


def tempo_period(env, fps):
    x = env - env.mean()
    ac = np.correlate(x, x, "full")[len(x) - 1:]
    lo, hi = int(fps * 60 / 190), int(fps * 60 / 65)
    lags = np.arange(lo, hi)
    bpm = 60 * fps / lags
    w = np.exp(-0.5 * (np.log2(bpm / 118) / 0.9) ** 2)   # uu tien quanh 118 BPM (nhac mang xa hoi)
    sc = ac[lo:hi] * w
    i = int(np.argmax(sc))
    if 0 < i < len(sc) - 1:                       # noi suy parabol cho chu ky le
        a_, b_, c_ = sc[i - 1], sc[i], sc[i + 1]
        den = a_ - 2 * b_ + c_
        off = 0.5 * (a_ - c_) / den if den else 0
    else:
        off = 0
    return lags[i] + off


def track_beats(env, period, tight=120.0):
    """Do nhip bang quy hoach dong (Ellis 2007)."""
    n = len(env)
    score = env.astype(np.float64).copy()
    back = np.full(n, -1)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    prange = np.arange(-hi, -lo + 1)
    pen = -tight * np.log(-prange / period) ** 2
    for t in range(hi, n):
        cand = score[t + prange] + pen
        j = int(np.argmax(cand))
        score[t] += cand[j]
        back[t] = t + prange[j]
    t = int(np.argmax(score[-int(period) - 1:])) + n - int(period) - 1
    beats = []
    while t >= 0:
        beats.append(t)
        t = back[t]
    return np.array(beats[::-1])


def analyse(name):
    a, sr = load(name)
    S, freqs = spectrum(a, sr)
    fps = sr / HOP
    env = onset_env(S, freqs)
    period = tempo_period(env, fps)
    bf = track_beats(env, period)
    t_of = lambda k: (k + 1) * HOP / sr + NFFT / 2 / sr
    beats = [round(float(t_of(k)), 3) for k in bf]
    # nhip manh dau o: pha (0..3) co tong luc dap lon nhat
    phase = int(np.argmax([env[bf[p::4]].sum() for p in range(4)])) if len(bf) >= 8 else 0
    down = beats[phase::4]
    # do soi dong moi 0.5s (0..1) + tinh chat ca bai
    rms = np.sqrt((S ** 2).mean(1))
    step = max(1, int(round(fps / 2)))
    energy = [round(float(x), 3) for x in (rms[: len(rms) // step * step].reshape(-1, step).mean(1) / (rms.max() + 1e-9))]
    centroid = float((S * freqs).sum(1).mean() / (S.sum(1).mean() + 1e-9))
    bpm = 60 * fps / period
    loud_db = float(20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9))
    mood = {
        "bpm": round(bpm, 1),
        "nhip": "chậm" if bpm < 90 else ("vừa" if bpm < 125 else "nhanh"),
        "do_soi_dong": "êm" if np.mean(energy) < 0.28 else ("vừa" if np.mean(energy) < 0.45 else "sôi động"),
        "am_sac": "trầm/ấm" if centroid < 1400 else ("cân bằng" if centroid < 2400 else "sáng/tươi"),
        "do_to_dbfs": round(loud_db, 1),
    }
    out = {"name": name, "tempo": round(bpm, 2), "beats": beats, "downbeats": down, "energy_step": 0.5,
           "energy": energy, "mood": mood}
    json.dump(out, open(NHAC / (name + "_nhip.json"), "w"), ensure_ascii=False)
    print("xong %s: %.1f BPM, %d nhip, %s / %s / %s" % (name, bpm, len(beats), mood["nhip"], mood["do_soi_dong"], mood["am_sac"]))


if __name__ == "__main__":
    names = sys.argv[1:]
    if names == ["--all"]:
        names = [p.name[: -len("_grid.json")] for p in sorted(NHAC.glob("*_grid.json"))
                 if not (NHAC / (p.name[: -len("_grid.json")] + "_nhip.json")).exists()]
    if not names:
        print("khong co bai nao can phan tich")
    for n in names:
        analyse(n)
