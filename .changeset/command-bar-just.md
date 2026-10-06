---
"warpforge-desktop": minor
"orchestrai-desktop": minor
---

The command bar at the bottom of the sidebar now knows your project's justfile, package scripts, and Makefile. Just recipes come first, sorted into their justfile groups, with each recipe's description, its aliases, and the default recipe marked. Recipes in modules are listed too. A recipe that takes parameters asks for them before it runs, showing the exact command, and a recipe marked to confirm asks you first. Dev servers, watchers, and other long-running commands open in a terminal tab instead of being cut off after 30 seconds. Shift-Return runs any command the other way, and a command that runs out of time offers a terminal instead. Package scripts use your project's package manager, and Makefile targets show their `##` descriptions. The same commands are in the command palette under Run. Without just installed, recipes are still listed from the justfile, and the bar suggests installing it for the full detail.
