---
name: commit
description: Create a well-formatted git commit
when_to_use: When the user asks to commit code changes
allowed_tools: Bash, Read
arguments: message
---

Please help me create a git commit:

1. First run `git status` and `git diff --cached` to see staged changes
2. If nothing is staged, run `git diff` to see unstaged changes and suggest what to stage
3. Generate a concise, conventional commit message based on the changes
4. User's note: {{ message }}
5. Execute the commit with the generated message
