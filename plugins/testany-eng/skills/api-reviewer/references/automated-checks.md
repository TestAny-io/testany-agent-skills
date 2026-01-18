# 自动化检查（可选）

仅在本地工具已安装且用户允许时执行；不要安装新工具。

## OpenAPI/REST

- `spectral lint <spec>`
- `redocly lint <spec>`
- `openapi-cli validate <spec>`
- `oasdiff --fail-on-diff <old> <new>`（破坏性变更）

## GraphQL

- `graphql-schema-linter <schema.graphql>`
- `graphql-inspector validate <schema.graphql>`
- `graphql-inspector diff <old> <new>`（破坏性变更）

## gRPC

- `buf lint`
- `buf breaking --against <old>`

## 事件/AsyncAPI

- `asyncapi validate <spec>`
- `spectral lint <spec>`（AsyncAPI 规则集）

## 组织内工具

如果已有 42Crunch 或其他企业级审计工具，按内部标准命令执行并附审计结果。

## 判定规则

- 语法/解析错误 → **P0**
- 破坏性变更 → **P0**
- 规范警告 → **P1**
- 信息级建议 → **P2**
