# The Zentinelle AI console Storybook as a static site, for the private
# storybook-zentinelle app on Astrolift (storybook/astrolift.toml). Builds from
# the repository root, because it needs frontend/:
#
#   docker build -f storybook/Dockerfile -t zentinelle-storybook .
#   docker run --rm -p 8080:8080 zentinelle-storybook

# Build: the same install and Storybook build the Frontend CI job runs.
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build-storybook

# Serve: static files only, nginx as an unprivileged user on 8080.
FROM nginx:1.29-alpine
COPY storybook/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/storybook-static /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
