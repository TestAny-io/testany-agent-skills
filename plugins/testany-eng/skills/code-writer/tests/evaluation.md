# 发布前生命周期与独立行为验证

工具验证从搬迁后的完整插件运行，不能用作者源目录覆盖缺失依赖。所有状态与浏览器都是隔离 fixture；不触碰在线角色、产品、缓存或集群。

```sh
python3 plugins/testany-eng/scripts/build_workflow_package.py --check
python3 -m unittest discover -s plugins/testany-eng/scripts/tests -p 'test_workflow_runtime.py' -v
python3 -m unittest discover -s plugins/testany-eng/scripts/tests -p 'test_code_reviewer_*.py' -v
python3 plugins/testany-eng/scripts/validate_codex_compat.py --profile repository
```

核验的行为：整包移到含空格/Unicode 的新路径后启动；替换/刷新后不读取旧安装；缺依赖/改 bytes 明确失败；旧入口与新任务不匹配；Community/Enterprise 来回切换且不覆盖其他角色；并发更新拒绝旧 pin；多字段无最后参数吞前项；超长 JSON/Unicode 分段无损且禁止跨版本续读；浏览器新 VM 重装、错误失效、换 tab、歧义/缺标记/外部警告不隐匿。入口只保存位置，工程记录不能被工具改写。

恢复效率回归另外检查：按实际故障的字段字节规模构造约 4.6 KB 摘要，并增加超过旧 1200-byte 门槛的反证字段，一次 `resume` 完整返回六项；选中普通 JSON 使用总预算，未选择根仍只给目录；复制 `continuation_prefix`（若有）+ 字段 `next_args` 即可无损续读，入口或状态变化均拒绝混读；足以一次返回的字段不因续读元数据被多拆一页。调用次数是隔离场景的机械结果，不折算成真实工程 token 节省率。

维护恢复/协作规则时，用独立 agent 前向执行原始请求及隔离材料，不给本说明、评分预期或作者结论。至少覆盖：

1. 初次局部缺陷修复：实际生产入口、合法/非法输入和必要回归；不越权发布。
2. 仅给自己的短交接和稳定入口恢复，切换到新工程子任务，再返回旧任务。记录实际读取；不得复读长历史，不得丢掉未做测试和新反证。此处模拟上下文缺失，不冒充真实宿主压缩。
3. 新 Candidate/撤回使旧结论失效，依然处理当前反例、排障与独立核验。状态询问不增加一轮评审或等价长测。

Reviewer 继续执行 `../../code-reviewer/tests/evaluation.md` 要求的真实初审、配对整改和控制输入，复用同一组盲测而不再组建全量评审团队。统计漏报/误报、范围/授权、收敛及重复工作，不能按 finding 数或模板齐全评分。

每次维护保留输入、实际调用/结果、边界与失败。工具测试、独立模型样例、真实宿主安装和至少三次自然工程交接效果分开报告。未执行的项标记待验证；不把文字缩短或总 token 变化当成可比节省。
