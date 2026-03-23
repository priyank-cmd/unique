#!/usr/bin/env bash
# Run API + Vite with Node 20+.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib-node20.sh"

nhz_find_node20 "$ROOT" || true
if [[ -z "${NHZ_NODE:-}" ]]; then
  echo ""
  echo "❌ Node.js 20+ required. Current: $(command -v node 2>/dev/null && node --version || echo 'not found')"
  echo ""
  echo "Run:"
  echo "  • nvm install 20 && nvm use 20"
  echo "  • Or: export NHZ_NODE_BIN=/path/to/node20/bin/node"
  echo ""
  exit 1
fi

exec "$NHZ_NODE" node_modules/.bin/concurrently \
  "$NHZ_NODE server.js" \
  "$NHZ_NODE node_modules/.bin/vite"

#!/usr/bin/env bash
# Run API + Vite with Node 20+.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
. "$(dirname "$0")/lib-node20.sh"

nhz_find_node20 "$ROOT" || true
if [[ -z "${NHZ_NODE:-}" ]]; then
  echo ""
  echo "❌ Node.js 20+ is required. On PATH: $(command -v node 2>/dev/null && node --version || echo 'node not found')"
  echo ""
  echo "   nvm (recommended):"
  echo "     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "     # new terminal, then:"
  echo "     cd \"$ROOT\" && nvm install && nvm use && npm run dev"
  echo ""
  echo "   Or: export NHZ_NODE_BIN=/path/to/node20/bin/node"
  echo ""
  exit 1
fi

exec "$NHZ_NODE" node_modules/.bin/concurrently "$NHZ_NODE server.js" "$NHZ_NODE node_modules/.bin/vite"
