#!/usr/bin/env bash

# Get all staged files
staged_files=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|jsx|ts|tsx)$')

if [[ -z "$staged_files" ]]; then
  exit 0
fi

# Check for .only in Jest or Cypress test files
only_pattern="(describe|it|test|context|cy)\.only\("
found_only=false

for file in $staged_files; do
  # Check if file has .only
  if grep -E "$only_pattern" "$file" > /dev/null; then
    echo "Error: Found .only in $file"
    echo "Please remove all instances of .only before committing"
    found_only=true
  fi
done

if [[ "$found_only" = true ]]; then
  exit 1
fi

exit 0