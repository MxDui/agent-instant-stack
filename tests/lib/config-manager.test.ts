import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConfigManager } from '../../src/lib/config-manager';
import { createMockLogger } from '../mocks/logger.mock';
import { createFileSystemWithFiles } from '../mocks/filesystem.mock';
import type { Logger, FileSystem, GlobalConfig, ProjectConfig } from '../../src/types';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let mockLogger: jest.Mocked<Logger>;
  let mockFileSystem: jest.Mocked<FileSystem>;

  const validGlobalConfig: GlobalConfig = {
    defaultTemplate: 'node',
    defaultMemory: '2G',
    defaultCpu: 2,
    defaultTimeout: 120,
    maxSandboxes: 10,
    mcpPort: 3000,
    logLevel: 'info',
  };

  const validProjectConfig: ProjectConfig = {
    name: 'test-project',
    template: 'typescript',
    memory: '4G',
    cpu: 4,
    timeout: 240,
    environment: {
      NODE_ENV: 'development',
    },
    ports: [3000, 8080],
    volumes: ['/app/data:/data'],
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockFileSystem = createFileSystemWithFiles({
      '/global/config.yml': `
defaultTemplate: node
defaultMemory: 2G
defaultCpu: 2
defaultTimeout: 120
maxSandboxes: 10
mcpPort: 3000
logLevel: info
      `,
      '/project/config.yml': `
name: test-project
template: typescript
memory: 4G
cpu: 4
timeout: 240
environment:
  NODE_ENV: development
ports:
  - 3000
  - 8080
volumes:
  - /app/data:/data
      `,
    });

    configManager = new ConfigManager('/global/config.yml', mockLogger, mockFileSystem);
  });

  describe('constructor', () => {
    it('should create ConfigManager with valid parameters', () => {
      expect(configManager).toBeInstanceOf(ConfigManager);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ConfigManager initialized',
        expect.objectContaining({
          globalConfigPath: '/global/config.yml',
        })
      );
    });

    it('should throw error with invalid globalConfigPath', () => {
      expect(() => {
        new ConfigManager('', mockLogger, mockFileSystem);
      }).toThrow('Global config path is required');
    });

    it('should throw error with null logger', () => {
      expect(() => {
        new ConfigManager('/global/config.yml', null as any, mockFileSystem);
      }).toThrow('Logger is required');
    });
  });

  describe('loadGlobalConfig', () => {
    it('should load valid global configuration', async () => {
      const result = await configManager.loadGlobalConfig();

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validGlobalConfig);
      }
    });

    it('should return error for non-existent config file', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      const result = await configManager.loadGlobalConfig();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_NOT_FOUND');
      }
    });

    it('should return error for invalid YAML', async () => {
      mockFileSystem.readFile.mockResolvedValue('invalid: yaml: content:');

      const result = await configManager.loadGlobalConfig();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_PARSE_ERROR');
      }
    });

    it('should return error for invalid configuration schema', async () => {
      mockFileSystem.readFile.mockResolvedValue(`
defaultTemplate: node
defaultMemory: invalid-memory
defaultCpu: -1
      `);

      const result = await configManager.loadGlobalConfig();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_VALIDATION_ERROR');
      }
    });
  });

  describe('loadProjectConfig', () => {
    it('should load valid project configuration', async () => {
      const result = await configManager.loadProjectConfig('/project/config.yml');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validProjectConfig);
      }
    });

    it('should return error for invalid project config path', async () => {
      const result = await configManager.loadProjectConfig('');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PATH');
      }
    });

    it('should return error for non-existent project config', async () => {
      const result = await configManager.loadProjectConfig('/nonexistent/config.yml');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_NOT_FOUND');
      }
    });
  });

  describe('mergeConfigs', () => {
    it('should merge global and project configs correctly', async () => {
      const globalResult = await configManager.loadGlobalConfig();
      const projectResult = await configManager.loadProjectConfig('/project/config.yml');

      expect(globalResult.success).toBe(true);
      expect(projectResult.success).toBe(true);

      if (globalResult.success && projectResult.success) {
        const result = configManager.mergeConfigs(globalResult.data, projectResult.data);

        expect(result).toBeValidResult();
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.name).toBe('test-project');
          expect(result.data.template).toBe('typescript');
          expect(result.data.memory).toBe('4G');
          expect(result.data.cpu).toBe(4);
          expect(result.data.timeout).toBe(240);
          expect(result.data.maxSandboxes).toBe(10); // From global config
          expect(result.data.mcpPort).toBe(3000); // From global config
        }
      }
    });

    it('should handle project config overriding global config', async () => {
      const globalConfig: GlobalConfig = {
        defaultTemplate: 'node',
        defaultMemory: '2G',
        defaultCpu: 2,
        defaultTimeout: 120,
        maxSandboxes: 10,
        mcpPort: 3000,
        logLevel: 'info',
      };

      const projectConfig: ProjectConfig = {
        name: 'override-project',
        template: 'python',
        memory: '8G',
        cpu: 8,
        timeout: 300,
      };

      const result = configManager.mergeConfigs(globalConfig, projectConfig);

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.template).toBe('python');
        expect(result.data.memory).toBe('8G');
        expect(result.data.cpu).toBe(8);
        expect(result.data.timeout).toBe(300);
      }
    });
  });

  describe('saveConfig', () => {
    it('should save configuration successfully', async () => {
      const config = validGlobalConfig;
      const result = await configManager.saveConfig('/new/config.yml', config);

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      expect(mockFileSystem.writeFile).toHaveBeenCalledWith(
        '/new/config.yml',
        expect.stringContaining('defaultTemplate: node')
      );
    });

    it('should return error for invalid save path', async () => {
      const config = validGlobalConfig;
      const result = await configManager.saveConfig('', config);

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PATH');
      }
    });

    it('should handle file system write errors', async () => {
      mockFileSystem.writeFile.mockRejectedValue(new Error('Permission denied'));
      
      const config = validGlobalConfig;
      const result = await configManager.saveConfig('/new/config.yml', config);

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_SAVE_ERROR');
      }
    });
  });

  describe('validateConfig', () => {
    it('should validate correct global configuration', () => {
      const result = configManager.validateConfig(validGlobalConfig, 'global');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
    });

    it('should validate correct project configuration', () => {
      const result = configManager.validateConfig(validProjectConfig, 'project');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
    });

    it('should reject invalid global configuration', () => {
      const invalidConfig = {
        defaultTemplate: 'node',
        defaultMemory: 'invalid',
        defaultCpu: -1,
      };

      const result = configManager.validateConfig(invalidConfig, 'global');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_VALIDATION_ERROR');
      }
    });

    it('should reject invalid project configuration', () => {
      const invalidConfig = {
        name: '',
        template: 'unknown-template',
        memory: 'invalid',
        cpu: 0,
      };

      const result = configManager.validateConfig(invalidConfig, 'project');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_VALIDATION_ERROR');
      }
    });
  });

  describe('error handling', () => {
    it('should log errors appropriately', async () => {
      mockFileSystem.exists.mockResolvedValue(false);

      await configManager.loadGlobalConfig();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load global configuration',
        expect.objectContaining({
          path: '/global/config.yml',
          error: expect.any(Object),
        })
      );
    });

    it('should handle file system exceptions gracefully', async () => {
      mockFileSystem.readFile.mockRejectedValue(new Error('Disk full'));

      const result = await configManager.loadGlobalConfig();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONFIG_READ_ERROR');
      }
    });
  });
});