FROM golang:1.22-alpine AS build

# The version the gateway reports in its startup log and cluster heartbeat.
ARG VERSION=dev

WORKDIR /src
COPY go.mod ./
COPY *.go ./

# Build a statically-linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w -X main.version=${VERSION}" -o /gateway .

# ---
FROM alpine:3.19

RUN apk add --no-cache ca-certificates

COPY --from=build /gateway /gateway

EXPOSE 8742

ENTRYPOINT ["/gateway"]
