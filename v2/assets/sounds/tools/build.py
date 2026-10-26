#!/usr/bin/env python3
"""Builds the sound library from `sources.toml` (docs/sounds.md "building").

For every source: decode the raw file (from `v2/assets-src/sounds/`, untrusted downloads —
ffmpeg only reads them), cut it, make it mono 48 kHz (the TV lies flat with people all round
it: stereo buys nothing and doubles the decoded memory), then

- a bed: pick the steadiest stretch (lowest spread of short-term loudness, no loud events),
  loop it seamlessly (its tail crossfaded equal-power into its head), normalise to -23 LUFS;
  a `beat = true` bed is cut at a whole number of beats with only a 30 ms seam fade,
- a one-shot: trim silence at both ends, a 3 ms fade-in and 60 ms fade-out, normalise to
  -16 LUFS (a short sound by its loudest 400 ms),

with the true peak kept at or below -1 dBTP, encode Opus in Ogg (Chromium/Android WebView and
WebKit decode it with the exact length, `probe_formats.ts`), and write `../index.json`.

Run: python3 -I v2/assets/sounds/tools/build.py [id …]   (no ids = all)
     python3 -I v2/assets/sounds/tools/build.py --table  (the catalogue table of docs/sounds.md)
"""
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import tomllib

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = os.path.dirname(HERE)
RAW = os.path.normpath(os.path.join(LIB, '..', '..', 'assets-src', 'sounds'))
RATE = 48000
BED_LOOP_S = 60.0      # loop length a bed aims for (shorter when the source is)
BED_XFADE_S = 3.0      # its seam crossfade
BED_LUFS = -23.0
SHOT_LUFS = -16.0
TRUE_PEAK = -1.0
MAX_LIMIT_DB = 9.0   # most a peaky bed is limited by to reach its loudness
BITRATE = {'bed': '64k', 'oneshot': '64k'}  # mono; at 48k libopus cuts the top band (rain lost 2 LU)
LICENCES = {'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
            'CC-BY-3.0': 'https://creativecommons.org/licenses/by/3.0/',
            'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/'}


def run(args, **kw):
    """Runs a command, returns (stdout bytes, stderr text); raises on failure."""
    p = subprocess.run(args, capture_output=True, **kw)
    if p.returncode != 0:
        raise RuntimeError(f"{args[0]} failed: {p.stderr.decode('utf8', 'replace')[-800:]}")
    return p.stdout, p.stderr.decode('utf8', 'replace')


def duration(path):
    """The file's length in seconds (ffprobe)."""
    out, _ = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
    return float(out.decode().strip())


def timeline(path):
    """Short-term loudness every 0.1 s: list of (t, S) — ffmpeg's ebur128 frame log."""
    _, err = run(['ffmpeg', '-v', 'verbose', '-nostats', '-hide_banner', '-i', path, '-af', 'ebur128=framelog=verbose', '-f', 'null', '-'])
    pts = []
    for m in re.finditer(r't:\s*([\d.]+)\s+TARGET:.*?M:\s*(-?[\d.inf]+)\s+S:\s*(-?[\d.inf]+)', err):
        s = float(m.group(3)) if 'inf' not in m.group(3) else -70.0
        pts.append((float(m.group(1)), max(s, -70.0), float(m.group(2)) if 'inf' not in m.group(2) else -70.0))
    return pts


def loudness(path):
    """(integrated LUFS, true peak dBTP, loudest momentary LUFS) of a file."""
    _, err = run(['ffmpeg', '-v', 'verbose', '-nostats', '-hide_banner', '-i', path, '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-'])
    i = float(re.findall(r'^\s+I:\s+(-?[\d.]+) LUFS', err, re.M)[-1])
    tp = float(re.findall(r'^\s+Peak:\s+(-?[\d.inf]+) dBFS', err, re.M)[-1].replace('-inf', '-99'))
    ms = [float(x) for x in re.findall(r'M:\s*(-?[\d.]+)\s+S:', err)]
    return i, tp, max(ms) if ms else -70.0


def steadiest(pts, start, end, length):
    """The start (s) of the `length`-second stretch in [start, end] whose short-term loudness
    spreads least; a stretch with a loud event (3 s above its median by > 8 LU) is penalised."""
    best, best_t = None, start
    t = start
    while t + length <= end + 1e-6:
        win = sorted(s for (pt, s, _) in pts if t + 3 <= pt <= t + length)
        if len(win) > 20:
            med = win[len(win) // 2]
            mean = sum(win) / len(win)
            sd = math.sqrt(sum((x - mean) ** 2 for x in win) / len(win))
            score = sd + 0.5 * max(0.0, win[-1] - med - 8)
            if best is None or score < best:
                best, best_t = score, t
        t += 1.0
    return best_t, best


def envelope(path, hz):
    """The file's energy envelope at `hz` values per second (mean |sample| of mono 8 kHz)."""
    raw, _ = run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-af', 'aresample=8000', '-f', 's16le', '-'])
    samples = memoryview(raw).cast('h')
    hop = 8000 // hz
    return [sum(map(abs, samples[i:i + hop])) / hop for i in range(0, len(samples) - hop, hop)]


def repeat_lag(env, hz, at, window, lo, hi):
    """The lag (s, in [lo, hi]) at which the envelope from `at` best repeats itself — the length
    of a whole number of bars of a rhythmic loop. Normalised correlation over `window` s."""
    a0, n = int(at * hz), int(window * hz)
    a = env[a0:a0 + n]
    ma = sum(a) / n
    a = [x - ma for x in a]
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    best, best_lag = -2.0, int(lo * hz)
    for lag in range(int(lo * hz), int(hi * hz) + 1):
        b = env[a0 + lag:a0 + lag + n]
        if len(b) < n:
            break
        mb = sum(b) / n
        nb = math.sqrt(sum((x - mb) ** 2 for x in b)) or 1.0
        c = sum(x * (y - mb) for x, y in zip(a, b)) / (na * nb)
        if c > best:
            best, best_lag = c, lag
    return best_lag / hz, best


def beat_loop(path, lo, hi):
    """(start, loop length, correlation) of a rhythmic bed: its phrase (the strongest self-repeat
    between 2 and 12 s, on a 100 Hz envelope), times the most phrases that still repeat well
    (correlation ≥ 0.6 — a drum track drifts over a minute) within 60 s, each refined on a
    250 Hz envelope (±40 ms, 4 ms steps) so the seam lands on the beat."""
    start = lo + 2.0
    window = 15.0
    env100 = envelope(path, 100)
    phrase, _ = repeat_lag(env100, 100, start, window, 2.0, 12.0)
    env250 = envelope(path, 250)
    best = None
    for n in range(1, int(min(BED_LOOP_S, hi - start - window) / phrase) + 1):
        lag, c = repeat_lag(env250, 250, start, window, n * phrase - 0.04, n * phrase + 0.04)
        if best is None or c >= 0.6:
            best = (start, lag, c)
    return best


def make_bed(src, s, tmp):
    """Cuts and loops a bed into `tmp/<id>.wav`; returns (wav path, notes)."""
    dur = duration(src)
    lo = float(s.get('start', 0) or 0)
    hi = float(s.get('end', 0) or 0) or dur
    pts = timeline(src)
    if s.get('beat'):
        t0, loop, corr = beat_loop(src, lo, hi)
        xfade = 0.03
        score = 0.0
        note = f'repeats after {loop:.3f} s (correlation {corr:.2f})'
    else:
        loop = min(BED_LOOP_S, hi - lo - BED_XFADE_S - 0.5)
        xfade = BED_XFADE_S
        t0, score = steadiest(pts, lo, hi, loop + xfade)
        note = ''
    L = round(loop * RATE)
    X = round(xfade * RATE)
    S0 = round(t0 * RATE)
    mono = '' if probe_channels(src) == 1 else 'pan=mono|c0=0.5*c0+0.5*c1,'
    seg = os.path.join(tmp, s['id'] + '.seg.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af',
         f'aresample={RATE},{mono}atrim=start_sample={S0}:end_sample={S0 + L + X},asetpts=N/SR/TB', '-c:a', 'pcm_f32le', seg])
    # Sparse, peaky beds (drips, crackling fire) would sit 10+ LU under the rest when only their
    # peaks set the gain: limit the stretch BEFORE it is looped (a limiter on the loop itself
    # would carry its state across the seam), at most MAX_LIMIT_DB of gain reduction.
    i, tp, _ = loudness(seg)
    over = tp + (BED_LUFS - i) - (TRUE_PEAK - 1.0)
    if over > 0.5:
        gain = BED_LUFS - i - max(0.0, over - MAX_LIMIT_DB)
        limited = os.path.join(tmp, s['id'] + '.lim.wav')
        run(['ffmpeg', '-v', 'error', '-y', '-i', seg, '-af',
             f'volume={gain:.2f}dB,alimiter=limit={10 ** ((TRUE_PEAK - 1.5) / 20):.4f}:attack=2:release=80:level=0', '-c:a', 'pcm_f32le', limited])
        seg = limited
        note = (note + ', ' if note else '') + f'limited {min(over, MAX_LIMIT_DB):.1f} dB'
    # out[i < X] = seg[i]·in + seg[L+i]·out (equal power), out[X..L) = seg[X..L): out[L-1] → out[0]
    # continues as seg[L-1] → seg[L], so the wrap is the source's own continuity.
    graph = (
        f"[0:a]asplit=3[a][b][c];"
        f"[a]atrim=end_sample={X},asetpts=N/SR/TB,afade=t=in:ns={X}:curve=qsin[h];"
        f"[b]atrim=start_sample={L}:end_sample={L + X},asetpts=N/SR/TB,afade=t=out:ns={X}:curve=qsin[t];"
        f"[h][t]amix=inputs=2:normalize=0[x];"
        f"[c]atrim=start_sample={X}:end_sample={L},asetpts=N/SR/TB[m];"
        f"[x][m]concat=n=2:v=0:a=1[out]"
    )
    out = os.path.join(tmp, s['id'] + '.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', seg, '-filter_complex', graph, '-map', '[out]', '-c:a', 'pcm_f32le', out])
    return out, f'cut {t0:.0f}+{loop:.1f} s of {dur:.0f} s (spread {score:.1f} LU){", " + note if note else ""}'


def make_shot(src, s, tmp):
    """Trims and fades a one-shot into `tmp/<id>.wav`; returns (wav path, notes)."""
    lo = float(s.get('start', 0) or 0)
    hi = float(s.get('end', 0) or 0)
    chain = [f'aresample={RATE}']
    if probe_channels(src) > 1:
        chain.append('pan=mono|c0=0.5*c0+0.5*c1')
    if lo or hi:
        chain.append(f"atrim=start={lo}" + (f":end={hi}" if hi else '') + ',asetpts=N/SR/TB')
    chain += ['silenceremove=start_periods=1:start_threshold=-55dB',
              'areverse', 'silenceremove=start_periods=1:start_threshold=-60dB', 'areverse']
    if s.get('extra'):
        chain.append(s['extra'])
        chain += ['areverse', 'silenceremove=start_periods=1:start_threshold=-60dB', 'areverse']
    chain += ['afade=t=in:d=0.003']
    out = os.path.join(tmp, s['id'] + '.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', ','.join(chain), '-c:a', 'pcm_f32le', out])
    d = duration(out)
    faded = os.path.join(tmp, s['id'] + '.f.wav')
    run(['ffmpeg', '-v', 'error', '-y', '-i', out, '-af', f'afade=t=out:st={max(0, d - 0.06):.3f}:d=0.06', '-c:a', 'pcm_f32le', faded])
    return faded, f'{d:.2f} s'


def probe_channels(path):
    """The file's channel count."""
    out, _ = run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels', '-of', 'csv=p=0', path])
    return int(out.decode().strip().split(',')[0])


def seam(path):
    """How smooth a bed's wrap is, from the encoded file: the sample jump last → first against
    the 99th percentile of the file's own sample-to-sample steps (≤ 1 = like any other step),
    and the level of the last 200 ms against the first 200 ms (dB; ~0 = no level jump)."""
    raw, _ = run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'])
    x = memoryview(raw).cast('h')
    steps = sorted(abs(x[k + 1] - x[k]) for k in range(0, len(x) - 1, 7))
    p99 = steps[int(len(steps) * 0.99)] or 1
    n = RATE // 5
    rms = lambda seg: math.sqrt(sum(v * v for v in seg) / len(seg)) or 1.0
    return abs(x[0] - x[-1]) / p99, 20 * math.log10(rms(x[-n:]) / rms(x[:n]))


def decoded_samples(path):
    """How many samples the encoded file decodes to (mono 48 kHz)."""
    raw, _ = run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-'])
    return len(raw) // 2


def build(s, tmp):
    """Builds one sound; returns its index entry."""
    src = os.path.join(RAW, s['file'])
    if not os.path.isfile(src):
        raise FileNotFoundError(src)
    kind = s['kind']
    wav, note = (make_bed if kind == 'bed' else make_shot)(src, s, tmp)
    i, tp, mmax = loudness(wav)
    target = BED_LUFS if kind == 'bed' else SHOT_LUFS
    measured = i if kind == 'bed' or duration(wav) >= 1.5 else mmax
    gain = target - measured
    if tp + gain > TRUE_PEAK:
        gain = TRUE_PEAK - tp  # quieter than the target rather than clipped (a loop must not be limited)
    rel = f"{'beds' if kind == 'bed' else 'oneshots'}/{s['id']}.ogg"
    out = os.path.join(LIB, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    for _ in range(4):  # the encoder shifts loudness and peaks a little: measure, correct
        run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={gain:.2f}dB', '-c:a', 'libopus',
             '-b:a', BITRATE[kind], '-application', 'audio', '-map_metadata', '-1', out])
        li, ltp, lmax = loudness(out)
        off = target - (li if measured is i else lmax)
        if ltp + off > TRUE_PEAK:
            off = TRUE_PEAK - ltp - 0.1
        if abs(off) < 0.3:
            break
        gain += off
    samples = decoded_samples(out)
    lic = s.get('licence', 'CC0-1.0')
    if lic not in LICENCES:
        raise ValueError(f"{s['id']}: licence {lic} is not one the table may use")
    if lic != 'CC0-1.0' and not s.get('attribution'):
        raise ValueError(f"{s['id']}: {lic} needs an attribution line")
    entry = {
        'id': s['id'], 'kind': kind, 'name': s['name'], 'group': s['group'], 'file': rel,
        'seconds': round(samples / RATE, 3), 'samples': samples, 'rate': RATE, 'channels': 1,
        'bytes': os.path.getsize(out), 'lufs': round(li, 1), 'tags': s.get('tags', []),
    }
    if kind == 'oneshot':
        if s.get('effects'):
            entry['effects'] = s['effects']
        entry['duck'] = s.get('duck', True)
    entry.update({'author': s['author'], 'source': s['url'],
                  'licence': {'id': lic, 'url': s.get('licence_url') or LICENCES[lic]},
                  'attribution': s.get('attribution', '')})
    if kind == 'bed':
        jump, level = seam(out)
        note += f'; seam step {jump:.2f}, level {level:+.1f} dB'
    print(f"{s['id']:14} {kind:7} {entry['seconds']:6.2f} s {entry['bytes'] / 1024:6.0f} KB  {li:6.1f} LUFS  TP {ltp:5.1f}  {note}")
    return entry


def table():
    """Prints the catalogue table of docs/sounds.md from `../index.json`."""
    with open(os.path.join(LIB, 'index.json')) as f:
        sounds = json.load(f)['sounds']
    print('| Id | Kind | Name | Group | Length | Effects | Author | Licence |')
    print('|---|---|---|---|---|---|---|---|')
    for e in sounds:
        fx = ', '.join(e.get('effects', [])) or '—'
        print(f"| `{e['id']}` | {e['kind']} | {e['name']} | {e['group']} | {e['seconds']:.1f} s | {fx} | [{e['author']}]({e['source']}) | {e['licence']['id']} |")


def main():
    if sys.argv[1:] == ['--table']:
        table()
        return
    with open(os.path.join(HERE, 'sources.toml'), 'rb') as f:
        sources = tomllib.load(f)['sound']
    want = set(sys.argv[1:])
    index_path = os.path.join(LIB, 'index.json')
    old = {}
    if want and os.path.exists(index_path):
        with open(index_path) as f:
            old = {e['id']: e for e in json.load(f)['sounds']}
    entries = []
    with tempfile.TemporaryDirectory(prefix='claude-v2-sound-build') as tmp:
        for s in sources:
            if want and s['id'] not in want:
                if s['id'] in old:
                    entries.append(old[s['id']])
                continue
            entries.append(build(s, tmp))
    index = {'version': 1, 'count': len(entries), 'sounds': entries}
    with open(index_path, 'w') as f:
        json.dump(index, f, indent=1)
        f.write('\n')
    total = sum(e['bytes'] for e in entries)
    print(f"{len(entries)} sounds, {total / 1024 / 1024:.1f} MB")


if __name__ == '__main__':
    main()
