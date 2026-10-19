#!/usr/bin/env python3
"""
FloatHUD 激活码生成器

用法:
  export FLOAT_HUD_LICENSE_SECRET='你的长密钥'
  python3 tools/genkey.py                 # 生成 1 枚
  python3 tools/genkey.py --count 10      # 生成 10 枚
  python3 tools/genkey.py --show-secret   # 生成密钥并打印

密钥规则: FH-PRO-XXXX-XXXX-XXXX-XXXX
  payload = 6 字节 serial
  sig     = HMAC-SHA256(secret, b"pro|" + serial)[:6]
  编码    = base32(payload + sig) → 去掉 =，按 4 分组
"""
import argparse
import base64
import hashlib
import hmac
import os
import secrets
import sys
from typing import Optional, Tuple

SECRET_ENV = "FLOAT_HUD_LICENSE_SECRET"
PREFIX = "FH-PRO-"


def b32(data: bytes) -> str:
    return base64.b32encode(data).decode("ascii").rstrip("=").upper()


def format_key(raw: bytes) -> str:
    # 10 字节 → 恰好 16 个 base32 字符 → 4 组
    s = b32(raw)
    assert len(s) == 16, len(s)
    groups = [s[i : i + 4] for i in range(0, 16, 4)]
    return PREFIX + "-".join(groups)


def gen_key(secret: bytes) -> str:
    serial = secrets.token_bytes(4)
    sig = hmac.new(secret, b"pro|" + serial, hashlib.sha256).digest()[:6]
    return format_key(serial + sig)


def parse_key(key: str) -> Optional[Tuple[bytes, bytes]]:
    k = key.strip().upper()
    if not k.startswith(PREFIX):
        return None
    body = k[len(PREFIX) :].replace("-", "")
    if len(body) != 16 or not all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in body):
        return None
    pad = (-len(body)) % 8
    try:
        raw = base64.b32decode(body + "=" * pad)
    except Exception:
        return None
    if len(raw) != 10:
        return None
    return raw[:4], raw[4:10]


def verify(secret: bytes, key: str) -> bool:
    parsed = parse_key(key)
    if not parsed:
        return False
    serial, sig = parsed
    expect = hmac.new(secret, b"pro|" + serial, hashlib.sha256).digest()[:6]
    return hmac.compare_digest(sig, expect)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=1)
    ap.add_argument("--show-secret", action="store_true")
    ap.add_argument("--verify", help="校验一枚激活码")
    args = ap.parse_args()

    secret = os.environ.get(SECRET_ENV, "").strip()
    if args.show_secret:
        s = secrets.token_urlsafe(32)
        print(s)
        print(f"# 放入环境变量后重新运行: export {SECRET_ENV}='...'", file=sys.stderr)
        return 0

    if not secret:
        print(f"缺少环境变量 {SECRET_ENV}", file=sys.stderr)
        print(f"首次可先运行: python3 tools/genkey.py --show-secret", file=sys.stderr)
        return 1

    secret_b = secret.encode("utf-8")

    if args.verify:
        ok = verify(secret_b, args.verify)
        print("OK" if ok else "INVALID")
        return 0 if ok else 2

    for _ in range(max(1, args.count)):
        print(gen_key(secret_b))
    return 0


if __name__ == "__main__":
    sys.exit(main())
