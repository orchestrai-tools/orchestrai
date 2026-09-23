---
"warpforge": patch
---

Task copies now live inside the project's `.warpforge` folder instead of a root-level `.worktrees` directory, so they are kept with the project and never show up in `git status` or `git add .`. Your own `.gitignore` and `.git` are untouched. Tasks started by older versions keep their existing copies where they are.
