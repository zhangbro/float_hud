#!/usr/bin/env python3
"""输出 Mimo 用量 HTML；失败时给出可读提示而不是 traceback。"""
import json
import os
import sys
import urllib.request
import urllib.error


def ok(html: str) -> None:
    print(html)
    sys.exit(0)


def fail(text: str) -> None:
    print(
        "<div style='color:#FF6961;font-size:12px;font-weight:600'>"
        + text
        + "</div>"
    )
    sys.exit(0)


def load_cookie_string() -> str:
    path = os.path.expanduser("~/.mimo-usage/mimo-useage.config")
    try:
        content = open(path).read()
    except OSError:
        return ""
    for line in content.splitlines():
        s = line.strip()
        if s and not s.startswith("{") and ";" in s and "api-platform_serviceToken" in s and "userId" in s:
            return s
    return ""


def main() -> None:
    cs = load_cookie_string()
    if not cs:
        fail("Cookie 缺失：请登录 platform.xiaomimimo.com 后重试")

    req = urllib.request.Request(
        "https://platform.xiaomimimo.com/api/v1/tokenPlan/usage",
        headers={
            "Cookie": cs,
            "content-type": "application/json",
            "x-timezone": "Asia/Shanghai",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            u = json.load(resp)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            fail("Cookie 已过期：请在浏览器重新登录 platform.xiaomimimo.com")
        fail(f"请求失败 HTTP {e.code}")
    except Exception as e:
        fail(f"请求失败：{e}")

    if u.get("code") != 0:
        fail("接口返回异常 code=%s" % u.get("code"))

    try:
        plan = next(
            i for i in u["data"]["usage"]["items"] if i["name"] == "plan_total_token"
        )
    except Exception:
        fail("响应结构变了，未找到 plan_total_token")

    pct = plan["used"] * 100 / plan["limit"]
    ok(
        "<div style='color:#5AC8FA;font-size:13px;font-weight:600'>"
        f"{pct:.1f}% {plan['used']/1e8:.1f}/{int(plan['limit']/1e8)}亿"
        "</div>"
    )


if __name__ == "__main__":
    main()
