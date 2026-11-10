# -*- coding: utf-8 -*-
"""Go bang loi noi -> tj.json (dinh dang bo may reel_engine can): tung tu kem moc giay + cac khoang lang do bang nang luong.
Dung faster-whisper (co card do hoa NVIDIA thi nhanh, khong co van chay bang CPU - cham hon).
   python go_bang.py <video hoac audio> <thu muc du an> [--model large-v3-turbo] [--lang vi]
Ket qua: <thu muc du an>\\tj.json va audio16k.wav"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np

def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default

src, proj = sys.argv[1], Path(sys.argv[2]); proj.mkdir(parents=True, exist_ok=True)
model_name, lang = arg("--model", "large-v3-turbo"), arg("--lang", "vi")
wav = proj / "audio16k.wav"
subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-map", "0:a:0", "-ac", "1", "-ar", "16000", str(wav)], check=True)

import os
for mod in ("nvidia.cublas", "nvidia.cudnn"):                 # thu vien CUDA cai bang pip (neu co) -> cho Windows tim thay DLL
    try:
        m = __import__(mod, fromlist=["x"]); b = Path(list(m.__path__)[0]) / "bin"
        if b.exists(): os.add_dll_directory(str(b)); os.environ["PATH"] = str(b) + os.pathsep + os.environ["PATH"]
    except Exception: pass
from faster_whisper import WhisperModel

def run(device):
    if device == "cuda": model = WhisperModel(model_name, device="cuda", compute_type="float16")
    else: model = WhisperModel(model_name if model_name != "large-v3-turbo" else "medium", device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(wav), language=lang, word_timestamps=True, beam_size=5, condition_on_previous_text=False,
                                  vad_filter=True, vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=200),
                                  initial_prompt=arg("--prompt", "Video nói chuyện tiếng Việt về kinh doanh, bán hàng, AI."))   # loc khoang lang chong "ao giac"
    return list(segs)                                         # chay het o day de bat loi GPU som
try:
    print("go bang bang GPU ...", flush=True); segs = run("cuda")
except Exception as ex:
    print("GPU khong dung duoc (%s) -> chay bang CPU, cham hon ..." % str(ex)[:80], flush=True); segs = run("cpu")

timeline, segments = [], []
for si, sg in enumerate(segs):
    segments.append({"i": si, "start": sg.start, "end": sg.end, "text": sg.text.strip()})
    for w in (sg.words or []):
        x = w.word.strip()
        if x: timeline.append({"t": "w", "seg": si, "s": round(w.start, 3), "e": round(w.end, 3), "x": x})

# khoang lang: nang luong 20ms thap hon muc noi trung vi ~14 dB, keo dai >= 0.25s
with wave.open(str(wav), "rb") as f:
    a = np.frombuffer(f.readframes(f.getnframes()), "<i2").astype(np.float64) / 32768
hop = 320; n = len(a) // hop
db = 20 * np.log10(np.sqrt((a[:n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
ref = np.median(db[db > -50]) if (db > -50).any() else -20
quiet = db < ref - 14
pauses, i = [], 0
while i < n:
    if quiet[i]:
        j = i
        while j < n and quiet[j]: j += 1
        d = (j - i) * hop / 16000
        if d >= 0.25: pauses.append({"t": "p", "s": round(i * hop / 16000, 3), "e": round(j * hop / 16000, 3), "d": round(d, 3), "k": "silence"})
        i = j
    else: i += 1
timeline = sorted(timeline + pauses, key=lambda x: x["s"])
json.dump({"source": src, "segments": segments, "timeline": timeline, "suggestions": []},
          open(proj / "tj.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("xong: %d cau, %d tu, %d khoang lang -> %s" % (len(segments), sum(1 for x in timeline if x["t"] == "w"), len(pauses), proj / "tj.json"))
