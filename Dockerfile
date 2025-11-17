# syntax=docker/dockerfile:1

FROM golang:1.24-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./


RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o conslee ./cmd/conslee

FROM alpine:3.20

RUN apk add --no-cache tzdata

WORKDIR /app

COPY --from=build /app/conslee /usr/local/bin/conslee

COPY ui/dist /app/ui/dist

VOLUME ["/var/run/docker.sock"]

EXPOSE 8800

ENTRYPOINT ["/usr/local/bin/conslee"]
CMD ["-config", "/app/config/config.yml"]
