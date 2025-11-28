# syntax=docker/dockerfile:1

# Stage 1: Build UI
FROM node:20-alpine AS ui-build
WORKDIR /app/ui
COPY ui/package.json ui/package-lock.json ./
RUN npm ci
COPY ui ./
RUN npm run build

# Stage 2: Build Go Binary
FROM golang:1.24-alpine AS backend-build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o conslee ./cmd/conslee

# Stage 3: Final Image
FROM alpine:3.20

RUN apk add --no-cache tzdata

WORKDIR /app

COPY --from=backend-build /app/conslee /usr/local/bin/conslee
COPY --from=ui-build /app/ui/dist /app/ui/dist

VOLUME ["/var/run/docker.sock"]

EXPOSE 8800

ENTRYPOINT ["/usr/local/bin/conslee"]
CMD ["-config", "/app/config/config.yml"]
