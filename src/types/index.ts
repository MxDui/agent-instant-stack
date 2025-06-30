export interface SandboxConfig {
  id: string;
  name: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  created: Date;
  template: string;
  git?: GitConfig;
  mcp: MCPConfig;
  resources: ResourceConfig;
  containerId?: string;
  mcpPort?: number;
}

export interface GitConfig {
  url: string;
  branch: string;
  clonePath?: string;
}

export interface MCPConfig {
  enabled: boolean;
  servers: MCPServer[];
  proxyPort?: number;
}

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface ResourceConfig {
  memory: string;
  cpu: number;
  disk: string;
  timeout: number;
}

export interface Template {
  name: string;
  baseImage: string;
  features: string[];
  mcpServers: MCPServer[];
  postCreate?: string[];
  environment?: Record<string, string>;
  ports?: number[];
}

export interface CreateOptions {
  name?: string;
  git?: string;
  branch?: string;
  template?: string;
  memory?: string;
  cpu?: number;
  timeout?: number;
  persist?: boolean;
  autoDetect?: boolean;
}

export interface SandboxInfo {
  sandbox: SandboxConfig;
  containerInfo?: any;
  mcpConnection?: string;
  workingDirectory: string;
}

export interface ProjectDetection {
  language: string;
  framework?: string;
  packageManager?: string;
  template: string;
  confidence: number;
}