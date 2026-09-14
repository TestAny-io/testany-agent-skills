# B3 离线运行设施

仅生成 fresh-context 输入并模拟样例所需平台状态；不启动 agent、不联网、不安装、不执行包内测试。
suite.json 与 evaluation.md 保持冻结字节，prepare 时校验其 SHA-256；预期只放在批次输出目录，
不进入 agent workspace。约束只是测试约定，不是沙箱。HARNESS.md 明确接口是离线替身，非正式 API。

## 使用

在仓库根目录运行：

```sh
python3 -B plugins/testany-eng/tests/b3-adaptation/prepare_run.py --cases A01,A02 --output 'output/b3 candidate'
python3 -B plugins/testany-eng/tests/b3-adaptation/prepare_run.py 'output/b3 original' --variant original
python3 -B plugins/testany-eng/tests/b3-adaptation/prepare_run.py 'output/b3 freeze' --freeze-only
python3 -B -m unittest discover -s plugins/testany-eng/tests/b3-adaptation -p 'test_*.py' -v
```

默认所有 18 例，每例一次；可用 `--batch a` 到 `f` 筛选。输出目录必须新建或为空。
`--freeze-only` 只生成设施快照、资源来源/哈希 manifest、冻结预期和空 tasks.json，不创建任务目录。
candidate 从当前工作树一次性读取四个 plugin 运行资源，original 从
`output/gpt6-b3-2026-09-14/start/tree.tar.gz` 读取，绝不先复制 candidate 再覆盖 original。
两组的 AGENTS.md、CLAUDE.md 与存在时的完整 docs/ 均读取准备时最新源，并分别记录 provenance。
因主任务可能继续修改生产资料，要测最新指令需重新准备一个新批次；已准备输入不会被覆盖。

## 输出与隔离

- `manifest.json` / `facility-freeze.json`：设施、suite/evaluation、运行资源、当前路由来源和 SHA-256。
- `facility-snapshot/`：本设施实际字节快照；`expected.frozen.json`：主持者专用冻结预期。
- `<ID>-1-input.tar.gz`：该例整个初始目录，保留 symlink，不包含 grader、suite 或 evaluation。
- `<ID>-1-receipt.json`：`run_key/case_id/variant/entry/directory/input_hashes`、symlink 目标和归档哈希。
- `tasks.json`：可接入 B1 collect_evidence.py 的任务字段；派发者另行补 `agent_id/message`。

每例目录单独分配在系统临时目录，通过 receipt 定位；不放在包含 grader 的批次目录内部。
ENTRY.md 只要求读 request 和 skills 并执行。SKILLS.md 指向含空格的 `installed skills/plugins/`；
ENVIRONMENT.md 说明本地约束，授权平台例另有 harness/TOOLS.md 与 testany.py。
未授权平台的例子没有 harness 或工具文档。业务材料、ZIP、元数据放在 workspace/。
F02 的三个独立练习 marketplace 与可用技能安装分离；越界链接只越出练习 marketplace root，
目标仍在该例归档内部，因此不需要外部文件，也不污染实际可用技能。

工具只支持样例最小读写面；调用逐条记录在 calls.jsonl，状态持久化于 state.json。
A01 模拟一次注册、上传、编排、执行及终态；A03 固定 running；D03 接受改名但读回旧值；
D04 上传失败但保留 case；D05 申请 pending 且不把 QA2 加入可用工作区。
成功 execution 只是离线编排行为证据，不意味着运行了包，也不是正式平台实测通过。

测试仅验证设施和输入，不替代 18 例独立 agent 行为回归。运行结束后临时目录由主持者按 receipt 清理。
