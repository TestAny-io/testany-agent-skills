#!/bin/bash

printf '\n========================================\n'
printf '📋 Checking Prompt Files...\n'
printf '========================================\n\n'

printf '=== Core Agents ===\n'
for file in prompts/00-orchestrator.md prompts/01-topic-scout.md prompts/02-researcher.md prompts/03-strategist.md; do
    if [ -f "$file" ]; then
        printf "✅ $(basename $file)\n"
    else
        printf "❌ $(basename $file) missing\n"
    fi
done

printf '\n=== Writers ===\n'
for file in prompts/04-writer-*.md; do
    if [ -f "$file" ]; then
        printf "✅ $(basename $file)\n"
    fi
done

printf '\n=== Editors ===\n'
for file in prompts/05-selector.md prompts/06-logic-editor.md prompts/06-style-editor.md prompts/06-detail-editor.md; do
    if [ -f "$file" ]; then
        printf "✅ $(basename $file)\n"
    else
        printf "❌ $(basename $file) missing\n"
    fi
done

printf '\n=== Illustrator ===\n'
if [ -f 'prompts/07-illustrator.md' ]; then
    printf '✅ 07-illustrator.md\n'
else
    printf '❌ 07-illustrator.md missing\n'
fi

printf '\n========================================\n\n'