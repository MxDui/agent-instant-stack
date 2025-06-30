import chalk from 'chalk';
import { SandboxManager } from '../lib/sandbox-manager';

interface LogsOptions {
  follow?: boolean;
  tail?: number;
}

export async function logsCommand(sandboxId: string, options: LogsOptions): Promise<void> {
  try {
    const sandboxManager = new SandboxManager();
    
    // Check if sandbox exists
    const sandbox = await sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      console.error(chalk.red(`Sandbox '${sandboxId}' not found.`));
      console.log('\nList available sandboxes with:');
      console.log(chalk.gray('dcsandbox list'));
      process.exit(1);
    }

    if (!sandbox.containerId) {
      console.error(chalk.red(`No container found for sandbox '${sandbox.name}'.`));
      process.exit(1);
    }

    console.log(chalk.bold(`\nLogs for sandbox: ${sandbox.name} (${sandbox.id})`));
    console.log(chalk.gray(`Status: ${sandbox.status}`));
    
    if (options.follow) {
      console.log(chalk.gray('Following logs... (Press Ctrl+C to stop)\n'));
    } else {
      console.log(chalk.gray(`Showing last ${options.tail || 100} lines...\n`));
    }

    // Get and display logs
    await sandboxManager.getLogs(sandboxId, {
      follow: options.follow || false,
      tail: options.tail || 100,
      onLog: (line: string) => {
        // Format log line with timestamp if it doesn't already have one
        const timestamp = new Date().toISOString();
        if (line.match(/^\d{4}-\d{2}-\d{2}/)) {
          // Line already has timestamp
          console.log(line);
        } else {
          // Add timestamp
          console.log(`${chalk.gray(timestamp)} ${line}`);
        }
      }
    });

  } catch (error) {
    console.error(chalk.red('Error getting logs:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}