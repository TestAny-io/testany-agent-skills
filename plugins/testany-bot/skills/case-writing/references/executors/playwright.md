# Playwright 模板

Playwright 执行器用于 UI/E2E 测试。

## ZIP 结构

```
my-test.zip
├── package.json
├── playwright.config.ts
└── tests/
    └── example.spec.ts
```

## Trigger 配置

```json
{
  "executor": "playwright",
  "trigger_path": "tests/example.spec.ts"
}
```

## package.json

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

## playwright.config.ts

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: process.env.APP_URL,
    headless: true,
  },
});
```

## 代码模板

```typescript
import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    const username = process.env.USERNAME;
    const password = process.env.PASSWORD;

    await page.goto('/login');
    await page.fill('#username', username!);
    await page.fill('#password', password!);
    await page.click('#submit');

    await expect(page).toHaveURL('/dashboard');
  });
});
```

## Relay 输出

```typescript
import axios from 'axios';

const relayService = process.env.TESTANY_OUTPUT_RELAY_SERVICE;
if (relayService) {
  await axios.post(relayService, {ACCESS_TOKEN: token});
}
```

## 官方文档

- [Playwright Test Case](https://docs.testany.io/en/docs/managing-test-case-playwright/)
- [Playwright Codegen Best Practice](https://docs.testany.io/en/docs/playwright-codegen-best-practice/)
