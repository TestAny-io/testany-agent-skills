import { test, expect, type Page } from "@playwright/test";
import { gunzipSync } from "node:zlib";
import type { Snapshot } from "../shared/contracts";

const nav = (page: Page, name: string) =>
  page.getByRole("navigation").getByRole("button", { name, exact: true });
async function snapshot(page: Page): Promise<Snapshot> {
  return (await page.request.get("/api/state?mode=sandbox")).json();
}
async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("appearance and language switches persist and system theme follows OS changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "外观与语言", exact: true }).click();
  await page.getByRole("button", { name: "深色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("dialog").getByRole("combobox").selectOption("en");
  await expect(page.getByRole("dialog")).toContainText("Appearance & language");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(nav(page, "Skills")).toBeVisible();
  await page
    .getByRole("button", { name: "Appearance & language", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("ja");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("dialog")).toContainText("外観と言語");
  await page.getByRole("dialog").getByRole("combobox").selectOption("zh");
  await page.getByRole("button", { name: "跟随系统", exact: true }).click();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
});

for (const language of ["zh", "en", "ja"] as const) {
  test(`all five pages and settings remain usable in ${language} at 390px in dark mode`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (language) =>
        localStorage.setItem(
          "skilldock.preferences.v1",
          JSON.stringify({ language, theme: "dark" }),
        ),
      language,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const buttons = page.getByRole("navigation").getByRole("button");
    await expect(buttons).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await buttons.nth(i).click();
      await expectNoOverflow(page);
    }
    const preferenceName = {
      zh: "外观与语言",
      en: "Appearance & language",
      ja: "外観と言語",
    }[language];
    await page
      .getByRole("button", { name: preferenceName, exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoOverflow(page);
    await page.keyboard.press("Escape");
    await buttons.nth(0).click();
    await page.screenshot({
      path: testInfo.outputPath(`dark-${language}-390.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

for (const language of ["zh", "en", "ja"] as const) {
  test(`update forms show localized validation in ${language} without native English errors`, async ({
    page,
  }) => {
    await page.addInitScript(
      (language) =>
        localStorage.setItem(
          "skilldock.preferences.v1",
          JSON.stringify({ language, theme: "dark" }),
        ),
      language,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const labels = {
      zh: {
        updates: "更新",
        configure: "设置计划",
        enable: "启用这个计划",
        clear: "清空选择",
        save: "保存计划",
        noTargets: "启用计划前至少选择一个可更新对象。",
        intervalError: "请输入0.25至168小时，且换算后须为整数分钟。",
        sourceRequired: "请填写来源路径或 Git 地址。",
        connect: "关联更新来源",
        compare: "比较来源",
      },
      en: {
        updates: "Updates",
        configure: "Configure schedule",
        enable: "Enable this schedule",
        clear: "Clear selection",
        save: "Save schedule",
        noTargets:
          "Select at least one eligible target before enabling the schedule.",
        intervalError:
          "Enter 0.25–168 hours, equivalent to a whole number of minutes.",
        sourceRequired: "Enter a source path or Git URL.",
        connect: "Connect update source",
        compare: "Compare source",
      },
      ja: {
        updates: "更新",
        configure: "スケジュール設定",
        enable: "このスケジュールを有効にする",
        clear: "選択を解除",
        save: "設定を保存",
        noTargets: "有効にする前に更新可能な対象を1つ以上選択してください。",
        intervalError:
          "0.25〜168時間で、分に換算すると整数になる値を入力してください。",
        sourceRequired: "ソースのパスまたは Git URL を入力してください。",
        connect: "更新元を関連付け",
        compare: "取得元を比較",
      },
    }[language];
    await nav(page, labels.updates).click();
    await page
      .getByRole("button", { name: labels.configure, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("checkbox", { name: labels.enable, exact: true })
      .check();
    await dialog
      .getByRole("button", { name: labels.clear, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: labels.save, exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(labels.noTargets);
    await dialog.getByRole("combobox").selectOption("custom");
    await dialog.getByRole("spinbutton").fill("0.24");
    await dialog
      .getByRole("button", { name: labels.save, exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(labels.intervalError);
    await expectNoOverflow(page);
    await page.keyboard.press("Escape");
    const row = page.locator(".uw-item").filter({
      has: page.getByRole("heading", { name: "api-notes", exact: true }),
    });
    await row
      .getByRole("button", { name: labels.connect, exact: true })
      .click();
    await dialog
      .getByRole("button", { name: labels.compare, exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(labels.sourceRequired);
    await page.keyboard.press("Escape");
    expect((await snapshot(page)).schedule!.enabled).toBe(false);
  });
}

test("classification explains personal/project skills and each uncertain status", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /个人与项目/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /状态待确认/ })).toBeVisible();
  await expect(page.getByText("独立技能", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /状态待确认/ }).click();
  await expect(page.locator("main")).toContainText(/同名|状态|确认/);
  await expectNoOverflow(page);
});

test("an existing skill connects a source without replacing files, then updates with its disabled state intact", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "更新").click();
  const before = await snapshot(page);
  const skill = before.skills.find((item) => item.name === "api-notes")!;
  const detailBefore = await (
    await page.request.get(
      `/api/skill?mode=sandbox&id=${encodeURIComponent(skill.id)}`,
    )
  ).json();
  const row = page.locator(".uw-item").filter({
    has: page.getByRole("heading", { name: "api-notes", exact: true }),
  });
  await row.getByRole("button", { name: "关联更新来源", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("来源路径或仓库地址", { exact: true })
    .fill(before.examples!.legacySource!);
  await page.getByRole("button", { name: "比较来源", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("SKILL.md");
  await expect(page.getByRole("dialog")).toContainText(
    skill.path.replace(/\/SKILL\.md$/, ""),
  );
  await page.getByRole("button", { name: "确认关联", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const connected = await (
    await page.request.get(
      `/api/skill?mode=sandbox&id=${encodeURIComponent(skill.id)}`,
    )
  ).json();
  expect(connected.content).toBe(detailBefore.content);
  expect(connected.skill.sourceInfo.confidence).toBe("user-confirmed");
  await row.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("SKILL.md");
  await expect(page.getByRole("dialog")).toContainText(
    skill.path.replace(/\/SKILL\.md$/, ""),
  );
  await page.getByRole("button", { name: "确认更新", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = await (
    await page.request.get(
      `/api/skill?mode=sandbox&id=${encodeURIComponent(skill.id)}`,
    )
  ).json();
  expect(updated.content).toContain("第二版");
  expect(updated.skill.enabled).toBe(false);
});

test("update inventory includes existing installations and schedule saves explicit targets per environment", async ({
  page,
}) => {
  await page.goto("/");
  await nav(page, "更新").click();
  await expect(
    page.getByRole("heading", { name: "自动更新", exact: true }),
  ).toBeVisible();
  const current = await snapshot(page);
  expect(current.updates?.length).toBeGreaterThan(0);
  for (const skill of current.skills)
    expect(
      current.updates?.some(
        (item) =>
          item.target.id === skill.id ||
          item.affectedSkillIds?.includes(skill.id),
      ),
    ).toBe(true);
  const editable = current.updates!.find((item) => item.canAutoApply)!;
  expect(editable).toBeTruthy();
  await page.getByRole("button", { name: "设置计划", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "启用这个计划", exact: true })
    .check();
  await dialog
    .getByRole("checkbox", { name: "发现更新后自动应用", exact: true })
    .check();
  await dialog.getByRole("button", { name: "清空选择", exact: true }).click();
  await dialog
    .getByRole("checkbox", { name: new RegExp(editable.name) })
    .check();
  await dialog
    .getByRole("combobox", { name: "检查周期（小时）", exact: true })
    .selectOption("1");
  await dialog.getByRole("button", { name: "保存计划", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const configured = (await snapshot(page)).schedule!;
  try {
    await expect(page.locator(".toast")).toContainText("1 小时周期");
    await expect(page.locator(".toast")).not.toContainText("分钟");
    expect(configured.enabled).toBe(true);
    expect(configured.autoApply).toBe(true);
    expect(configured.intervalMinutes).toBe(60);
    expect(configured.targets).toEqual([editable.target]);
    expect(configured.nextRunAt).toBeTruthy();
    await page.reload();
    await nav(page, "更新").click();
    await page.getByRole("button", { name: "设置计划", exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("checkbox", { name: "启用这个计划", exact: true }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    const local = await (
      await page.request.get("/api/state?mode=local")
    ).json();
    expect(local.schedule.enabled).toBe(false);
  } finally {
    const { token } = await (await page.request.get("/api/session")).json();
    const result = await page.request.post("/api/actions", {
      headers: { "X-SkillDock-Token": token },
      data: {
        mode: "sandbox",
        action: "schedule.configure",
        schedule: {
          enabled: false,
          autoApply: configured.autoApply,
          intervalMinutes: configured.intervalMinutes,
          timezone: configured.timezone,
          targets: configured.targets,
        },
      },
    });
    expect(result.ok()).toBe(true);
  }
});

test("license and corresponding source downloads contain software rather than local data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "外观与语言", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("AGPL-3.0-only");
  await expect(
    page.getByRole("dialog").locator('a[href="/api/license"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").locator('a[href="/api/source"]'),
  ).toBeVisible();
  const license = await page.request.get("/api/license");
  expect(license.ok()).toBe(true);
  expect(await license.text()).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  const source = await page.request.get("/api/source");
  expect(source.ok()).toBe(true);
  expect(source.headers()["content-disposition"]).toContain("attachment");
  const tar = gunzipSync(await source.body());
  const names: string[] = [];
  // Read member headers, not file contents (the test source itself contains forbidden-path literals).
  for (let offset = 0; offset + 512 <= tar.length && tar[offset] !== 0; ) {
    const header = tar.subarray(offset, offset + 512);
    const text = (start: number, size: number) =>
      header
        .subarray(start, start + size)
        .toString("utf8")
        .split("\0")[0];
    const prefix = text(345, 155);
    names.push(`${prefix ? prefix + "/" : ""}${text(0, 100)}`);
    const length = Number.parseInt(text(124, 12).trim(), 8);
    expect(Number.isFinite(length)).toBe(true);
    offset += 512 + Math.ceil(length / 512) * 512;
  }
  expect(names).toContain("skilldock/assets/app/server/index.mjs");
  expect(names).toContain("skilldock/scripts/launch.mjs");
  expect(names).toContain("skilldock/LICENSE");
  expect(
    names.some((name) => /\/(?:node_modules|\.state|\.git)\//.test(name)),
  ).toBe(false);
});
