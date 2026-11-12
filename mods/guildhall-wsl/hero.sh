#!/bin/bash
# Guildhall: starts Claude Code in WSL with a quest as its first message, read from a file.
# The quest travels in a file because Herdr appends a task to the command line, which breaks the
# quoting of a command that goes through cmd.exe and wsl.exe. A shell stays open afterwards.
#   bash -li hero.sh /mnt/c/.../quest.txt
if [ -n "$1" ] && [ -f "$1" ]; then
  claude "$(cat "$1")"
else
  claude
fi
exec bash -li
