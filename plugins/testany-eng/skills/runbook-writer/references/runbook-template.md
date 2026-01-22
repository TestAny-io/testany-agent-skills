# Runbook Output Template

This template defines the standard structure for all Runbooks produced by runbook-writer skill.

---

# [系统名称] Runbook

**版本**: [版本号]
**最后更新**: [日期]
**维护团队**: [团队名称]

---

## 1. 系统概览

### 1.1 系统架构

**系统描述**：
[从 HLD 提取的系统架构简要说明]

**服务边界**：
- 核心服务：[列表]
- 依赖服务（内部）：[列表]
- 依赖服务（外部）：[列表]

**数据存储**：
- 数据库：[类型、用途]
- 缓存：[类型、用途]
- 对象存储：[类型、用途]

### 1.2 系统依赖图

```
[可选：系统依赖关系图]
```

### 1.3 关键配置

| 配置项 | 位置 | 说明 |
|--------|------|------|
| [配置名] | [ConfigMap/Secret/文件] | [用途] |

---

## 2. 部署流程

### 2.1 前置检查

**在开始部署前，必须确认：**

- [ ] 依赖服务健康状态
  ```bash
  # 检查命令
  curl http://[dependency-service]/health
  # 预期输出：{"status":"ok"}
  ```

- [ ] 数据库连接正常
  ```bash
  # 检查命令
  [database-check-command]
  # 预期输出：[expected-output]
  ```

- [ ] 维护窗口确认（如需要）
  - 开始时间：[时间]
  - 结束时间：[时间]
  - 通知渠道：[已通知]

- [ ] 备份确认
  ```bash
  # 数据库备份
  [backup-command]
  # 验证备份
  [verify-backup-command]
  ```

### 2.2 部署步骤

**步骤 1: [步骤名称]**

```bash
# 执行命令
[command]
```

**预期输出**：
```
[expected output]
```

**验证**：
```bash
# 验证命令
[verification-command]
# 预期结果
[expected-result]
```

**如果失败**：[troubleshooting steps]

---

**步骤 2: [下一步骤]**

[重复上述格式]

---

### 2.3 部署验证

**完成所有部署步骤后，执行以下验证：**

- [ ] **健康检查通过**
  ```bash
  curl http://[service]/health
  # 预期：{"status":"ok", "version":"[new-version]"}
  ```

- [ ] **核心功能验证**
  ```bash
  # 功能验证命令
  [functional-test-command]
  # 预期结果
  [expected-result]
  ```

- [ ] **监控指标正常**
  - QPS: [expected-range]
  - P99 延迟: < [threshold]
  - 错误率: < [threshold]

  ```bash
  # 查询监控指标
  [monitoring-query]
  ```

- [ ] **日志无异常**
  ```bash
  # 查看最近日志
  kubectl logs -f deployment/[name] --tail=100
  # 检查是否有 ERROR/FATAL
  ```

**验证通过标准**：
- ✅ 所有检查项通过
- ✅ 监控指标在正常范围
- ✅ 无严重日志错误

**如果验证失败** → 执行回滚流程（见第 3 节）

---

## 3. 回滚流程

### 3.1 回滚触发条件

**立即回滚条件**：
- 错误率 > [threshold]%（持续 [duration] 分钟）
- P99 延迟 > [threshold]ms（持续 [duration] 分钟）
- 核心功能不可用
- 严重安全漏洞发现

**决策流程**：
```
检测到异常指标
  ↓
持续超过阈值时间？
  ↓ Yes
立即回滚
```

### 3.2 回滚步骤

**⚠️ 回滚步骤必须可以在新版本完全失败的情况下执行**

---

**步骤 1: 停止新版本流量**

```bash
# 切换流量到旧版本
[traffic-switch-command]
```

**验证**：
```bash
# 确认流量已切换
[verify-command]
# 预期：流量 100% 到旧版本
```

---

**步骤 2: 回滚应用版本**

```bash
# 回滚到上一版本
[rollback-command]
```

**预期输出**：
```
[expected-output]
```

**验证**：
```bash
# 确认版本已回滚
[verify-version-command]
# 预期：[old-version]
```

---

**步骤 3: 回滚数据库 Migration（如有）**

```bash
# 执行 migration down
[migration-rollback-command]
```

**验证**：
```bash
# 检查数据库 schema 版本
[check-schema-version]
# 预期：[old-schema-version]
```

---

**步骤 4: 回滚配置（如有）**

```bash
# 恢复旧配置
[config-rollback-command]
```

**验证**：
```bash
# 确认配置已恢复
[verify-config-command]
```

---

### 3.3 回滚验证

**回滚完成后，必须验证：**

- [ ] **服务健康**
  ```bash
  curl http://[service]/health
  # 预期：{"status":"ok", "version":"[old-version]"}
  ```

- [ ] **核心功能正常**
  ```bash
  [functional-test-command]
  ```

- [ ] **监控指标恢复**
  - 错误率 < [normal-threshold]%
  - P99 延迟 < [normal-threshold]ms

- [ ] **用户影响评估**
  - 受影响用户数：[评估]
  - 数据一致性：[检查]

**回滚成功标准**：
- ✅ 所有验证通过
- ✅ 指标恢复到部署前水平
- ✅ 无新的错误或告警

---

## 4. 监控与告警

### 4.1 关键指标

| 指标 | SLO 阈值 | 查询命令/Query |
|------|----------|----------------|
| QPS | [min-max] | `[monitoring-query]` |
| P99 延迟 | < [threshold]ms | `[monitoring-query]` |
| 错误率 | < [threshold]% | `[monitoring-query]` |
| CPU 使用率 | < [threshold]% | `[monitoring-query]` |
| 内存使用率 | < [threshold]% | `[monitoring-query]` |

### 4.2 SLO 定义

**可用性 SLO**：
- 目标：[percentage]% uptime
- 测量周期：[period]
- 错误预算：[error-budget]

**性能 SLO**：
- P99 延迟：< [threshold]ms
- P95 延迟：< [threshold]ms
- 错误率：< [threshold]%

### 4.3 告警配置

**Critical 告警**：

1. **[告警名称]**
   - 触发条件：[condition]
   - 持续时间：[duration]
   - 通知渠道：[channel]
   - 响应 SLA：[time]

**Warning 告警**：

1. **[告警名称]**
   - 触发条件：[condition]
   - 持续时间：[duration]
   - 通知渠道：[channel]

### 4.4 Dashboard

**主监控 Dashboard**：
- URL: [dashboard-url]
- 包含面板：
  - QPS & 延迟
  - 错误率趋势
  - 资源使用率
  - 依赖服务状态

---

## 5. 故障处理

### 5.1 [故障场景 1：场景名称]

**症状**：
- [可观察的现象 1]
- [可观察的现象 2]
- 相关指标异常：[metric] > [threshold]

**排查步骤**：

1. **确认症状范围**
   ```bash
   # 检查受影响范围
   [check-command]
   ```

2. **检查日志**
   ```bash
   # 查看错误日志
   kubectl logs deployment/[name] | grep ERROR
   ```

3. **检查依赖服务**
   ```bash
   # 检查上游服务状态
   [check-dependency-command]
   ```

**根因分析**：
- 可能原因 1：[description]
  - 验证方法：[how-to-verify]
- 可能原因 2：[description]
  - 验证方法：[how-to-verify]

**解决方案**：

**方案 1: [描述]**
```bash
# 执行命令
[fix-command]
```

**验证修复**：
```bash
# 验证命令
[verify-command]
# 预期结果：[expected]
```

**如果未解决** → 尝试方案 2 或升级

**升级条件**：
- 尝试所有方案后仍未解决
- 超过 [time] 分钟
- 影响范围扩大

**升级对象**：[团队/人员]

---

### 5.2 [故障场景 2：场景名称]

[重复上述格式]

---

### 5.N 通用故障处理流程

```
发现告警/异常
  ↓
确认症状和影响范围
  ↓
检查监控指标 + 日志
  ↓
识别根因（匹配已知场景）
  ↓
执行对应解决方案
  ↓
验证修复生效
  ↓
记录事故报告
```

---

## 6. 值班手册

### 6.1 值班职责

**on-call 工程师负责**：
- 响应 Critical 告警（SLA: [time]）
- 响应 Warning 告警（SLA: [time]）
- 执行计划内维护操作
- 记录事故和解决方案
- 更新 Runbook

**不负责**：
- 非紧急功能开发
- 长期架构优化
- 其他团队的服务

### 6.2 联系方式

| 角色 | 联系方式 | 响应时间 |
|------|----------|----------|
| On-call 工程师 | [contact] | 15 分钟 |
| Team Lead | [contact] | 30 分钟 |
| [其他关键角色] | [contact] | [time] |

**依赖团队**：
| 团队 | 服务 | 联系方式 |
|------|------|----------|
| [团队名] | [服务名] | [contact] |

### 6.3 升级路径

```
Level 1: On-call Engineer
  ↓ 15 分钟未解决
Level 2: Senior Engineer / Team Lead
  ↓ 30 分钟未解决 或 P0 故障
Level 3: Engineering Manager / CTO
```

**升级触发条件**：
- 时间超过 SLA
- 故障影响扩大
- 需要其他团队协作
- 需要架构级决策

### 6.4 事故记录

**每次故障必须记录**：
- 时间：[start] - [end]
- 影响：[users/services affected]
- 根因：[root cause]
- 解决方案：[what fixed it]
- 改进措施：[prevention]

**记录位置**：[incident-tracker-url]

### 6.5 Runbook 维护

**如何报告 Runbook 问题**：
- [报告渠道]
- [负责人]

**更新流程**：
1. 发现 Runbook 错误或过时
2. 创建 Issue/Ticket
3. 提交更新 PR
4. Review + 合并
5. 更新版本号和日期

---

## 附录

### A. 参考文档

| 文档 | 路径/URL | 说明 |
|------|----------|------|
| PRD | [path] | 产品需求 |
| HLD | [path] | 高层设计 |
| LLD | [path] | 低层设计 |
| API Contract | [path] | 接口契约 |
| Guardrails | [path] | 工程规范 |
| Infrastructure Doc | [path] | 基础设施 |

### B. 变更历史

| 版本 | 日期 | 变更内容 | 作者 |
|------|------|----------|------|
| 1.0.0 | [date] | Initial version | [author] |

### C. 常用命令速查

```bash
# 查看服务状态
[command]

# 查看日志
[command]

# 重启服务
[command]

# 查看监控
[command]
```

### D. 故障决策树

```
告警触发
  ↓
是 Critical 告警？
  ↓ Yes
  立即响应（15分钟）
  ↓
  检查症状匹配场景
  ↓
  执行对应解决方案
  ↓
  验证修复
  ↓
  记录事故
```

---

**文档结束**
