# Test Reviewer 检查清单

## 预检：脚本化门禁

- [ ] 是否先执行了 `python3 "$TESTANY_ENG_ROOT/scripts/trace_lint.py" --format json <Test Spec 路径>`？
- [ ] 是否先执行了 `python3 "$TESTANY_ENG_ROOT/scripts/trace_build_rtm.py" --format json <PRD 路径> <Test Strategy 路径> <Test Spec 路径>`？
- [ ] `trace-lint` 是否通过，且未留下 blocking issue？
- [ ] `trace-build-rtm` 是否没有 `RTM001 / RTM002 / RTM003 / RTM004`？
- [ ] `trace-build-rtm` 中的 orphan entity 是否已识别并纳入问题分级？

## Gate 1：基线与追溯

- `TRACEABILITY-METADATA` block 是否存在且 profile = `test-spec-profile-v1`
- 是否标明 PRD / API / HLD / LLD / Test Strategy 基线
- In-scope 需求、接口、风险是否有追溯项
- 批准 API Contract 的 in-scope 验证点是否有追溯项
- 覆盖率口径是否明确为“测试设计覆盖率”
- 是否分项统计覆盖率，而非单一总覆盖率
- 分母与排除项是否写清楚
- Out-of-scope、豁免、待确认项是否记录
- 是否记录开发内建验证前置条件，且未把 QA API Contract 验证排除出本包范围

## Gate 2：覆盖与漂移

- `trace-build-rtm` 的 Requirement / Risk / Must-not-regress / External Behavior 矩阵是否与正文统计一致
- In-scope 需求覆盖率是否为 100%
- API Contract 覆盖率是否为 100%，高风险契约点是否无遗漏
- 高风险覆盖率是否为 100%
- Must-not-regress 覆盖率是否为 100%
- 必测 NFR 覆盖率是否为 100%
- 外部行为覆盖率是否已统计并列出未覆盖项
- 场景覆盖率是否已统计并列出未覆盖项
- 主流程、分支、异常、边界是否覆盖
- must-not-regress 是否被回归包覆盖
- 系统集成与兼容性验证是否承接 API Contract 的外部行为基线
- API Contract 黑盒验证是否覆盖正向、负向、边界、权限、错误语义与幂等/兼容验证点
- 非功能必测项是否承接 Strategy
- 是否存在无来源依据的测试目标或行为假设

## Gate 3：可执行性

- 每个 case 是否有前置条件、数据、步骤、预期、断言、清理
- 环境、依赖、观测与证据要求是否完整
- API Contract 漂移判定所需证据是否完整
- Smoke / Regression / Compatibility 分组是否明确
- 自动化建议是否与风险匹配
- 若 `Testany Automation Handoff.status != not_planned`，其 scenario_groups / executor / split / relay / dependency / pipeline_required 是否完整

## Gate 4：执行证据与残余风险

- 在发布前模式下是否提供执行证据
- 必测范围是否执行完成
- 是否存在未关闭 P0/P1 缺陷
- 豁免是否有理由、owner、截止时间
- 残余风险是否被显式接受
