#!/usr/bin/env python3
"""
AI 图片生成模块

支持 Nano Banana Pro (Google Gemini) 和通义万相 (阿里云)。

Usage:
    # 使用 Nano Banana Pro（默认）
    python3 image_generate.py "A cozy coffee shop" --output cover.png

    # 使用通义万相
    python3 image_generate.py "温馨的咖啡店" --provider wanxiang --output cover.png

    # 指定尺寸
    python3 image_generate.py "咖啡店" --size 2K --aspect-ratio 16:9 --output cover.png
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict

from credentials import get_credential


@dataclass
class GenerateResult:
    """图片生成结果"""
    provider: str  # nano-banana | wanxiang
    prompt: str
    local_path: str
    size: str
    aspect_ratio: str
    success: bool
    error: Optional[str] = None


def generate_with_nano_banana(
    prompt: str,
    output_path: str,
    size: str = "2K",
    aspect_ratio: str = "16:9",
) -> GenerateResult:
    """
    使用 Nano Banana Pro (Google Gemini 3 Pro Image) 生成图片

    Args:
        prompt: 图片描述
        output_path: 输出路径
        size: 分辨率 1K | 2K | 4K
        aspect_ratio: 宽高比 16:9 | 1:1 | 4:3 等

    Returns:
        GenerateResult
    """
    api_key = get_credential("GEMINI_API_KEY")
    if not api_key:
        return GenerateResult(
            provider="nano-banana",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio=aspect_ratio,
            success=False,
            error="GEMINI_API_KEY not configured",
        )

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=['IMAGE'],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio,
                    image_size=size,
                ),
            ),
        )

        # 确保输出目录存在
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # 保存图片并转换为 PNG
        for part in response.parts:
            if image := part.as_image():
                # Gemini 返回的可能是 JPEG，先保存为临时文件
                temp_path = output_path + ".temp"
                image.save(temp_path)

                # 用 Pillow 转换为 PNG
                from PIL import Image as PILImage
                pil_img = PILImage.open(temp_path)
                pil_img.save(output_path, "PNG")

                # 删除临时文件
                import os
                os.remove(temp_path)

                return GenerateResult(
                    provider="nano-banana",
                    prompt=prompt,
                    local_path=output_path,
                    size=size,
                    aspect_ratio=aspect_ratio,
                    success=True,
                )

        return GenerateResult(
            provider="nano-banana",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio=aspect_ratio,
            success=False,
            error="No image in response",
        )

    except Exception as e:
        return GenerateResult(
            provider="nano-banana",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio=aspect_ratio,
            success=False,
            error=str(e),
        )


def generate_with_wanxiang(
    prompt: str,
    output_path: str,
    size: str = "1696*960",
    timeout: int = 120,
) -> GenerateResult:
    """
    使用通义万相生成图片（异步调用）

    Args:
        prompt: 图片描述（中文效果更好）
        output_path: 输出路径
        size: 尺寸，如 1696*960（约 16:9）
        timeout: 超时时间（秒）

    Returns:
        GenerateResult
    """
    api_key = get_credential("DASHSCOPE_API_KEY")
    if not api_key:
        return GenerateResult(
            provider="wanxiang",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio="16:9",
            success=False,
            error="DASHSCOPE_API_KEY not configured",
        )

    try:
        from dashscope import ImageSynthesis

        # 提交任务
        response = ImageSynthesis.call(
            api_key=api_key,
            model="wan2.6-t2i",
            prompt=prompt,
            n=1,
            size=size,
        )

        # 检查结果
        if response.status_code != 200:
            return GenerateResult(
                provider="wanxiang",
                prompt=prompt,
                local_path=output_path,
                size=size,
                aspect_ratio="16:9",
                success=False,
                error=f"API error: {response.code} - {response.message}",
            )

        # 获取图片 URL
        if not response.output or not response.output.results:
            return GenerateResult(
                provider="wanxiang",
                prompt=prompt,
                local_path=output_path,
                size=size,
                aspect_ratio="16:9",
                success=False,
                error="No image in response",
            )

        image_url = response.output.results[0].url

        # 下载图片
        import requests
        img_resp = requests.get(image_url, timeout=60)
        img_resp.raise_for_status()

        # 确保输出目录存在
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        # 保存图片（转换为 PNG）
        from PIL import Image
        from io import BytesIO

        img = Image.open(BytesIO(img_resp.content))
        img.save(output_path, "PNG")

        return GenerateResult(
            provider="wanxiang",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio="16:9",
            success=True,
        )

    except Exception as e:
        return GenerateResult(
            provider="wanxiang",
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio="16:9",
            success=False,
            error=str(e),
        )


def generate_image(
    prompt: str,
    output_path: str,
    provider: str = "nano-banana",
    size: str = "2K",
    aspect_ratio: str = "16:9",
    fallback: bool = True,
) -> GenerateResult:
    """
    生成图片（统一入口）

    Args:
        prompt: 图片描述
        output_path: 输出路径
        provider: nano-banana | wanxiang
        size: 分辨率
        aspect_ratio: 宽高比
        fallback: 失败时是否尝试备选 provider

    Returns:
        GenerateResult
    """
    # 确保输出路径以 .png 结尾
    if not output_path.lower().endswith('.png'):
        output_path = os.path.splitext(output_path)[0] + '.png'

    result = None

    if provider == "nano-banana":
        result = generate_with_nano_banana(prompt, output_path, size, aspect_ratio)

        # Fallback 到通义万相
        if not result.success and fallback:
            print(f"Nano Banana Pro failed: {result.error}", file=sys.stderr)
            print("Falling back to 通义万相...", file=sys.stderr)
            # 转换尺寸格式
            wanxiang_size = "1696*960"  # 默认 16:9
            if aspect_ratio == "1:1":
                wanxiang_size = "1280*1280"
            elif aspect_ratio == "4:3":
                wanxiang_size = "1472*1104"
            result = generate_with_wanxiang(prompt, output_path, wanxiang_size)

    elif provider == "wanxiang":
        # 转换尺寸格式
        wanxiang_size = size
        if size in ["1K", "2K", "4K"]:
            if aspect_ratio == "16:9":
                wanxiang_size = "1696*960"
            elif aspect_ratio == "1:1":
                wanxiang_size = "1280*1280"
            elif aspect_ratio == "4:3":
                wanxiang_size = "1472*1104"
            else:
                wanxiang_size = "1696*960"

        result = generate_with_wanxiang(prompt, output_path, wanxiang_size)

        # Fallback 到 Nano Banana Pro
        if not result.success and fallback:
            print(f"通义万相 failed: {result.error}", file=sys.stderr)
            print("Falling back to Nano Banana Pro...", file=sys.stderr)
            result = generate_with_nano_banana(prompt, output_path, size, aspect_ratio)

    else:
        result = GenerateResult(
            provider=provider,
            prompt=prompt,
            local_path=output_path,
            size=size,
            aspect_ratio=aspect_ratio,
            success=False,
            error=f"Unknown provider: {provider}",
        )

    return result


def main():
    parser = argparse.ArgumentParser(
        description="AI 图片生成（Nano Banana Pro + 通义万相）"
    )
    parser.add_argument("prompt", help="图片描述")
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="输出路径（自动添加 .png 后缀）"
    )
    parser.add_argument(
        "--provider", "-p",
        choices=["nano-banana", "wanxiang"],
        default="nano-banana",
        help="生成服务（默认 nano-banana）"
    )
    parser.add_argument(
        "--size", "-s",
        default="2K",
        help="分辨率（默认 2K）"
    )
    parser.add_argument(
        "--aspect-ratio", "-a",
        default="16:9",
        help="宽高比（默认 16:9）"
    )
    parser.add_argument(
        "--no-fallback",
        action="store_true",
        help="禁用 fallback"
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="格式化 JSON 输出"
    )

    args = parser.parse_args()

    result = generate_image(
        prompt=args.prompt,
        output_path=args.output,
        provider=args.provider,
        size=args.size,
        aspect_ratio=args.aspect_ratio,
        fallback=not args.no_fallback,
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
