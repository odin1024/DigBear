# -*- coding: utf-8 -*-
"""批量生成掘掘熊吉祥物（即梦 Seedream 4.6）。

用法:
    set JIMENG_AK / JIMENG_SK
    python scripts/gen_mascots.py --out-dir build-preview/mascot-test
"""
import argparse, base64, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jimeng_gen as J

CHARACTER = (
    "The same character in every image: a chubby cartoon bear mascot with warm cream-colored fluffy fur, "
    "wearing an amber yellow miner's helmet with a glowing round headlamp on the front, "
    "bold clean dark purple outlines, flat vector illustration style with soft cel shading, "
    "warm palette of cream, amber and deep purple. Simple rounded shapes, friendly and charming. "
    "Full body visible, centered composition, plain solid pure white background, no text, no shadow."
)

ACTIONS = {
    "hero":   "The bear stands upright facing the viewer and raises one paw in a cheerful friendly wave, big smile.",
    "crawl":  "The bear crouches down and digs energetically into the ground with a small shovel, little dirt particles flying, focused and determined expression.",
    "empty":  "The bear stands with empty paws, tilts its head and scratches behind its ear with a puzzled and slightly worried expression.",
    "happy":  "The bear beams with a big smile and happily holds up a bulging collection sack full of colorful pictures in both paws.",
    "error":  "The bear looks upset and confused, sitting on the ground with one paw on its head.",
    "login":  "The bear stands beside a simple closed door, holding up a large golden key in one paw, looking hopeful.",
}

ORDER = ["hero", "crawl", "empty", "happy", "error", "login"]


def run_one(mood, ak, sk, out_dir, width=1024, height=1024, retries=3):
    prompt = CHARACTER + " " + ACTIONS[mood]
    for attempt in range(1, retries + 1):
        try:
            body = {
                "req_key": J.REQ_KEY,
                "prompt": prompt,
                "width": width,
                "height": height,
                "return_url": True,
            }
            res = J._call(J.SUBMIT_ACTION, body, ak, sk)
            if res.get("code", 10000) not in (0, 10000, None):
                raise RuntimeError(json.dumps(res, ensure_ascii=False)[:200])
            task_id = res["data"]["task_id"]
            print("[%s] task_id=%s" % (mood, task_id), flush=True)
            for _ in range(60):
                time.sleep(4)
                q = J._call(J.QUERY_ACTION, {"req_key": J.REQ_KEY, "task_id": task_id}, ak, sk)
                d = q.get("data") or {}
                if d.get("status") == "done":
                    blobs = d.get("binary_data_base64") or []
                    if not blobs:
                        raise RuntimeError("完成但无图片")
                    path = os.path.join(out_dir, "%s.png" % mood)
                    raw = base64.b64decode(blobs[0])
                    with open(path, "wb") as f:
                        f.write(raw)
                    print("[%s] saved %s (%d bytes)" % (mood, path, len(raw)), flush=True)
                    return path
                if d.get("status") in ("failed", "cancel"):
                    raise RuntimeError("任务失败")
            raise RuntimeError("轮询超时")
        except Exception as e:
            print("[%s] 第 %d 次失败: %s" % (mood, attempt, str(e)[:140]), flush=True)
            if attempt == retries:
                return None
            time.sleep(15 * attempt)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--only", default="", help="逗号分隔的情绪名")
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    args = ap.parse_args()

    ak = os.environ.get("JIMENG_AK")
    sk = os.environ.get("JIMENG_SK")
    if not ak or not sk:
        raise SystemExit("请先设置 JIMENG_AK / JIMENG_SK")
    os.makedirs(args.out_dir, exist_ok=True)

    moods = [m.strip() for m in args.only.split(",") if m.strip()] or ORDER
    for i, mood in enumerate(moods):
        run_one(mood, ak, sk, args.out_dir, args.width, args.height)
        if i < len(moods) - 1:
            time.sleep(8)   # 避开并发限流
    print("全部完成")


if __name__ == "__main__":
    main()