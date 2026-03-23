#!/usr/bin/env bash
# Run a command with Node.js 20+ (see lib-node20.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib-node20.sh"

nhz_find_node20 "$ROOT" || true
if [[ -z "${NHZ_NODE:-}" ]]; then
  echo ""
  echo "❌ Node.js 20+ is required, but a 20+ binary was not found."
  echo "On PATH: $(command -v node 2>/dev/null || true) -> $(node --version 2>/dev/null || true)"
  echo ""
  echo "Install Node 20 (fast options):"
  echo "  • nvm install 20 && nvm use 20"
  echo "  • Or: export NHZ_NODE_BIN=/path/to/node20/bin/node"
  echo ""
  exit 1
fi

exec "$NHZ_NODE" "$@"

#!/usr/bin/env bash
# Run a command with Node.js 20+ (see lib-node20.sh).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib-node20.sh"

nhz_find_node20 "$ROOT" || true
if [[ -z "${NHZ_NODE:-}" ]]; then
  echo ""
  echo "❌ Node.js 20+ is required. On PATH: $(command -v node 2>/dev/null && node --version || echo 'node not found')"
  echo ""
  echo "   Install Node 20, then retry:"
  echo "   • nvm:  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "           (open a new terminal, then)  cd \"$ROOT\" && nvm install && nvm use"
  echo "   • Or set: export NHZ_NODE_BIN=/path/to/node20/bin/node"
  echo ""
  echo "   To skip auto-download: export NHZ_AUTO_NVM_INSTALL=0"
  echo ""
  exit 1
fi

exec "$NHZ_NODE" "$@"
