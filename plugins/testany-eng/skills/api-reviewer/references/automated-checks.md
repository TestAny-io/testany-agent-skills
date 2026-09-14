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

- 先分清实际输入中的契约错误与工具/依赖故障。后者记 evidence_gap，不是产品 P0；可选工具缺失应披露但不单独阻断，组织指定必要工具缺失则不得准出。
- 语法/解析或破坏性变更的实际缺陷按影响定 P0/P1；规范警告须核查，不自动升级 P1。
- 信息级建议 → **P2**
