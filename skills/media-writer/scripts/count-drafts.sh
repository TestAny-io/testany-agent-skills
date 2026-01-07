#!/bin/bash

printf '\n========================================\n'
printf '📝 Draft Statistics\n'
printf '========================================\n\n'

for platform in wechat zhihu xiaohongshu reddit medium linkedin; do
    count=$(find workflow/04-drafts/$platform -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -gt 0 ]; then
        printf "📄 $platform: $count drafts\n"
    fi
done

total=$(find workflow/04-drafts -name '*.md' 2>/dev/null | wc -l | tr -d ' ')
printf "\n📊 Total: $total drafts\n"

printf '\n========================================\n\n'