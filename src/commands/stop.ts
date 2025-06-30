import chalk from 'chalk';
import ora from 'ora';
import { SandboxManager } from '../lib/sandbox-manager';

export async function stopCommand(sandboxId: string): Promise<void> {
  const spinner = ora(`Stopping sandbox ${sandboxId}...`).start();
  
  try {
    const sandboxManager = new SandboxManager();
    
    // Check if sandbox exists
    const sandbox = await sandboxManager.getSandbox(sandboxId);
    if (!sandbox) {
      spinner.fail(`Sandbox '${sandboxId}' not found`);
      console.log('\nList available sandboxes with:');
      console.log(chalk.gray('dcsandbox list'));
      process.exit(1);
    }

    if (sandbox.status === 'stopped') {
      spinner.info(`Sandbox '${sandbox.name}' is already stopped`);
      return;
    }

    if (sandbox.status !== 'running') {
      spinner.fail(`Cannot stop sandbox '${sandbox.name}' (status: ${sandbox.status})`);
      process.exit(1);
    }

    // Stop the sandbox
    await sandboxManager.stopSandbox(sandboxId);
    spinner.succeed(`Sandbox '${sandbox.name}' stopped successfully`);

    console.log('\n' + chalk.bold('Sandbox stopped:'));
    console.log(`Name: ${chalk.cyan(sandbox.name)}`);
    console.log(`ID: ${chalk.gray(sandbox.id)}`);
    console.log(`Status: ${chalk.gray('stopped')}`);

    console.log('\n' + chalk.bold('Next steps:'));
    console.log(`Start again: ${chalk.gray(`dcsandbox start ${sandbox.id}`)}`);
    console.log(`Remove sandbox: ${chalk.gray(`dcsandbox remove ${sandbox.id}`)}`);
    console.log(`View logs: ${chalk.gray(`dcsandbox logs ${sandbox.id}`)}`);

  } catch (error) {
    spinner.fail('Failed to stop sandbox');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}