# Build context is the repo root: the demo depends on the SDK in ../sdk and the design tokens in ../design.
FROM node:22-alpine AS build
WORKDIR /src
COPY sdk/package.json sdk/
COPY demo/package.json demo/package-lock.json demo/
RUN cd demo && npm ci
COPY sdk/tsconfig.json sdk/
COPY sdk/src sdk/src
COPY design/ design/
COPY demo/ demo/
ARG VITE_SDK_KEY_DEV
ARG VITE_SDK_KEY_PROD
RUN cd demo && npm run build

FROM nginx:1.27-alpine
COPY demo/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/demo/dist /usr/share/nginx/html
