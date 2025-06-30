import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { SandboxManager } from '../lib/sandbox-manager';

interface RemoveOptions {
  force?: boolean;
}

export async function removeCommand(sandboxId: string, options: RemoveOptions): Promise<void> {
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

    // Confirm removal unless forced
    if (!options.force) {
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to remove sandbox '${sandbox.name}'?`,
          default: false
        }
      ]);

      if (!answer.confirm) {
        console.log(chalk.yellow('Removal cancelled.'));
        return;
      }
    }

    const spinner = ora(`Removing sandbox ${sandbox.name}...`).start();

    try {
      // Stop the sandbox if it's running
      if (sandbox.status === 'running') {
        spinner.text = 'Stopping sandbox...';
        await sandboxManager.stopSandbox(sandboxId);
      }

      // Remove the sandbox
      spinner.text = 'Removing container and data...';
      await sandboxManager.removeSandbox(sandboxId);
      
      spinner.succeed(`Sandbox '${sandbox.name}' removed successfully`);

      console.log('\n' + chalk.bold('Removed sandbox:'));
      console.log(`Name: ${chalk.cyan(sandbox.name)}`);
      console.log(`ID: ${chalk.gray(sandbox.id)}`);
      console.log(`Template: ${chalk.magenta(sandbox.template)}`);

      if (sandbox.git) {
        console.log(`Repository: ${chalk.blue(sandbox.git.url)}`);
      }

      console.log('\n' + chalk.gray('All data associated with this sandbox has been permanently deleted.'));

    } catch (error) {
      spinner.fail('Failed to remove sandbox');
      throw error;
    }

  } catch (error) {
    console.error(chalk.red('Error removing sandbox:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}