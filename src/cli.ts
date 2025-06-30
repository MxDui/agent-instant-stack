#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { createCommand } from './commands/create';
import { listCommand } from './commands/list';
import { infoCommand } from './commands/info';
import { stopCommand } from './commands/stop';
import { removeCommand } from './commands/remove';
import { cleanupCommand } from './commands/cleanup';
import { logsCommand } from './commands/logs';

const program = new Command();

program
  .name('dcsandbox')
  .description('DevContainer Sandbox CLI - Create isolated development environments with MCP support')
  .version('1.0.0');

// Create command
program
  .command('create')
  .description('Create a new sandbox')
  .option('--git <url>', 'Git repository URL to clone')
  .option('--branch <branch>', 'Git branch to checkout', 'main')
  .option('--name <name>', 'Custom name for the sandbox')
  .option('--template <template>', 'Predefined devcontainer template')
  .option('--memory <size>', 'Memory limit (e.g., 2G, 512M)', '2G')
  .option('--cpu <cores>', 'CPU core limit', parseFloat, 2)
  .option('--timeout <minutes>', 'Auto-cleanup timeout', parseInt, 120)
  .option('--persist', 'Keep sandbox after disconnection')
  .option('--auto-detect', 'Auto-detect project type from git repo')
  .action(createCommand);

// List command
program
  .command('list')
  .description('List active sandboxes with their MCP connection details')
  .action(listCommand);

// Info command
program
  .command('info <sandbox-id>')
  .description('Get MCP connection string for Claude Code')
  .action(infoCommand);

// Stop command
program
  .command('stop <sandbox-id>')
  .description('Stop a sandbox')
  .action(stopCommand);

// Remove command
program
  .command('remove <sandbox-id>')
  .description('Remove a sandbox')
  .option('--force', 'Force removal without confirmation')
  .action(removeCommand);

// Cleanup command
program
  .command('cleanup')
  .description('Clean up all sandboxes')
  .option('--all', 'Remove all sandboxes including running ones')
  .option('--force', 'Skip confirmation prompts')
  .action(cleanupCommand);

// Logs command
program
  .command('logs <sandbox-id>')
  .description('Show logs from a sandbox')
  .option('-f, --follow', 'Follow log output')
  .option('--tail <lines>', 'Number of lines to show from the end', parseInt, 100)
  .action(logsCommand);

// Global error handler
program.exitOverride((err) => {
  if (err.code === 'commander.unknownCommand') {
    console.error(chalk.red(`Unknown command: ${err.message}`));
    console.log('\nAvailable commands:');
    program.help();
  } else if (err.code === 'commander.missingArgument') {
    console.error(chalk.red(`Missing required argument: ${err.message}`));
  } else {
    console.error(chalk.red(`Error: ${err.message}`));
  }
  process.exit(1);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();