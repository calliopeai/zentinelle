FROM golang:1.22-bookworm AS build

# The version the gateway reports in its startup log and cluster heartbeat.
ARG VERSION=dev

WORKDIR /src
COPY go.mod ./
COPY *.go ./

# Build a statically-linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.version=${VERSION}" -o /gateway .

# ---
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /gateway /gateway

EXPOSE 8742

ENTRYPOINT ["/gateway"]
