#!/usr/bin/env bash
set -euo pipefail

# Builds the container image with Podman, tagged with both the versioned
# and floating `latest` tags.
#
# Usage: scripts/build-image.sh [version_tag] [full_version_tag] [full_latest_tag]
#
# build.yaml passes all three, taken from the "Generate image tags" step's
# outputs, so the tag it builds is the one already recorded as the job's
# `image_tag` output. Run with no arguments to build locally against a
# freshly generated tag.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION_TAG="${1:-}"
FULL_VERSION_TAG="${2:-}"
FULL_LATEST_TAG="${3:-}"

if [ -z "$VERSION_TAG" ] || [ -z "$FULL_VERSION_TAG" ] || [ -z "$FULL_LATEST_TAG" ]; then
  eval "$("$SCRIPT_DIR/generate-image-tags.sh")"
  VERSION_TAG="$version_tag"
  FULL_VERSION_TAG="$full_version_tag"
  FULL_LATEST_TAG="$full_latest_tag"
fi

echo "Building ${FULL_VERSION_TAG} (also tagged ${FULL_LATEST_TAG})" >&2

podman build \
  --file "$REPO_ROOT/containerfile" \
  --build-arg VERSION_TAG="${VERSION_TAG}" \
  --tag "${FULL_VERSION_TAG}" \
  --tag "${FULL_LATEST_TAG}" \
  "$REPO_ROOT"
