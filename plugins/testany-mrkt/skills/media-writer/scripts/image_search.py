#!/usr/bin/env python3
"""
图片搜索模块

支持从 Unsplash、Pexels、Pixabay 搜索图片。

Usage:
    python3 image_search.py "coffee shop" --count 5 --source all
    python3 image_search.py "咖啡店" --source unsplash --orientation landscape
"""

import argparse
import json
import sys
from typing import Optional
from dataclasses import dataclass, asdict

import requests

from credentials import get_credential


@dataclass
class ImageResult:
    """统一的图片搜索结果"""
    id: str
    url: str  # 原图 URL
    thumbnail: str  # 缩略图 URL
    width: int
    height: int
    author: str
    author_url: str
    source: str  # unsplash | pexels | pixabay
    download_url: str  # 下载链接
    description: str = ""


class UnsplashSearcher:
    """Unsplash 图片搜索"""

    BASE_URL = "https://api.unsplash.com"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"Authorization": f"Client-ID {api_key}"}

    def search(
        self,
        query: str,
        count: int = 5,
        orientation: Optional[str] = None,
    ) -> list[ImageResult]:
        """
        搜索图片

        Args:
            query: 搜索关键词
            count: 返回数量（最大 30）
            orientation: landscape | portrait | squarish

        Returns:
            ImageResult 列表
        """
        params = {
            "query": query,
            "per_page": min(count, 30),
        }
        if orientation:
            params["orientation"] = orientation

        try:
            resp = requests.get(
                f"{self.BASE_URL}/search/photos",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"Unsplash search error: {e}", file=sys.stderr)
            return []

        results = []
        for item in data.get("results", []):
            results.append(ImageResult(
                id=item["id"],
                url=item["urls"]["regular"],
                thumbnail=item["urls"]["thumb"],
                width=item["width"],
                height=item["height"],
                author=item["user"]["name"],
                author_url=item["user"]["links"]["html"],
                source="unsplash",
                download_url=item["links"]["download"],
                description=item.get("alt_description", "") or "",
            ))

        return results


class PexelsSearcher:
    """Pexels 图片搜索"""

    BASE_URL = "https://api.pexels.com/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {"Authorization": api_key}

    def search(
        self,
        query: str,
        count: int = 5,
        orientation: Optional[str] = None,
    ) -> list[ImageResult]:
        """
        搜索图片

        Args:
            query: 搜索关键词
            count: 返回数量（最大 80）
            orientation: landscape | portrait | square

        Returns:
            ImageResult 列表
        """
        params = {
            "query": query,
            "per_page": min(count, 80),
        }
        if orientation:
            # Pexels 用 square 而不是 squarish
            if orientation == "squarish":
                orientation = "square"
            params["orientation"] = orientation

        try:
            resp = requests.get(
                f"{self.BASE_URL}/search",
                headers=self.headers,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"Pexels search error: {e}", file=sys.stderr)
            return []

        results = []
        for item in data.get("photos", []):
            results.append(ImageResult(
                id=str(item["id"]),
                url=item["src"]["large2x"],
                thumbnail=item["src"]["medium"],
                width=item["width"],
                height=item["height"],
                author=item["photographer"],
                author_url=item["photographer_url"],
                source="pexels",
                download_url=item["src"]["original"],
                description=item.get("alt", "") or "",
            ))

        return results


class PixabaySearcher:
    """Pixabay 图片搜索"""

    BASE_URL = "https://pixabay.com/api/"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def search(
        self,
        query: str,
        count: int = 5,
        orientation: Optional[str] = None,
    ) -> list[ImageResult]:
        """
        搜索图片

        Args:
            query: 搜索关键词
            count: 返回数量（最大 200）
            orientation: horizontal | vertical (Pixabay 术语)

        Returns:
            ImageResult 列表
        """
        params = {
            "key": self.api_key,
            "q": query,
            "per_page": max(3, min(count, 200)),  # Pixabay 要求 3-200
            "image_type": "photo",
            "safesearch": "true",
        }
        if orientation:
            # 转换为 Pixabay 术语
            if orientation == "landscape":
                params["orientation"] = "horizontal"
            elif orientation == "portrait":
                params["orientation"] = "vertical"
            # squarish 不支持，忽略

        try:
            resp = requests.get(
                self.BASE_URL,
                params=params,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"Pixabay search error: {e}", file=sys.stderr)
            return []

        results = []
        for item in data.get("hits", []):
            results.append(ImageResult(
                id=str(item["id"]),
                url=item["largeImageURL"],
                thumbnail=item["previewURL"],
                width=item["imageWidth"],
                height=item["imageHeight"],
                author=item["user"],
                author_url=f"https://pixabay.com/users/{item['user']}-{item['user_id']}/",
                source="pixabay",
                download_url=item["largeImageURL"],  # Pixabay 直接用 URL
                description=item.get("tags", "") or "",
            ))

        return results


def search_images(
    query: str,
    count: int = 5,
    orientation: Optional[str] = None,
    source: str = "all",
) -> list[ImageResult]:
    """
    搜索图片（统一入口）

    Args:
        query: 搜索关键词
        count: 返回数量
        orientation: landscape | portrait | squarish
        source: unsplash | pexels | pixabay | all

    Returns:
        ImageResult 列表
    """
    results = []

    sources_to_search = []
    if source == "all":
        sources_to_search = ["unsplash", "pexels", "pixabay"]
    else:
        sources_to_search = [source]

    for src in sources_to_search:
        if src == "unsplash":
            api_key = get_credential("UNSPLASH_ACCESS_KEY")
            if not api_key:
                print("Warning: UNSPLASH_ACCESS_KEY not configured", file=sys.stderr)
                continue
            searcher = UnsplashSearcher(api_key)
            results.extend(searcher.search(query, count, orientation))

        elif src == "pexels":
            api_key = get_credential("PEXELS_API_KEY")
            if not api_key:
                print("Warning: PEXELS_API_KEY not configured", file=sys.stderr)
                continue
            searcher = PexelsSearcher(api_key)
            results.extend(searcher.search(query, count, orientation))

        elif src == "pixabay":
            api_key = get_credential("PIXABAY_API_KEY")
            if not api_key:
                print("Warning: PIXABAY_API_KEY not configured", file=sys.stderr)
                continue
            searcher = PixabaySearcher(api_key)
            results.extend(searcher.search(query, count, orientation))

    return results


def main():
    parser = argparse.ArgumentParser(
        description="搜索图片（Unsplash + Pexels + Pixabay）"
    )
    parser.add_argument("query", help="搜索关键词")
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=5,
        help="返回数量（默认 5）"
    )
    parser.add_argument(
        "--orientation", "-o",
        choices=["landscape", "portrait", "squarish"],
        help="图片方向"
    )
    parser.add_argument(
        "--source", "-s",
        choices=["unsplash", "pexels", "pixabay", "all"],
        default="all",
        help="搜索源（默认 all）"
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="格式化 JSON 输出"
    )

    args = parser.parse_args()

    results = search_images(
        query=args.query,
        count=args.count,
        orientation=args.orientation,
        source=args.source,
    )

    # 输出 JSON
    output = [asdict(r) for r in results]
    if args.pretty:
        print(json.dumps(output, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
