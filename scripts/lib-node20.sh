#!/usr/bin/env bash
# Shared: find an executable Node.js 20+ binary. Sets NHZ_NODE to full path or empty.
# Usage: source "$(dirname "$0")/lib-node20.sh" && nhz_find_node20 "/path/to/project/root"

nhz_find_node20() {
  NHZ_NODE=""
  local ROOT="${1:-.}"
  ROOT="$(cd "$ROOT" && pwd)"

  if [[ -n "${NHZ_NODE_BIN:-}" && -x "${NHZ_NODE_BIN}" ]]; then
    NHZ_NODE="${NHZ_NODE_BIN}"
    return 0
  fi

  # nvm can break if npm_config_prefix is set to something like /usr
  unset npm_config_prefix

  local nvm_sh=""
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [[ -s "$NVM_DIR/nvm.sh" ]] && nvm_sh="$NVM_DIR/nvm.sh"
  if [[ -z "$nvm_sh" && -s "/usr/local/opt/nvm/nvm.sh" ]]; then
    nvm_sh="/usr/local/opt/nvm/nvm.sh"
    export NVM_DIR="/usr/local/opt/nvm"
  fi

  if [[ -n "$nvm_sh" ]]; then
    # shellcheck source=/dev/null
    . "$nvm_sh"
    pushd "$ROOT" >/dev/null || return 1
    if [[ "${NHZ_AUTO_NVM_INSTALL:-1}" != "0" ]]; then
      if [[ -f .nvmrc ]]; then
        nvm install >/dev/null 2>&1 || true
      else
        nvm install 20 >/dev/null 2>&1 || true
      fi
    fi
    # nvm use MUST run in this shell (not a subshell) so PATH changes apply
    nvm use >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || nvm use 22 >/dev/null 2>&1 || true
    popd >/dev/null || true

    # Prefer nvm's idea of the active node binary
    local p
    p="$(nvm which node 2>/dev/null || true)"
    if [[ -n "$p" && -x "$p" ]]; then
      local major
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        return 0
      fi
    fi
  fi

  # Any v20 / v22 under ~/.nvm (no shell hook)
  shopt -s nullglob
  local dir p major
  for dir in "$HOME/.nvm/versions/node"/v22.* "$HOME/.nvm/versions/node"/v20.*; do
    p="$dir/bin/node"
    if [[ -x "$p" ]]; then
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        shopt -u nullglob
        return 0
      fi
    fi
  done
  shopt -u nullglob

  # fnm fallback
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env 2>/dev/null)" || true
    p="$(command -v node 2>/dev/null || true)"
    if [[ -n "$p" && -x "$p" ]]; then
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        return 0
      fi
    fi
  fi

  # PATH fallback (only if already 20+)
  p="$(command -v node 2>/dev/null || true)"
  if [[ -n "$p" && -x "$p" ]]; then
    major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
    if [[ "${major:-0}" -ge 20 ]]; then
      NHZ_NODE="$p"
      return 0
    fi
  fi

  return 1
}

#!/usr/bin/env bash
# Shared: find an executable Node.js 20+ binary. Sets NHZ_NODE to full path or empty.
# Usage: source "$(dirname "$0")/lib-node20.sh" && nhz_find_node20 "/path/to/project/root"

nhz_find_node20() {
  NHZ_NODE=""
  local ROOT="${1:-.}"
  ROOT="$(cd "$ROOT" && pwd)"
  # Some systems export npm_config_prefix=/usr, which breaks nvm.
  # Clear it only for this process so nvm can select the requested Node version.
  unset npm_config_prefix

  if [[ -n "${NHZ_NODE_BIN:-}" && -x "${NHZ_NODE_BIN}" ]]; then
    NHZ_NODE="${NHZ_NODE_BIN}"
    return 0
  fi

  local major p

  # nvm: must not rely on `command -v node` (system Node 18 may win on PATH)
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  local nvm_sh=""
  [[ -s "$NVM_DIR/nvm.sh" ]] && nvm_sh="$NVM_DIR/nvm.sh"
  [[ -z "$nvm_sh" && -s "/usr/local/opt/nvm/nvm.sh" ]] && nvm_sh="/usr/local/opt/nvm/nvm.sh" && NVM_DIR="/usr/local/opt/nvm"

  if [[ -n "$nvm_sh" ]]; then
    # shellcheck source=/dev/null
    . "$nvm_sh"
    # nvm use MUST run in this shell (not a subshell) or PATH/current version never updates
    pushd "$ROOT" >/dev/null || return 1
    if [[ "${NHZ_AUTO_NVM_INSTALL:-1}" != "0" ]]; then
      if [[ -f .nvmrc ]]; then
        nvm install 2>&1 || true
      else
        nvm install 20 2>&1 || true
      fi
    fi
    nvm use 2>/dev/null || nvm use 20 2>/dev/null || nvm use 22 2>/dev/null || true
    popd >/dev/null || true
    # Prefer nvm's active binary (not `command -v node` — system Node 18 can win on PATH)
    p="$(nvm which node 2>/dev/null || true)"
    if [[ -z "$p" || ! -x "$p" ]]; then
      p="$(nvm which 20 2>/dev/null || nvm which 22 2>/dev/null || true)"
    fi
    if [[ -n "$p" && -x "$p" ]]; then
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        return 0
      fi
    fi
  fi

  # Any v20 / v22 under ~/.nvm (no shell hook)
  shopt -s nullglob
  local dir
  for dir in "$HOME/.nvm/versions/node"/v22.* "$HOME/.nvm/versions/node"/v20.*; do
    p="$dir/bin/node"
    if [[ -x "$p" ]]; then
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        shopt -u nullglob
        return 0
      fi
    fi
  done
  shopt -u nullglob

  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env 2>/dev/null)" || true
    p="$(command -v node 2>/dev/null || true)"
    if [[ -n "$p" ]]; then
      major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
      if [[ "${major:-0}" -ge 20 ]]; then
        NHZ_NODE="$p"
        return 0
      fi
    fi
  fi

  p="$(command -v node 2>/dev/null || true)"
  if [[ -n "$p" ]]; then
    major="$("$p" -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
    if [[ "${major:-0}" -ge 20 ]]; then
      NHZ_NODE="$p"
      return 0
    fi
  fi

  return 1
}
