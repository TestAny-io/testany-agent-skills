#!/bin/bash

printf '\n========================================\n'
printf '📊 Workflow Status Overview\n'
printf '========================================\n\n'

printf '📌 Topics: '
find workflow/01-topics -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '📚 Materials: '
find workflow/02-materials -type f 2>/dev/null | wc -l | tr -d ' '

printf '🎯 Angles: '
find workflow/03-angles -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '📝 Drafts: '
find workflow/04-drafts -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '✨ Candidates: '
find workflow/05-candidates -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '✅ Finals: '
find workflow/06-finals -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '🎨 Illustrated: '
find workflow/07-illustrated -name '*.md' 2>/dev/null | wc -l | tr -d ' '

printf '\n========================================\n\n'