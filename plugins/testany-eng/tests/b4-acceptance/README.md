# B4 轻量导出设施

`export_fixture.py` 只导出本地隔离输入，不 dispatch、collect、grading，不调用模型或真实平台。
`collect_evidence.py` 是独立的本地公开证据收集入口，不执行任务或评分。
原有命名空间的业务材料复用既有 exporter/fixtures/supplemental，adapter 保持原始字节与协议。
未传归档覆盖参数时，原版读取 `output/gpt6-b4-2026-09-14/start/original.tar.gz`；候选读取
同目录 `candidate.tar.gz`。两者的插件、AGENTS、CLAUDE、docs 均来自各自归档，
不补入当前工作树治理。归档中的 tests/grader/audit/cache 被排除；资源 symlink
必须在导出安装根内有效，绝对、越界、悬空、循环及链接父目录写入均拒绝。

## 1. Scenarios JSON

文件内容是数组；不接受 request/expect 覆盖：

```json
[
  {"source": "legacy", "case_id": "C01"},
  {"source": "b3", "case_id": "A01"},
  {"source": "b3", "case_id": "E02"}
]
```

可选来源：`legacy` C01-C10；`b1` R06-R11；`b2` 原 suite 的 case id；
`b2-supplement` D06/B06；`b3` 原 suite 的 A01-F02（18 cases）；
`b3-supplement` S01；`b4-repair` C10G。相同 ID 由 source 区分。省略 scenarios 时选择全部。

`b4-repair:C10G` 单独复用 C10 请求、材料及业务判据，将旧 adapter 原样保留为
`harness/legacy_adapter.py`，由 `command_adapter.py` 提供仅适用于该离线 main.py 样例的兼容层：
接受文档使用的 `trigger_command`（数组或精确字符串），并保留旧 `trigger_path` 输入。
导出的工具 schema 同步声明两种入口、数组类型和共存时须一致；冲突或不完整入口在启动前拒绝。
它不执行命令、不修改存储的 metadata，不模拟完整平台 schema。旧 C10 输入、失败和评分不被替换；
新 fixture 有独立 source/case ID、facility hash、输入归档及运行证据，不纳入原 119 次配对成绩。
早期 C10F 漏同步 schema，三个已启动的 Astra 任务整组仅保留设施试跑，未启动的 Terra 三例不执行。
C10F 的完整旧 facility-snapshot 与输入归档保留；当前导出器不再生成该不完整版本，不能用 C10G 成绩覆盖它。

## 2. Prepare 入口

```python
# 通过 importlib 或将本目录加入 sys.path 后导入。
from export_fixture import prepare
tasks = prepare(output, scenarios=scenarios,
                variants=("original", "candidate"), repeats=3)
```

`output` 必须尚不存在，重复或失败后的同目录不可覆盖。`archives=` 是 keyword-only
归档映射，例如 `{"candidate": Path("/absolute/path/candidate.tar.gz")}`；传入时不与默认值合并，
每个选中变体都必须有显式路径，空映射也拒绝。每个任务使用随机含空格临时根，
`installed skills/` 为安装副本，`plugins/` 是其内部兼容 symlink。
业务产物只写 workspace；adapter 协议产生的 harness 状态与日志除外。

```sh
python3 -B plugins/testany-eng/tests/b4-acceptance/export_fixture.py \
  --output output/b4-new-batch --scenarios /absolute/path/scenarios.json \
  --variants original,candidate --repeats 3
```

复现到新批次且使用显式冻结归档（路径需替换为实际存在的文件）：

```sh
python3 -B plugins/testany-eng/tests/b4-acceptance/export_fixture.py \
  --output output/b4-explicit-new-batch --scenarios /absolute/path/scenarios.json \
  --variants original,candidate --repeats 3 \
  --original-archive /absolute/path/original.tar.gz \
  --candidate-archive /absolute/path/candidate.tar.gz
```

任一 `--original-archive` / `--candidate-archive` 出现后，所有选中变体均须显式提供归档。
例如双变体只传 candidate，或 candidate-only 只传 original，均以退出码 2 拒绝，
不会混用隐藏的日期默认路径。candidate-only 可仅传 `--candidate-archive`。
显式文件不存在或归档无效时直接失败，不回退、不跳过；未传覆盖参数才保留本次 B4 默认路径。

candidate-only 使用 `--variants candidate`。不启动模型；主 agent 自行调度用户指定的
gpt-6-astra/high 及交叉 gpt-5.6-terra/high。任务环境约束不是系统级安全沙箱；
主持者须确保隔离执行，不向被测 agent 暴露证据目录或目录外读取能力。

## 3. Tasks / Receipt

`prepare` 返回 receipt 数组，`tasks.json` 和 `manifest.json.runs` 保存同一数组。
每个 receipt 含 `run_key`、`source`、`case_id`、`variant`、`repeat`、绝对 `entry` / `directory`，
`input_hashes`（仅 is_file 可读文件的实际字节 SHA256，含指向文件的内部 symlink，
兼容既有 collector）与 `input_symlinks`（链接路径到 link 原文）、
`input_manifest`（文件 hash/mode、目录、link 原文）；同时含：

- `payload_sha256`：request + workspace + harness 的路径/字节/mode/link 可比 hash。
- `comparable_sha256`：再包含 ENTRY、ENVIRONMENT 等全部非变体输入，配对与 repeat 不同则拒绝。
- `runtime_sha256`：完整安装副本（含各自治理）的 hash；`facility_sha256`：复用设施源码/输入 hash。
- `source_archive` / `source_archive_sha256`：源快照；`archive` / `archive_sha256`：本次输入归档。

每个 run 独立保存 `<run_key>-receipt.json` 和不可覆盖的 `<run_key>-input.tar.gz`。
`expected.frozen.json` 与 `facility-snapshot/` 只位于 output，永不进入任务或 input 归档。
expected 来自原 suite/legacy/B1 grader；仅 B2 suite 有 reuse 且没有 request 覆盖时保留 legacy expected，
B2 supplement 仅保留各自 expect，不套用语义不同的 legacy 预期。
输出 manifest 只在全部导出与可比性检查成功后生成。失败保留证据目录但清理已生成任务根，
不能把部分 receipt 当作完成清单；成功任务根由主持者收集后清理。

## 4. 公开证据采集

只对主持者明确 dispatch 且已结束的本地任务调用 Python API：

```python
from pathlib import Path
from collect_evidence import collect
collect(Path("/absolute/path/new-batch"))
```

批次目录须已有 `dispatch*.json` 数组（每项含 `agent_id`、`run_key`、绝对 `directory`、
公开派发 `message`）及导出器生成的 `<run_key>-receipt.json`。默认从
`~/.codex/sessions` 定位唯一、身份匹配的会话；`sessions_root=` 仅用于合成本地测试注入。
不从模型上下文生成派发收据，不启动 agent，不安装宿主或访问服务。

JSONL 按 UTF-8/LF 记录读取，U+0085/U+2028/U+2029 保留为字符串数据；trace 输出转义 Unicode，
final 保留原公开文字及空白。仅导出 assistant commentary/final/final_answer 和匹配派发文字的
user 消息，以及既有工具调用/输出字段。消息内容仅保留公开 text/input_text/output_text、
legacy 无 type 文本及 refusal；typed thinking/reasoning/analysis、非公开 channel/phase 内容块
和不透明块元数据均排除。初始 developer/user 上下文只保留既有指纹与布尔检查，不导出原文。
最新 turn 必须具有非空公开 final，之后出现 completion；旧 turn 的完成事件不能认证后续未完成 turn。

写入前检查全部任务：重复 agent/run、非法路径组件、收据身份不符、输入路径越界、会话歧义、
缺失任务根、越界/悬空链接与复制目录循环均拒绝。`evidence` / `evidence-index.json` 已存在
（包括悬空 symlink）时拒绝覆盖；独占创建 evidence 目录，全部成功后才写完成索引。
复制失败留下不可覆盖的部分目录，无完成索引，不能解释为完成或清理旧证据后重试。

限制：这是已停止任务上的本地收集器，不是抵抗并发恶意文件系统变更的安全沙箱，也不是公开
文本/工具输出中的语义脱敏器。未知非文本消息块不会导出；新增宿主格式须先加合成测试。
已导出的 119 个任务包、facility-snapshot、归档和公开证据均保持冻结；修订当前源码不允许
替换旧副本，也不把新测试结果追溯声明为旧模型任务使用了修订后的设施。

## 5. 本地测试与跳过语义

从仓库根运行（Python 3.10+，标准库，无模型/服务）：

```sh
python3 -B -m unittest discover -s plugins/testany-eng/tests/b4-acceptance -p 'test_*.py' -v
```

导出与 collection 端到端测试的临时文件位于本目录的新建随机子目录，parser 测试使用系统
临时目录；均自动清理，不编辑旧 fixture/expected，不读取真实原始模型会话。
单元/CLI 契约测试使用合成归档和合成会话，覆盖双变体/candidate-only 覆盖、缺失变体拒绝、
Unicode 保真、private block 过滤、completion+final、重复/越界/覆盖拒绝及输入差异语义。

只有三个导出集成测试依赖本机忽略的记录工件：

- `test_real_archives_are_exact_and_never_use_current_governance`：需要两个默认 start 归档。
- `test_cli_real_candidate_only`：只需要默认 candidate 归档。
- `test_main_agent_scenario_lists_prepare_without_dispatch`：需要两个默认 start 归档及本次运行目录的 `*-scenarios.json`。

缺失时 `unittest` 显示 SKIP 和缺失路径/场景说明；已存在但损坏的文件、目录或链接仍失败，
不以 SKIP 掩盖错误。clean checkout 中这些本机工件缺失不导致单元测试失败，但 SKIP 不代表
真实归档兼容性通过、模型行为验收通过或 B4 获准。测试不会改变既有 scenarios 选择列表。

不移动/删除真实归档，注入不存在的测试路径复现缺失归档情形：

```sh
python3 -B - <<'PY'
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
home = Path("plugins/testany-eng/tests/b4-acceptance").resolve()
sys.path.insert(0, str(home))
import export_fixture
with tempfile.TemporaryDirectory(prefix=".missing-archives ", dir=home) as temp:
    absent = {v: Path(temp) / (v + ".tar.gz") for v in ("original", "candidate")}
    with patch.object(export_fixture, "ARCHIVES", absent):
        suite = unittest.defaultTestLoader.discover(str(home), pattern="test_*.py")
        result = unittest.TextTestRunner(verbosity=2).run(suite)
sys.exit(not result.wasSuccessful())
PY
```

该注入运行应明确出现上述三个 SKIP，其余测试照常运行；真实归档默认路径不被改写。
