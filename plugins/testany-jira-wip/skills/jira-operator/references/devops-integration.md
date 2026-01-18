# DevOps 工具链集成参考

## 前置条件

- 用户已确认 CI/CD 工具（GitHub Actions, GitLab CI, Jenkins）
- 用户已确认版本管理工具（Git, SVN）
- 用户已确认监控工具（Prometheus, Grafana, PagerDuty）

## CI/CD 集成

### GitHub Actions 集成

**场景**：Pull Request 状态变更时更新 Jira Issue

```yaml
# .github/workflows/jira-update.yml
name: Update Jira Status

on:
  pull_request:
    types: [opened, closed, merged]

jobs:
  update-jira:
    runs-on: ubuntu-latest
    steps:
      - name: Extract Jira Issue Key
        id: extract-key
        run: |
          # 从 PR title 提取 Issue Key (格式：PROJ-123)
          ISSUE_KEY=$(echo "${{ github.event.pull_request.title }}" | grep -oE '[A-Z]+-[0-9]+' | head -1)
          echo "issue_key=$ISSUE_KEY" >> $GITHUB_OUTPUT

      - name: Update Jira Issue
        if: steps.extract-key.outputs.issue_key != ''
        run: |
          curl -X POST \
            -u "${{ secrets.JIRA_USER }}:${{ secrets.JIRA_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{
              "transition": {
                "id": "${{ secrets.JIRA_REVIEW_TRANSITION_ID }}"
              }
            }' \
            "${{ secrets.JIRA_URL }}/rest/api/2/issue/${{ steps.extract-key.outputs.issue_key }}/transitions"
```

**环境变量配置**：

| 变量 | 说明 | 示例 |
|--------|------|------|
| JIRA_URL | Jira URL | https://company.atlassian.net |
| JIRA_USER | Jira 用户名 | username@company.com |
| JIRA_TOKEN | API Token | api_token_here |
| JIRA_REVIEW_TRANSITION_ID | In Review 状态 ID | 81 |

### GitLab CI 集成

**场景**：Merge Request 合并后更新 Jira Issue

```yaml
# .gitlab-ci.yml
update_jira:
  stage: deploy
  script:
    - |
      # 提取 Issue Key
      ISSUE_KEY=$(echo "$CI_MERGE_REQUEST_TITLE" | grep -oE '[A-Z]+-[0-9]+' | head -1)

      if [ -n "$ISSUE_KEY" ]; then
        curl -X POST \
          -u "$JIRA_USER:$JIRA_TOKEN" \
          -H "Content-Type: application/json" \
          -d '{"transition": {"id": "81"}}' \
          "$JIRA_URL/rest/api/2/issue/$ISSUE_KEY/transitions"
      fi
  only:
    - merge_requests
```

### Jenkins 集成

**场景**：构建成功后更新 Jira Issue

```groovy
// Jenkinsfile
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'mvn clean install'
            }
        }
        stage('Update Jira') {
            steps {
                script {
                    // 从环境变量或 git log 提取 Issue Key
                    def issueKey = env.JIRA_ISSUE_KEY
                    if (issueKey) {
                        // 调用 Jira REST API
                        sh """
                            curl -X POST \
                                -u '${JIRA_USER}:${JIRA_TOKEN}' \
                                -H 'Content-Type: application/json' \
                                -d '{"transition": {"id": "81"}}' \
                                '${JIRA_URL}/rest/api/2/issue/${issueKey}/transitions'
                        """
                    }
                }
            }
        }
    }
}
```

## 版本管理集成

### Git Commit Message 集成

**场景**：Git Commit Message 包含 Issue Key 时自动更新 Issue

```json
{
  "name": "Git Commit 集成",
  "trigger": "Webhook",
  "webhook": "https://git.company.com/webhook/jira",
  "condition": "commitMessage contains \"PROJ-\"",
  "actions": [
    {
      "type": "Comment on Issue",
      "comment": "Git Commit: {{commitMessage}}\nAuthor: {{author}}\n{{commitUrl}}"
    },
    {
      "type": "Edit Issue",
      "fields": {
        "fixVersions": [{"name": "{{branch}}"}]
      },
      "condition": "branch = \"main\" OR branch = \"master\""
    }
  ]
}
```

**Commit Message 格式规范**：

- 标准：`PROJ-123: Fix login bug`
- 详细：`PROJ-123: Fix login bug\n\n- Issue 1\n- Issue 2`
- 多 Issue：`PROJ-123, PROJ-456: Update feature`

### 版本发布自动化

**场景**：Git Tag 创建时自动创建 Jira 版本并关联 Issue

```json
{
  "name": "版本发布自动化",
  "trigger": "Webhook",
  "webhook": "https://git.company.com/webhook/jira",
  "condition": "ref_type = \"tag\"",
  "actions": [
    {
      "type": "Create Version",
      "version_name": "{{tag}}",
      "project": "PROJ"
    },
    {
      "type": "Update Issues",
      "query": "project = PROJ AND fixVersions in ({{tag}})",
      "fields": {
        "status": "Done"
      }
    },
    {
      "type": "Create Release Notes",
      "version": "{{tag}}",
      "content": "自动生成发布笔记..."
    }
  ]
}
```

## 监控和告警集成

### Prometheus 集成

**场景**：监控指标异常时自动创建 Jira Issue

```yaml
# alertmanager.yml
receivers:
  - name: 'jira'
    webhook_configs:
      - url: 'https://jira.company.com/webhook/prometheus'
        send_resolved: true
```

**告警规则示例**：

```yaml
# prometheus.yml
groups:
  - name: alert.rules
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status="500"}[5m]) > 0.05
        annotations:
          summary: "错误率过高"
          description: "{{ $labels.instance }} 错误率超过 5%"
```

### PagerDuty 集成

**场景**：PagerDuty Alert 触发时自动创建 Jira Incident Issue

```json
{
  "name": "PagerDuty 集成",
  "trigger": "Webhook",
  "webhook": "https://pagerduty.company.com/webhook/jira",
  "actions": [
    {
      "type": "Create Issue",
      "fields": {
        "project": "PROJ",
        "issuetype": "Bug",
        "summary": "Incident: {{incident_title}}",
        "priority": "{{severity}}",
        "description": "Alert: {{alert_message}}\n\nURL: {{incident_url}}"
      },
      "assignee": "on-call@company.com"
    },
    {
      "type": "Transition Issue",
      "transition": "Resolved",
      "condition": "incident_status = \"resolved\""
    }
  ]
}
```

## 配置步骤

### 1. 配置 Webhook

使用 MCP 工具：`jira_create_webhook`

```json
{
  "name": "GitHub Integration",
  "url": "https://jira.company.com/webhook/github",
  "events": ["jira:issue_created", "jira:issue_updated"],
  "filter": "project = PROJ"
}
```

### 2. 配置 Jira Automation Rule

使用 MCP 工具：`jira_create_automation_rule`

```json
{
  "name": "Git Commit 集成",
  "trigger": {
    "type": "Webhook",
    "webhook": "https://git.company.com/webhook/jira"
  },
  "actions": [
    {
      "type": "Comment on Issue",
      "comment": "Git Commit: {{commitMessage}}"
    }
  ]
}
```

### 3. 配置 CI/CD

在 CI/CD 工具中配置环境变量和脚本：

```yaml
# GitHub Actions 示例
env:
  JIRA_URL: https://company.atlassian.net
  JIRA_USER: ${{ secrets.JIRA_USER }}
  JIRA_TOKEN: ${{ secrets.JIRA_TOKEN }}
```

## 验证检查

- [ ] Webhook 配置正确
- [ ] CI/CD 环境变量配置正确
- [ ] 测试触发器正常工作
- [ ] Issue 状态自动更新
- [ ] 告警自动创建 Incident
- [ ] 版本发布自动化正常

## 最佳实践

1. **Commit Message 规范**：强制使用 Issue Key 格式
2. **Webhook 安全**：验证 Webhook 请求来源
3. **错误处理**：集成失败时记录日志
4. **幂等性**：确保重复触发不会产生重复数据
5. **测试先行**：在测试环境验证集成
6. **监控集成**：监控集成状态，及时发现故障
