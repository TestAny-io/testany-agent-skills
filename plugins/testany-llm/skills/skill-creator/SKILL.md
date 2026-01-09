---
name: skill-creator
description: 创建 Skill、写 Skill、Skill 模板。帮助创建和优化 Claude Code Skills，遵循 Testany 公司规范。
---

# Skill Creator

帮助创建符合 Testany 规范的 Claude Code Skills。

## Testany Skill 规范（强制）

### 命名与结构约定

| 约定项 | 规范 |
|--------|------|
| 命名语言 | 英文，kebab-case（如 `prd-writer`） |
| 目录结构 | 扁平结构 `skills/xxx/` |
| 必须文件 | 只需 SKILL.md |
| references 命名 | 英文 |

### 审核标准

| 审核项 | 要求 |
|--------|------|
| Frontmatter | 必须包含触发词 |
| 行数限制 | SKILL.md < 500 行 |
| 边界检查 | 必须通过 `quick_validate.py` + 人工审核 |
| 语言 | 必须中文（技术术语可保留英文） |
| 示例 | 必须有使用示例 |

### 目录结构

```
skill-name/
├── SKILL.md (必需)
└── references/ (可选，按需加载的参考文档)
```

不要创建 README.md、CHANGELOG.md 等额外文件。

## 核心原则

### 简洁优先

Context window 是公共资源。只添加 Claude 不知道的信息。

**默认假设：Claude 已经很聪明。** 用简洁示例代替冗长解释。

### 渐进式加载

1. **Metadata**（name + description）- 始终在 context 中
2. **SKILL.md body** - 触发后加载
3. **references/** - 按需加载

## Skill 创建流程

### 步骤 1：理解需求

通过具体示例理解 skill 的使用场景：

- 这个 skill 要支持什么功能？
- 用户会怎么使用它？
- 什么话会触发这个 skill？

### 步骤 2：规划内容

分析每个示例，确定需要的资源：

| 资源类型 | 用途 | 示例 |
|----------|------|------|
| references/ | 参考文档，按需加载 | 模板、规范、API 文档 |
| scripts/ | 可执行脚本 | 验证、初始化工具 |
| assets/ | 输出资源 | 图片、模板文件 |

### 步骤 3：初始化 Skill

```bash
scripts/init_skill.py <skill-name>
```

脚本默认输出到 `skills/` 目录，会创建：
- SKILL.md 模板
- 示例目录结构（scripts/、references/、assets/）

### 步骤 4：编写 SKILL.md

#### Frontmatter（必需）

```yaml
---
name: skill-name
description: 触发词1、触发词2。功能描述，说明什么时候使用这个 skill。
---
```

**重要**：description 必须包含触发词，这是 skill 被激活的关键。

#### Body

- 使用中文撰写
- 简洁明了，< 500 行
- 包含使用示例
- 引用 references 时说明何时读取

### 步骤 5：验证

```bash
scripts/quick_validate.py skills/<skill-name>
```

检查项：
- Frontmatter 格式
- 行数限制
- 触发词存在

### 步骤 6：人工审核

验证通过后，提交人工审核：
- 功能完整性
- 文档清晰度
- 示例有效性

## 参考示例：prd-writer

`prd-writer` 是一个符合 Testany 规范的 skill 示例：

```
prd-writer/
├── SKILL.md (233 行)
└── references/
    ├── new-feature-ui.md
    ├── new-feature-backend.md
    ├── integration.md
    ├── refactoring.md
    └── optimization.md
```

**Frontmatter 示例**：

```yaml
---
name: prd-writer
description: 写 PRD、写产品需求文档、PRD 模板、新功能需求。帮助撰写高质量的产品需求文档，支持多种类型：新功能（有UI/无UI）、第三方集成、功能重构、性能/安全优化。
---
```

注意 description 开头的触发词：`写 PRD、写产品需求文档、PRD 模板、新功能需求`

## 常见问题

### Q: references 和 assets 的区别？

- **references/**：供 Claude 参考的文档，会加载到 context
- **assets/**：输出资源（图片、模板），不加载到 context

### Q: SKILL.md 太长怎么办？

拆分到 references/，在 SKILL.md 中引用并说明何时读取。

### Q: 如何测试 skill？

1. 运行 `quick_validate.py` 验证格式
2. 实际使用测试功能
3. 根据反馈迭代改进
