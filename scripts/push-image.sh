#!/usr/bin/env bash
set -euo pipefail

# Pushes both tags built by scripts/build-image.sh to their registry.
# Requires an authenticated registry session (`podman login`).
#
# Usage: scripts/push-image.sh <full_version_tag> <full_latest_tag>
#
# Both tags are required rather than defaulted: unlike build-image.sh,
# regenerating them here would mint a timestamp that doesn't match any
# image actually built, so build.yaml passes the exact tags its "Generate
# image tags" step already produced.

FULL_VERSION_TAG="${1:?usage: push-image.sh <full_version_tag> <full_latest_tag>}"
FULL_LATEST_TAG="${2:?usage: push-image.sh <full_version_tag> <full_latest_tag>}"

podman push "${FULL_VERSION_TAG}"
podman push "${FULL_LATEST_TAG}"
