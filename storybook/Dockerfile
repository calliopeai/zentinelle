# The Zentinelle AI console Storybook as a static site, for the private
# storybook-zentinelle app on Astrolift (storybook/astrolift.toml). Builds from
# the repository root, because it needs frontend/:
#
#   docker build -f storybook/Dockerfile -t zentinelle-storybook .
#   docker run --rm -p 8080:8080 zentinelle-storybook

# Build: the same install and Storybook build the Frontend CI job runs.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build-storybook
# Compress once here; nginx serves the .gz files (gzip_static) instead of
# compressing multi-MB bundles on every request under a small CPU limit.
RUN find storybook-static -type f \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.svg' -o -name '*.html' \) -exec gzip -9 -k {} +

# Serve: static files only, nginx as an unprivileged user on 8080.
FROM nginx:1.29
COPY storybook/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/storybook-static /usr/share/nginx/html
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD curl -fsS -o /dev/null http://127.0.0.1:8080/healthz || exit 1
