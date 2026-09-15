# Testany Agent Skills

**Practical workflows for requirements, design, reviews, content, and testing — ready for your AI agent.**

Open-source tools by [Testany](https://testany.io): four domain plugins plus **SkillDock**, a visual manager for local Codex skills and plugins. Install each plugin independently, according to what you need.

[简体中文](README.md) · [Choose a plugin](#choose-a-plugin) · [SkillDock screenshots & setup](plugins/skilldock/README.en.md) · [Feedback](#feedback) · [Meet Testany](https://testany.io)

## Choose a plugin

| Your task | Plugin | Start with |
| --- | --- | --- |
| Turn an idea into requirements, designs, reviews, tests, and delivery preparation | **[testany-eng](plugins/testany-eng/README.md)** | `guide`, or one of the 21 engineering skills |
| Improve a prompt | **[testany-llm](plugins/testany-llm/README.md)** | `prompt-optimizer` with your prompt and intended outcome |
| Write content for different platforms | **[testany-mrkt](plugins/testany-mrkt/README.md)** | `media-writer` with your audience, platform, and goal |
| Author, orchestrate, run, and diagnose tests in Testany | **[testany-bot](plugins/testany-bot/README.md)** | Connect Testany MCP, then choose a case, pipeline, or execution workflow |
| Organize, install, and update local Codex skills / plugins visually | **[SkillDock](plugins/skilldock/README.en.md)** | Install `skilldock`, then open it with `$skill-manager` |

The [skill catalog](README.md#包含的-skills) and detailed plugin documentation are maintained in Chinese. Host-specific capabilities and prerequisites are documented per plugin; SkillDock currently targets Codex on macOS.

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

Replace `testany-eng` with `testany-llm`, `testany-mrkt`, or `testany-bot` to install another plugin. Adding a marketplace only adds its catalog; it does not install every plugin.

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

This installs only `skilldock` and its `skill-manager` entry. You need Git and a Codex CLI with plugin support. The launcher selects or prepares Node.js/npm; installing a global Node.js runtime is not a prerequisite.

After installation, open a new Codex task and ask `$skill-manager` to open the panel. See the [SkillDock product page](plugins/skilldock/README.en.md) for screenshots, first steps, updates, and feedback. Existing users of the old bundled version should follow the [migration instructions](README.md#从旧版-testany-eng-迁移).

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
