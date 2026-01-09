#!/usr/bin/env python3
"""
API Key 安全存储模块

使用 macOS Keychain（通过 keyring 库）安全存储 API Keys。
支持 fallback 到环境变量（兼容 CI/CD 场景）。

Usage:
    # 交互式配置
    python3 credentials.py

    # 检查配置状态
    python3 credentials.py check

    # 在其他脚本中使用
    from credentials import get_credential
    api_key = get_credential("GEMINI_API_KEY")
"""

import keyring
import os
import sys
from typing import Optional

SERVICE_NAME = "testany-media-writer"

# (key_name, display_name, url, required)
REQUIRED_KEYS = [
    ("UNSPLASH_ACCESS_KEY", "Unsplash", "https://unsplash.com/developers", True),
    ("PEXELS_API_KEY", "Pexels", "https://www.pexels.com/api/new/", True),
    ("PIXABAY_API_KEY", "Pixabay", "https://pixabay.com/api/docs/", True),
    ("GEMINI_API_KEY", "Google AI (Gemini)", "https://aistudio.google.com/apikey", True),
    ("DASHSCOPE_API_KEY", "通义万相 (阿里云)", "https://bailian.console.aliyun.com/", False),
]


def get_credential(key_name: str) -> Optional[str]:
    """
    获取 API Key（优先级：Keychain > 环境变量）

    Args:
        key_name: API Key 名称，如 "GEMINI_API_KEY"

    Returns:
        API Key 值，未配置则返回 None
    """
    # 1. 先查 Keychain
    try:
        value = keyring.get_password(SERVICE_NAME, key_name)
        if value:
            return value
    except Exception:
        pass  # Keychain 不可用，继续尝试环境变量

    # 2. Fallback 到环境变量（CI/CD、Docker 等场景）
    return os.environ.get(key_name)


def set_credential(key_name: str, value: str) -> bool:
    """
    存储 API Key 到 Keychain

    Args:
        key_name: API Key 名称
        value: API Key 值

    Returns:
        是否成功
    """
    try:
        keyring.set_password(SERVICE_NAME, key_name, value)
        return True
    except Exception as e:
        print(f"  Error: 无法保存到 Keychain: {e}")
        return False


def delete_credential(key_name: str) -> bool:
    """
    从 Keychain 删除 API Key

    Args:
        key_name: API Key 名称

    Returns:
        是否成功
    """
    try:
        keyring.delete_password(SERVICE_NAME, key_name)
        return True
    except keyring.errors.PasswordDeleteError:
        return True  # Key 不存在，视为成功
    except Exception:
        return False


def check_credentials() -> dict[str, bool]:
    """
    检查所有 API Key 的配置状态

    Returns:
        {key_name: is_configured} 字典
    """
    result = {}
    for key_name, _, _, _ in REQUIRED_KEYS:
        value = get_credential(key_name)
        result[key_name] = bool(value)
    return result


def setup_credentials() -> None:
    """交互式设置 API Keys 到 Keychain"""
    print("=" * 60)
    print("  Media Writer - API Key 配置")
    print("  Keys 将安全存储在 macOS Keychain 中")
    print("=" * 60)
    print()

    for key_name, service, url, required in REQUIRED_KEYS:
        # 检查现有配置
        existing = None
        try:
            existing = keyring.get_password(SERVICE_NAME, key_name)
        except Exception:
            pass

        # 显示状态
        if existing:
            status = "已配置"
            masked = existing[:4] + "*" * (len(existing) - 8) + existing[-4:] if len(existing) > 8 else "****"
            print(f"[{service}] {status} ({masked})")
            update = input("  是否更新？(y/N): ").strip().lower()
            if update != 'y':
                print()
                continue
        else:
            status = "未配置（必需）" if required else "未配置（可选）"
            print(f"[{service}] {status}")

        # 显示获取地址
        print(f"  获取地址: {url}")

        # 输入新值
        value = input(f"  请输入 {key_name}: ").strip()

        if value:
            if set_credential(key_name, value):
                print(f"  OK 已保存到 Keychain")
            else:
                print(f"  WARN 保存失败，请手动设置环境变量")
        elif required:
            print(f"  WARN 跳过（后续使用时可能报错）")
        else:
            print(f"  跳过")

        print()

    print("=" * 60)
    print("  配置完成！")
    print("=" * 60)


def show_status() -> int:
    """
    显示所有 API Key 的配置状态

    Returns:
        退出码：0=全部必需项已配置，1=有缺失
    """
    print("=" * 60)
    print("  Media Writer - API Key 状态")
    print("=" * 60)
    print()

    result = check_credentials()
    all_required_ok = True

    for key_name, service, _, required in REQUIRED_KEYS:
        configured = result.get(key_name, False)
        if configured:
            status = "OK"
        elif required:
            status = "MISSING"
            all_required_ok = False
        else:
            status = "-- (可选)"

        req_mark = "*" if required else " "
        print(f"  [{status:^8}] {req_mark} {service} ({key_name})")

    print()
    print("  * 表示必需")
    print("=" * 60)

    return 0 if all_required_ok else 1


def main():
    """主入口"""
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        if cmd == "check":
            sys.exit(show_status())
        elif cmd == "help" or cmd == "-h" or cmd == "--help":
            print(__doc__)
            sys.exit(0)
        else:
            print(f"未知命令: {cmd}")
            print("可用命令: check, help")
            sys.exit(1)
    else:
        setup_credentials()


if __name__ == "__main__":
    main()
