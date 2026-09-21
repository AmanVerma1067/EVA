#!/usr/bin/env bash
# EVA Distribution Packaging Script
# Conforms to Sections 4, 5, 28, 29 of EVA Product Architecture, Distribution & Launch Spec
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "==> EVA Release Packaging"
cd "${ROOT_DIR}"

# 1. Platform Guard Check
UNAME_S="$(uname -s)"
case "${UNAME_S}" in
  Darwin*)  PLATFORM="darwin" ;;
  Linux*)   PLATFORM="linux" ;;
  CYGWIN*|MINGW*|MSYS*|Windows*)
    echo "ERROR: Unsupported platform: Windows. EVA requires macOS or Linux." >&2
    exit 1
    ;;
  *)
    echo "ERROR: Unsupported platform: ${UNAME_S}." >&2
    exit 1
    ;;
esac

UNAME_M="$(uname -m)"
case "${UNAME_M}" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="x64" ;;
  *)
    echo "ERROR: Unsupported architecture: ${UNAME_M}." >&2
    exit 1
    ;;
esac

# 2. Build TypeScript and compile dist
echo "==> Compiling TypeScript artifacts..."
npm run build

# 3. Read package version
VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="${ROOT_DIR}/dist/release"
mkdir -p "${RELEASE_DIR}"

TARBALL_NAME="eva-v${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
TARBALL_PATH="${RELEASE_DIR}/${TARBALL_NAME}"

echo "==> Packaging ${TARBALL_NAME}..."

# Bundle required artifacts
tar -czf "${TARBALL_PATH}" \
  --exclude='dist/release' \
  bin dist package.json README.md

# 4. Generate SHA256SUMS
echo "==> Generating SHA256 checksum..."
cd "${RELEASE_DIR}"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${TARBALL_NAME}" > SHA256SUMS
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${TARBALL_NAME}" > SHA256SUMS
else
  openssl dgst -sha256 "${TARBALL_NAME}" | awk '{print $NF "  " "'"${TARBALL_NAME}"'"}' > SHA256SUMS
fi

# 5. Generate Build Metadata & SBOM Manifest (Section 28)
echo "==> Generating build metadata and SBOM manifest..."
SHA256=$(cat SHA256SUMS | awk '{print $1}')
cat <<EOF > build-metadata.json
{
  "name": "eva-agent",
  "version": "${VERSION}",
  "platform": "${PLATFORM}",
  "arch": "${ARCH}",
  "releaseChannel": "stable",
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "tarball": "${TARBALL_NAME}",
  "sha256": "${SHA256}",
  "components": [
    "core/orchestrator",
    "core/planner",
    "core/providers",
    "core/health",
    "core/distribution",
    "security/permissions",
    "security/pairing",
    "security/policy",
    "security/audit",
    "voice"
  ]
}
EOF

echo "==> Package complete:"
echo "    Tarball:  ${TARBALL_PATH}"
echo "    Checksum: ${SHA256}"
echo "    Metadata: ${RELEASE_DIR}/build-metadata.json"
