# Build context is the repo root: the admin imports the shared design tokens from ../design.
FROM node:22-alpine AS build
WORKDIR /src
COPY admin/package.json admin/package-lock.json admin/
RUN cd admin && npm ci
COPY design/ design/
COPY admin/ admin/
RUN cd admin && npm run build

FROM nginx:1.27-alpine
COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/admin/dist /usr/share/nginx/html
