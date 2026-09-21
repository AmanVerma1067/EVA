#!/usr/bin/env bash
# EVA Distribution Installer Script
# Conforms to Sections 3, 4, 5, 28 of EVA Product Architecture, Distribution & Launch Spec
set -euo pipefail

echo "================================================================"
echo "          EVA — Private AI Operating Layer Installer            "
echo "================================================================"

# 1. Platform Detection & Early Windows Rejection (Section 3 & 4)
OS="$(uname -s)"
case "${OS}" in
  Darwin*)
    PLATFORM="darwin"
    PLATFORM_NAME="macOS"
    ;;
  Linux*)
    PLATFORM="linux"
    PLATFORM_NAME="Linux"
    ;;
  CYGWIN*|MINGW*|MSYS*|Windows*)
    echo ""
    echo "❌ ERROR: Unsupported Operating System: Windows."
    echo "EVA requires native POSIX architecture, macOS APIs, or Linux system interfaces."
    echo "Supported platforms:"
    echo "  • macOS (Apple Silicon arm64, Intel x86_64)"
    echo "  • Linux (x86_64, aarch64)"
    echo ""
    exit 1
    ;;
  *)
    echo "❌ ERROR: Unsupported platform: ${OS}."
    exit 1
    ;;
esac

ARCH="$(uname -m)"
case "${ARCH}" in
  arm64|aarch64)
    ARCH_NAME="arm64"
    ;;
  x86_64|amd64)
    ARCH_NAME="x64"
    ;;
  *)
    echo "❌ ERROR: Unsupported CPU architecture: ${ARCH}."
    exit 1
    ;;
esac

echo "✓ Detected platform: ${PLATFORM_NAME} (${ARCH_NAME})"

# 2. Dependency Checks (Section 4 & 25)
if ! command -v node >/dev/null 2>&1; then
  echo "❌ ERROR: Node.js is required but not installed."
  echo "Please install Node.js v20 or later from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo "❌ ERROR: Node.js version 20 or higher is required. Found v$(node -v)."
  exit 1
fi
echo "✓ Node.js $(node -v) detected"

# 3. Determine Installation Source and Destination
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "${INSTALL_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# If running from cloned source repository
if [ -f "${REPO_DIR}/package.json" ] && [ -f "${REPO_DIR}/bin/eva" ]; then
  echo "==> Installing from local repository: ${REPO_DIR}"
  cd "${REPO_DIR}"
  if [ ! -d "${REPO_DIR}/dist" ]; then
    echo "==> Compiling TypeScript..."
    npm run build
  fi
  chmod +x "${REPO_DIR}/bin/eva"
  ln -sf "${REPO_DIR}/bin/eva" "${INSTALL_DIR}/eva"
  echo "✓ Linked ${INSTALL_DIR}/eva -> ${REPO_DIR}/bin/eva"
fi

# 4. Check if INSTALL_DIR is in PATH
if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo ""
  echo "⚠️  NOTE: ${INSTALL_DIR} is not in your current PATH."
  echo "   Add it by putting this in your ~/.zshrc or ~/.bashrc:"
  echo "   export PATH=\"\${HOME}/.local/bin:\$PATH\""
  echo ""
fi

# 5. Run first-run setup
echo "==> Running EVA workspace initialization..."
"${INSTALL_DIR}/eva" setup

# 6. Run doctor diagnostics
echo "==> Running health check..."
"${INSTALL_DIR}/eva" doctor

echo ""
echo "================================================================"
echo "          ✓ EVA Installation & Verification Complete!           "
echo "================================================================"
echo "To get started:"
echo "  • Run 'eva' to launch the interactive voice & text agent shell"
echo "  • Run 'eva doctor' to verify system health"
echo "  • Run 'eva status' to inspect storage and AI connectivity"
echo "  • Run 'eva --help' to see all available CLI commands"
echo ""
