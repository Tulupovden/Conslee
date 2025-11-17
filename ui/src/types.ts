type ServiceSchedule = {
    mode: string;
    days?: string[];
    start?: string;
    stop?: string;
};

export type ServiceStatus = {
    name: string;
    host: string;
    containers: string[];
    mode: string;
    enabled: boolean;
    running: boolean;
    lastActivity: string;
    idleTimeout: string;
    startupTimeout: string;
    targetUrl: string;
    healthPath: string;
    schedule?: ServiceSchedule;
};

type DockerPort = {
    ip: string;
    private: number;
    public: number;
    type: string;
};

export type DockerContainer = {
    id: string;
    name: string;
    image: string;
    state: string;
    status: string;
    ports: DockerPort[];
    stack?: string;
};

export type SystemStatus = {
    listenAddr: string;
    idleReaperInterval: string;
};

export type Tab = "all" | "running" | "scheduled" | "help";
