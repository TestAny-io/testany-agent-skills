#!/usr/bin/env python3
"""
图片下载模块

下载图片并转换为 PNG 格式。

Usage:
    python3 image_download.py "https://images.unsplash.com/..." --output cover.png
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

import requests
from PIL import Image
from io import BytesIO


@dataclass
class DownloadResult:
    """下载结果"""
    url: str
    local_path: str
    file_size: str  # human readable, e.g. "245KB"
    width: int
    height: int
    success: bool
    error: Optional[str] = None


def format_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f}KB"
    else:
        return f"{size_bytes / (1024 * 1024):.1f}MB"


def download_image(
    url: str,
    output_path: str,
    timeout: int = 60,
    max_retries: int = 3,
) -> DownloadResult:
    """
    下载图片并转换为 PNG

    Args:
        url: 图片 URL
        output_path: 输出路径（自动添加 .png 后缀）
        timeout: 超时时间（秒）
        max_retries: 最大重试次数

    Returns:
        DownloadResult
    """
    # 确保输出路径以 .png 结尾
    if not output_path.lower().endswith('.png'):
        output_path = os.path.splitext(output_path)[0] + '.png'

    # 确保输出目录存在
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    last_error = None

    for attempt in range(max_retries):
        try:
            # 下载图片
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
            }
            resp = requests.get(url, headers=headers, timeout=timeout, stream=True)
            resp.raise_for_status()

            # 读取内容
            content = resp.content
            file_size = len(content)

            # 打开并转换为 PNG
            img = Image.open(BytesIO(content))

            # 如果是 RGBA 且有透明通道，保持；否则转为 RGB
            if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                # 保持透明通道
                pass
            else:
                img = img.convert('RGB')

            # 保存为 PNG
            img.save(output_path, 'PNG', optimize=True)

            # 获取实际保存后的文件大小
            actual_size = os.path.getsize(output_path)

            return DownloadResult(
                url=url,
                local_path=output_path,
                file_size=format_size(actual_size),
                width=img.width,
                height=img.height,
                success=True,
            )

        except requests.exceptions.Timeout:
            last_error = f"Timeout after {timeout}s"
        except requests.exceptions.RequestException as e:
            last_error = f"Request error: {e}"
        except Exception as e:
            last_error = f"Error: {e}"

        # 重试前等待
        if attempt < max_retries - 1:
            import time
            time.sleep(2 ** attempt)  # 指数退避

    return DownloadResult(
        url=url,
        local_path=output_path,
        file_size="0B",
        width=0,
        height=0,
        success=False,
        error=f"Failed after {max_retries} attempts: {last_error}",
    )


def main():
    parser = argparse.ArgumentParser(
        description="下载图片并转换为 PNG"
    )
    parser.add_argument("url", help="图片 URL")
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="输出路径（自动添加 .png 后缀）"
    )
    parser.add_argument(
        "--timeout", "-t",
        type=int,
        default=60,
        help="超时时间（秒，默认 60）"
    )
    parser.add_argument(
        "--retries", "-r",
        type=int,
        default=3,
        help="最大重试次数（默认 3）"
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="格式化 JSON 输出"
    )

    args = parser.parse_args()

    result = download_image(
        url=args.url,
        output_path=args.output,
        timeout=args.timeout,
        max_retries=args.retries,
    )

    # 输出 JSON
    output = asdict(result)
    if args.pretty:
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(output, ensure_ascii=False))

    # 返回码
    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
