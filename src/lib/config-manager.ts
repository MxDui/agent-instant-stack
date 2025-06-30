/**
 * Configuration Manager with comprehensive error handling and validation
 * @fileoverview Manages global and project-specific configurations
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import Joi from 'joi';

// Type imports
import type { 
  GlobalConfig, 
  ProjectConfig, 
  ValidationResult, 
  ValidationError, 
  Result, 
  Logger, 
  FileSystem 
} from '../types';

/**
 * Custom error class for configuration operations
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Readonly<Record<string, unknown>>
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Configuration schema validation
 */
const globalConfigSchema = Joi.object({
  defaults: Joi.object({
    memory: Joi.string().pattern(/^\d+[KMGT]?$/i).required(),
    cpu: Joi.number().integer().min(1).max(32).required(),
    disk: Joi.string().pattern(/^\d+[KMGT]?$/i).required(),
    timeout: Joi.number().integer().min(30).max(3600).required(),
    autoCleanup: Joi.boolean().required()
  }).required(),
  container: Joi.object({
    runtime: Joi.string().valid('docker', 'podman').required(),
    network: Joi.string().min(1).required()
  }).required(),
  mcp: Joi.object({
    proxyHost: Joi.string().hostname().required(),
    portRange: Joi.array().items(Joi.number().port()).length(2).required()
  }).required(),
  cleanup: Joi.object({
    inactiveTimeout: Joi.string().pattern(/^\d+[smhd]$/).required(),
    onExit: Joi.boolean().required(),
    preserveNamed: Joi.boolean().required()
  }).required(),
  templates: Joi.object({
    customPath: Joi.string().optional(),
    autoUpdate: Joi.boolean().required()
  }).required()
});

const projectConfigSchema = Joi.object({
  name: Joi.string().alphanum().min(3).max(50).required(),
  created: Joi.string().isoDate().required(),
  template: Joi.string().alphanum().min(1).max(50).required(),
  git: Joi.object({
    url: Joi.string().uri().required(),
    branch: Joi.string().min(1).max(100).required()
  }).optional(),
  mcp: Joi.object({
    servers: Joi.array().items(Joi.string().alphanum().min(1).max(50)).required()
  }).required()
});

/**
 * Configuration Manager with proper error handling and validation
 */
export class ConfigManager {
  private readonly configDir: string;
  private readonly globalConfigPath: string;
  private readonly defaultConfig: GlobalConfig;
  private readonly logger: Logger;
  private readonly fileSystem: FileSystem;

  /**
   * Creates a new ConfigManager instance
   * @param logger - Logger instance for structured logging
   * @param fileSystem - File system abstraction for testing
   */
  constructor(
    logger: Logger,
    fileSystem?: FileSystem
  ) {
    this.logger = logger;
    this.fileSystem = fileSystem || this.createDefaultFileSystem();
    this.configDir = path.join(os.homedir(), '.config', 'dcsandbox');
    this.globalConfigPath = path.join(this.configDir, 'config.yaml');
    
    this.defaultConfig = {
      defaults: {
        memory: '2G',
        cpu: 2,
        disk: '10G',
        timeout: 120,
        autoCleanup: true
      },
      container: {
        runtime: 'docker',
        network: 'bridge'
      },
      mcp: {
        proxyHost: 'localhost',
        portRange: [50000, 60000] as const
      },
      cleanup: {
        inactiveTimeout: '4h',
        onExit: true,
        preserveNamed: false
      },
      templates: {
        autoUpdate: true
      }
    };

    this.validateConstructorInputs();
  }

  /**
   * Validates constructor inputs
   * @private
   */
  private validateConstructorInputs(): void {
    if (!this.logger) {
      throw new ConfigError(
        'Logger is required for ConfigManager', 
        'MISSING_DEPENDENCY',
        { component: 'ConfigManager' }
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
   * Gets the global configuration with validation
   * @returns Promise resolving to validated global configuration
   */
  async getGlobalConfig(): Promise<Result<GlobalConfig, ConfigError>> {
    try {
      this.logger.debug('Loading global configuration', { 
        configPath: this.globalConfigPath 
      });

      await this.ensureConfigDir();
      
      const configExists = await this.fileSystem.exists(this.globalConfigPath);
      if (!configExists) {
        this.logger.info('Configuration file not found, using defaults');
        return { success: true, data: this.defaultConfig };
      }

      const configContent = await this.fileSystem.readFile(this.globalConfigPath);
      const parsedConfig = this.parseYAML(configContent);
      
      if (!parsedConfig.success) {
        return { success: false, error: parsedConfig.error };
      }

      const validationResult = await this.validateGlobalConfig(parsedConfig.data);
      if (!validationResult.valid) {
        const error = new ConfigError(
          'Invalid configuration format',
          'VALIDATION_FAILED',
          { errors: validationResult.errors }
        );
        return { success: false, error };
      }
      
      const mergedConfig = this.mergeWithDefaults(parsedConfig.data);
      
      this.logger.info('Global configuration loaded successfully');
      return { success: true, data: mergedConfig };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to load global configuration',
        'LOAD_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to load global configuration', { 
        error: configError.message,
        context: configError.context 
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Saves global configuration with validation
   * @param config - Partial configuration to merge with current
   * @returns Promise resolving to operation result
   */
  async saveGlobalConfig(config: Partial<GlobalConfig>): Promise<Result<void, ConfigError>> {
    try {
      this.logger.debug('Saving global configuration', { config });

      await this.ensureConfigDir();
      
      const currentConfigResult = await this.getGlobalConfig();
      if (!currentConfigResult.success) {
        return { success: false, error: currentConfigResult.error };
      }

      const mergedConfig = this.deepMerge(currentConfigResult.data, config);
      
      const validationResult = await this.validateGlobalConfig(mergedConfig);
      if (!validationResult.valid) {
        const error = new ConfigError(
          'Invalid configuration data',
          'VALIDATION_FAILED',
          { errors: validationResult.errors }
        );
        return { success: false, error };
      }
      
      const yamlContent = YAML.stringify(mergedConfig);
      await this.fileSystem.writeFile(this.globalConfigPath, yamlContent);
      
      this.logger.info('Global configuration saved successfully');
      return { success: true, data: undefined };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to save global configuration',
        'SAVE_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to save global configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Gets a specific configuration value by path
   * @param configPath - Dot-separated path to configuration value
   * @returns Promise resolving to configuration value
   */
  async getConfigValue(configPath: string): Promise<Result<unknown, ConfigError>> {
    try {
      if (!configPath || typeof configPath !== 'string') {
        const error = new ConfigError(
          'Configuration path must be a non-empty string',
          'INVALID_PATH',
          { path: configPath }
        );
        return { success: false, error };
      }

      this.logger.debug('Getting configuration value', { path: configPath });

      const configResult = await this.getGlobalConfig();
      if (!configResult.success) {
        return { success: false, error: configResult.error };
      }

      const value = this.getNestedValue(configResult.data, configPath);
      
      this.logger.debug('Configuration value retrieved', { 
        path: configPath, 
        value: typeof value 
      });
      
      return { success: true, data: value };
    } catch (error) {
      const configError = new ConfigError(
        `Failed to get configuration value at path: ${configPath}`,
        'GET_VALUE_FAILED',
        { 
          path: configPath,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to get configuration value', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Sets a specific configuration value by path
   * @param configPath - Dot-separated path to configuration value
   * @param value - Value to set
   * @returns Promise resolving to operation result
   */
  async setConfigValue(configPath: string, value: unknown): Promise<Result<void, ConfigError>> {
    try {
      if (!configPath || typeof configPath !== 'string') {
        const error = new ConfigError(
          'Configuration path must be a non-empty string',
          'INVALID_PATH',
          { path: configPath, value }
        );
        return { success: false, error };
      }

      this.logger.debug('Setting configuration value', { 
        path: configPath, 
        value: typeof value 
      });

      const configResult = await this.getGlobalConfig();
      if (!configResult.success) {
        return { success: false, error: configResult.error };
      }

      const config = JSON.parse(JSON.stringify(configResult.data)); // Deep copy
      this.setNestedValue(config, configPath, value);
      
      const saveResult = await this.saveGlobalConfig(config);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      
      this.logger.info('Configuration value set successfully', { 
        path: configPath 
      });
      
      return { success: true, data: undefined };
    } catch (error) {
      const configError = new ConfigError(
        `Failed to set configuration value at path: ${configPath}`,
        'SET_VALUE_FAILED',
        { 
          path: configPath,
          value,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to set configuration value', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Resets configuration to defaults
   * @returns Promise resolving to operation result
   */
  async resetConfig(): Promise<Result<void, ConfigError>> {
    try {
      this.logger.info('Resetting configuration to defaults');
      
      await this.ensureConfigDir();
      const yamlContent = YAML.stringify(this.defaultConfig);
      await this.fileSystem.writeFile(this.globalConfigPath, yamlContent);
      
      this.logger.info('Configuration reset successfully');
      return { success: true, data: undefined };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to reset configuration',
        'RESET_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to reset configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Saves project-specific configuration
   * @param sandboxId - Unique sandbox identifier
   * @param config - Project configuration to save
   * @returns Promise resolving to operation result
   */
  async saveProjectConfig(
    sandboxId: string, 
    config: ProjectConfig
  ): Promise<Result<void, ConfigError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new ConfigError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.debug('Saving project configuration', { 
        sandboxId, 
        config 
      });

      const validationResult = await this.validateProjectConfig(config);
      if (!validationResult.valid) {
        const error = new ConfigError(
          'Invalid project configuration',
          'VALIDATION_FAILED',
          { errors: validationResult.errors }
        );
        return { success: false, error };
      }

      const sandboxDir = path.join(os.homedir(), '.dcsandbox', 'sandboxes', sandboxId);
      await this.fileSystem.mkdir(sandboxDir, { recursive: true });
      
      const configPath = path.join(sandboxDir, '.dcsandbox', 'config.yaml');
      await this.fileSystem.mkdir(path.dirname(configPath), { recursive: true });
      
      const yamlContent = YAML.stringify(config);
      await this.fileSystem.writeFile(configPath, yamlContent);
      
      this.logger.info('Project configuration saved successfully', { 
        sandboxId 
      });
      
      return { success: true, data: undefined };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to save project configuration',
        'PROJECT_SAVE_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to save project configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Gets project-specific configuration
   * @param sandboxId - Unique sandbox identifier
   * @returns Promise resolving to project configuration or null if not found
   */
  async getProjectConfig(
    sandboxId: string
  ): Promise<Result<ProjectConfig | null, ConfigError>> {
    try {
      if (!sandboxId || typeof sandboxId !== 'string') {
        const error = new ConfigError(
          'Sandbox ID must be a non-empty string',
          'INVALID_SANDBOX_ID',
          { sandboxId }
        );
        return { success: false, error };
      }

      this.logger.debug('Loading project configuration', { sandboxId });

      const configPath = path.join(
        os.homedir(), 
        '.dcsandbox', 
        'sandboxes', 
        sandboxId, 
        '.dcsandbox', 
        'config.yaml'
      );
      
      const configExists = await this.fileSystem.exists(configPath);
      if (!configExists) {
        this.logger.debug('Project configuration not found', { 
          sandboxId, 
          configPath 
        });
        return { success: true, data: null };
      }

      const configContent = await this.fileSystem.readFile(configPath);
      const parsedConfig = this.parseYAML(configContent);
      
      if (!parsedConfig.success) {
        return { success: false, error: parsedConfig.error };
      }

      const validationResult = await this.validateProjectConfig(parsedConfig.data);
      if (!validationResult.valid) {
        const error = new ConfigError(
          'Invalid project configuration format',
          'VALIDATION_FAILED',
          { errors: validationResult.errors }
        );
        return { success: false, error };
      }
      
      this.logger.debug('Project configuration loaded successfully', { 
        sandboxId 
      });
      
      return { success: true, data: parsedConfig.data };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to load project configuration',
        'PROJECT_LOAD_FAILED',
        { 
          sandboxId,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
      
      this.logger.error('Failed to load project configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Exports global configuration as YAML string
   * @returns Promise resolving to YAML configuration string
   */
  async exportConfig(): Promise<Result<string, ConfigError>> {
    try {
      this.logger.debug('Exporting global configuration');
      
      const configResult = await this.getGlobalConfig();
      if (!configResult.success) {
        return { success: false, error: configResult.error };
      }
      
      const yamlContent = YAML.stringify(configResult.data);
      
      this.logger.info('Configuration exported successfully');
      return { success: true, data: yamlContent };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to export configuration',
        'EXPORT_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to export configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Imports global configuration from YAML string
   * @param yamlContent - YAML configuration string
   * @returns Promise resolving to operation result
   */
  async importConfig(yamlContent: string): Promise<Result<void, ConfigError>> {
    try {
      if (!yamlContent || typeof yamlContent !== 'string') {
        const error = new ConfigError(
          'YAML content must be a non-empty string',
          'INVALID_YAML_CONTENT',
          { content: typeof yamlContent }
        );
        return { success: false, error };
      }

      this.logger.debug('Importing configuration from YAML');
      
      const parsedConfig = this.parseYAML(yamlContent);
      if (!parsedConfig.success) {
        return { success: false, error: parsedConfig.error };
      }
      
      const saveResult = await this.saveGlobalConfig(parsedConfig.data);
      if (!saveResult.success) {
        return { success: false, error: saveResult.error };
      }
      
      this.logger.info('Configuration imported successfully');
      return { success: true, data: undefined };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to import configuration',
        'IMPORT_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      this.logger.error('Failed to import configuration', {
        error: configError.message,
        context: configError.context
      });
      
      return { success: false, error: configError };
    }
  }

  /**
   * Validates global configuration using schema
   * @param config - Configuration object to validate
   * @returns Promise resolving to validation result
   */
  async validateGlobalConfig(config: unknown): Promise<ValidationResult> {
    try {
      const { error, value } = globalConfigSchema.validate(config, { 
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
        message: 'Configuration validation failed',
        value: config
      };
      
      return { valid: false, errors: [validationError] };
    }
  }

  /**
   * Validates project configuration using schema
   * @param config - Project configuration object to validate
   * @returns Promise resolving to validation result
   */
  async validateProjectConfig(config: unknown): Promise<ValidationResult> {
    try {
      const { error, value } = projectConfigSchema.validate(config, { 
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
        message: 'Project configuration validation failed',
        value: config
      };
      
      return { valid: false, errors: [validationError] };
    }
  }

  /**
   * Gets the configuration directory path
   * @returns Promise resolving to configuration directory path
   */
  async getConfigDir(): Promise<Result<string, ConfigError>> {
    try {
      await this.ensureConfigDir();
      return { success: true, data: this.configDir };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to get configuration directory',
        'GET_CONFIG_DIR_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      
      return { success: false, error: configError };
    }
  }

  /**
   * Ensures configuration directory exists
   * @private
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await this.fileSystem.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      throw new ConfigError(
        'Failed to create configuration directory',
        'CREATE_DIR_FAILED',
        { 
          configDir: this.configDir,
          error: error instanceof Error ? error.message : String(error) 
        }
      );
    }
  }

  /**
   * Parses YAML content safely
   * @private
   */
  private parseYAML(content: string): Result<unknown, ConfigError> {
    try {
      const parsed = YAML.parse(content);
      return { success: true, data: parsed };
    } catch (error) {
      const configError = new ConfigError(
        'Failed to parse YAML content',
        'YAML_PARSE_FAILED',
        { error: error instanceof Error ? error.message : String(error) }
      );
      return { success: false, error: configError };
    }
  }

  /**
   * Merges configuration with defaults
   * @private
   */
  private mergeWithDefaults(config: Partial<GlobalConfig>): GlobalConfig {
    return this.deepMerge(this.defaultConfig, config) as GlobalConfig;
  }

  /**
   * Deep merges two objects
   * @private
   */
  private deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && 
          typeof source[key] === 'object' && 
          !Array.isArray(source[key]) &&
          source[key] !== null) {
        result[key] = this.deepMerge(
          (target[key] as Record<string, unknown>) || {}, 
          source[key] as Record<string, unknown>
        );
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Gets nested value from object by path
   * @private
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce(
      (current: unknown, key: string) => {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          return (current as Record<string, unknown>)[key];
        }
        return undefined;
      }, 
      obj
    );
  }

  /**
   * Sets nested value in object by path
   * @private
   */
  private setNestedValue(
    obj: Record<string, unknown>, 
    path: string, 
    value: unknown
  ): void {
    const keys = path.split('.');
    const lastKey = keys.pop();
    
    if (!lastKey) {
      throw new ConfigError(
        'Invalid configuration path',
        'INVALID_PATH',
        { path }
      );
    }
    
    const target = keys.reduce(
      (current: Record<string, unknown>, key: string) => {
        if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
          current[key] = {};
        }
        return current[key] as Record<string, unknown>;
      }, 
      obj
    );
    
    target[lastKey] = value;
  }

  /**
   * Legacy validation method - replaced by Joi schema
   * @deprecated Use validateGlobalConfig instead
   * @private
   */
  private isValidMemorySize(size: string): boolean {
    return /^\d+[KMGT]?$/i.test(size);
  }
}