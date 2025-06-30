import chalk from 'chalk';
import ora from 'ora';
import { nanoid } from 'nanoid';
import { CreateOptions } from '../types';
import { SandboxManager } from '../lib/sandbox-manager';
import { GitManager } from '../lib/git-manager';
import { TemplateManager } from '../lib/template-manager';
import { ProjectDetector } from '../lib/project-detector';

export async function createCommand(options: CreateOptions): Promise<void> {
  const spinner = ora('Creating devcontainer sandbox...').start();
  
  try {
    const sandboxManager = new SandboxManager();
    const gitManager = new GitManager();
    const templateManager = new TemplateManager();
    const projectDetector = new ProjectDetector();

    // Generate sandbox ID and name
    const sandboxId = `sandbox-${nanoid(8)}`;
    const sandboxName = options.name || (options.git ? extractRepoName(options.git) : `sandbox-${Date.now()}`);

    let template = options.template || 'base';
    let clonePath: string | undefined;

    // Handle git repository
    if (options.git) {
      spinner.text = 'Cloning repository...';
      clonePath = await gitManager.cloneRepository(options.git, options.branch || 'main', sandboxId);
      spinner.succeed('Repository cloned');

      // Auto-detect project type if requested or no template specified
      if (options.autoDetect || !options.template) {
        spinner.start('Detecting project type...');
        const detection = await projectDetector.detectProject(clonePath);
        if (detection.confidence > 0.7) {
          template = detection.template;
          spinner.succeed(`Detected: ${detection.language}${detection.framework ? `/${detection.framework}` : ''}`);
        } else {
          spinner.warn('Could not reliably detect project type, using base template');
        }
      }
    }

    // Get template configuration
    spinner.start('Loading template configuration...');
    const templateConfig = await templateManager.getTemplate(template);
    if (!templateConfig) {
      throw new Error(`Template '${template}' not found`);
    }
    spinner.succeed(`Selected template: ${template}`);

    // Create sandbox configuration
    const sandboxConfig = {
      id: sandboxId,
      name: sandboxName,
      status: 'creating' as const,
      created: new Date(),
      template,
      git: options.git ? {
        url: options.git,
        branch: options.branch || 'main',
        clonePath
      } : undefined,
      mcp: {
        enabled: true,
        servers: templateConfig.mcpServers
      },
      resources: {
        memory: options.memory || '2G',
        cpu: options.cpu || 2,
        disk: '10G',
        timeout: options.timeout || 120
      }
    };

    // Create and start the sandbox
    spinner.start('Building devcontainer image...');
    const sandbox = await sandboxManager.createSandbox(sandboxConfig, templateConfig);
    spinner.succeed('Container created');

    spinner.start('Starting container...');
    await sandboxManager.startSandbox(sandbox.id);
    spinner.succeed('Container started');

    spinner.start('Configuring MCP servers...');
    await sandboxManager.setupMCP(sandbox.id);
    spinner.succeed('MCP servers configured');

    if (templateConfig.postCreate && templateConfig.postCreate.length > 0) {
      spinner.start('Running post-create commands...');
      await sandboxManager.runPostCreateCommands(sandbox.id, templateConfig.postCreate);
      spinner.succeed('Post-create commands completed');
    }

    // Get final sandbox info
    const sandboxInfo = await sandboxManager.getSandboxInfo(sandbox.id);
    
    if (!sandboxInfo) {
      throw new Error('Failed to get sandbox information after creation');
    }
    
    console.log('\n' + chalk.green('✓ Sandbox created successfully!'));
    console.log('\n' + chalk.bold('Sandbox Details:'));
    console.log(`Name: ${chalk.cyan(sandboxInfo.sandbox.name)}`);
    console.log(`ID: ${chalk.gray(sandboxInfo.sandbox.id)}`);
    console.log(`Status: ${chalk.green(sandboxInfo.sandbox.status)}`);
    console.log(`MCP Connection: ${chalk.yellow(sandboxInfo.mcpConnection || 'Not available')}`);
    console.log(`Working Directory: ${chalk.blue(sandboxInfo.workingDirectory)}`);

    if (sandboxInfo.mcpConnection) {
      console.log('\n' + chalk.bold('To connect from Claude Code, use:'));
      console.log(chalk.cyan(`npx mcp-proxy connect ${sandboxInfo.mcpConnection}`));
    }

    console.log('\n' + chalk.bold('Useful commands:'));
    console.log(`View logs: ${chalk.gray(`dcsandbox logs ${sandbox.id}`)}`);
    console.log(`Get info: ${chalk.gray(`dcsandbox info ${sandbox.id}`)}`);
    console.log(`Stop sandbox: ${chalk.gray(`dcsandbox stop ${sandbox.id}`)}`);

  } catch (error) {
    spinner.fail('Failed to create sandbox');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function extractRepoName(gitUrl: string): string {
  // Extract repository name from git URL
  const match = gitUrl.match(/\/([^\/]+?)(?:\.git)?$/);
  return match ? match[1] : 'repo';
}