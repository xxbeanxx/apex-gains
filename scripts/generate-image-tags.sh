#!/usr/bin/env bash
set -euo pipefail

# Computes the container image tags used across the build workflow, so the
# same date-sha-timestamp scheme backs the pushed image, the deploy job's
# `az containerapp update --image`, and a local `podman build`.
#
# REPOSITORY, when unset, is derived from the git remote so the script also
# works outside CI (GitHub Actions sets it to `owner/repo`). GITHUB_SHA,
# when unset, falls back to the currently checked-out commit.
#
# Prints GITHUB_OUTPUT-style `key=value` lines to stdout - nothing else, so
# the output can be redirected straight into `$GITHUB_OUTPUT` or captured
# with `eval "$(...)"`. Informational messages go to stderr instead.

REPOSITORY="${REPOSITORY:-$(git remote get-url origin | sed -E 's#.*[:/]([^/]+/[^/.]+)(\.git)?$#\1#')}"
COMMIT_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"

# 8-digit date in UTC (e.g. 20260901)
DATE=$(date --utc +'%Y%m%d')

# 8-character commit SHA of what was actually checked out
SHA="${COMMIT_SHA:0:8}"

# Lowercase image repository name for GHCR
IMAGE_NAME=$(echo "ghcr.io/${REPOSITORY}" | tr '[:upper:]' '[:lower:]')

# 8-character hex Unix timestamp (e.g. 66d5e2c0). Same width as the SHA
# segment, and sorts correctly as a string until the epoch exceeds
# 0xffffffff (year 2106).
BUILD_NUM=$(printf '%08x' "$(date -u +%s)")

# Tag format: date-sha-timestamp (e.g. 20260901-abcd1234-66d5e2c0)
VERSION_TAG="${DATE}-${SHA}-${BUILD_NUM}"

{
  echo "Image tags generated:"
  echo "  - Version: ${IMAGE_NAME}:${VERSION_TAG}"
  echo "  - Latest:  ${IMAGE_NAME}:latest"
} >&2

echo "version_tag=${VERSION_TAG}"
echo "image_name=${IMAGE_NAME}"
echo "full_version_tag=${IMAGE_NAME}:${VERSION_TAG}"
echo "full_latest_tag=${IMAGE_NAME}:latest"
