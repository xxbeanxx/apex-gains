FROM node:24-alpine AS build-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
# The build output is the whole application: `vite.server.config.ts` inlines
# every dependency into build/server/main.js and `react-router build` does the
# same for build/server/index.js, so nothing here resolves a bare import at
# runtime and the image needs no node_modules. package.json comes along for its
# `"type": "module"` - without it node reads the bundles' ESM syntax as CommonJS.
COPY ./package.json ./
COPY --from=build-env /app/build ./build
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# `node` rather than `npm run start`: that script shells out to cross-env, which
# is one of the dependencies this image deliberately doesn't ship.
CMD ["node", "./build/server/main.js"]
