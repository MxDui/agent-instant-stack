import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import { MCPServer } from '../types';

export class MCPProxy {
  private activePorts: Set<number> = new Set();
  private proxies: Map<string, MCPProxyInstance> = new Map();
  private portRange = { min: 50000, max: 60000 };

  async allocatePort(): Promise<number> {
    for (let port = this.portRange.min; port <= this.portRange.max; port++) {
      if (!this.activePorts.has(port)) {
        this.activePorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports in range');
  }

  async releasePort(port: number): Promise<void> {
    this.activePorts.delete(port);
  }

  async startProxy(sandboxId: string, port: number, mcpServers: MCPServer[]): Promise<void> {
    const proxy = new MCPProxyInstance(sandboxId, port, mcpServers);
    await proxy.start();
    this.proxies.set(sandboxId, proxy);
  }

  async stopProxy(sandboxId: string): Promise<void> {
    const proxy = this.proxies.get(sandboxId);
    if (proxy) {
      await proxy.stop();
      this.proxies.delete(sandboxId);
    }
  }
}

class MCPProxyInstance {
  private wss: WebSocketServer | null = null;
  private mcpServers: Map<string, ChildProcess> = new Map();
  private connections: Map<WebSocket, string> = new Map();

  constructor(
    private sandboxId: string,
    private port: number,
    private mcpServerConfigs: MCPServer[]
  ) {}

  async start(): Promise<void> {
    // Start MCP servers
    for (const serverConfig of this.mcpServerConfigs) {
      if (serverConfig.enabled) {
        await this.startMCPServer(serverConfig);
      }
    }

    // Start WebSocket server
    this.wss = new WebSocketServer({ port: this.port });
    
    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (error) => {
      console.error(`MCP Proxy error for sandbox ${this.sandboxId}:`, error);
    });
  }

  async stop(): Promise<void> {
    // Stop WebSocket server
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    // Stop all MCP servers
    for (const [name, process] of this.mcpServers) {
      process.kill();
    }
    this.mcpServers.clear();
  }

  private async startMCPServer(config: MCPServer): Promise<void> {
    const childProcess = spawn(config.command, config.args, {
      env: {
        ...process.env,
        ...config.env,
        SANDBOX_ID: this.sandboxId
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    childProcess.on('error', (error: Error) => {
      console.error(`Failed to start MCP server ${config.name}:`, error);
    });

    childProcess.on('exit', (code: number | null) => {
      console.warn(`MCP server ${config.name} exited with code ${code}`);
      this.mcpServers.delete(config.name);
    });

    this.mcpServers.set(config.name, childProcess);
  }

  private handleConnection(ws: WebSocket): void {
    console.log(`New MCP connection for sandbox ${this.sandboxId}`);
    
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleMCPMessage(ws, message);
      } catch (error) {
        console.error('Error handling MCP message:', error);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error'
          },
          id: null
        }));
      }
    });

    ws.on('close', () => {
      console.log(`MCP connection closed for sandbox ${this.sandboxId}`);
      this.connections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error(`MCP WebSocket error for sandbox ${this.sandboxId}:`, error);
    });

    // Send initial capabilities
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        },
        serverInfo: {
          name: 'dcsandbox-proxy',
          version: '1.0.0'
        }
      }
    }));
  }

  private async handleMCPMessage(ws: WebSocket, message: any): Promise<void> {
    const { method, params, id } = message;

    switch (method) {
      case 'initialize':
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: 'dcsandbox-proxy',
              version: '1.0.0'
            }
          },
          id
        }));
        break;

      case 'tools/list':
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result: {
            tools: await this.getAvailableTools()
          },
          id
        }));
        break;

      case 'tools/call':
        const result = await this.callTool(params.name, params.arguments);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result,
          id
        }));
        break;

      case 'resources/list':
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result: {
            resources: await this.getAvailableResources()
          },
          id
        }));
        break;

      case 'resources/read':
        const resource = await this.readResource(params.uri);
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          result: {
            contents: [resource]
          },
          id
        }));
        break;

      default:
        // Forward to appropriate MCP server
        await this.forwardToMCPServer(ws, message);
    }
  }

  private async getAvailableTools(): Promise<any[]> {
    // Return tools available in this sandbox
    return [
      {
        name: 'filesystem_read',
        description: 'Read file contents from the sandbox',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to workspace'
            }
          },
          required: ['path']
        }
      },
      {
        name: 'filesystem_write',
        description: 'Write content to a file in the sandbox',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path relative to workspace'
            },
            content: {
              type: 'string',
              description: 'File content'
            }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'shell_execute',
        description: 'Execute shell command in the sandbox',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            }
          },
          required: ['command']
        }
      }
    ];
  }

  private async getAvailableResources(): Promise<any[]> {
    return [
      {
        uri: 'file:///workspace',
        name: 'Workspace',
        description: 'Sandbox workspace directory',
        mimeType: 'inode/directory'
      }
    ];
  }

  private async callTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'filesystem_read':
        return await this.handleFilesystemRead(args.path);
      
      case 'filesystem_write':
        return await this.handleFilesystemWrite(args.path, args.content);
      
      case 'shell_execute':
        return await this.handleShellExecute(args.command);
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async readResource(uri: string): Promise<any> {
    // Handle resource reading
    if (uri.startsWith('file://')) {
      const filePath = uri.replace('file://', '');
      return await this.handleFilesystemRead(filePath);
    }
    
    throw new Error(`Unsupported resource URI: ${uri}`);
  }

  private async handleFilesystemRead(path: string): Promise<any> {
    // This would interact with the container's filesystem
    // For now, return a placeholder
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Content of ${path} from sandbox ${this.sandboxId}`
        }
      ]
    };
  }

  private async handleFilesystemWrite(path: string, content: string): Promise<any> {
    // This would write to the container's filesystem
    // For now, return a placeholder
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Successfully wrote to ${path} in sandbox ${this.sandboxId}`
        }
      ]
    };
  }

  private async handleShellExecute(command: string): Promise<any> {
    // This would execute commands in the container
    // For now, return a placeholder
    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: `Executed: ${command}\nOutput: Command executed successfully in sandbox ${this.sandboxId}`
        }
      ]
    };
  }

  private async forwardToMCPServer(ws: WebSocket, message: any): Promise<void> {
    // Forward message to appropriate MCP server process
    // This would involve more complex routing based on the message content
    // For now, return an error
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32601,
        message: 'Method not found'
      },
      id: message.id
    }));
  }
}