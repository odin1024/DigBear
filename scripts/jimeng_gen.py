# -*- coding: utf-8 -*-
"""即梦 AI（Seedream 4.6）图片生成客户端 —— 火山引擎 V4 签名。

凭据从环境变量读取，不写进代码：
    JIMENG_AK / JIMENG_SK

用法:
    python scripts/jimeng_gen.py --prompt "..." --out out.png --width 1024 --height 1024
"""
import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HOST = "visual.volcengineapi.com"
REGION = "cn-north-1"
SERVICE = "cv"
VERSION = "2022-08-31"
SUBMIT_ACTION = "CVSync2AsyncSubmitTask"
QUERY_ACTION = "CVSync2AsyncGetResult"
REQ_KEY = "jimeng_seedream46_cvtob"


def _hmac(key, msg: str) -> bytes:
    if isinstance(key, str):
        key = key.encode("utf-8")
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _sign_key(secret, date: str) -> bytes:
    k_date = _hmac(secret, date)
    k_region = _hmac(k_date, REGION)
    k_service = _hmac(k_region, SERVICE)
    return _hmac(k_service, "request")


def _canonical_query(action: str) -> str:
    # Action 与 Version 按字典序排列并做 RFC3986 编码
    params = {"Action": action, "Version": VERSION}
    return "&".join(
        "%s=%s" % (urllib.parse.quote(k, safe="-_.~"), urllib.parse.quote(v, safe="-_.~"))
        for k, v in sorted(params.items())
    )


def _call(action: str, body: dict, ak: str, sk: bytes) -> dict:
    payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    payload_hash = hashlib.sha256(payload).hexdigest()
    now = dt.datetime.now(dt.timezone.utc)
    x_date = now.strftime("%Y%m%dT%H%M%SZ")
    date = now.strftime("%Y%m%d")

    cqs = _canonical_query(action)
    headers = {
        "content-type": "application/json",
        "host": HOST,
        "x-content-sha256": payload_hash,
        "x-date": x_date,
    }
    signed_headers = ";".join(sorted(headers.keys()))
    canonical_headers = "".join("%s:%s\n" % (k, headers[k]) for k in sorted(headers.keys()))
    canonical_request = "\n".join(
        ["POST", "/", cqs, canonical_headers, signed_headers, payload_hash]
    )

    scope = "%s/%s/%s/request" % (date, REGION, SERVICE)
    string_to_sign = "\n".join(
        [
            "HMAC-SHA256",
            x_date,
            scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signature = hmac.new(
        _sign_key(sk, date), string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()

    req = urllib.request.Request(
        "https://%s/?%s" % (HOST, cqs),
        data=payload,
        method="POST",
        headers={
            **headers,
            "X-Date": x_date,
            "Authorization": (
                "HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s"
                % (ak, scope, signed_headers, signature)
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _brief(payload, limit=300):
    """错误信息截断 —— 完整响应可能含 MB 级 base64，打印出来会淹没终端。"""
    text = json.dumps(payload, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit] + " ...(truncated)"


def generate(prompt, ak, sk, width, height, seed=None, image_urls=None, timeout=600):
    body = {
        "req_key": REQ_KEY,
        "prompt": prompt,
        "width": width,
        "height": height,
        "return_url": True,
    }
    if seed is not None:
        body["seed"] = seed
    if image_urls:
        body["image_urls"] = image_urls

    res = _call(SUBMIT_ACTION, body, ak, sk)
    # 火山引擎视觉智能：10000 表示成功（不是 0）。
    if res.get("code", 10000) not in (0, 10000, None):
        raise SystemExit("提交失败: %s" % json.dumps(res, ensure_ascii=False))
    task_id = res["data"]["task_id"]
    print("task_id =", task_id, flush=True)

    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(3)
        q = _call(QUERY_ACTION, {"req_key": REQ_KEY, "task_id": task_id}, ak, sk)
        data = q.get("data") or {}
        status = data.get("status")
        if status == "done":
            # 火山引擎视觉智能：结果既可能放在 binary_data_base64，
            # 也可能放在 resp_data.image_urls，两处都要认。
            blobs = data.get("binary_data_base64") or []
            urls = data.get("resp_data", {}).get("image_urls") or []
            urls = urls or data.get("image_urls") or []
            if not blobs and not urls:
                raise SystemExit("完成但没有图片: %s" % _brief(q))
            return blobs, urls
        if status in ("failed", "cancel"):
            raise SystemExit("任务失败: %s" % _brief(q))
        print("  status=%s" % status, flush=True)
    raise SystemExit("超时")


def download(url, dest):
    with urllib.request.urlopen(url, timeout=180) as resp:
        data = resp.read()
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "wb") as f:
        f.write(data)
    return len(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=1024)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--image-url", action="append", default=None)
    args = ap.parse_args()

    ak = os.environ.get("JIMENG_AK")
    sk_b64 = os.environ.get("JIMENG_SK")
    if not ak or not sk_b64:
        raise SystemExit("请先设置环境变量 JIMENG_AK 与 JIMENG_SK")
    # 火山引擎视觉智能的 SK 直接用控制台给出的字符串参与签名，不做 base64 解码。
    sk = sk_b64

    blobs, urls = generate(args.prompt, ak, sk, args.width, args.height,
                           seed=args.seed, image_urls=args.image_url)

    results = []
    for i, b64 in enumerate(blobs):
        dest = args.out if len(blobs) == 1 else "%s-%d%s" % (
            os.path.splitext(args.out)[0], i + 1, os.path.splitext(args.out)[1])
        raw = base64.b64decode(b64)
        os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(raw)
        results.append(dest)
        print("saved %s (%d bytes)" % (dest, len(raw)))

    for i, u in enumerate(urls):
        if len(blobs) and i < len(blobs):
            continue
        dest = args.out if not urls or len(urls) == 1 else "%s-%d%s" % (
            os.path.splitext(args.out)[0], i + 1, os.path.splitext(args.out)[1])
        size = download(u, dest)
        results.append(dest)
        print("saved %s (%d bytes) <- %s" % (dest, size, u))

    if not results:
        raise SystemExit("没有拿到任何图片")


if __name__ == "__main__":
    main()