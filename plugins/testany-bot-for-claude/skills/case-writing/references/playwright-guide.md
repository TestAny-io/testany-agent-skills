# Playwright 测试脚本指南

Playwright 是用于 UI/E2E 测试的浏览器自动化框架，支持 Chromium、Firefox 和 WebKit。

## 适用场景

- UI 测试
- E2E（端到端）测试
- 浏览器自动化
- 跨浏览器测试

## ZIP 结构

```
my-test.zip
├── package.json              ← 必需
├── playwright.config.ts      ← 必需
└── tests/
    └── example.spec.ts       ← 测试文件
```

## Trigger 配置

```json
{
  "executor": "playwright",
  "trigger_path": "tests/example.spec.ts"
}
```

**运行整个目录**：
```json
{
  "executor": "playwright",
  "trigger_path": "tests/"
}
```

## 配置文件模板

### package.json

```json
{
  "name": "playwright-tests",
  "version": "1.0.0",
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "axios": "^1.6.0"
  }
}
```

### playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: process.env.APP_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
```

## 代码模板

### 基础登录测试

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    // 从环境变量获取配置
    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;

    // 导航到登录页
    await page.goto('/login');

    // 填写表单
    await page.fill('#username', username!);
    await page.fill('#password', password!);

    // 提交
    await page.click('#submit');

    // 断言
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('.welcome-message')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'invalid_user');
    await page.fill('#password', 'wrong_password');
    await page.click('#submit');

    await expect(page.locator('.error-message')).toBeVisible();
    await expect(page.locator('.error-message')).toContainText('Invalid credentials');
  });
});
```

### 带 Relay 输出的测试

```typescript
import { test, expect } from '@playwright/test';
import axios from 'axios';

test.describe('Login with Relay', () => {
  test('should login and relay session info', async ({ page }) => {
    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;

    await page.goto('/login');
    await page.fill('#username', username!);
    await page.fill('#password', password!);

    // 监听 API 响应以获取 token
    const [response] = await Promise.all([
      page.waitForResponse('**/api/login'),
      page.click('#submit')
    ]);

    const data = await response.json();

    // 验证登录成功
    await expect(page).toHaveURL('/dashboard');

    // Relay 输出
    const relayService = process.env.TESTANY_OUTPUT_RELAY_SERVICE;
    if (relayService) {
      await axios.post(relayService, {
        ACCESS_TOKEN: data.token,
        SESSION_ID: data.session_id,
        LOGIN_TIME: new Date().toISOString()
      });
    }
  });
});
```

### API 测试（使用 Playwright 的 request 功能）

```typescript
import { test, expect } from '@playwright/test';

test.describe('API Tests', () => {
  test('should get user profile', async ({ request }) => {
    const apiUrl = process.env.API_BASE_URL;
    const token = process.env.ACCESS_TOKEN;

    const response = await request.get(`${apiUrl}/api/profile`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.username).toBeDefined();
  });
});
```

## 环境变量使用

```typescript
// 必需变量
const appUrl = process.env.APP_URL;

// 可选变量（有默认值）
const timeout = parseInt(process.env.TIMEOUT || '30000');
```

## 常用定位器

```typescript
// ID
page.locator('#submit')

// Class
page.locator('.btn-primary')

// 文本
page.getByText('Login')

// Role
page.getByRole('button', { name: 'Submit' })

// Placeholder
page.getByPlaceholder('Enter username')

// Label
page.getByLabel('Username')
```

## 注意事项

1. **Headless 模式**：Testany 环境中必须使用 headless 模式
2. **package.json 必需**：Playwright 依赖必须在 package.json 中声明
3. **TypeScript**：推荐使用 TypeScript 编写测试
4. **等待策略**：优先使用 `await expect()` 而非固定等待时间
