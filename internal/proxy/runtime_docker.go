package proxy

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// Docker runtime implementation

type DockerRuntime struct {
	cli *client.Client
}

func NewDockerRuntime() (*DockerRuntime, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &DockerRuntime{cli: cli}, nil
}

func (d *DockerRuntime) Inspect(ctx context.Context, name string) (ContainerState, error) {
	insp, err := d.cli.ContainerInspect(ctx, name)
	if err != nil {
		return ContainerState{}, err
	}
	return ContainerState{Running: insp.State != nil && insp.State.Running}, nil
}

func (d *DockerRuntime) Start(ctx context.Context, name string) error {
	return d.cli.ContainerStart(ctx, name, container.StartOptions{})
}

func (d *DockerRuntime) Stop(ctx context.Context, name string, _ time.Duration) error {
	return d.cli.ContainerStop(ctx, name, container.StopOptions{})
}

func (d *DockerRuntime) List(ctx context.Context, all bool) ([]ContainerInfo, error) {
	cs, err := d.cli.ContainerList(ctx, container.ListOptions{All: all})
	if err != nil {
		return nil, err
	}
	out := make([]ContainerInfo, 0, len(cs))
	for _, c := range cs {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		var ports []Port
		for _, p := range c.Ports {
			ports = append(ports, Port{
				IP:      p.IP,
				Private: p.PrivatePort,
				Public:  p.PublicPort,
				Type:    p.Type,
			})
		}
		if len(ports) == 0 && (c.State == "exited" || c.State == "stopped" || c.State == "created") {
			insp, err := d.cli.ContainerInspect(ctx, c.ID)
			if err == nil && insp.Config != nil && insp.HostConfig != nil {
				if insp.Config.ExposedPorts != nil {
					for portSpec := range insp.Config.ExposedPorts {
						portSpecStr := string(portSpec)
						parts := strings.Split(portSpecStr, "/")
						if len(parts) > 0 {
							if portNum, err := strconv.ParseUint(parts[0], 10, 16); err == nil && portNum > 0 {
								portType := "tcp"
								if len(parts) > 1 {
									portType = parts[1]
								}
								var publicPort uint64 = portNum
								if insp.HostConfig.PortBindings != nil {
									if bindings, ok := insp.HostConfig.PortBindings[portSpec]; ok && len(bindings) > 0 {
										if parsedPublic, err := strconv.ParseUint(bindings[0].HostPort, 10, 16); err == nil && parsedPublic > 0 {
											publicPort = parsedPublic
											ports = append(ports, Port{
												IP:      bindings[0].HostIP,
												Private: uint16(portNum),
												Public:  uint16(publicPort),
												Type:    portType,
											})
											break
										}
									}
								}
								if len(ports) == 0 {
									ports = append(ports, Port{
										IP:      "0.0.0.0",
										Private: uint16(portNum),
										Public:  uint16(publicPort),
										Type:    portType,
									})
									break
								}
							}
						}
					}
				}
			}
		}
		stack := c.Labels["com.docker.compose.project"]
		out = append(out, ContainerInfo{
			ID:     c.ID,
			Name:   name,
			Image:  c.Image,
			State:  c.State,
			Status: c.Status,
			Ports:  ports,
			Stack:  stack,
		})
	}
	return out, nil
}
