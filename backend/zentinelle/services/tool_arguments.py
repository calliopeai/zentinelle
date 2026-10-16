"""Argument-aware tool rules: what a tool call's command and paths are (#384).

Agent hosts send a call's arguments as `context.tool_input`; older callers
send `context.tool_args`. A tool_permission policy names argument rules per
tool, under the tool's name as the harness calls it:

    "tool_configs": {
        "Bash": {"blocked_commands": ["rm -rf *"],
                 "allowed_commands": ["npm test", "npm run *", "git status"]},
        "Write": {"allowed_paths": ["/workspace"], "blocked_paths": ["/workspace/.git"]}
    }

Commands come from `command` or `cmd` (a string, or an argv list as Codex
sends). The command is split into simple commands at `;`, `&&`, `||`, `|`,
`&`, newlines, parentheses, backticks and `$(`, and the script of `sh -c`,
`bash -lc` and the like, or of `eval`, is split the same way. Quotes and
escapes are removed and whitespace collapsed, then each simple command is
matched against glob patterns (`*` matches anything, spaces included; case
matters).

- A blocked pattern refuses the call if it matches any simple command, or the
  tail of one from any word on, so `rm -rf *` also catches `sudo rm -rf /`.
  It matches text, not meaning: `rm -fr /` or a command built from variables
  is a different text. Use blocked patterns as a guard.
- With allowed patterns, every simple command must match one in full. This is
  the boundary: anything not listed is refused. For them the command is read
  as a shell reads it: only unquoted newlines, backticks and `$(` separate,
  and what this reader could read differently from a shell is refused
  (command substitution, or a backslash before `$`, a backtick or a newline,
  inside double quotes; `$'...'` quoting; here-documents).
- A command that cannot be read (unbalanced quotes, nesting deeper than
  MAX_DEPTH) is refused.

Paths come from `file_path`, `path`, `notebook_path`, `paths` and the file
headers of an `apply_patch` patch. A relative path is resolved against the
call's `workdir`/`cwd` argument or `context.cwd`; one that cannot be
resolved is refused where a rule names absolute paths. A path is inside a listed
path when it is that path or below it after `.` and `..` are resolved;
symbolic links cannot be seen from here. Every path in the call must be
inside an allowed path, and none inside a blocked one.

A tool with command or path rules whose call carries no command or path is
refused: there is nothing to check, so the rule cannot pass it.
"""
import posixpath
import re
import shlex
from fnmatch import fnmatchcase
from typing import Any, Dict, Iterable, List, Optional, Tuple

MAX_DEPTH = 4
MAX_COMMAND_LENGTH = 100_000
COMMAND_KEYS = ('command', 'cmd')
PATH_KEYS = ('file_path', 'path', 'notebook_path')
CWD_KEYS = ('workdir', 'cwd')
SHELLS = frozenset({'sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'mksh'})
# Reserved words that open a compound command; the command follows them.
LEADING_WORDS = frozenset({'{', '}', '!', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done',
                           'while', 'until', 'time', 'case', 'esac', 'select'})
SHLEX_PUNCTUATION = frozenset('();<>|&')
SEPARATOR_CHARS = frozenset(';|()')
# Hunk headers; leading whitespace allowed, as Codex trims each line.
PATCH_HEADER = re.compile(r'^\s*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$', re.M)


class Unreadable(ValueError):
    """The command cannot be split reliably, so no rule can pass it."""


def _shell_text(command: str) -> str:
    """`command` with its unquoted newlines, backticks and `$(` made separators.

    For allowed patterns: quoted text is kept as the shell keeps it, so the
    script of `sh -c '...'` reaches the next level whole. What shlex would
    read differently from a shell is refused, never guessed.
    """
    out: List[str] = []
    quote = None
    index = 0
    while index < len(command):
        char = command[index]
        pair = command[index:index + 2]
        if quote == "'":
            quote = None if char == "'" else quote
        elif quote == '"':
            if char == '`' or pair == '$(':
                raise Unreadable('command substitution inside double quotes cannot be checked')
            if char == '\\' and pair[1:] in ('$', '`', '\n', '\r'):
                raise Unreadable('escapes inside double quotes cannot be checked')
            if char == '\\':
                out.append(pair)
                index += 2
                continue
            quote = None if char == '"' else quote
        elif char == '\\':
            out.append(pair)
            index += 2
            continue
        elif pair == "$'":
            raise Unreadable("$'...' quoting cannot be checked")
        elif char in '\'"':
            quote = char
        elif char in '\r\n`':
            out.append(' ; ')
            index += 1
            continue
        elif pair == '$(':
            out.append(' ( ')
            index += 2
            continue
        out.append(char)
        index += 1
    return ''.join(out)


def _tokens(command: str, strict: bool = False) -> List[str]:
    if strict:
        text = _shell_text(command)
    else:
        # Newlines and backticks separate commands; `$(` opens one. Rewriting
        # them inside quotes too makes the split finer for blocked patterns.
        text = command.replace('\r', '\n').replace('\n', ' ; ').replace('`', ' ; ').replace('$(', ' ( ')
    lexer = shlex.shlex(text, posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    # bash starts a comment only at the start of a word; shlex would also cut
    # `a#; rm -rf /` at the `#` and hide the rest. Keep every character.
    lexer.commenters = ''
    try:
        tokens = list(lexer)
    except ValueError as exc:
        raise Unreadable(f'command cannot be parsed: {exc}') from exc
    if strict and any(token.startswith('<<') and not token.startswith('<<<') for token in tokens):
        raise Unreadable('here-documents cannot be checked')
    return tokens


def _is_separator(token: str) -> bool:
    # `;`, `|`, `&&`, `|&`, parentheses, and `<(` `>(` (process substitution
    # runs a command); `>&` and `&>` are redirections.
    chars = set(token)
    return bool(token) and chars <= SHLEX_PUNCTUATION and (bool(chars & SEPARATOR_CHARS) or chars == {'&'})


def _shell_script(words: List[str]) -> Optional[Tuple[str, ...]]:
    """The script of `sh -c SCRIPT` or `eval ARGS`, or None for any other command."""
    if not words:
        return None
    head = posixpath.basename(words[0])
    if head == 'eval':
        return (' '.join(words[1:]),)
    if head not in SHELLS:
        return None
    for index, word in enumerate(words[1:], start=1):
        if word.startswith('--'):
            continue
        if not word.startswith('-'):
            return None
        if 'c' in word[1:]:
            if index + 1 >= len(words):
                raise Unreadable(f'{head} -c without a script')
            return (words[index + 1],)
    return None


def simple_commands(command: str, depth: int = 0, strict: bool = False) -> List[str]:
    """Each simple command in `command`, quotes removed and words joined by one space.

    `strict` reads it as a shell would, for allowed patterns (see _shell_text).
    """
    if depth > MAX_DEPTH:
        raise Unreadable('commands nest too deeply to check')
    if len(command) > MAX_COMMAND_LENGTH:
        raise Unreadable('command is too long to check')
    segments: List[List[str]] = [[]]
    for token in _tokens(command, strict):
        if _is_separator(token):
            segments.append([])
        else:
            segments[-1].append(token)
    found: List[str] = []
    for words in segments:
        while words and words[0] in LEADING_WORDS:
            words = words[1:]
        if not words:
            continue
        script = _shell_script(words)
        if script is not None:
            for inner in script:
                found.extend(simple_commands(inner, depth + 1, strict))
            continue
        found.append(' '.join(words))
    return found


def _command_texts(arguments: Any) -> List[str]:
    """Every command the call carries: a call with both `command` and `cmd` passes with each."""
    if isinstance(arguments, str):
        return [arguments]
    if not isinstance(arguments, dict):
        return []
    texts = []
    for key in COMMAND_KEYS:
        value = arguments.get(key)
        if isinstance(value, str):
            texts.append(value)
        elif isinstance(value, list) and value and all(isinstance(item, str) for item in value):
            texts.append(shlex.join(value))
    return texts


def _patterns(config: Dict[str, Any], key: str) -> List[str]:
    value = config.get(key) or []
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise Unreadable(f'{key} must be a list of strings')
    return value


def check_command(tool: str, config: Dict[str, Any], arguments: Any) -> Optional[str]:
    """Why the call's command breaks the tool's command rules, or None if it does not."""
    blocked = _patterns(config, 'blocked_commands')
    allowed = _patterns(config, 'allowed_commands')
    if not blocked and not allowed:
        return None
    texts = _command_texts(arguments)
    if not texts:
        return f"Tool '{tool}' has command rules but the call carries no command"
    for text in texts:
        commands = simple_commands(text)
        if not commands:
            return f"Tool '{tool}' has command rules but the call carries no command"
        for command in commands:
            words = command.split(' ')
            tails = [' '.join(words[index:]) for index in range(len(words))]
            for pattern in blocked:
                if any(fnmatchcase(tail, pattern) for tail in tails):
                    return f"Tool '{tool}' command '{command[:200]}' matches blocked pattern '{pattern}'"
        if not allowed:
            continue
        commands = simple_commands(text, strict=True)
        if not commands:
            return f"Tool '{tool}' has command rules but the call carries no command"
        for command in commands:
            if not any(fnmatchcase(command, pattern) for pattern in allowed):
                return f"Tool '{tool}' command '{command[:200]}' is not in the allowed commands"
    return None


def _cwd(arguments: Any, context: Dict[str, Any]) -> Optional[str]:
    candidates: Iterable[Any] = [arguments.get(key) for key in CWD_KEYS] if isinstance(arguments, dict) else []
    for value in [*candidates, context.get('cwd')]:
        if isinstance(value, str) and value.startswith('/'):
            return value
    return None


def _paths(arguments: Any) -> List[str]:
    found: List[str] = []
    texts: List[str] = []
    if isinstance(arguments, str):
        texts.append(arguments)
    elif isinstance(arguments, dict):
        for key in PATH_KEYS:
            if isinstance(arguments.get(key), str):
                found.append(arguments[key])
        if isinstance(arguments.get('paths'), list):
            found.extend(item for item in arguments['paths'] if isinstance(item, str))
        texts.extend(arguments[key] for key in ('input', 'patch') if isinstance(arguments.get(key), str))
    for text in texts:
        if '*** Begin Patch' in text:
            headers = PATCH_HEADER.findall(text)
            if not headers:
                # Never fall back to the working directory for a patch.
                raise Unreadable('the patch names no file this can read')
            found.extend(headers)
    return found


def _resolve(path: str, cwd: Optional[str]) -> str:
    if not path.startswith('/') and cwd:
        path = posixpath.join(cwd, path)
    return posixpath.normpath(path)


def _inside(path: str, prefix: str) -> bool:
    """`path` is `prefix` or below it, both resolved."""
    base = posixpath.normpath(prefix)
    if path.startswith('/') != base.startswith('/'):
        return False
    if base == '.':
        return path != '..' and not path.startswith('../')
    return path == base or base == '/' or path.startswith(base + '/')


def check_paths(tool: str, config: Dict[str, Any], arguments: Any, context: Dict[str, Any]) -> Optional[str]:
    """Why the call's paths break the tool's path rules, or None if they do not."""
    blocked = _patterns(config, 'blocked_paths')
    allowed = _patterns(config, 'allowed_paths')
    if not blocked and not allowed:
        return None
    cwd = _cwd(arguments, context)
    raw_paths = _paths(arguments) or ([cwd] if cwd else [])
    if not raw_paths:
        return f"Tool '{tool}' has path rules but the call carries no path"
    for raw in raw_paths:
        path = _resolve(raw, cwd)
        if not path.startswith('/') and any(prefix.startswith('/') for prefix in blocked):
            return f"File path '{raw[:500]}' is relative and the call does not say where it runs"
        for prefix in blocked:
            # The raw prefix test is the rule's older reading; keep it so no
            # path it blocked gets through.
            if raw.startswith(prefix) or _inside(path, prefix):
                return f"File path '{raw[:500]}' is in blocked paths"
        if allowed and not any(_inside(path, prefix) for prefix in allowed):
            return f"File path '{raw[:500]}' is not in allowed paths"
    return None
