import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { SandboxManager } from '../lib/sandbox-manager';

interface CleanupOptions {
  all?: boolean;
  force?: boolean;
}

export async function cleanupCommand(options: CleanupOptions): Promise<void> {
  try {
    const sandboxManager = new SandboxManager();
    const allSandboxes = await sandboxManager.listSandboxes();

    if (allSandboxes.length === 0) {
      console.log(chalk.yellow('No sandboxes found to clean up.'));
      return;
    }

    // Determine which sandboxes to clean up
    const sandboxesToRemove = options.all 
      ? allSandboxes 
      : allSandboxes.filter(sandbox => sandbox.status === 'stopped' || sandbox.status === 'error');

    if (sandboxesToRemove.length === 0) {
      if (options.all) {
        console.log(chalk.yellow('No sandboxes found.'));
      } else {
        console.log(chalk.yellow('No stopped or errored sandboxes found to clean up.'));
        console.log('\nUse --all flag to remove all sandboxes including running ones:');
        console.log(chalk.gray('dcsandbox cleanup --all'));
      }
      return;
    }

    // Show what will be removed
    console.log(chalk.bold(`\nFound ${sandboxesToRemove.length} sandbox${sandboxesToRemove.length === 1 ? '' : 'es'} to clean up:`));
    
    sandboxesToRemove.forEach(sandbox => {
      const statusColor = getStatusColor(sandbox.status);
      const uptime = getUptime(sandbox.created);
      console.log(`  - ${chalk.cyan(sandbox.name)} (${statusColor}, ${uptime})`);
    });

    // Confirm cleanup unless forced
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Remove ${sandboxesToRemove.length === 1 ? 'this sandbox' : 'these sandboxes'}?`,
          default: false
        }
      ]);

      if (!answer.confirm) {
        console.log(chalk.yellow('Cleanup cancelled.'));
        return;
      }
    }

    const spinner = ora('Cleaning up sandboxes...').start();
    let removedCount = 0;
    let failedCount = 0;

    for (const sandbox of sandboxesToRemove) {
      try {
        spinner.text = `Removing ${sandbox.name}...`;
        
        // Stop if running
        if (sandbox.status === 'running') {
          await sandboxManager.stopSandbox(sandbox.id);
        }
        
        // Remove the sandbox
        await sandboxManager.removeSandbox(sandbox.id);
        removedCount++;
        
      } catch (error) {
        console.log(`\n${chalk.red('✗')} Failed to remove ${sandbox.name}: ${error instanceof Error ? error.message : String(error)}`);
        failedCount++;
      }
    }

    if (failedCount === 0) {
      spinner.succeed(`Successfully removed ${removedCount} sandbox${removedCount === 1 ? '' : 'es'}`);
    } else {
      spinner.warn(`Removed ${removedCount} sandbox${removedCount === 1 ? '' : 'es'}, ${failedCount} failed`);
    }

    // Show summary
    console.log('\n' + chalk.bold('Cleanup Summary:'));
    console.log(`${chalk.green('✓')} Removed: ${removedCount}`);
    if (failedCount > 0) {
      console.log(`${chalk.red('✗')} Failed: ${failedCount}`);
    }

    // Show remaining sandboxes
    const remainingSandboxes = await sandboxManager.listSandboxes();
    if (remainingSandboxes.length > 0) {
      console.log(`${chalk.blue('→')} Remaining: ${remainingSandboxes.length}`);
    } else {
      console.log(chalk.gray('All sandboxes have been cleaned up.'));
    }

  } catch (error) {
    console.error(chalk.red('Error during cleanup:'), error instanceof Error ? error.message : String(error));
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

function getUptime(created: Date): string {
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ago`;
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else {
    return `${minutes}m ago`;
  }
}