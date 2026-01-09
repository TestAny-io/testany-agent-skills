#!/usr/bin/env python3
"""
智能图片获取模块

整合搜索和生成功能，按优先级获取图片：
1. Unsplash 搜索
2. Pexels 搜索
3. Pixabay 搜索
4. AI 生成（Nano Banana Pro → 通义万相）

Usage:
    # 基本用法
    python3 image_get.py "coffee shop interior" --output-dir ./images/ --filename cover

    # 启用 AI 生成 fallback
    python3 image_get.py "温馨咖啡店" --output-dir ./images/ --filename cover --fallback-generate

    # 仅搜索，不生成
    python3 image_get.py "coffee" --output-dir ./images/ --filename img-01
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

from image_search import search_images, ImageResult
from image_generate import generate_image, GenerateResult
from image_download import download_image, DownloadResult


@dataclass
class GetResult:
    """获取结果"""
    strategy: str  # search | generate
    source: str  # unsplash | pexels | pixabay | nano-banana | wanxiang
    local_path: str
    original_url: Optional[str]
    author: Optional[str]
    author_url: Optional[str]
    prompt: Optional[str]  # 如果是 AI 生成
    success: bool
    error: Optional[str] = None


def get_image(
    query: str,
    output_dir: str,
    filename: str,
    fallback_generate: bool = False,
    orientation: Optional[str] = "landscape",
    generate_provider: str = "nano-banana",
    generate_size: str = "2K",
    generate_aspect_ratio: str = "16:9",
) -> GetResult:
    """
    智能获取图片

    Args:
        query: 搜索关键词 / AI 生成 prompt
        output_dir: 输出目录
        filename: 文件名（不含扩展名）
        fallback_generate: 搜索失败时是否使用 AI 生成
        orientation: 图片方向 landscape | portrait | squarish
        generate_provider: AI 生成 provider
        generate_size: AI 生成分辨率
        generate_aspect_ratio: AI 生成宽高比

    Returns:
        GetResult
    """
    # 确保输出目录存在
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    output_path = os.path.join(output_dir, f"{filename}.png")

    # Step 1-3: 搜索（Unsplash → Pexels → Pixabay）
    search_sources = ["unsplash", "pexels", "pixabay"]

    for source in search_sources:
        print(f"Searching {source}...", file=sys.stderr)

        results = search_images(
            query=query,
            count=1,
            orientation=orientation,
            source=source,
        )

        if results:
            # 找到图片，下载
            img = results[0]
            print(f"Found image from {source}: {img.id}", file=sys.stderr)

            download_result = download_image(
                url=img.download_url or img.url,
                output_path=output_path,
            )

            if download_result.success:
                return GetResult(
                    strategy="search",
                    source=source,
                    local_path=download_result.local_path,
                    original_url=img.url,
                    author=img.author,
                    author_url=img.author_url,
                    prompt=None,
                    success=True,
                )
            else:
                print(f"Download failed: {download_result.error}", file=sys.stderr)

    # Step 4: AI 生成
    if fallback_generate:
        print("No search results, generating with AI...", file=sys.stderr)

        gen_result = generate_image(
            prompt=query,
            output_path=output_path,
            provider=generate_provider,
            size=generate_size,
            aspect_ratio=generate_aspect_ratio,
            fallback=True,  # 允许 provider 之间 fallback
        )

        if gen_result.success:
            return GetResult(
                strategy="generate",
                source=gen_result.provider,
                local_path=gen_result.local_path,
                original_url=None,
                author="AI Generated",
                author_url=None,
                prompt=query,
                success=True,
            )
        else:
            return GetResult(
                strategy="generate",
                source=gen_result.provider,
                local_path=output_path,
                original_url=None,
                author=None,
                author_url=None,
                prompt=query,
                success=False,
                error=gen_result.error,
            )

    # 没有找到且不允许生成
    return GetResult(
        strategy="search",
        source="none",
        local_path=output_path,
        original_url=None,
        author=None,
        author_url=None,
        prompt=None,
        success=False,
        error="No images found in any source",
    )


def main():
    parser = argparse.ArgumentParser(
        description="智能图片获取（搜索 → 生成）"
    )
    parser.add_argument(
        "query",
        help="搜索关键词 / AI 生成 prompt"
    )
    parser.add_argument(
        "--output-dir", "-d",
        required=True,
        help="输出目录"
    )
    parser.add_argument(
        "--filename", "-f",
        required=True,
        help="文件名（不含扩展名）"
    )
    parser.add_argument(
        "--fallback-generate", "-g",
        action="store_true",
        help="搜索失败时使用 AI 生成"
    )
    parser.add_argument(
        "--orientation", "-o",
        choices=["landscape", "portrait", "squarish"],
        default="landscape",
        help="图片方向（默认 landscape）"
    )
    parser.add_argument(
        "--provider", "-p",
        choices=["nano-banana", "wanxiang"],
        default="nano-banana",
        help="AI 生成 provider（默认 nano-banana）"
    )
    parser.add_argument(
        "--size", "-s",
        default="2K",
        help="AI 生成分辨率（默认 2K）"
    )
    parser.add_argument(
        "--aspect-ratio", "-a",
        default="16:9",
        help="AI 生成宽高比（默认 16:9）"
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="格式化 JSON 输出"
    )

    args = parser.parse_args()

    result = get_image(
        query=args.query,
        output_dir=args.output_dir,
        filename=args.filename,
        fallback_generate=args.fallback_generate,
        orientation=args.orientation,
        generate_provider=args.provider,
        generate_size=args.size,
        generate_aspect_ratio=args.aspect_ratio,
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
