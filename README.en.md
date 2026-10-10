# Testany Agent Skills

**Practical workflows for requirements, design, reviews, content, and testing — ready for your AI agent.**

Open-source tools by [Testany](https://testany.io): four domain plugins plus **SkillDock**, a visual manager for local Codex and Claude skills and plugins. Install each plugin independently, according to what you need.

[简体中文](README.md) · [Choose a plugin](#choose-a-plugin) · [SkillDock screenshots & setup](plugins/skilldock/README.en.md) · [Feedback](#feedback) · [Meet Testany](https://testany.io)

## Choose a plugin

| Your task | Plugin | Start with |
| --- | --- | --- |
| Turn an idea into requirements, designs, reviews, tests, and delivery preparation | **[testany-eng](plugins/testany-eng/README.md)** | `guide`, or one of the 23 engineering and coordination skills |
| Improve a prompt | **[testany-llm](plugins/testany-llm/README.md)** | `prompt-optimizer` with your prompt and intended outcome |
| Write content for different platforms | **[testany-mrkt](plugins/testany-mrkt/README.md)** | `media-writer` with your audience, platform, and goal |
| Author, orchestrate, run, and diagnose tests in Testany | **[testany-bot](plugins/testany-bot/README.md)** | Connect Testany MCP, then choose a case, pipeline, or execution workflow |
| Organize, install, and update local Codex and Claude skills / plugins visually | **[SkillDock](plugins/skilldock/README.en.md)** | Install `skilldock`, then open it with `$skill-manager` in Codex or `/skilldock:skill-manager` in Claude |

The [skill catalog](README.md#包含的-skills) and detailed plugin documentation are maintained in Chinese. Host-specific capabilities and prerequisites are documented per plugin; SkillDock targets Codex and Claude on macOS, and TeamDesk targets Codex on macOS.

`code-reviewer` saves complete machine evidence to files and returns bounded summaries, with reusable evidence verification tools. See the [artifact tool guide](plugins/testany-eng/skills/code-reviewer/references/artifact-tools.md) for usage and the `--full-json` option for consumers of the previous full snapshot stdout.

`testany-eng 2.7.1` improves recovery for [code-writer](plugins/testany-eng/skills/code-writer/SKILL.md) and Reviewer: core fields share a total output budget, oversized fields return exact continuation arguments pinned to their sources, and known tasks resume directly from their stable entry, reducing directory discovery and parameter retries. See [workflow setup and host boundaries](plugins/testany-eng/references/workflow-runtime.md). Update the complete plugin to use this version; publication does not establish local installation, adoption by active threads, or token savings in real engineering work.

`testany-eng 2.6.0` adds [delivery-secretary](plugins/testany-eng/skills/delivery-secretary/SKILL.md) to maintain durable goals, dependencies, original commitments and progress across long-running work. It proactively clarifies status with authorized roles; the optional `code-reviewer` interface reuses existing conclusions for progress updates without adding review gates.

## Use the domain plugins in Codex

Ask Codex to install the plugin you choose. For example:

```text
Install testany-eng from https://github.com/TestAny-io/testany-agent-skills and verify that it is installed and enabled.
```

Then start a new task with `$guide Help me identify the next step for this project`. Replace the plugin name with `testany-llm`, `testany-mrkt`, or `testany-bot` to install another domain plugin, and follow its README. If the CLI is unavailable, follow the [CLI discovery and fallback instructions](README.md#在-codex-中使用-skilldock), keeping your chosen domain plugin as the installation target.

## Use the domain plugins in Claude Code

Add this marketplace, then install the plugin you want. For example, in a Claude Code conversation:

```text
/plugin marketplace add TestAny-io/testany-agent-skills
/plugin install testany-eng@testany-agent-skills
```

Replace `testany-eng` with `testany-llm`, `testany-mrkt`, or `testany-bot` to install another plugin. Adding a marketplace only adds its catalog; it does not install every plugin. SkillDock can be installed in Claude too; see [Use SkillDock in Claude](#use-skilldock-in-claude). TeamDesk supports Codex only.

Try a task:

```text
/testany-eng:guide Help me identify the next step for this project
/testany-eng:prd-writer Write a PRD for user sign-in
/testany-llm:prompt-optimizer Improve this prompt while preserving its output requirements
/testany-mrkt:media-writer Draft a product introduction for our developer audience
```

Platform operations in `testany-bot` require [Testany MCP and access to the platform](plugins/testany-bot/README.md#前置要求).

To update a user-scoped installation, run these commands in a terminal:

```bash
claude plugin marketplace update testany-agent-skills
claude plugin update testany-eng@testany-agent-skills
```

Replace the plugin name as needed. For a project or local installation, add the matching `--scope project` or `--scope local` to the second command. Run `/reload-plugins` in an existing Claude Code conversation, or start a new session. [Official CLI reference](https://code.claude.com/docs/en/plugins-reference#plugin-update).

## Use SkillDock in Codex

Copy this request into Codex on your Mac:

```text
Install the standalone SkillDock plugin from https://github.com/TestAny-io/testany-agent-skills and open its skill management panel.
```

This installs only `skilldock` and its `skill-manager` entry. You need Git and a Codex CLI with plugin support. Opening it needs Node.js 22.12 or later on your Mac: the launcher looks for one you already have (the Node bundled with the Codex workspace, Homebrew, nvm and others) and saves its choice; if none is found, it shows installation guidance. It does not download Node or change your shell configuration. The first start needs network access to install dependencies.

Current version: **0.11.0**. One local instance manages the skills, plugins, and marketplaces of both Codex and Claude, and opens from either side (see [Use SkillDock in Claude](#use-skilldock-in-claude)). It still offers real-name search, descriptions, logos, and installation previews for official Codex app plugins such as Miro. Installation and account connection are verified separately. After installation, open **SkillDock** from More / Explore and choose **Pin to sidebar**. Opening the page starts the backend on demand and keeps your saved project. The native entry has been verified in desktop build 26.924.22138; if your host does not show it, open a new Codex task and ask `$skill-manager` to open the browser panel.

See the [SkillDock product page](plugins/skilldock/README.en.md) for screenshots, first steps, updates, and feedback. Existing users of the old bundled version should follow the [migration instructions](README.md#从旧版-testany-eng-迁移).

## Use SkillDock in Claude

Since 0.11.0, SkillDock can also be installed in Claude Code or the Claude desktop app. Both sides open the same local instance with the same data; installed on one side only, it still shows and manages the other.

Add this marketplace and install it in a Claude Code conversation:

```text
/plugin marketplace add TestAny-io/testany-agent-skills
/plugin install skilldock@testany-agent-skills
```

Once this marketplace is added, you can also click **+** next to the prompt box in the Claude desktop app's Code tab → **Plugins** → **Add plugin** and choose SkillDock in the plugin browser. Start a new session (or run `/reload-plugins` in an open one), then open it with `/skilldock:skill-manager` or just ask Claude to open SkillDock. Claude opens it in its built-in browser panel, or gives you a link when no browser tool is available; Claude has no native sidebar entry like Codex.

- **Requirements**: macOS, Git, and Node.js 22.12 or later (found or guided as above).
- **Management**: when SkillDock first sees an Agent, the side where SkillDock is installed is managed and the other side is read-only. SkillDock only reads a read-only side; turn management on in **Agent environments** to let it make changes, after a list of the places it may write. Changes to Claude go through Claude's own command line and are read back.
- **Updates**: run `/plugin` in a Claude session, select `testany-agent-skills` on the **Marketplaces** tab and choose **Update marketplace** (it refreshes this repository's catalog, then updates the plugins installed from it); or check and update Claude's SkillDock on SkillDock's **Updates** page (when the two sides run different versions, **Agent environments** also offers a one-click update). Then run `/reload-plugins` or start a new session. From a terminal, `claude plugin marketplace update testany-agent-skills` and `claude plugin update skilldock@testany-agent-skills` do the same.
- **SkillDock on both sides**: when 0.11 first opens older data, it checks that neither side has a SkillDock older than 0.10.3; otherwise it stops, changes nothing, and explains what to do (including a one-click update after you confirm).
- **Going back**: to return to 0.10.x, use a separate data directory (`SKILLDOCK_STATE_DIR`) or keep 0.11.x. SkillDock 0.10.3 does not take over 0.11 data and asks you to update; 0.10.2 and earlier refuse to start or fail to start without changing your plans, bindings, history or preferences (they may remove the launch record, which 0.11 writes back next time). A separate data directory applies to SkillDock started from the skill or the command line; see `SKILL.md`.

## Feedback

English and Chinese are welcome. Start with what you were trying to do and where you got stuck; a short message is enough.

- [Questions and installation help](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/q-a)
- [Ideas and trial feedback](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/ideas)
- [Share your workflow](https://github.com/TestAny-io/testany-agent-skills/discussions/categories/show-and-tell)
- [Report a bug](https://github.com/TestAny-io/testany-agent-skills/issues/new?template=bug-report.yml) · [Support guide](.github/SUPPORT.md#english)

For SkillDock, we especially want to hear whether installation worked, which feature helped, and which step was confusing. Feedback on every other plugin is equally welcome.

## Meet Testany

[Testany](https://testany.io) is building a software testing platform for human testers and AI testing agents, centered on test orchestration, execution, and feedback. These tools grew out of our own engineering workflows.

Explore [Testany](https://testany.io), read the [platform documentation](https://docs.testany.io), or use [testany-bot](plugins/testany-bot/README.md) to connect an agent to the platform. Contact the team at [engineering@testany.io](mailto:engineering@testany.io).

## Contributing and licenses

For repository structure and skill authoring, see the [Chinese README](README.md#关于本仓库) and [development guide](docs/plugin-development.md).

The repository defaults to [MIT](LICENSE). SkillDock-owned software and documentation under `plugins/skilldock/` use [AGPL-3.0-only](plugins/skilldock/LICENSE); third-party components retain their own licenses. See [third-party notices](plugins/skilldock/skills/skill-manager/THIRD_PARTY_NOTICES.md) and the [changelog](CHANGELOG.md).

## TeamDesk 0.2.0 (seed release)

[TeamDesk](plugins/teamdesk/README.md) is a local workspace for up to 32 AI employees working in existing Codex Desktop tasks. It includes departments, skills, business tasks, human decisions and acceptance, native FIFO/steer, peer-to-peer handoffs, metadata receipts, and a collaboration graph with history replay. Work remains in Codex; TeamDesk does not run a separate model environment or mirror conversations.

On macOS, run this single installation flow in Terminal:

```sh
curl -fL https://raw.githubusercontent.com/TestAny-io/testany-agent-skills/main/install-teamdesk.sh -o install-teamdesk.sh &&
sh install-teamdesk.sh
```

Version 0.2.0 fixes the downloaded installer entry on macOS temporary/symlinked paths. The installer checks dependencies, installs only the TeamDesk Codex plugin, builds and verifies `~/Applications/TeamDesk.app`, then opens it. The icon starts Codex Desktop and opens TeamDesk in Safari. Requires macOS 13+, Codex Desktop (bundled CLI numeric release baseline ≥0.155.0, including prereleases), Node ≥22.13 with SQLite, and Xcode Command Line Tools for the initial build. It prefers Codex's bundled Node. Missing prerequisites are reported with recovery instructions; rerun after installing them. Use `--check` for dependency checks or `--no-open` to install without launching.

Running `sh ./install-teamdesk.sh` inside a clone uses that local source. Existing marketplace conflicts and disabled plugins require an explicit choice; the installer preserves business data and never force-quits Codex or trusts hooks on your behalf. Shared startup uses experimental Codex interfaces. Installation on another Mac, Intel, older macOS, and full cold startup remain seed-test items; see the [seed testing guide](plugins/teamdesk/docs/SEED-TESTING.md) and [verification scope](plugins/teamdesk/docs/VERIFICATION.md).
