import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Snapshot } from "../shared/contracts";

for (const language of ["zh", "en", "ja"] as const) {
  test(`missing source records explain blank fields in ${language}`, async ({
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
    const text = {
      zh: {
        updates: "更新",
        connect: "关联更新来源",
        region: "已检测到的来源信息",
        empty: "未记录",
        missing: "未找到可核实的安装来源记录",
        address: "来源路径或仓库地址",
      },
      en: {
        updates: "Updates",
        connect: "Connect update source",
        region: "Detected source information",
        empty: "Not recorded",
        missing: "No verifiable installation source record was found",
        address: "Source path or repository URL",
      },
      ja: {
        updates: "更新",
        connect: "更新元を関連付け",
        region: "検出された取得元情報",
        empty: "記録なし",
        missing: "確認できるインストール元の記録がない",
        address: "取得元のパスまたはリポジトリURL",
      },
    }[language];
    await page
      .getByRole("navigation")
      .getByRole("button", { name: text.updates, exact: true })
      .click();
    await page
      .locator(".uw-item")
      .filter({
        has: page.getByRole("heading", { name: "design-review", exact: true }),
      })
      .getByRole("button", { name: text.connect, exact: true })
      .click();
    const details = page.getByRole("region", {
      name: text.region,
      exact: true,
    });
    await expect(details).toContainText(text.missing);
    await expect(details.getByText(text.empty, { exact: true })).toHaveCount(4);
    await expect(
      page.getByRole("dialog").getByLabel(text.address, { exact: true }),
    ).toHaveValue("");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
  });
}

for (const hasOrigin of [true, false])
  test(`Git working tree metadata with origin=${hasOrigin} prefills available fields while identifying HEAD accurately`, async ({
    page,
  }) => {
    const run = promisify(execFile);
    const before: Snapshot = await (
      await page.request.get("/api/state?mode=sandbox")
    ).json();
    const repo = path.join(
      before.paths.skills,
      `uat-git-source-context-${hasOrigin}`,
    );
    const skillDirectory = path.join(repo, "skills", "metadata-sample");
    await fs.mkdir(skillDirectory, { recursive: true });
    const git = (...args: string[]) =>
      run("git", [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "user.name=SkillDock Test",
        "-c",
        "user.email=fixture@example.invalid",
        "-C",
        repo,
        ...args,
      ]);
    try {
      await fs.writeFile(
        path.join(skillDirectory, "SKILL.md"),
        "---\nname: metadata-sample\ndescription: Source metadata fixture\n---\nCommitted body.\n",
      );
      await git("init", "--initial-branch=main");
      await git("add", ".");
      await git("commit", "-m", "fixture");
      const commit = (await git("rev-parse", "HEAD")).stdout.trim();
      const source = hasOrigin
        ? "https://github.com/example/metadata-fixture.git"
        : repo;
      if (hasOrigin) await git("remote", "add", "origin", source);
      await fs.appendFile(
        path.join(skillDirectory, "SKILL.md"),
        "\nUncommitted local text.\n",
      );
      const state: Snapshot = await (
        await page.request.get("/api/state?mode=sandbox&refresh=true")
      ).json();
      const detected = state.skills.find((s) => s.name === "metadata-sample")!;
      expect(detected.sourceInfo).toMatchObject({
        kind: "git-checkout",
        source,
        subpath: "skills/metadata-sample",
        ref: "main",
        commit,
      });
      await page.addInitScript(() =>
        localStorage.setItem(
          "skilldock.preferences.v1",
          JSON.stringify({ language: "en", theme: "dark" }),
        ),
      );
      await page.goto("/");
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Updates", exact: true })
        .click();
      await page
        .locator(".uw-item")
        .filter({
          has: page.getByRole("heading", {
            name: "metadata-sample",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Connect update source", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(
        dialog.getByLabel(hasOrigin ? "Git repository or directory URL" : "Source path or repository URL", { exact: true }),
      ).toHaveValue(source);
      await expect(
        dialog.getByLabel("Repository subdirectory (optional)", {
          exact: true,
        }),
      ).toHaveValue("skills/metadata-sample");
      if (hasOrigin)
        await expect(
          dialog.getByLabel("Branch or tag (optional)", { exact: true }),
        ).toHaveValue("main");
      else
        await expect(
          dialog.getByLabel("Branch or tag (optional)", { exact: true }),
        ).toHaveCount(0);
      const details = dialog.getByRole("region", {
        name: "Detected source information",
        exact: true,
      });
      await expect(details).toContainText(commit);
      await expect(details).toContainText("skills/metadata-sample");
      await expect(details).toContainText("main");
      await expect(details).toContainText(
        "It does not prove which commit was originally installed.",
      );
      await page.keyboard.press("Escape");
      expect(
        await fs.readFile(path.join(skillDirectory, "SKILL.md"), "utf8"),
      ).toContain("Uncommitted local text.");
      expect((await git("rev-parse", "HEAD")).stdout.trim()).toBe(commit);
    } finally {
      await fs.rm(repo, { recursive: true, force: true });
      await page.request.get("/api/state?mode=sandbox&refresh=true");
    }
  });
