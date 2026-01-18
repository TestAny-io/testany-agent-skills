# 全局配置参考（从 0 搭建）

## 前置条件

- 用户已确认团队规模
- 用户已确认方法论（Scrum/Kanban/瀑布）
- 用户已确认项目类型

## 配置阶段

### 阶段 1：基础配置

#### 1.1 创建项目

```json
{
  "name": "新项目名称",
  "key": "PROJ",
  "type": "software",
  "lead": "project-lead@company.com"
}
```

#### 1.2 配置工作流

选择标准工作流模板：
- Scrum Workflow
- Kanban Workflow
- Waterfall Workflow

#### 1.3 配置权限方案

选择标准权限方案：
- Scrum Team Permission Scheme
- Kanban Team Permission Scheme
- Support Team Permission Scheme

### 阶段 2：Issue 类型配置

#### 2.1 配置 Issue 类型

| Issue 类型 | 说明 | 必需字段 |
|-----------|------|-----------|
| Epic | 大型功能或主题 | Summary, Priority |
| Story | 用户故事 | Summary, Priority, Story Points |
| Task | 技术任务 | Summary, Priority, Assignee |
| Bug | 缺陷修复 | Summary, Priority, Environment |
| Sub-task | 子任务 | Summary, Parent |

#### 2.2 配置字段

必填字段：
- Summary
- Issue Type
- Priority

自定义字段：
- Story Points（数字）
- Epic Link（选择器）
- Sprint（选择器）

### 阶段 3：看板配置

#### 3.1 创建看板

Scrum 项目：
- Sprint Backlog
- Active Sprint

Kanban 项目：
- Project Kanban（配置 WIP 限制）

#### 3.2 配置列和泳道

根据工作流配置列：
- Scrum: To Do, In Progress, In Review, Done
- Kanban: Backlog, Ready, In Progress, In Review, Testing, Done

### 阶段 4：仪表板配置

创建标准仪表板：
- 项目经理仪表板
- 开发团队仪表板
- 产品经理仪表板

### 阶段 5：自动化配置

配置基础自动化规则：
- 自动分配规则
- 状态变更通知
- SLA 违规提醒

### 阶段 6：DevOps 集成

配置集成：
- Git Commit 集成
- CI/CD 集成
- 监控告警集成

## 配置检查清单

### 基础配置

- [ ] 项目创建成功
- [ ] 工作流配置正确
- [ ] 权限方案已应用

### Issue 类型配置

- [ ] Issue 类型配置正确
- [ ] 必填字段配置正确
- [ ] 自定义字段已添加
- [ ] 屏幕方案配置正确

### 看板配置

- [ ] 看板创建成功
- [ ] 列配置正确
- [ ] WIP 限制已设置（Kanban）
- [ ] 泳道配置正确

### 仪表板配置

- [ ] 仪表板创建成功
- [ ] Gadget 配置正确
- [ ] 数据源正确
- [ ] 仪表板已共享

### 自动化配置

- [ ] 自动化规则已创建
- [ ] 触发器配置正确
- [ ] 操作可执行
- [ ] 规则已启用

### DevOps 集成

- [ ] Webhook 配置正确
- [ ] Git Commit 集成正常
- [ ] CI/CD 集成正常
- [ ] 监控告警集成正常

### Confluence 配置

- [ ] 空间创建成功
- [ ] 权限配置正确
- [ ] 主页已设置
- [ ] 页面模板可用

## 测试阶段

### 功能测试

- [ ] 测试创建 Issue
- [ ] 测试更新 Issue
- [ ] 测试状态流转
- [ ] 测试权限控制
- [ ] 测试 JQL 查询

### 集成测试

- [ ] 测试 Git Commit 集成
- [ ] 测试 CI/CD 集成
- [ ] 测试告警集成

### 用户验收测试

- [ ] PM 可以正常使用
- [ ] 开发可以正常使用
- [ ] QA 可以正常使用
- [ ] 外部协作人员可以正常使用

## 上线准备

### 文档准备

- [ ] 用户指南已编写
- [ ] 最佳实践文档已编写
- [ ] FAQ 已编写
- [ ] 培训材料已准备

### 培训准备

- [ ] 培训时间已确认
- [ ] 培训对象已确认
- [ ] 培训材料已准备
- [ ] 培训场地已预约

### 监控准备

- [ ] 监控指标已定义
- [ ] 告警规则已配置
- [ ] 监控仪表板已创建

## 最佳实践

1. **分阶段实施**：基础配置 → Issue 类型 → 看板 → 仪表板 → 自动化 → 集成
2. **测试先行**：每个阶段完成后立即测试
3. **用户参与**：配置过程中邀请用户参与测试
4. **文档同步**：配置的同时编写文档
5. **逐步上线**：小范围试点 → 全员推广
6. **持续优化**：上线后根据反馈持续优化
