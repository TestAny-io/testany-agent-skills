import { test, expect, type Page, type Request } from "@playwright/test";
import type { ScheduleInput, Snapshot } from "../shared/contracts";

const labels = {
  zh: {
    updates: "更新",
    configure: "设置计划",
    interval: "检查周期（小时）",
    custom: "自定义间隔（小时）",
    save: "保存计划",
    intervalError: "请输入0.25至168小时，且换算后须为整数分钟。",
  },
  en: {
    updates: "Updates",
    configure: "Configure schedule",
    interval: "Check interval (hours)",
    custom: "Custom interval (hours)",
    save: "Save schedule",
    intervalError:
      "Enter 0.25–168 hours, equivalent to a whole number of minutes.",
  },
  ja: {
    updates: "更新",
    configure: "スケジュール設定",
    interval: "確認間隔（時間）",
    custom: "カスタム間隔（時間）",
    save: "設定を保存",
    intervalError:
      "0.25〜168時間で、分に換算すると整数になる値を入力してください。",
  },
} as const;
type Language = keyof typeof labels;

async function snapshot(page: Page, mode = "sandbox"): Promise<Snapshot> {
  const response = await page.request.get(`/api/state?mode=${mode}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

function scheduleInput(schedule: NonNullable<Snapshot["schedule"]>): ScheduleInput {
  const { enabled, autoApply, intervalMinutes, timezone, targets } = schedule;
  return { enabled, autoApply, intervalMinutes, timezone, targets };
}

async function configure(page: Page, schedule: ScheduleInput) {
  const session = await page.request.get("/api/session");
  expect(session.ok()).toBe(true);
  const { token } = await session.json();
  const response = await page.request.post("/api/actions", {
    headers: { "X-SkillDock-Token": token },
    data: { mode: "sandbox", action: "schedule.configure", schedule },
  });
  expect(response.ok()).toBe(true);
}

// The E2E server uses temporary homes. Each case additionally restores its
// sandbox configuration, and all exercised schedules are disabled and empty.
async function withSchedule(
  page: Page,
  intervalMinutes: number,
  run: () => Promise<void>,
) {
  const original = scheduleInput((await snapshot(page)).schedule!);
  const localBefore = scheduleInput((await snapshot(page, "local")).schedule!);
  try {
    await configure(page, {
      ...original,
      enabled: false,
      autoApply: false,
      intervalMinutes,
      targets: [],
    });
    await run();
    expect(scheduleInput((await snapshot(page, "local")).schedule!)).toEqual(
      localBefore,
    );
  } finally {
    await configure(page, original);
    expect(scheduleInput((await snapshot(page)).schedule!)).toEqual(original);
  }
}

async function visitUpdates(page: Page, language: Language = "en") {
  await page.addInitScript(
    (language) =>
      localStorage.setItem(
        "skilldock.preferences.v1",
        JSON.stringify({ language, theme: "dark" }),
      ),
    language,
  );
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: labels[language].updates, exact: true })
    .click();
}

async function openSchedule(page: Page, language: Language = "en") {
  await page
    .getByRole("button", { name: labels[language].configure, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveAndExpectMinutes(page: Page, intervalMinutes: number) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: labels.en.save, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const schedule = (await snapshot(page)).schedule!;
  expect(schedule.intervalMinutes).toBe(intervalMinutes);
  expect(schedule.enabled).toBe(false);
  expect(schedule.autoApply).toBe(false);
  expect(schedule.targets).toEqual([]);
}

for (const language of ["zh", "en", "ja"] as const) {
  test(`hour controls and localized errors fit ${language} schedule at 390px`, async ({
    page,
  }, testInfo) => {
    await withSchedule(page, 1440, async () => {
      const text = labels[language];
      await page.setViewportSize({ width: 390, height: 844 });
      await visitUpdates(page, language);
      const summary = page.locator(".uw-plan-summary");
      await expect(summary).toContainText(text.interval);
      await expect(summary).toContainText("24");
      await expect(summary).not.toContainText("1440");
      const dialog = await openSchedule(page, language);
      const frequency = dialog.getByRole("combobox", {
        name: text.interval,
        exact: true,
      });
      await expect(frequency).toHaveValue("24");
      await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
      await expect(dialog).not.toContainText("1440");
      await frequency.selectOption("custom");
      const input = dialog.getByRole("spinbutton", {
        name: text.custom,
        exact: true,
      });
      await expect(input).toBeVisible();
      await input.fill("0.24");
      await dialog.getByRole("button", { name: text.save, exact: true }).click();
      await expect(dialog.getByRole("alert")).toHaveText(text.intervalError);
      expect(
        await page.evaluate(() => ({
          page: document.documentElement.scrollWidth <= innerWidth + 1,
          dialog: [...document.querySelectorAll('[role="dialog"]')].every(
            (element) => element.scrollWidth <= element.clientWidth + 1,
          ),
        })),
      ).toEqual({ page: true, dialog: true });
      await page.screenshot({
        path: testInfo.outputPath(`schedule-hours-${language}-390.png`),
        fullPage: false,
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      expect((await snapshot(page)).schedule!.intervalMinutes).toBe(1440);
    });
  });
}

test("custom hours and presets save whole minutes at both supported boundaries", async ({
  page,
}) => {
  await withSchedule(page, 1440, async () => {
    await visitUpdates(page);
    let dialog = await openSchedule(page);
    await dialog.getByRole("combobox").selectOption("custom");
    await dialog.getByRole("spinbutton").fill("2");
    await expect(dialog.getByRole("combobox")).toHaveValue("custom");
    await saveAndExpectMinutes(page, 120);

    for (const [hours, minutes] of [[24, 1440], [168, 10080]] as const) {
      dialog = await openSchedule(page);
      await dialog.getByRole("combobox").selectOption(String(hours));
      await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
      await saveAndExpectMinutes(page, minutes);
    }

    for (const [hours, minutes] of [[0.25, 15], [168, 10080], [1.1, 66]] as const) {
      dialog = await openSchedule(page);
      await dialog.getByRole("combobox").selectOption("custom");
      // Typing a preset's numeric value must not replace the custom control.
      await dialog.getByRole("spinbutton").fill("1");
      await expect(dialog.getByRole("combobox")).toHaveValue("custom");
      await expect(dialog.getByRole("spinbutton")).toHaveValue("1");
      await dialog.getByRole("spinbutton").fill(String(hours));
      await saveAndExpectMinutes(page, minutes);
    }
  });
});

test("existing 15-minute and 61-minute schedules round-trip through custom hours without rounding", async ({
  page,
}) => {
  for (const minutes of [15, 61]) {
    await withSchedule(page, minutes, async () => {
      await visitUpdates(page);
      const dialog = await openSchedule(page);
      await expect(dialog.getByRole("combobox")).toHaveValue("custom");
      await expect(dialog.getByRole("spinbutton")).toHaveValue(
        String(minutes / 60),
      );
      await saveAndExpectMinutes(page, minutes);
    });
  }
});

test("out-of-range, fractional-minute and empty custom hours never submit an action", async ({
  page,
}) => {
  await withSchedule(page, 1440, async () => {
    await visitUpdates(page);
    const dialog = await openSchedule(page);
    await dialog.getByRole("combobox").selectOption("custom");
    const actions: unknown[] = [];
    const trackAction = (request: Request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === "/api/actions")
        actions.push(request.postDataJSON());
    };
    page.on("request", trackAction);
    try {
      for (const value of ["0.24", "168.01", "0.251", ""]) {
        await dialog.getByRole("spinbutton").fill(value);
        await dialog
          .getByRole("button", { name: labels.en.save, exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toHaveText(labels.en.intervalError);
        expect(actions).toEqual([]);
        expect((await snapshot(page)).schedule!.intervalMinutes).toBe(1440);
      }
    } finally {
      page.off("request", trackAction);
    }
    await page.keyboard.press("Escape");
  });
});
