FROM node:24-alpine AS build-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:24-alpine AS production-dependencies-env
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY ./package.json package-lock.json tsconfig.json ./
COPY --from=production-dependencies-env /app/node_modules ./node_modules
COPY ./server ./server
# server/ imports repositories, services, and domain code directly from
# app/ (unbundled - tsx runs server/ as source, not through Vite), so the
# app/ source tree has to ship alongside it, not just the built build/
# output the old plain-Express server.ts only ever needed.
COPY ./app ./app
COPY --from=build-env /app/build ./build
ARG VERSION_TAG
ENV VERSION_TAG=$VERSION_TAG
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
