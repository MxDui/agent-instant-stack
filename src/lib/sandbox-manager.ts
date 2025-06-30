/**
 * Sandbox Manager with comprehensive error handling and type safety
 * @fileoverview Manages Docker containers for sandbox environments
 */

import Docker from 'dockerode';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import Joi from 'joi';

// Type imports
import type { 
  SandboxConfig, 
  SandboxInfo, 
  Template, 
  Result, 
  Logger, 
  FileSystem,
  ContainerInfo,
  SandboxStatus,
  ValidationResult,
  ValidationError
} from '../types';
import type { MCPProxy } from './mcp-proxy';

/**
 * Custom error class for sandbox operations
 */
export class SandboxError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Sandbox configuration validation schema
 */
const sandboxConfigSchema = Joi.object({
  id: Joi.string().alphanum().min(3).max(50).required(),
  name: Joi.string().min(1).max(100).required(),
  status: Joi.string().valid('creating', 'running', 'stopped', 'error').required(),
  created: Joi.date().required(),
  template: Joi.string().alphanum().min(1).max(50).required(),
  git: Joi.object({
    url: Joi.string().uri().required(),
    branch: Joi.string().min(1).max(100).required(),
    clonePath: Joi.string().optional()
  }).optional(),
  mcp: Joi.object({
    enabled: Joi.boolean().required(),
    servers: Joi.array().items(Joi.object({
      name: Joi.string().alphanum().min(1).max(50).required(),
      command: Joi.string().min(1).required(),
      args: Joi.array().items(Joi.string()).required(),
      env: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      enabled: Joi.boolean().required()
    })).required(),
    proxyPort: Joi.number().port().optional()
  }).required(),
  resources: Joi.object({
    memory: Joi.string().pattern(/^\d+[KMGT]?$/i).required(),
    cpu: Joi.number().integer().min(1).max(32).required(),
    disk: Joi.string().pattern(/^\d+[KMGT]?$/i).required(),
    timeout: Joi.number().integer().min(30).max(3600).required()
  }).required(),
  containerId: Joi.string().optional(),
  mcpPort: Joi.number().port().optional()
});

/**
 * Sandbox Manager with proper error handling and validation
 */
export class SandboxManager {
  private readonly docker: Docker;
  private readonly mcpProxy: MCPProxy;
  private readonly sandboxesDir: string;
  private readonly logger: Logger;
  private readonly fileSystem: FileSystem;

  /**
   * Creates a new SandboxManager instance
   * @param docker - Docker client instance
   * @param mcpProxy - MCP proxy instance
   * @param logger - Logger instance for structured logging
   * @param fileSystem - File system abstraction for testing
   */
  constructor(
    docker: Docker,
    mcpProxy: MCPProxy,
    logger: Logger,
    fileSystem?: FileSystem
  ) {
    this.docker = docker;
    this.mcpProxy = mcpProxy;
    this.logger = logger;
    this.fileSystem = fileSystem || this.createDefaultFileSystem();
    this.sandboxesDir = path.join(os.homedir(), '.dcsandbox', 'sandboxes');

    this.validateConstructorInputs();
  }

  /**
   * Validates constructor inputs
   * @private
   */
  private validateConstructorInputs(): void {
    if (!this.docker) {
      throw new SandboxError(
        'Docker client is required for SandboxManager',
        'MISSING_DEPENDENCY',
        { component: 'SandboxManager' }
      );
    }

    if (!this.mcpProxy) {
      throw new SandboxError(
        'MCP proxy is required for SandboxManager',
        'MISSING_DEPENDENCY',
        { component: 'SandboxManager' }
      );
    }

    if (!this.logger) {
      throw new SandboxError(
        'Logger is required for SandboxManager',
        'MISSING_DEPENDENCY',
        { component: 'SandboxManager' }
      );
    }
  }

  /**
   * Creates default file system implementation
   * @private
   */
  private createDefaultFileSystem(): FileSystem {
    return {
      readFile: (filePath: string) => fs.readFile(filePath, 'utf8'),
      writeFile: (filePath: string, content: string) => fs.writeFile(filePath, content),
      mkdir: (dirPath: string, options?: { recursive?: boolean }) => 
        fs.mkdir(dirPath, options),
      rmdir: (dirPath: string, options?: { recursive?: boolean; force?: boolean }) => 
        fs.rm(dirPath, options),
      exists: async (filePath: string) => {
        try {
          await fs.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
      stat: async (filePath: string) => {
        const stats = await fs.stat(filePath);
        return {
          size: stats.size,
          mtime: stats.mtime,
          isDirectory: () => stats.isDirectory()
        };
      }
    };
  }

  /**
   * Creates a new sandbox with validation and error handling
   * @param config - Sandbox configuration
   * @param template - Template definition
   * @returns Promise resolving to created sandbox configuration
   */
  async createSandbox(
    config: SandboxConfig, 
    template: Template
  ): Promise<Result<SandboxConfig, SandboxError>> {
    try {
      this.logger.info('Creating sandbox', { 
        sandboxId: config.id, 
        template: template.name 
      });

      // Validate inputs
      const validationResult = await this.validateSandboxConfig(config);
      if (!validationResult.valid) {
        const error = new SandboxError(
          'Invalid sandbox configuration',
          'VALIDATION_FAILED',
          { errors: validationResult.errors }
        );
        return { success: false, error };
      }

      const templateValidationResult = await this.validateTemplate(template);
      if (!templateValidationResult.valid) {
        const error = new SandboxError(
          'Invalid template configuration',
          'TEMPLATE_VALIDATION_FAILED',
          { errors: templateValidationResult.errors }
        );
        return { success: false, error };
      }

      return await this.performSandboxCreation(config, template);
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to create sandbox',
        'CREATE_FAILED',
        { 
          sandboxId: config.id,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to create sandbox', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Performs the actual sandbox creation steps
   * @private
   */
  private async performSandboxCreation(
    config: SandboxConfig, 
    template: Template
  ): Promise<Result<SandboxConfig, SandboxError>> {
    try {
      // Ensure sandboxes directory exists
      await this.fileSystem.mkdir(this.sandboxesDir, { recursive: true });

      // Create sandbox workspace directory
      const workspaceDir = path.join(this.sandboxesDir, config.id);
      await this.fileSystem.mkdir(workspaceDir, { recursive: true });

      this.logger.debug('Created workspace directory', { 
        sandboxId: config.id, 
        workspaceDir 
      });

      // Setup workspace content
      const workspaceSetupResult = await this.setupWorkspace(config, workspaceDir);
      if (!workspaceSetupResult.success) {
        return { success: false, error: workspaceSetupResult.error };
      }

      // Generate Docker assets
      const dockerAssetsResult = await this.generateDockerAssets(template, workspaceDir);
      if (!dockerAssetsResult.success) {
        return { success: false, error: dockerAssetsResult.error };
      }

      // Build Docker image
      const imageTag = `dcsandbox:${config.id}`;
      const buildResult = await this.buildDockerImage(workspaceDir, imageTag);
      if (!buildResult.success) {
        return { success: false, error: buildResult.error };
      }

      // Create container
      const containerResult = await this.createDockerContainer(config, template, imageTag, workspaceDir);
      if (!containerResult.success) {
        return { success: false, error: containerResult.error };
      }

      // Update config with container ID
      const updatedConfig: SandboxConfig = {
        ...config,
        containerId: containerResult.data.id,
        status: 'stopped'
      };

      // Save sandbox config
      const saveResult = await this.saveSandboxConfig(updatedConfig);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      this.logger.info('Sandbox created successfully', { 
        sandboxId: config.id,
        containerId: containerResult.data.id 
      });

      return { success: true, data: updatedConfig };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed during sandbox creation',
        'CREATION_STEP_FAILED',
        { 
          sandboxId: config.id,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Starts a sandbox with proper error handling
   * @param sandboxId - Unique sandbox identifier
   * @returns Promise resolving to operation result
   */
  async startSandbox(sandboxId: string): Promise<Result<void, SandboxError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new SandboxError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.info('Starting sandbox', { sandboxId });

      const configResult = await this.getSandbox(sandboxId);
      if (!configResult.success) {
        return { success: false, error: configResult.error };
      }

      const config = configResult.data;
      if (!config) {
        const error = new SandboxError(
          `Sandbox ${sandboxId} not found`,
          'SANDBOX_NOT_FOUND',
          { sandboxId }
        );
        return { success: false, error };
      }

      if (!config.containerId) {
        const error = new SandboxError(
          `Sandbox ${sandboxId} has no container`,
          'NO_CONTAINER',
          { sandboxId }
        );
        return { success: false, error };
      }

      const container = this.docker.getContainer(config.containerId);
      await container.start();

      // Allocate MCP port
      const mcpPortResult = await this.mcpProxy.allocatePort();
      if (!mcpPortResult.success) {
        // Attempt to stop container if MCP port allocation fails
        try {
          await container.stop();
        } catch (stopError) {
          this.logger.warn('Failed to stop container after MCP port allocation failure', {
            sandboxId,
            containerId: config.containerId,
            error: stopError
          });
        }
        return { success: false, error: mcpPortResult.error };
      }
      
      // Update config
      const updatedConfig: SandboxConfig = {
        ...config,
        status: 'running',
        mcpPort: mcpPortResult.data
      };
      
      const saveResult = await this.saveSandboxConfig(updatedConfig);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      this.logger.info('Sandbox started successfully', { 
        sandboxId,
        mcpPort: mcpPortResult.data 
      });

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to start sandbox',
        'START_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to start sandbox', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Stops a sandbox with proper error handling
   * @param sandboxId - Unique sandbox identifier
   * @returns Promise resolving to operation result
   */
  async stopSandbox(sandboxId: string): Promise<Result<void, SandboxError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new SandboxError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.info('Stopping sandbox', { sandboxId });

      const configResult = await this.getSandbox(sandboxId);
      if (!configResult.success) {
        return { success: false, error: configResult.error };
      }

      const config = configResult.data;
      if (!config) {
        const error = new SandboxError(
          `Sandbox ${sandboxId} not found`,
          'SANDBOX_NOT_FOUND',
          { sandboxId }
        );
        return { success: false, error };
      }

      if (!config.containerId) {
        const error = new SandboxError(
          `Sandbox ${sandboxId} has no container`,
          'NO_CONTAINER',
          { sandboxId }
        );
        return { success: false, error };
      }

      const container = this.docker.getContainer(config.containerId);
      await container.stop();

      // Release MCP port
      if (config.mcpPort) {
        const releaseResult = await this.mcpProxy.releasePort(config.mcpPort);
        if (!releaseResult.success) {
          this.logger.warn('Failed to release MCP port', {
            sandboxId,
            mcpPort: config.mcpPort,
            error: releaseResult.error
          });
        }
      }

      // Update config
      const updatedConfig: SandboxConfig = {
        ...config,
        status: 'stopped',
        mcpPort: undefined
      };
      
      const saveResult = await this.saveSandboxConfig(updatedConfig);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }

      this.logger.info('Sandbox stopped successfully', { sandboxId });

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to stop sandbox',
        'STOP_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to stop sandbox', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Removes a sandbox completely with proper cleanup
   * @param sandboxId - Unique sandbox identifier
   * @returns Promise resolving to operation result
   */
  async removeSandbox(sandboxId: string): Promise<Result<void, SandboxError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new SandboxError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.info('Removing sandbox', { sandboxId });

      return await this.performSandboxRemoval(sandboxId);
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to remove sandbox',
        'REMOVE_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to remove sandbox', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Performs the actual sandbox removal steps
   * @private
   */
  private async performSandboxRemoval(sandboxId: string): Promise<Result<void, SandboxError>> {
    const configResult = await this.getSandbox(sandboxId);
    if (!configResult.success) {
      return { success: false, error: configResult.error };
    }

    const config = configResult.data;
    if (!config) {
      const error = new SandboxError(
        `Sandbox ${sandboxId} not found`,
        'SANDBOX_NOT_FOUND',
        { sandboxId }
      );
      return { success: false, error };
    }

    // Stop if running
    if (config.status === 'running') {
      const stopResult = await this.stopSandbox(sandboxId);
      if (!stopResult.success) {
        this.logger.warn('Failed to stop sandbox during removal', {
          sandboxId,
          error: stopResult.error
        });
        // Continue with removal even if stop fails
      }
    }

    // Remove container
    if (config.containerId) {
      try {
        const container = this.docker.getContainer(config.containerId);
        await container.remove({ force: true });
        this.logger.debug('Container removed successfully', {
          sandboxId,
          containerId: config.containerId
        });
      } catch (error) {
        this.logger.warn('Could not remove container', {
          sandboxId,
          containerId: config.containerId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Remove sandbox directory
    const sandboxDir = path.join(this.sandboxesDir, sandboxId);
    try {
      await this.fileSystem.rmdir(sandboxDir, { recursive: true, force: true });
      this.logger.debug('Sandbox directory removed successfully', {
        sandboxId,
        sandboxDir
      });
    } catch (error) {
      this.logger.warn('Could not remove sandbox directory', {
        sandboxId,
        sandboxDir,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Remove from git clone cache if applicable
    if (config.git?.clonePath) {
      try {
        await this.fileSystem.rmdir(config.git.clonePath, { recursive: true, force: true });
        this.logger.debug('Git clone removed successfully', {
          sandboxId,
          clonePath: config.git.clonePath
        });
      } catch (error) {
        this.logger.warn('Could not remove git clone', {
          sandboxId,
          clonePath: config.git.clonePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.logger.info('Sandbox removed successfully', { sandboxId });
    return { success: true, data: undefined };
  }

  /**
   * Gets sandbox configuration with validation
   * @param sandboxId - Unique sandbox identifier
   * @returns Promise resolving to sandbox configuration or null
   */
  async getSandbox(sandboxId: string): Promise<Result<SandboxConfig | null, SandboxError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new SandboxError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.debug('Getting sandbox configuration', { sandboxId });

      const configPath = path.join(this.sandboxesDir, sandboxId, 'config.json');
      
      const configExists = await this.fileSystem.exists(configPath);
      if (!configExists) {
        this.logger.debug('Sandbox configuration not found', {
          sandboxId,
          configPath
        });
        return { success: true, data: null };
      }

      const configData = await this.fileSystem.readFile(configPath);
      const config = JSON.parse(configData);
      
      // Convert date strings back to Date objects
      if (config.created) {
        config.created = new Date(config.created);
      }

      // Validate the loaded configuration
      const validationResult = await this.validateSandboxConfig(config);
      if (!validationResult.valid) {
        const error = new SandboxError(
          'Invalid stored sandbox configuration',
          'INVALID_STORED_CONFIG',
          { 
            sandboxId,
            errors: validationResult.errors 
          }
        );
        return { success: false, error };
      }
      
      this.logger.debug('Sandbox configuration loaded successfully', {
        sandboxId
      });
      
      return { success: true, data: config };
    } catch (error) {
      if (error instanceof SyntaxError) {
        const sandboxError = new SandboxError(
          'Invalid JSON in sandbox configuration',
          'INVALID_JSON',
          { 
            sandboxId,
            error: error.message 
          }
        );
        return { success: false, error: sandboxError };
      }

      const sandboxError = new SandboxError(
        'Failed to load sandbox configuration',
        'LOAD_CONFIG_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to load sandbox configuration', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Lists all sandboxes with proper error handling
   * @returns Promise resolving to list of sandbox configurations
   */
  async listSandboxes(): Promise<Result<SandboxConfig[], SandboxError>> {
    try {
      this.logger.debug('Listing sandboxes');

      await this.fileSystem.mkdir(this.sandboxesDir, { recursive: true });
      
      const sandboxDirExists = await this.fileSystem.exists(this.sandboxesDir);
      if (!sandboxDirExists) {
        this.logger.debug('Sandboxes directory does not exist');
        return { success: true, data: [] };
      }

      const entries = await fs.readdir(this.sandboxesDir);
      const sandboxes: SandboxConfig[] = [];
      const errors: string[] = [];

      for (const entry of entries) {
        const sandboxResult = await this.getSandbox(entry);
        if (sandboxResult.success && sandboxResult.data) {
          sandboxes.push(sandboxResult.data);
        } else if (!sandboxResult.success) {
          errors.push(`Failed to load sandbox ${entry}: ${sandboxResult.error.message}`);
        }
      }

      if (errors.length > 0) {
        this.logger.warn('Some sandboxes failed to load', { errors });
      }

      const sortedSandboxes = sandboxes.sort(
        (a, b) => b.created.getTime() - a.created.getTime()
      );

      this.logger.debug('Sandboxes listed successfully', {
        count: sortedSandboxes.length,
        errors: errors.length
      });

      return { success: true, data: sortedSandboxes };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to list sandboxes',
        'LIST_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to list sandboxes', {
        error: sandboxError.message,
        context: sandboxError.context
      });
      
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Saves sandbox configuration with validation
   * @private
   */
  private async saveSandboxConfig(config: SandboxConfig): Promise<Result<void, SandboxError>> {
    try {
      const validationResult = await this.validateSandboxConfig(config);
      if (!validationResult.valid) {
        const error = new SandboxError(
          'Invalid sandbox configuration for saving',
          'VALIDATION_FAILED',
          { 
            sandboxId: config.id,
            errors: validationResult.errors 
          }
        );
        return { success: false, error };
      }

      const configPath = path.join(this.sandboxesDir, config.id, 'config.json');
      await this.fileSystem.writeFile(configPath, JSON.stringify(config, null, 2));
      
      this.logger.debug('Sandbox configuration saved', {
        sandboxId: config.id,
        configPath
      });
      
      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to save sandbox configuration',
        'SAVE_CONFIG_FAILED',
        { 
          sandboxId: config.id,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Validates sandbox configuration
   * @private
   */
  private async validateSandboxConfig(config: unknown): Promise<ValidationResult> {
    try {
      const { error } = sandboxConfigSchema.validate(config, { 
        abortEarly: false,
        allowUnknown: false 
      });
      
      if (error) {
        const validationErrors: ValidationError[] = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context?.value
        }));
        
        return { valid: false, errors: validationErrors };
      }
      
      return { valid: true, errors: [] };
    } catch (error) {
      const validationError: ValidationError = {
        field: 'root',
        message: 'Sandbox configuration validation failed',
        value: config
      };
      
      return { valid: false, errors: [validationError] };
    }
  }

  /**
   * Validates template configuration
   * @private
   */
  private async validateTemplate(template: unknown): Promise<ValidationResult> {
    try {
      // Basic template validation - could be expanded with a proper schema
      if (!template || typeof template !== 'object') {
        return {
          valid: false,
          errors: [{
            field: 'template',
            message: 'Template must be an object',
            value: template
          }]
        };
      }

      const t = template as Record<string, unknown>;
      const errors: ValidationError[] = [];

      if (!t.name || typeof t.name !== 'string') {
        errors.push({
          field: 'template.name',
          message: 'Template name is required and must be a string',
          value: t.name
        });
      }

      if (!t.baseImage || typeof t.baseImage !== 'string') {
        errors.push({
          field: 'template.baseImage',
          message: 'Template baseImage is required and must be a string',
          value: t.baseImage
        });
      }

      if (!Array.isArray(t.features)) {
        errors.push({
          field: 'template.features',
          message: 'Template features must be an array',
          value: t.features
        });
      }

      return { valid: errors.length === 0, errors };
    } catch (error) {
      const validationError: ValidationError = {
        field: 'template',
        message: 'Template validation failed',
        value: template
      };
      
      return { valid: false, errors: [validationError] };
    }
  }

  /**
   * Parses memory string to bytes with validation
   * @private
   */
  private parseMemory(memoryStr: string): Result<number, SandboxError> {
    try {
      if (!memoryStr || typeof memoryStr !== 'string') {
        const error = new SandboxError(
          'Memory string must be a non-empty string',
          'INVALID_MEMORY_FORMAT',
          { memoryStr }
        );
        return { success: false, error };
      }

      const match = memoryStr.match(/^(\d+)([KMGT]?)$/i);
      if (!match) {
        const error = new SandboxError(
          `Invalid memory format: ${memoryStr}`,
          'INVALID_MEMORY_FORMAT',
          { memoryStr }
        );
        return { success: false, error };
      }

      const value = parseInt(match[1], 10);
      const unit = match[2].toUpperCase();

      if (isNaN(value) || value <= 0) {
        const error = new SandboxError(
          `Invalid memory value: ${value}`,
          'INVALID_MEMORY_VALUE',
          { memoryStr, value }
        );
        return { success: false, error };
      }

      let bytes: number;
      switch (unit) {
        case 'K': bytes = value * 1024; break;
        case 'M': bytes = value * 1024 * 1024; break;
        case 'G': bytes = value * 1024 * 1024 * 1024; break;
        case 'T': bytes = value * 1024 * 1024 * 1024 * 1024; break;
        default: bytes = value; break;
      }

      return { success: true, data: bytes };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to parse memory string',
        'MEMORY_PARSE_FAILED',
        { 
          memoryStr,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Generates exposed ports configuration
   * @private
   */
  private generateExposedPorts(ports: readonly number[]): Record<string, Record<string, never>> {
    const exposedPorts: Record<string, Record<string, never>> = {};
    
    for (const port of ports) {
      if (typeof port === 'number' && port > 0 && port <= 65535) {
        exposedPorts[`${port}/tcp`] = {};
      } else {
        this.logger.warn('Invalid port number ignored', { port });
      }
    }
    
    return exposedPorts;
  }

  /**
   * Copies directory recursively with error handling
   * @private
   */
  private async copyDirectory(src: string, dest: string): Promise<Result<void, SandboxError>> {
    try {
      await this.fileSystem.mkdir(dest, { recursive: true });
      const entries = await fs.readdir(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          const copyResult = await this.copyDirectory(srcPath, destPath);
          if (!copyResult.success) {
            return copyResult;
          }
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to copy directory',
        'COPY_FAILED',
        { 
          src,
          dest,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Sets up workspace content
   * @private
   */
  private async setupWorkspace(
    config: SandboxConfig, 
    workspaceDir: string
  ): Promise<Result<void, SandboxError>> {
    try {
      if (config.git?.clonePath) {
        const destPath = path.join(workspaceDir, 'workspace');
        const copyResult = await this.copyDirectory(config.git.clonePath, destPath);
        if (!copyResult.success) {
          return copyResult;
        }
      } else {
        // Create empty workspace
        await this.fileSystem.mkdir(path.join(workspaceDir, 'workspace'), { recursive: true });
      }

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to setup workspace',
        'WORKSPACE_SETUP_FAILED',
        { 
          sandboxId: config.id,
          workspaceDir,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Generates Docker assets (Dockerfile, devcontainer.json)
   * @private
   */
  private async generateDockerAssets(
    template: Template, 
    workspaceDir: string
  ): Promise<Result<void, SandboxError>> {
    try {
      // Create Dockerfile from template
      const dockerfile = this.generateDockerfile(template);
      await this.fileSystem.writeFile(path.join(workspaceDir, 'Dockerfile'), dockerfile);

      // Create devcontainer.json
      const devcontainerConfig = this.generateDevcontainerConfig(template);
      const devcontainerDir = path.join(workspaceDir, '.devcontainer');
      await this.fileSystem.mkdir(devcontainerDir, { recursive: true });
      await this.fileSystem.writeFile(
        path.join(devcontainerDir, 'devcontainer.json'),
        JSON.stringify(devcontainerConfig, null, 2)
      );

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to generate Docker assets',
        'DOCKER_ASSETS_FAILED',
        { 
          templateName: template.name,
          workspaceDir,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Builds Docker image
   * @private
   */
  private async buildDockerImage(
    workspaceDir: string, 
    imageTag: string
  ): Promise<Result<void, SandboxError>> {
    try {
      const stream = await this.docker.buildImage({
        context: workspaceDir,
        src: ['Dockerfile', 'workspace', '.devcontainer']
      }, { t: imageTag });

      // Wait for build to complete
      await new Promise<void>((resolve, reject) => {
        this.docker.modem.followProgress(stream, 
          (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          },
          (event: unknown) => {
            // Log build progress
            this.logger.debug('Docker build progress', { event });
          }
        );
      });

      return { success: true, data: undefined };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to build Docker image',
        'BUILD_FAILED',
        { 
          workspaceDir,
          imageTag,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  /**
   * Creates Docker container
   * @private
   */
  private async createDockerContainer(
    config: SandboxConfig,
    template: Template,
    imageTag: string,
    workspaceDir: string
  ): Promise<Result<Docker.Container, SandboxError>> {
    try {
      const memoryResult = this.parseMemory(config.resources.memory);
      if (!memoryResult.success) {
        return { success: false, error: memoryResult.error };
      }

      const container = await this.docker.createContainer({
        Image: imageTag,
        name: `dcsandbox-${config.id}`,
        WorkingDir: '/workspace',
        Env: [
          `SANDBOX_ID=${config.id}`,
          `SANDBOX_NAME=${config.name}`,
          ...Object.entries(template.environment || {}).map(
            ([key, value]) => `${key}=${value}`
          )
        ],
        HostConfig: {
          Memory: memoryResult.data,
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

      return { success: true, data: container };
    } catch (error) {
      const sandboxError = new SandboxError(
        'Failed to create Docker container',
        'CONTAINER_CREATE_FAILED',
        { 
          sandboxId: config.id,
          imageTag,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      return { success: false, error: sandboxError };
    }
  }

  // Keep existing methods for backward compatibility but with updated signatures
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
      ...Object.entries(template.environment || {}).map(
        ([key, value]) => `ENV ${key}=${value}`
      ),
      '',
      '# Expose ports',
      ...(template.ports?.map(port => `EXPOSE ${port}`) || []),
      '',
      '# Default command',
      'CMD ["/bin/bash"]'
    ];

    return dockerfile.join('\n');
  }

  private generateDevcontainerConfig(template: Template): Record<string, unknown> {
    return {
      name: `DevContainer Sandbox - ${template.name}`,
      dockerFile: '../Dockerfile',
      workspaceFolder: '/workspace',
      features: template.features.reduce(
        (acc, feature) => {
          acc[feature] = {};
          return acc;
        }, 
        {} as Record<string, Record<string, never>>
      ),
      forwardPorts: template.ports || [],
      postCreateCommand: template.postCreate?.join(' && '),
      customizations: {
        mcp: {
          servers: template.mcpServers
        }
      }
    };
  }
}