#!/usr/bin/env python3
"""
Skill Initializer - 创建新 Skill 模板

Usage:
    init_skill.py <skill-name> [--path <path>]

Examples:
    init_skill.py my-new-skill                     # 默认输出到 skills/
    init_skill.py my-new-skill --path skills/      # 显式指定路径
    init_skill.py custom-skill --path /custom/location
"""

import sys
from pathlib import Path


SKILL_TEMPLATE = """---
name: {skill_name}
description: [触发词1]、[触发词2]、[触发词3]。[功能描述，说明什么时候使用这个 skill]
---

# {skill_title}

[TODO: 1-2 句话说明这个 skill 的作用]

## 核心原则

[TODO: 列出 3-5 个核心原则]

## 工作流程

[TODO: 描述使用这个 skill 的工作流程]

## 使用示例

[TODO: 提供 1-2 个具体的使用示例]

## 资源目录

本 skill 包含以下资源目录（按需使用，不需要的可删除）：

### references/
供 Claude 参考的文档，会加载到 context。
- 适合：详细的指南、API 文档、规范说明

### scripts/
可执行脚本，直接运行完成特定操作。
- 适合：验证工具、初始化脚本、自动化工具

### assets/
输出资源，不加载到 context，用于最终输出。
- 适合：模板文件、图片、字体

---

**Testany Skill 规范提醒：**
- SKILL.md 必须 < 500 行
- description 必须包含触发词
- 使用中文撰写（技术术语可保留英文）
- 必须包含使用示例
- 验证：`scripts/quick_validate.py skills/{skill_name}`
"""

EXAMPLE_SCRIPT = '''#!/usr/bin/env python3
"""
{skill_name} 辅助脚本示例

这是一个占位脚本，可直接执行。
请替换为实际实现或删除此文件。
"""

def main():
    print("这是 {skill_name} 的示例脚本")
    # TODO: 在此添加实际逻辑

if __name__ == "__main__":
    main()
'''

EXAMPLE_REFERENCE = """# {skill_title} 参考文档

这是参考文档的占位符。请替换为实际内容或删除此文件。

## 何时使用参考文档

参考文档适合存放：
- 详细的 API 文档
- 复杂的工作流程指南
- SKILL.md 放不下的详细信息
- 特定场景才需要的内容

## 结构建议

### 指南类文档
- 概述
- 前提条件
- 步骤说明
- 常见问题
- 最佳实践

### API 文档
- 概述
- 认证方式
- 接口说明
- 错误码
- 使用示例
"""

EXAMPLE_ASSET = """# 资源文件示例

这是资源文件的占位符。请替换为实际资源文件或删除此文件。

资源文件**不会**加载到 context，而是用于 Claude 输出的最终产物。

## 常见资源类型

- 模板：.pptx, .docx, 项目模板目录
- 图片：.png, .jpg, .svg, .gif
- 字体：.ttf, .otf, .woff, .woff2
- 样板代码：项目目录、启动文件
- 数据文件：.csv, .json, .xml, .yaml

注意：这是一个文本占位符，实际资源可以是任何文件类型。
"""


def title_case_skill_name(skill_name):
    """Convert hyphenated skill name to Title Case for display."""
    return ' '.join(word.capitalize() for word in skill_name.split('-'))


def init_skill(skill_name, path):
    """
    Initialize a new skill directory with template SKILL.md.

    Args:
        skill_name: Name of the skill
        path: Path where the skill directory should be created

    Returns:
        Path to created skill directory, or None if error
    """
    # Determine skill directory path
    skill_dir = Path(path).resolve() / skill_name

    # 检查目录是否已存在
    if skill_dir.exists():
        print(f"❌ 错误：Skill 目录已存在: {skill_dir}")
        return None

    # 创建 skill 目录
    try:
        skill_dir.mkdir(parents=True, exist_ok=False)
        print(f"✅ 创建 skill 目录: {skill_dir}")
    except Exception as e:
        print(f"❌ 创建目录失败: {e}")
        return None

    # 从模板创建 SKILL.md
    skill_title = title_case_skill_name(skill_name)
    skill_content = SKILL_TEMPLATE.format(
        skill_name=skill_name,
        skill_title=skill_title
    )

    skill_md_path = skill_dir / 'SKILL.md'
    try:
        skill_md_path.write_text(skill_content)
        print("✅ 创建 SKILL.md")
    except Exception as e:
        print(f"❌ 创建 SKILL.md 失败: {e}")
        return None

    # 创建资源目录和示例文件
    try:
        # 创建 scripts/ 目录
        scripts_dir = skill_dir / 'scripts'
        scripts_dir.mkdir(exist_ok=True)
        example_script = scripts_dir / 'example.py'
        example_script.write_text(EXAMPLE_SCRIPT.format(skill_name=skill_name))
        example_script.chmod(0o755)
        print("✅ 创建 scripts/example.py")

        # 创建 references/ 目录
        references_dir = skill_dir / 'references'
        references_dir.mkdir(exist_ok=True)
        example_reference = references_dir / 'example.md'
        example_reference.write_text(EXAMPLE_REFERENCE.format(skill_title=skill_title))
        print("✅ 创建 references/example.md")

        # 创建 assets/ 目录
        assets_dir = skill_dir / 'assets'
        assets_dir.mkdir(exist_ok=True)
        example_asset = assets_dir / 'example.txt'
        example_asset.write_text(EXAMPLE_ASSET)
        print("✅ 创建 assets/example.txt")
    except Exception as e:
        print(f"❌ 创建资源目录失败: {e}")
        return None

    # 打印下一步操作
    print(f"\n✅ Skill '{skill_name}' 初始化成功: {skill_dir}")
    print("\n下一步：")
    print("1. 编辑 SKILL.md，完成 TODO 项并更新 description")
    print("2. 按需修改或删除 scripts/、references/、assets/ 中的示例文件")
    print("3. 运行 quick_validate.py 验证 skill 结构")

    return skill_dir


def main():
    if len(sys.argv) < 2:
        print("Usage: init_skill.py <skill-name> [--path <path>]")
        print("\nSkill 命名规范：")
        print("  - 英文，kebab-case（如 'data-analyzer'）")
        print("  - 只能包含小写字母、数字、连字符")
        print("  - 最多 40 个字符")
        print("\n示例：")
        print("  init_skill.py my-new-skill                     # 默认输出到 skills/")
        print("  init_skill.py my-new-skill --path skills/      # 显式指定路径")
        print("  init_skill.py custom-skill --path /custom/location")
        sys.exit(1)

    skill_name = sys.argv[1]

    # 默认路径为 skills/
    path = "skills/"
    if len(sys.argv) >= 4 and sys.argv[2] == '--path':
        path = sys.argv[3]

    print(f"🚀 初始化 skill: {skill_name}")
    print(f"   路径: {path}")
    print()

    result = init_skill(skill_name, path)

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
