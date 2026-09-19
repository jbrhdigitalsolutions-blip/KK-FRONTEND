# Coding-agent adapter

KK-FRONTEND does not silently choose or install an AI coding agent.

To enable automated implementation, configure:

```text
KK_FRONTEND_AGENT_COMMAND=<executable>
KK_FRONTEND_AGENT_ARGS_JSON=["arg1","arg2","{taskFile}","{projectRoot}"]
```

Placeholders:
- `{taskFile}` — generated `AGENT-TASK.md`
- `{projectRoot}` — isolated Git worktree

The command is spawned directly without a shell. The original project remains unchanged.
