#!/usr/bin/env python3
"""
Fetch TastyLive video transcripts from YouTube via yt-dlp.
Outputs to TRANSCRIPTS_OUT as a JSON file keyed by video ID.
Can be run as a standalone script or triggered via the API.
"""
import glob
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

# ── Configuration ──────────────────────────────────────────────────────────────
CACHE_PATH = Path(os.getenv("TRANSCRIPT_CACHE", "/opt/data/transcript_cache_yt.json"))
TRANSCRIPTS_OUT = Path(os.getenv("TRANSCRIPTS_OUT", "/opt/data/tastylive_transcripts.json"))
YT_DLP_CMD = os.getenv("YT_DLP_CMD", "yt-dlp")
RATE_LIMIT_SEC = int(os.getenv("YT_RATE_LIMIT", "15"))

# ── TastyLive video library ───────────────────────────────────────────────────
VIDEOS = [
    ("4XUwTpwofjM",   "Short Vertical Spreads Explained"),
    ("K0O2M7xVMm4",   "4 Numbers That Make Every Vertical Spread Decision"),
    ("H-l1RbeeIZA",   "Watch This Before Your Next Iron Condor Trade"),
    ("HIGvlrIRvtM",   "5000 Trades To Find Optimal Wing Price"),
    ("-2TM3Jaz9dQ",   "15000 Trades To Find Preferred Delta"),
    ("Zt-Zx6zld24",   "Stop Overthinking Greeks - Delta Moves Your Money"),
    ("7UxFF9O38_0",   "Zero DTE Iron Condors March 2026"),
    ("eyxQQ2eydx0",   "Rolling Method Cuts IC Loss 45%"),
    ("mBSUEPakaxU",   "Why 0DTE Iron Condors Show Consistent Results"),
    ("VsUIyZzL8WI",   "Pick Strikes Forever"),
    ("oWfBJJxE1MI",   "9-Minute Manage Every Options Trade"),
    ("JIyiEo-0HB0",   "Sell Options In 8 Minutes"),
    ("pwogTJq9GYs",   "When Options Trade Goes Against You"),
    ("XQCwqCI8Ods",   "Manage Iron Condors Forever"),
]

# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_cache() -> dict:
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except (json.JSONDecodeError, Exception):
            return {}
    return {}

def _save_cache(cache: dict):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache, indent=2))


def _build_collection(cache: dict) -> dict:
    """Build the master collection from cache entries with status 'ok'."""
    collection = {}
    for vid, data in cache.items():
        if data.get("status") == "ok":
            lines = data.get("transcript", "").split("\n")
            collection[vid] = {
                "title": data.get("title", ""),
                "transcript": data.get("transcript", ""),
                "segments": len(lines),
                "chars": data.get("chars", 0),
            }
    return collection


def _write_collection(collection: dict):
    TRANSCRIPTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTS_OUT.write_text(json.dumps(collection, indent=2))


def _fetch_single(vid: str, title: str, timeout: int = 60) -> dict:
    """Fetch subtitles for a single video. Returns result dict."""
    outtmpl = f"/tmp/sub_{vid}"
    cmd = [
        YT_DLP_CMD,
        "--skip-download",
        "--write-auto-subs",
        "--sub-langs", "en",
        "--sub-format", "json3",
        "-o", outtmpl,
        "--no-progress",
        "--retries", "3",
        f"https://www.youtube.com/watch?v={vid}",
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            return {"title": title, "transcript": "", "status": f"yt-dlp exit {result.returncode}: {result.stderr[:200]}"}

        # Find subtitle file
        candidates = glob.glob(f"{outtmpl}*.json3") + glob.glob(f"{outtmpl}*.json")
        if not candidates:
            return {"title": title, "transcript": "", "status": "sub file not found"}

        sub_file = candidates[0]
        with open(sub_file) as f:
            sub_data = json.load(f)

        # Parse JSON3 format: events array with segs
        segments = []
        for event in sub_data.get("events", []):
            segs = event.get("segs", [])
            start = event.get("tStartMs", 0) / 1000.0
            text = "".join(s.get("utf8", "") for s in segs)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                segments.append({"start": start, "text": text})

        if not segments:
            return {"title": title, "transcript": "", "status": "no segments found"}

        def fmt(sec):
            m, s = divmod(int(sec), 60)
            return f"{m}:{s:02d}"

        lines = [f"{fmt(s['start'])} {s['text']}" for s in segments]
        full_text = "\n".join(lines)

        # Cleanup temp files
        for f_path in candidates:
            try:
                os.remove(f_path)
            except OSError:
                pass
        for ext in [".en.json3", ".en.vtt", ".en.srt", ".en.ttml"]:
            p = f"{outtmpl}{ext}"
            if os.path.exists(p):
                os.remove(p)

        return {
            "title": title,
            "transcript": full_text,
            "segments": len(segments),
            "chars": len(full_text),
            "status": "ok",
        }

    except subprocess.TimeoutExpired:
        return {"title": title, "transcript": "", "status": "timeout"}
    except Exception as e:
        return {"title": title, "transcript": "", "status": f"error: {e}"}


# ── Public API ─────────────────────────────────────────────────────────────────

def get_transcripts() -> dict:
    """Return the current collection of transcripts."""
    if TRANSCRIPTS_OUT.exists():
        try:
            return json.loads(TRANSCRIPTS_OUT.read_text())
        except (json.JSONDecodeError, Exception):
            return {}
    return {}


def get_video_library() -> list:
    """Return the list of known videos."""
    cache = _load_cache()
    result = []
    for vid, title in VIDEOS:
        entry = {"id": vid, "title": title}
        cached = cache.get(vid, {})
        entry["status"] = cached.get("status", "not_fetched")
        entry["chars"] = cached.get("chars", 0)
        result.append(entry)
    return result


def run_fetch(video_ids: list[str] | None = None, wait: bool = True) -> dict:
    """
    Fetch transcripts for given video IDs (or all if None).
    If wait=True, blocks until done. If False, returns immediately (caller should background).
    Returns summary dict.
    """
    cache = _load_cache()
    targets = [(vid, title) for vid, title in VIDEOS if video_ids is None or vid in video_ids]
    results = {"total": len(targets), "ok": 0, "failed": 0, "skipped": 0, "errors": []}

    for i, (vid, title) in enumerate(targets):
        # Skip if already fetched successfully
        if vid in cache and cache[vid].get("status") == "ok":
            results["skipped"] += 1
            continue

        print(f"[{i+1}/{len(targets)}] Fetching {vid} — {title}")
        result = _fetch_single(vid, title)
        cache[vid] = result
        _save_cache(cache)

        if result["status"] == "ok":
            results["ok"] += 1
            print(f"  ✓ {result['chars']} chars")
        else:
            results["failed"] += 1
            results["errors"].append(f"{vid}: {result['status']}")
            print(f"  ✗ {result['status']}")

        # Rate limit
        if i < len(targets) - 1 and wait:
            print(f"  Waiting {RATE_LIMIT_SEC}s...")
            time.sleep(RATE_LIMIT_SEC)

    # Write master collection
    collection = _build_collection(cache)
    _write_collection(collection)
    results["total_chars"] = sum(c.get("chars", 0) for c in collection.values())
    results["videos_cached"] = len(collection)

    print(f"\nDone: {results['ok']} ok, {results['failed']} failed, {results['skipped']} skipped")
    return results


# ── CLI entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Fetch TastyLive video transcripts")
    parser.add_argument("--videos", nargs="*", help="Specific video IDs to fetch (default: all)")
    parser.add_argument("--status", action="store_true", help="Show library status and exit")
    args = parser.parse_args()

    if args.status:
        lib = get_video_library()
        print(f"{'ID':<14} {'Status':<16} {'Chars':<8} Title")
        print("-" * 70)
        for v in lib:
            print(f"{v['id']:<14} {v['status']:<16} {v['chars']:<8} {v['title']}")
        print(f"\nTotal: {len(lib)} videos")

        transcripts = get_transcripts()
        print(f"Transcripts cached: {len(transcripts)} videos")
        sys.exit(0)

    result = run_fetch(video_ids=args.videos, wait=True)
    sys.exit(0 if result["failed"] == 0 else 1)
