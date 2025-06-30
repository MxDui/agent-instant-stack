import chalk from 'chalk';
import { SandboxManager } from '../lib/sandbox-manager';

export async function listCommand(): Promise<void> {
  try {
    const sandboxManager = new SandboxManager();
    const sandboxes = await sandboxManager.listSandboxes();

    if (sandboxes.length === 0) {
      console.log(chalk.yellow('No active sandboxes found.'));
      console.log('\nCreate a new sandbox with:');
      console.log(chalk.gray('dcsandbox create --git <repository-url>'));
      return;
    }

    console.log(chalk.bold('\nActive Sandboxes:'));
    console.log();

    // Print header
    const header = `${'NAME'.padEnd(20)} ${'STATUS'.padEnd(10)} ${'UPTIME'.padEnd(12)} ${'MCP'.padEnd(20)}`;
    console.log(chalk.gray(header));
    console.log(chalk.gray('-'.repeat(header.length)));

    // Print each sandbox
    for (const sandbox of sandboxes) {
      const uptime = getUptime(sandbox.created);
      const status = getStatusColor(sandbox.status);
      const mcpConnection = sandbox.mcpPort ? `localhost:${sandbox.mcpPort}` : '-';
      
      const row = `${sandbox.name.padEnd(20)} ${status.padEnd(10)} ${uptime.padEnd(12)} ${chalk.cyan(mcpConnection).padEnd(20)}`;
      console.log(row);
    }

    console.log();
    console.log(chalk.gray(`Total: ${sandboxes.length} sandbox${sandboxes.length === 1 ? '' : 'es'}`));
    
    // Show helpful commands
    console.log('\n' + chalk.bold('Commands:'));
    console.log(`Get details: ${chalk.gray('dcsandbox info <sandbox-id>')}`);
    console.log(`View logs: ${chalk.gray('dcsandbox logs <sandbox-id>')}`);
    console.log(`Stop sandbox: ${chalk.gray('dcsandbox stop <sandbox-id>')}`);

  } catch (error) {
    console.error(chalk.red('Error listing sandboxes:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function getUptime(created: Date): string {
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else {
    return `${minutes}m`;
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