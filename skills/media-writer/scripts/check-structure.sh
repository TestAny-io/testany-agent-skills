#!/bin/bash

printf '\n========================================\n'
printf '📂 Checking Workflow Structure...\n'
printf '========================================\n\n'

for dir in workflow/01-topics workflow/02-materials workflow/03-angles workflow/04-drafts workflow/05-candidates workflow/06-finals workflow/07-illustrated; do
    if [ -d "$dir" ]; then
        printf "✅ $dir exists\n"
    else
        printf "❌ $dir missing\n"
    fi
done

printf '\n========================================\n\n'