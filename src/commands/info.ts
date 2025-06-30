import chalk from 'chalk';
import { SandboxManager } from '../lib/sandbox-manager';

export async function infoCommand(sandboxId: string): Promise<void> {
  try {
    const sandboxManager = new SandboxManager();
    const sandboxInfo = await sandboxManager.getSandboxInfo(sandboxId);

    if (!sandboxInfo) {
      console.error(chalk.red(`Sandbox '${sandboxId}' not found.`));
      console.log('\nList available sandboxes with:');
      console.log(chalk.gray('dcsandbox list'));
      process.exit(1);
    }

    const { sandbox, containerInfo, mcpConnection, workingDirectory } = sandboxInfo;

    console.log(chalk.bold(`\nSandbox: ${sandbox.name} (${sandbox.id})`));
    console.log(`Status: ${getStatusColor(sandbox.status)}`);
    
    if (sandbox.status === 'running' && mcpConnection) {
      console.log(`MCP Connection: ${chalk.cyan(mcpConnection)}`);
    }
    
    console.log(`Working Directory: ${chalk.blue(workingDirectory)}`);
    console.log(`Template: ${chalk.magenta(sandbox.template)}`);
    console.log(`Created: ${chalk.gray(sandbox.created.toLocaleString())}`);

    // Git information
    if (sandbox.git) {
      console.log('\n' + chalk.bold('Git Repository:'));
      console.log(`URL: ${chalk.blue(sandbox.git.url)}`);
      console.log(`Branch: ${chalk.yellow(sandbox.git.branch)}`);
    }

    // Resource information
    console.log('\n' + chalk.bold('Resources:'));
    console.log(`Memory: ${sandbox.resources.memory}`);
    console.log(`CPU: ${sandbox.resources.cpu} cores`);
    console.log(`Disk: ${sandbox.resources.disk}`);
    console.log(`Timeout: ${sandbox.resources.timeout} minutes`);

    // Container information
    if (containerInfo && sandbox.status === 'running') {
      console.log('\n' + chalk.bold('Container Info:'));
      console.log(`Container ID: ${chalk.gray(containerInfo.Id?.slice(0, 12) || 'Unknown')}`);
      
      if (containerInfo.NetworkSettings?.Ports) {
        const ports = Object.keys(containerInfo.NetworkSettings.Ports)
          .filter(port => containerInfo.NetworkSettings.Ports[port])
          .map(port => {
            const hostPort = containerInfo.NetworkSettings.Ports[port][0]?.HostPort;
            return `${port} → ${hostPort}`;
          });
        
        if (ports.length > 0) {
          console.log(`Ports: ${ports.join(', ')}`);
        }
      }
    }

    // MCP Servers
    if (sandbox.mcp.enabled && sandbox.mcp.servers.length > 0) {
      console.log('\n' + chalk.bold('Available MCP Servers:'));
      sandbox.mcp.servers.forEach(server => {
        const status = server.enabled ? chalk.green('active') : chalk.gray('inactive');
        console.log(`  - ${server.name} (${status})`);
      });
    }

    // Claude Code configuration
    if (sandbox.status === 'running' && mcpConnection) {
      console.log('\n' + chalk.bold('Claude Code MCP Configuration:'));
      const config = {
        mcpServers: {
          [sandbox.name]: {
            command: "npx",
            args: ["mcp-proxy", "connect", mcpConnection],
            env: {
              SANDBOX_ID: sandbox.id
            }
          }
        }
      };
      console.log(chalk.gray(JSON.stringify(config, null, 2)));
    }

    // Helpful commands
    console.log('\n' + chalk.bold('Commands:'));
    if (sandbox.status === 'running') {
      console.log(`View logs: ${chalk.gray(`dcsandbox logs ${sandbox.id}`)}`);
      console.log(`Stop sandbox: ${chalk.gray(`dcsandbox stop ${sandbox.id}`)}`);
    } else if (sandbox.status === 'stopped') {
      console.log(`Start sandbox: ${chalk.gray(`dcsandbox start ${sandbox.id}`)}`);
      console.log(`Remove sandbox: ${chalk.gray(`dcsandbox remove ${sandbox.id}`)}`);
    }

  } catch (error) {
    console.error(chalk.red('Error getting sandbox info:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return chalk.green(status);
    case 'stopped':
      return chalk.gray(status);
    case 'creating':
      return chalk.yellow(status);
    case 'error':
      return chalk.red(status);
    default:
      return status;
  }
}