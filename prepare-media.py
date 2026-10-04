#!/usr/bin/env python3
"""Prepare and check the Spill radio media folder.

Run from the repo root (the folder that contains radio/):
    python3 prepare-media.py                 # check and update manifest.json
    python3 prepare-media.py --fix-names     # also rename files with spaces/odd characters
    python3 prepare-media.py path/to/media   # use a different media folder

What it does
  - Creates radio/media/radio and radio/media/music if they are missing.
  - Adds a manifest.json entry for every audio file that does not have one
    (title taken from the file name, npub set to a TEST npub you must replace).
  - Never overwrites titles or npubs you already set.
  - Checks every npub (real bech32 checksum), file names, sizes, durations,
    and whether a transcript already exists.
"""
import json
import os
import re
import shutil
import subprocess
import sys

AUDIO = (".mp3", ".mpeg", ".m4a", ".wav", ".ogg", ".webm", ".aac", ".flac")
TEST_NPUBS = [
    "npub1zupsftlnpddt70jepjzlw5pgxxtp0u7jhhrtf7awqmqqxghtem0qyn9j4a",
    "npub1esetegxclt87alcsvnzp5fya6cdyxk7x8qfu4p46tpzmkxss32tqz7fjrx",
    "npub16j2dugp5ma73hqqqz7y5m7s6u0wz8rucssa0g0pc8hgvfxfznfcqn67dzk",
    "npub1uphdlz09djcrkjrqy57c038ysr3gfjxay366ywttqcz8m2ptmpvsawym9w",
    "npub1vnw7tvtycj6trnakkqss2zfpz92642erh2t9qszquxcclgkr289srjypuz",
]
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
GEN = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
MAX_MB = 20          # keep files small: transcription has a size limit
MAX_MIN = 10         # and long recordings may exceed it once converted


def polymod(values):
    chk = 1
    for v in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ v
        for i in range(5):
            if (top >> i) & 1:
                chk ^= GEN[i]
    return chk


def npub_valid(s):
    """True only for a correctly formed npub (checksum and 32 bytes)."""
    if not isinstance(s, str) or not s.startswith("npub1") or len(s) != 63:
        return False
    if s != s.lower():
        return False
    try:
        data = [CHARSET.index(c) for c in s[5:]]
    except ValueError:
        return False
    hrp = "npub"
    exp = [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]
    if polymod(exp + data) != 1:
        return False
    acc, bits, out = 0, 0, []
    for v in data[:-6]:
        acc = (acc << 5) | v
        bits += 5
        while bits >= 8:
            bits -= 8
            out.append((acc >> bits) & 255)
        acc &= (1 << bits) - 1
    return len(out) == 32


def title_from(name):
    base = os.path.splitext(name)[0]
    base = re.sub(r"[_\-]+", " ", base).strip()
    return base[:1].upper() + base[1:] if base else name


def duration_sec(path):
    if not shutil.which("ffprobe"):
        return None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        ).stdout.strip()
        return float(out)
    except Exception:
        return None


def safe_name(name):
    stem, ext = os.path.splitext(name)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-")
    return (stem or "audio") + ext.lower()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    fix_names = "--fix-names" in sys.argv
    media = args[0] if args else os.path.join("radio", "media")
    radio_dir = os.path.join(media, "radio")
    music_dir = os.path.join(media, "music")
    os.makedirs(radio_dir, exist_ok=True)
    os.makedirs(music_dir, exist_ok=True)

    warnings, problems = [], []

    if not shutil.which("ffmpeg"):
        problems.append("ffmpeg is not installed. The worker needs it on this machine.")
    if not shutil.which("ffprobe"):
        warnings.append("ffprobe not found, so durations were not checked.")

    files = sorted(f for f in os.listdir(radio_dir)
                   if f.lower().endswith(AUDIO) and os.path.isfile(os.path.join(radio_dir, f)))

    # Optional renaming of awkward file names
    if fix_names:
        for f in list(files):
            new = safe_name(f)
            if new != f and not os.path.exists(os.path.join(radio_dir, new)):
                os.rename(os.path.join(radio_dir, f), os.path.join(radio_dir, new))
                print(f"renamed: {f} -> {new}")
        files = sorted(f for f in os.listdir(radio_dir)
                       if f.lower().endswith(AUDIO) and os.path.isfile(os.path.join(radio_dir, f)))

    manifest_path = os.path.join(radio_dir, "manifest.json")
    manifest = []
    if os.path.exists(manifest_path):
        try:
            manifest = json.load(open(manifest_path, encoding="utf-8"))
            if not isinstance(manifest, list):
                raise ValueError("manifest.json must be a list")
        except Exception as e:
            print(f"ERROR: manifest.json is not valid ({e}). Fix or delete it, then rerun.")
            sys.exit(1)

    by_file = {e.get("file"): e for e in manifest if isinstance(e, dict)}
    added = 0
    for f in files:
        if f not in by_file:
            entry = {"file": f, "title": title_from(f),
                     "npub": TEST_NPUBS[(len(by_file)) % len(TEST_NPUBS)]}
            manifest.append(entry)
            by_file[f] = entry
            added += 1
    json.dump(manifest, open(manifest_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)

    print(f"\nMedia folder: {os.path.abspath(media)}")
    print(f"Recordings found: {len(files)}   (new manifest entries added: {added})\n")
    print(f"{'file':42} {'npub':8} {'length':>7} {'size':>7}  transcript")
    for f in files:
        path = os.path.join(radio_dir, f)
        e = by_file[f]
        ok = npub_valid(e.get("npub"))
        test = e.get("npub") in TEST_NPUBS
        size = os.path.getsize(path) / 1_000_000
        dur = duration_sec(path)
        has_t = any(os.path.exists(os.path.join(radio_dir, n)) for n in
                    (f + ".transcript.json", os.path.splitext(f)[0] + ".transcript.json"))
        label = "OK" if ok and not test else ("TEST" if ok else "BAD")
        dur_s = f"{dur/60:.1f}m" if dur else "?"
        print(f"{f[:41]:42} {label:8} {dur_s:>7} {size:6.1f}M  {'yes' if has_t else 'no (will be made)'}")
        if not ok:
            problems.append(f"{f}: npub is not a valid npub, so the file will be skipped.")
        if test:
            warnings.append(f"{f}: uses a TEST npub. Replace it with the speaker's real npub.")
        if not str(e.get("title", "")).strip():
            problems.append(f"{f}: title is empty.")
        if size > MAX_MB:
            warnings.append(f"{f}: {size:.0f} MB. Transcription may fail; compress or split it.")
        if dur and dur / 60 > MAX_MIN:
            warnings.append(f"{f}: {dur/60:.0f} min. Long files may exceed the transcription "
                            f"limit; split into parts under {MAX_MIN} min.")
        if f != safe_name(f):
            warnings.append(f"{f}: has spaces or special characters. "
                            f"Rerun with --fix-names to rename it safely.")

    for e in manifest:
        if isinstance(e, dict) and e.get("file") not in files:
            warnings.append(f"manifest entry '{e.get('file')}' has no audio file in {radio_dir}.")

    music = sorted(f for f in os.listdir(music_dir) if f.lower().endswith(AUDIO))
    print(f"\nMusic clips in {music_dir}: {len(music)}")
    for m in music:
        print(f"  {m}")
    if not music:
        warnings.append("media/music is empty, so the AI DJ has no music breaks.")

    print()
    for w in warnings:
        print(f"WARNING: {w}")
    for p in problems:
        print(f"PROBLEM: {p}")
    if not warnings and not problems:
        print("All good.")
    print("\nNext: start or restart the worker, wait a minute or two, then run:")
    print("  ls radio/media/radio | grep transcript")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
