FROM node:24-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:24-alpine
COPY ./package.json package-lock.json tsconfig.json /app/
COPY ./server /app/server
# server/ imports repositories, services, and domain code directly from
# app/ (unbundled - tsx runs server/ as source, not through Vite), so the
# app/ source tree has to ship alongside it, not just the built build/
# output the old plain-Express server.ts only ever needed.
COPY ./app /app/app
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
