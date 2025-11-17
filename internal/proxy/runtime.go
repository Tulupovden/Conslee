package proxy

import (
	"context"
	"time"
)

// Container runtime interface

type ContainerRuntime interface {
	Inspect(ctx context.Context, name string) (ContainerState, error)
	Start(ctx context.Context, name string) error
	Stop(ctx context.Context, name string, timeout time.Duration) error
	List(ctx context.Context, all bool) ([]ContainerInfo, error)
}

type ContainerState struct {
	Running bool
}

type Port struct {
	IP      string
	Private uint16
	Public  uint16
	Type    string
}

type ContainerInfo struct {
	ID     string
	Name   string
	Image  string
	State  string
	Status string
	Ports  []Port
	Stack  string
}
