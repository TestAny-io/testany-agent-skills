# ui-ux-pro-max marketplace regression

Metadata and MIT notice from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill at commit `09170eec67eefd46a7ae85de61b40c194020f997` (2026-10-02 inspection).

The two JSON files are unchanged upstream declarations: root source, duplicate `2.13.0` versions, `strict:false` with no entry component fields, and `skills:"./.claude/skills/"` in plugin.json. Tests generate seven harmless placeholder skills at the upstream directory names; they do not copy or execute the upstream skill instructions or scripts. A separate read-only smoke check can inspect a full upstream checkout.
