# Containerfile for building the Apex Gains application.
#
# Both Vite builds inline every dependency (`resolve.noExternal`), so the
# build output needs no node_modules at runtime - see README.md "Build
# output" for why the final image ships only `build/` and `package.json`.
#
# Build arguments with default values for build metadata:
#   - VERSION_TAG: date-sha-timestamp identifying the build (default: "dev").
#
# Example build and run commands:
#
#   $ podman build . --tag apex-gains --file containerfile \
#       --build-arg VERSION_TAG="$(date -u +%Y%m%d)-$(git rev-parse --short=8 HEAD)-$(printf '%08x' "$(date -u +%s)")"
#
#   $ podman run --rm --publish 3000:3000 \
#       --env DATABASE_URL --env SESSION_SECRET \
#       --env GOOGLE_CLIENT_ID --env GOOGLE_CLIENT_SECRET \
#       --name apex-gains apex-gains
#

# ---------------------------------------------------------------------------- #

# Stage: Base image
# Provides the Node.js runtime shared by the build and final stages. The
# alpine variant keeps the production image small.
FROM docker.io/library/node:24.20.0-bookworm AS base

# ---------------------------------------------------------------------------- #

# Stage: Build
# Installs dependencies and compiles the application and server runtime -
# `build/` is the only output the final stage needs.
FROM base AS build

WORKDIR /home/node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node ./ ./

USER node
RUN npm run build

# ---------------------------------------------------------------------------- #

# Stage: Final Production Image
# The final image is optimized for running the application in production. It
# contains only the build output and its package.json - no node_modules, no
# source - since both Vite builds inline their own dependencies.
FROM base AS final

ARG VERSION_TAG="dev"
ARG IMAGE_AUTHORS="Greg Baker"
ARG IMAGE_DESCRIPTION="Apex Gains -- personal workout tracker"
ARG IMAGE_TITLE="apex-gains"
ARG IMAGE_URL="https://github.com/xxbeanxx/apex-gains"

# .github/workflows/build.yaml builds with a registry --cache-from/--cache-to,
# and that cache doesn't invalidate ENV/LABEL-only layers just because their
# ARG value changed - without this RUN, a build can silently reuse a stale
# VERSION_TAG baked by an earlier build. RUN's cache key does include the
# resolved command text, so this forces every layer below to rebuild whenever
# VERSION_TAG differs.
RUN echo "Building version ${VERSION_TAG}"

ENV VERSION_TAG=${VERSION_TAG}
ENV NODE_ENV=production
ENV PORT=3000

# OCI labels describe the image build and support interoperability with registries.
# See: https://github.com/opencontainers/image-spec/blob/main/annotations.md
LABEL org.opencontainers.image.authors=${IMAGE_AUTHORS}
LABEL org.opencontainers.image.description=${IMAGE_DESCRIPTION}
LABEL org.opencontainers.image.title=${IMAGE_TITLE}
LABEL org.opencontainers.image.url=${IMAGE_URL}
LABEL org.opencontainers.image.version=${VERSION_TAG}

WORKDIR /home/node
COPY --chown=node:node ./package.json ./
COPY --from=build --chown=node:node /home/node/build/ ./build/

USER node
CMD ["node", "./build/server/main.js"]

EXPOSE 3000
