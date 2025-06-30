import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SandboxConfig, SandboxInfo, Template } from '../types';
import { MCPProxy } from './mcp-proxy';

export class SandboxManager {
  private docker: Docker;
  private mcpProxy: MCPProxy;
  private sandboxesDir: string;

  constructor() {
    this.docker = new Docker();
    this.mcpProxy = new MCPProxy();
    this.sandboxesDir = path.join(os.homedir(), '.dcsandbox', 'sandboxes');
  }

  async createSandbox(config: SandboxConfig, template: Template): Promise<SandboxConfig> {
    // Ensure sandboxes directory exists
    await fs.mkdir(this.sandboxesDir, { recursive: true });

    // Create sandbox workspace directory
    const workspaceDir = path.join(this.sandboxesDir, config.id);
    await fs.mkdir(workspaceDir, { recursive: true });

    // Copy git repository if provided
    if (config.git?.clonePath) {
      const destPath = path.join(workspaceDir, 'workspace');
      await this.copyDirectory(config.git.clonePath, destPath);
    } else {
      // Create empty workspace
      await fs.mkdir(path.join(workspaceDir, 'workspace'), { recursive: true });
    }

    // Create Dockerfile from template
    const dockerfile = this.generateDockerfile(template);
    await fs.writeFile(path.join(workspaceDir, 'Dockerfile'), dockerfile);

    // Create devcontainer.json
    const devcontainerConfig = this.generateDevcontainerConfig(template);
    const devcontainerDir = path.join(workspaceDir, '.devcontainer');
    await fs.mkdir(devcontainerDir, { recursive: true });
    await fs.writeFile(
      path.join(devcontainerDir, 'devcontainer.json'),
      JSON.stringify(devcontainerConfig, null, 2)
    );

    // Build Docker image
    const imageTag = `dcsandbox:${config.id}`;
    await this.buildImage(workspaceDir, imageTag);

    // Create container
    const container = await this.docker.createContainer({
      Image: imageTag,
      name: `dcsandbox-${config.id}`,
      WorkingDir: '/workspace',
      Env: [
        `SANDBOX_ID=${config.id}`,
        `SANDBOX_NAME=${config.name}`,
        ...Object.entries(template.environment || {}).map(([key, value]) => `${key}=${value}`)
      ],
      HostConfig: {
        Memory: this.parseMemory(config.resources.memory),
        NanoCpus: config.resources.cpu * 1000000000,
        NetworkMode: 'bridge',
        Binds: [
          `${path.join(workspaceDir, 'workspace')}:/workspace`
        ],
        AutoRemove: false
      },
      ExposedPorts: this.generateExposedPorts(template.ports || []),
      NetworkingConfig: {
        EndpointsConfig: {
          bridge: {}
        }
      }
    });

    // Update config with container ID
    const updatedConfig = {
      ...config,
      containerId: container.id,
      status: 'stopped' as const
    };

    // Save sandbox config
    await this.saveSandboxConfig(updatedConfig);

    return updatedConfig;
  }

  async startSandbox(sandboxId: string): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config || !config.containerId) {
      throw new Error(`Sandbox ${sandboxId} not found or has no container`);
    }

    const container = this.docker.getContainer(config.containerId);
    await container.start();

    // Allocate MCP port
    const mcpPort = await this.mcpProxy.allocatePort();
    
    // Update config
    const updatedConfig = {
      ...config,
      status: 'running' as const,
      mcpPort
    };
    
    await this.saveSandboxConfig(updatedConfig);
  }

  async stopSandbox(sandboxId: string): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config || !config.containerId) {
      throw new Error(`Sandbox ${sandboxId} not found or has no container`);
    }

    const container = this.docker.getContainer(config.containerId);
    await container.stop();

    // Release MCP port
    if (config.mcpPort) {
      await this.mcpProxy.releasePort(config.mcpPort);
    }

    // Update config
    const updatedConfig = {
      ...config,
      status: 'stopped' as const,
      mcpPort: undefined
    };
    
    await this.saveSandboxConfig(updatedConfig);
  }

  async removeSandbox(sandboxId: string): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config) {
      throw new Error(`Sandbox ${sandboxId} not found`);
    }

    // Stop if running
    if (config.status === 'running') {
      await this.stopSandbox(sandboxId);
    }

    // Remove container
    if (config.containerId) {
      try {
        const container = this.docker.getContainer(config.containerId);
        await container.remove({ force: true });
      } catch (error) {
        // Container might already be removed
        console.warn(`Could not remove container: ${error}`);
      }
    }

    // Remove sandbox directory
    const sandboxDir = path.join(this.sandboxesDir, sandboxId);
    try {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Could not remove sandbox directory: ${error}`);
    }

    // Remove from git clone cache if applicable
    if (config.git?.clonePath) {
      try {
        await fs.rm(config.git.clonePath, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Could not remove git clone: ${error}`);
      }
    }
  }

  async setupMCP(sandboxId: string): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config || !config.mcpPort) {
      throw new Error(`Sandbox ${sandboxId} not ready for MCP setup`);
    }

    // Start MCP proxy for this sandbox
    await this.mcpProxy.startProxy(sandboxId, config.mcpPort, config.mcp.servers);
  }

  async runPostCreateCommands(sandboxId: string, commands: string[]): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config || !config.containerId) {
      throw new Error(`Sandbox ${sandboxId} not found or has no container`);
    }

    const container = this.docker.getContainer(config.containerId);

    for (const command of commands) {
      const exec = await container.exec({
        Cmd: ['/bin/bash', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace'
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      // Wait for command to complete
      await new Promise<void>((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });
    }
  }

  async getSandbox(sandboxId: string): Promise<SandboxConfig | null> {
    try {
      const configPath = path.join(this.sandboxesDir, sandboxId, 'config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(configData);
      
      // Convert date strings back to Date objects
      config.created = new Date(config.created);
      
      return config;
    } catch (error) {
      return null;
    }
  }

  async getSandboxInfo(sandboxId: string): Promise<SandboxInfo | null> {
    const sandbox = await this.getSandbox(sandboxId);
    if (!sandbox) {
      return null;
    }

    let containerInfo = null;
    let mcpConnection = null;

    if (sandbox.containerId) {
      try {
        const container = this.docker.getContainer(sandbox.containerId);
        containerInfo = await container.inspect();
        
        if (sandbox.mcpPort && sandbox.status === 'running') {
          mcpConnection = `localhost:${sandbox.mcpPort}`;
        }
      } catch (error) {
        // Container might not exist
        containerInfo = null;
      }
    }

    return {
      sandbox,
      containerInfo,
      mcpConnection: mcpConnection || undefined,
      workingDirectory: '/workspace'
    };
  }

  async listSandboxes(): Promise<SandboxConfig[]> {
    try {
      await fs.mkdir(this.sandboxesDir, { recursive: true });
      const entries = await fs.readdir(this.sandboxesDir);
      const sandboxes: SandboxConfig[] = [];

      for (const entry of entries) {
        const sandbox = await this.getSandbox(entry);
        if (sandbox) {
          sandboxes.push(sandbox);
        }
      }

      return sandboxes.sort((a, b) => b.created.getTime() - a.created.getTime());
    } catch (error) {
      return [];
    }
  }

  async getLogs(sandboxId: string, options: { follow: boolean; tail: number; onLog: (line: string) => void }): Promise<void> {
    const config = await this.getSandbox(sandboxId);
    if (!config || !config.containerId) {
      throw new Error(`Sandbox ${sandboxId} not found or has no container`);
    }

    const container = this.docker.getContainer(config.containerId);
    
    if (options.follow) {
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: options.tail
      }) as NodeJS.ReadableStream;

      logStream.on('data', (chunk: Buffer) => {
        // Docker log format: first 8 bytes are header, rest is log data
        const logData = chunk.slice(8).toString();
        options.onLog(logData.trim());
      });

      // Handle Ctrl+C to stop following
      process.on('SIGINT', () => {
        if ('destroy' in logStream && typeof logStream.destroy === 'function') {
          logStream.destroy();
        }
        process.exit(0);
      });
    } else {
      const logBuffer = await container.logs({
        follow: false,
        stdout: true,
        stderr: true,
        tail: options.tail
      }) as Buffer;

      // Process the buffer and split into lines
      const logData = logBuffer.slice(8).toString();
      const lines = logData.split('\n').filter(line => line.trim());
      lines.forEach(line => options.onLog(line));
    }
  }

  private async saveSandboxConfig(config: SandboxConfig): Promise<void> {
    const configPath = path.join(this.sandboxesDir, config.id, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  }

  private generateDockerfile(template: Template): string {
    const dockerfile = [
      `FROM ${template.baseImage}`,
      '',
      '# Install additional features',
      ...template.features.map(feature => `RUN apt-get update && apt-get install -y ${feature}`),
      '',
      '# Set working directory',
      'WORKDIR /workspace',
      '',
      '# Copy workspace files',
      'COPY workspace/ /workspace/',
      '',
      '# Set environment variables',
      ...Object.entries(template.environment || {}).map(([key, value]) => `ENV ${key}=${value}`),
      '',
      '# Expose ports',
      ...template.ports?.map(port => `EXPOSE ${port}`) || [],
      '',
      '# Default command',
      'CMD ["/bin/bash"]'
    ];

    return dockerfile.join('\n');
  }

  private generateDevcontainerConfig(template: Template): any {
    return {
      name: `DevContainer Sandbox - ${template.name}`,
      dockerFile: '../Dockerfile',
      workspaceFolder: '/workspace',
      features: template.features.reduce((acc, feature) => {
        acc[feature] = {};
        return acc;
      }, {} as any),
      forwardPorts: template.ports || [],
      postCreateCommand: template.postCreate?.join(' && '),
      customizations: {
        mcp: {
          servers: template.mcpServers
        }
      }
    };
  }

  private async buildImage(contextDir: string, tag: string): Promise<void> {
    const stream = await this.docker.buildImage({
      context: contextDir,
      src: ['Dockerfile', 'workspace', '.devcontainer']
    }, { t: tag });

    // Wait for build to complete
    await new Promise<void>((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: Error | null, res: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private parseMemory(memoryStr: string): number {
    const match = memoryStr.match(/^(\d+)([KMGT]?)$/i);
    if (!match) throw new Error(`Invalid memory format: ${memoryStr}`);

    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case 'K': return value * 1024;
      case 'M': return value * 1024 * 1024;
      case 'G': return value * 1024 * 1024 * 1024;
      case 'T': return value * 1024 * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private generateExposedPorts(ports: number[]): Record<string, {}> {
    const exposedPorts: Record<string, {}> = {};
    ports.forEach(port => {
      exposedPorts[`${port}/tcp`] = {};
    });
    return exposedPorts;
  }

  private async copyDirectory(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}