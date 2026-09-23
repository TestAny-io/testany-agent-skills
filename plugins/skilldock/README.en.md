# SkillDock

**A visual home for your Codex skills and plugins.**

A Testany Product · macOS + Codex · English / 中文 / 日本語 · Light / dark themes

[简体中文](README.md) · [Install & open](#install--open) · [Give feedback](#tell-us-how-it-went) · [More Testany plugins](../../README.en.md#choose-a-plugin) · [Meet Testany](https://testany.io)

As your skill collection grows, sources, versions, and duplicate copies become harder to track. SkillDock brings skills, plugins, marketplaces, and updates into a panel you can open in Codex's right-hand browser.

![SkillDock skill library with status, tag filters, and management controls](assets/skills-overview.png)

*Actual SkillDock 0.3.0 interface in Chinese, using isolated example data. English and Japanese are also available in the app.*

## What you can do

| Task | In SkillDock |
| --- | --- |
| See what is installed | Browse skills and plugins, their installation paths, and discoverable source information |
| Find a skill in a large collection | Add your own tags to skills / plugins, then search and filter |
| Choose between duplicate skills | Inspect each installation path and select the copies to keep or remove; restore removed copies from Activity |
| Understand an update | Follow check progress and expand file diffs before applying changes |
| Keep selected tools current | Choose targets and an interval in hours; optionally apply updates automatically. Bundled skills update with their plugin |
| Use a private repository | Reuse your locally configured Git credentials; paste a GitHub directory URL when linking a source |

Source discovery depends on records left by the original installation. You can connect an update source when those records are missing. Host permissions and system protection can limit available actions; the app shows those restrictions.

## Install & open

The standalone `skilldock` plugin contains just one entry: `skill-manager`. The engineering, prompt, content, and testing plugins are separate choices.

Copy this into Codex on your Mac:

```text
Install the standalone SkillDock plugin from https://github.com/TestAny-io/testany-agent-skills and open its skill management panel.
```

You need Git and a Codex CLI with plugin management support. You do not need to clone the repository manually or install a global Node.js/npm runtime first. The launcher selects or prepares the runtime; the first launch needs network access and may take a little while.

Once installed, open a new Codex task:

```text
$skill-manager Open the skill management panel
```

If the `codex` command on your PATH fails, the [installation guide](../../README.md#在-codex-中使用-skilldock) covers checking desktop app CLI candidates and reporting the executable and project paths actually used. Ask Codex to follow that guide; it is maintained in Chinese. If you previously installed SkillDock 0.1.0 with testany-eng 2.4.0, use the [migration instructions](../../README.md#从旧版-testany-eng-迁移) to retain your schedule, history, and source records.

## Try these first

1. **Check your project.** Use “Switch project” to select the workspace you intend to manage.
2. **Organize a few skills.** Tag a favorite and filter by that tag. If names collide, inspect each copy's installation path.
3. **Review updates.** Click “Check all” on Updates, watch the progress, then expand a diff before choosing an update.

To schedule updates, choose an interval, select targets, and decide whether to enable automatic application. Include `skilldock` itself to update the app and restart it automatically.

Enabling a schedule registers a per-user macOS background task that runs on demand and exits. SkillDock’s web service and Codex can stay closed. Scheduling resumes after reboot and sign-in; missed checks are coalesced into one catch-up. The system checks whether work is due every five minutes, so a run may start up to about five minutes after its planned time. Failures are recorded and retried with backoff. The Updates page shows actual background status; if macOS blocks background activity, restore that permission. Disabling the schedule removes the task. Existing enabled plans migrate when 0.4.0 first starts, including an automatic restart after updating. A manual launch is only needed if the plugin files were updated while the app was stopped and the new version has not run yet. Local-clone sources are not automatically pulled with Git.

## Tell us how it went

**Did installation work? What helped? What was confusing?** A few sentences are enough, in English or Chinese.

- [Questions / installation help](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/q-a)
- [Ideas / trial feedback](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/ideas)
- [Report a bug](https://github.com/TestAny-io/testany-agent-skills/issues/new?template=bug-report.yml) · [Support guide](../../.github/SUPPORT.md#english)

## Built by Testany

[Testany](https://testany.io) is building a software testing platform for human testers and AI testing agents. SkillDock is an open-source tool we built for everyday use. This repository also includes [engineering workflows](../testany-eng/README.md), [prompt optimization](../testany-llm/README.md), [content writing](../testany-mrkt/README.md), and [Testany platform workflows](../testany-bot/README.md).

Explore [Testany](https://testany.io), read the [platform docs](https://docs.testany.io), or [contact the team](mailto:engineering@testany.io).

## Version, license, and development

Current version: **0.4.2**, distributed through this Git repository. [Changelog](../../CHANGELOG.md) · [AGPL-3.0-only](LICENSE) · [Third-party notices](skills/skill-manager/THIRD_PARTY_NOTICES.md).

See the [application README](skills/skill-manager/assets/app/README.md) for development and verification commands, and the [Chinese product page](README.md#版本许可与开发) for implementation and UAT records. Other existing skills in this repository remain MIT-licensed.
