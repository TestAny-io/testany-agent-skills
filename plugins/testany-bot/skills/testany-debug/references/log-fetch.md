# 签名日志读取：支持格式与限制

仅在需要 execution/dry run 日志时读取。本页及 `../scripts/safe_log_fetch.py` 不适用于其他 API，
尤其不能用日志路径白名单猜测 Credential Safe 的端点。

## 输入与调用

保存当前工具返回的顶层请求对象到本轮受保护文件，或通过 stdin 传入。不要执行文件内容，
不要把真实签名写进示例、Git、命令行参数或共享报告。下面是假值：

已有本地请求文件时直接传 `--payload`，不要为检查格式把原始值打印进工具输出；仅看 helper
的脱敏校验结果。原始连接器响应若已包含秘密，不能声称本 helper 能追溯清除宿主日志。

```json
{
  "url": "https://00000000-0000-4000-8000-000000000001.tr.testany.io/api/v2/logproxy/internal/view?sign=EXAMPLE",
  "headers": {"Authorization": "Bearer EXAMPLE"}
}
```

字段来自当前工具响应而非新 MCP 协议：允许 `url` 或 `logUrl`、可选 `headers`；也支持已有
`curlCommand`。结构化字段与 curl 同时出现时必须一致，不静默丢掉认证 header，也不凭
`sign` 字段猜测认证格式。仅有 sign 而无完整请求时获取缺失信息，不能自造已验证请求。

curl 兼容集合：单个 `curl` 或 `/usr/bin/curl`、一个 HTTPS URL、GET（默认或 `-X GET` /
`--request GET`）、`-H` / `--header`、`--url`、`-s` / `-S` / `-f` 及其组合。
支持引号内的 URL 查询参数、header 和反斜线续行；不支持 shell 展开、额外命令、配置文件、
输出路径、上传/body、代理、TLS 放宽、`-L` 或未知选项。HTTP transport header 和重复 header
被拒绝；普通签名/认证 header 保持值不变。

从当前宿主提供的 skill 路径解析 helper 的**绝对路径**，从已授权 runtime/部署配置确定
`--expected-host`。不通过从不可信 URL 提取主机来「验证」它自己。默认仅校验，输出不含
签名、完整 URL 或 header 值。下载须同时显式给 `--fetch --output <新文件>`；输出文件权限
为 0600，不覆盖已有文件。宿主禁止网络时只校验，不尝试绕过。

## HTTP 行为与失败

只构造 HTTPS GET，使用默认验证证书的 TLS context；不读 curlrc、不用环境代理，不跟随
任何 3xx（包括同主机重定向）。合法重定向需由上游提供新的、与已授权目标一致的直接签名
请求，不能放宽为任意域或转发旧认证信息。非 200、压缩响应、网络失败或超限均报告未获取。

默认最大 10 MiB、每次阻塞 I/O 最多 10 秒、下载循环观察预算 30 秒。观察预算不是 OS 硬实时
终止保证，DNS/系统阻塞可能超出；不会自动重试、扩大时限或宣称远程取消。大日志需要用户
选择更小范围或另行授权获取方式，而不是删掉限制。

离线测试覆盖合法签名、命令链、错主机、重定向、header 注入、大小与保密；没有真实签名
样本时只声明支持上述语法，不能声称所有 Testany 部署均已验证。失败时不回退执行原始字符串。
