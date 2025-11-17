<div align="center">
  <img src="ui/src/assets/conslee-logo.svg" alt="Conslee Logo" width="400">
</div>

# Conslee

Conslee is a Docker container management system that automatically starts and stops containers based on demand, schedules, or both. It acts as a reverse proxy layer that monitors traffic and manages container lifecycles efficiently.

## What is Conslee for?

Conslee solves the problem of resource waste from running Docker containers that are only needed occasionally. Instead of keeping containers running 24/7, Conslee intelligently manages their lifecycle:

- **Save Resources**: Stop containers when they're not in use, reducing CPU, memory, and power consumption
- **Cost Efficiency**: Lower infrastructure costs by only running services when needed
- **Automated Management**: No manual intervention required - containers start automatically when accessed and stop after idle periods
- **Flexible Scheduling**: Run services on specific schedules (e.g., business hours, weekdays only) to match your actual usage patterns
- **Seamless Experience**: Users don't notice the difference - containers start quickly when accessed, providing a transparent experience

Whether you're running development environments, staging servers, internal tools, or any containerized service that doesn't need to be always-on, Conslee helps you optimize resource usage while maintaining availability when needed.

## Features

- **On-Demand Mode**: Automatically start containers when the first HTTP request arrives (when someone accesses the service) and stop them after idle timeout
- **Schedule Mode**: Run containers on specific days and time windows
- **Both Modes**: Combine on-demand and scheduled operation
- **Health Checks**: Optional health check paths to verify service readiness
- **Web UI**: Modern, responsive web interface for managing services
- **Multi-language Support**: Available in multiple languages
- **Docker Integration**: Seamless integration with Docker containers and stacks

## Installation

### Prerequisites

- Docker and Docker Compose installed
- Access to Docker socket (`/var/run/docker.sock`)
- A reverse proxy (nginx, Apache, etc.) for production use

### Quick Start with Docker Compose

1. Create a `docker-compose.yml` file:

```yaml
services:
  conslee:
    image: ghcr.io/tulupovden/conslee:latest
    container_name: conslee
    restart: unless-stopped
    environment:
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./config:/app/config
      - /etc/localtime:/etc/localtime:ro
    network_mode: host
```

2. (Optional) Create a `config/config.yml` file if you need to change the default port:

```yaml
server:
  listen_addr: :8800
idle_reaper:
  interval: 1m0s
services: []
```

If you don't create `config/config.yml`, it will be automatically generated with default settings on first run. The `config` directory will be created automatically.

3. Start Conslee:

```bash
docker compose up -d
```

4. Access the web interface:

Open your browser and navigate to `http://localhost:8800` (or the port you configured).

## Configuration

### Default Port

By default, Conslee listens on port `8800`. If you need to change this:

1. Create a `config/config.yml` file in the same directory as your `docker-compose.yml`
2. Set the `listen_addr` field:

```yaml
server:
  listen_addr: :8080  # Change to your desired port
```

3. Restart the container:

```bash
docker compose restart conslee
```

### Basic Configuration File

Here's a minimal `config/config.yml` example:

```yaml
server:
  listen_addr: :8800
idle_reaper:
  interval: 1m0s
services: []
```

The configuration file will be automatically created with defaults in the `config` directory if it doesn't exist. You can also manage most settings through the web UI.

## Proxy Configuration

For Conslee to track traffic and work in 'on demand' mode, you need to configure your external proxy (nginx, Apache, etc.) to forward requests to Conslee instead of directly to containers. When a user makes an HTTP request to your service, Conslee detects it, automatically starts the required containers if they're stopped, and then forwards the request to the service.

### Important Notes

1. Change the proxy to point to Conslee's listen address (check System Settings, default is `:8800`)
2. In the service configuration, set `targetUrl` to what was previously in the proxy (the container's port)
3. If your proxy uses HTTPS, use HTTP in the proxy (`proxy_pass http://127.0.0.1:8800`), but set HTTPS in the service's `targetUrl` (e.g., `https://127.0.0.1:9000`)

### Nginx Configuration

**Before** (direct to container):
```nginx
location / {
    proxy_pass http://127.0.0.1:9000;
    ...
}
```

**After** (via Conslee):
```nginx
location / {
    proxy_pass http://127.0.0.1:8800;  # Conslee's listen address
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
}
```

For convenience, you can use upstream:
```nginx
upstream conslee {
    server 127.0.0.1:8800;
}

server {
    server_name your-domain.com;
    location / {
        proxy_pass http://conslee;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

### Apache Configuration

**Before** (direct to container):
```apache
ProxyPass / http://127.0.0.1:9000/
ProxyPassReverse / http://127.0.0.1:9000/
```

**After** (via Conslee):
```apache
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:8800/  # Conslee's listen address
ProxyPassReverse / http://127.0.0.1:8800/

<Proxy *>
    Require all granted
</Proxy>
```

### Service targetUrl Configuration

In the service settings, set `targetUrl` to the address that was previously in your proxy:

- If proxy was: `proxy_pass http://127.0.0.1:9000`  
  Then `targetUrl`: `http://127.0.0.1:9000`

- If proxy was HTTPS but you changed it to HTTP for Conslee:  
  Proxy: `proxy_pass http://127.0.0.1:8800`  
  `targetUrl`: `https://127.0.0.1:9000`  # Use HTTPS here

## Using Conslee

### Creating a Service

1. Click the 'Add' button in the header
2. Enter a service name. For 'On demand' or 'Both' modes, also specify the domain (Host) that will be used to access the service
3. Select one or more Docker containers that should be started
4. For 'On demand' or 'Both' modes, configure the Target URL (internal address where the service runs, e.g., `http://127.0.0.1:8800`). For 'Schedule only' mode, Host and Target URL are optional - if omitted, Conslee will only manage containers by schedule without proxying
5. Set the mode, timeouts, and optional schedule according to your needs

### Service Modes

- **On demand**: Service starts automatically when the first HTTP request arrives (when someone accesses the service via the configured Host domain). The container will stop after the idle timeout period when there's no activity. Requires Host and Target URL to be configured.
- **Schedule only**: Service only runs according to the schedule. Host and Target URL are optional - if not specified, Conslee will not proxy requests and only manage containers by schedule. Requests to the site will not start containers.
- **On demand + schedule**: Service can be started on demand and also follows the schedule. Requires Host and Target URL to be configured.

### Timeouts

- **Idle timeout**: Time after which an inactive service will be stopped. Format: number + unit (s, m, h). Example: `15m`, `1h30m`
- **Startup timeout**: Maximum time to wait for containers to start and become ready. Format: number + unit (s, m, h). Example: `30s`, `2m`

### Scheduling

You can configure services to run on specific days and time windows. Select weekdays and optionally set start/stop times. Empty time fields mean no time restrictions for selected days.

### Health Check

Optionally specify a health check path (e.g., `/health`, `/api/status`). Conslee will check this endpoint to verify the service is ready before routing traffic. Leave empty to disable health checks.

## Troubleshooting

### Proxy Layer Issues

If you see 'Proxy layer issue' warnings:

1. Verify that your external proxy (nginx/Apache) is correctly forwarding requests to Conslee
2. Check that Conslee is running and listening on the configured address (check System Settings)
3. Ensure the Host header is being forwarded correctly from your external proxy

### Container Layer Issues

If you see 'Container layer issue' warnings:

1. Verify the Target URL is correct and the service is accessible at that address
2. Check that the Docker containers are running and healthy
3. Ensure the containers are listening on the correct ports specified in Target URL

## Support the Project

The development of Conslee depends on your support. Your contributions help us improve the project, add new features, and maintain the infrastructure.

You can support the project via [DonationAlerts](https://www.donationalerts.com/r/tulupovden).

Click the "Support Project" button in the web interface sidebar to learn more about supporting Conslee.

## License

This project is distributed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.

