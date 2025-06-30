import { describe, it, expect, beforeEach } from '@jest/globals';
import { SandboxManager } from '../../src/lib/sandbox-manager';
import { createMockDocker } from '../mocks/docker.mock';
import { createMockLogger } from '../mocks/logger.mock';
import { createMockFileSystem } from '../mocks/filesystem.mock';
import type { SandboxConfig, Logger, FileSystem } from '../../src/types';
import type { Docker } from 'dockerode';

describe('SandboxManager', () => {
  let sandboxManager: SandboxManager;
  let mockDocker: jest.Mocked<Docker>;
  let mockLogger: jest.Mocked<Logger>;
  let mockFileSystem: jest.Mocked<FileSystem>;

  const validSandboxConfig: SandboxConfig = {
    id: 'test-sandbox-123',
    name: 'Test Sandbox',
    template: 'node',
    git: {
      url: 'https://github.com/user/repo.git',
      branch: 'main',
    },
    memory: '2G',
    cpu: 2,
    timeout: 120,
    environment: {
      NODE_ENV: 'development',
    },
    ports: [3000],
    volumes: ['/app/data:/data'],
    persist: false,
  };

  beforeEach(() => {
    mockDocker = createMockDocker();
    mockLogger = createMockLogger();
    mockFileSystem = createMockFileSystem();

    // Mock successful file system operations
    mockFileSystem.exists.mockResolvedValue(true);
    mockFileSystem.mkdir.mockResolvedValue(undefined);
    mockFileSystem.writeFile.mockResolvedValue(undefined);

    sandboxManager = new SandboxManager(mockDocker, mockLogger, mockFileSystem);
  });

  describe('constructor', () => {
    it('should create SandboxManager with valid dependencies', () => {
      expect(sandboxManager).toBeInstanceOf(SandboxManager);
      expect(mockLogger.debug).toHaveBeenCalledWith('SandboxManager initialized');
    });

    it('should throw error with null Docker client', () => {
      expect(() => {
        new SandboxManager(null as any, mockLogger, mockFileSystem);
      }).toThrow('Docker client is required');
    });

    it('should throw error with null logger', () => {
      expect(() => {
        new SandboxManager(mockDocker, null as any, mockFileSystem);
      }).toThrow('Logger is required');
    });

    it('should throw error with null file system', () => {
      expect(() => {
        new SandboxManager(mockDocker, mockLogger, null as any);
      }).toThrow('File system is required');
    });
  });

  describe('createSandbox', () => {
    it('should create sandbox with valid configuration', async () => {
      const result = await sandboxManager.createSandbox(validSandboxConfig);

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(validSandboxConfig.id);
        expect(result.data.name).toBe(validSandboxConfig.name);
        expect(result.data.status).toBe('running');
      }

      expect(mockDocker.createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validSandboxConfig.id,
          Image: expect.stringContaining('node'),
          Env: expect.arrayContaining(['NODE_ENV=development']),
          HostConfig: expect.objectContaining({
            Memory: 2147483648, // 2G in bytes
            NanoCpus: 2000000000, // 2 CPUs in nanocpus
          }),
        })
      );
    });

    it('should return error for invalid configuration', async () => {
      const invalidConfig = {
        ...validSandboxConfig,
        memory: 'invalid-memory',
        cpu: -1,
      };

      const result = await sandboxManager.createSandbox(invalidConfig);

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('should handle Docker container creation failure', async () => {
      mockDocker.createContainer.mockRejectedValue(new Error('Docker daemon not running'));

      const result = await sandboxManager.createSandbox(validSandboxConfig);

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTAINER_CREATE_FAILED');
      }
    });

    it('should clean up resources on failure', async () => {
      const mockContainer = {
        id: 'failed-container',
        start: jest.fn().mockRejectedValue(new Error('Start failed')),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockDocker.createContainer.mockResolvedValue(mockContainer as any);

      const result = await sandboxManager.createSandbox(validSandboxConfig);

      expect(result).toBeErrorResult();
      expect(mockContainer.remove).toHaveBeenCalled();
    });

    it('should handle workspace setup failure', async () => {
      mockFileSystem.mkdir.mockRejectedValue(new Error('Permission denied'));

      const result = await sandboxManager.createSandbox(validSandboxConfig);

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('WORKSPACE_SETUP_FAILED');
      }
    });
  });

  describe('stopSandbox', () => {
    it('should stop running sandbox successfully', async () => {
      const result = await sandboxManager.stopSandbox('test-sandbox-123');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      expect(mockDocker.getContainer).toHaveBeenCalledWith('test-sandbox-123');
    });

    it('should return error for invalid sandbox ID', async () => {
      const result = await sandboxManager.stopSandbox('');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_SANDBOX_ID');
      }
    });

    it('should handle container stop failure', async () => {
      const mockContainer = {
        stop: jest.fn().mockRejectedValue(new Error('Container not running')),
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const result = await sandboxManager.stopSandbox('test-sandbox-123');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTAINER_STOP_FAILED');
      }
    });
  });

  describe('removeSandbox', () => {
    it('should remove sandbox successfully', async () => {
      const result = await sandboxManager.removeSandbox('test-sandbox-123');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      expect(mockDocker.getContainer).toHaveBeenCalledWith('test-sandbox-123');
    });

    it('should force remove if requested', async () => {
      const result = await sandboxManager.removeSandbox('test-sandbox-123', true);

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
    });

    it('should handle container removal failure', async () => {
      const mockContainer = {
        remove: jest.fn().mockRejectedValue(new Error('Container is running')),
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const result = await sandboxManager.removeSandbox('test-sandbox-123');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTAINER_REMOVE_FAILED');
      }
    });
  });

  describe('listSandboxes', () => {
    it('should list all sandboxes successfully', async () => {
      const result = await sandboxManager.listSandboxes();

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.data)).toBe(true);
        expect(result.data.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle Docker list failure', async () => {
      mockDocker.listContainers.mockRejectedValue(new Error('Docker daemon unreachable'));

      const result = await sandboxManager.listSandboxes();

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('LIST_CONTAINERS_FAILED');
      }
    });
  });

  describe('getSandboxInfo', () => {
    it('should get sandbox information successfully', async () => {
      const result = await sandboxManager.getSandboxInfo('test-sandbox-123');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('mock-container-id');
        expect(result.data.status).toBeDefined();
      }
    });

    it('should return error for invalid sandbox ID', async () => {
      const result = await sandboxManager.getSandboxInfo('');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_SANDBOX_ID');
      }
    });

    it('should handle container inspect failure', async () => {
      const mockContainer = {
        inspect: jest.fn().mockRejectedValue(new Error('Container not found')),
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const result = await sandboxManager.getSandboxInfo('test-sandbox-123');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CONTAINER_INSPECT_FAILED');
      }
    });
  });

  describe('getSandboxLogs', () => {
    it('should get sandbox logs successfully', async () => {
      const result = await sandboxManager.getSandboxLogs('test-sandbox-123');

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data).toBe('string');
      }
    });

    it('should handle logs with options', async () => {
      const result = await sandboxManager.getSandboxLogs('test-sandbox-123', {
        follow: false,
        tail: 100,
      });

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
    });

    it('should return error for invalid sandbox ID', async () => {
      const result = await sandboxManager.getSandboxLogs('');

      expect(result).toBeErrorResult();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_SANDBOX_ID');
      }
    });
  });

  describe('cleanup', () => {
    it('should cleanup all sandboxes successfully', async () => {
      const result = await sandboxManager.cleanup();

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.removed).toBe('number');
        expect(typeof result.data.errors).toBe('number');
      }
    });

    it('should handle cleanup with some failures', async () => {
      const mockContainer = {
        remove: jest.fn().mockRejectedValue(new Error('Cannot remove running container')),
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const result = await sandboxManager.cleanup();

      expect(result).toBeValidResult();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.errors).toBeGreaterThan(0);
      }
    });
  });

  describe('configuration validation', () => {
    it('should validate memory format correctly', async () => {
      const configs = [
        { ...validSandboxConfig, memory: '1G' },
        { ...validSandboxConfig, memory: '512M' },
        { ...validSandboxConfig, memory: '2048M' },
      ];

      for (const config of configs) {
        const result = await sandboxManager.createSandbox(config);
        expect(result).toBeValidResult();
      }
    });

    it('should reject invalid memory formats', async () => {
      const invalidConfigs = [
        { ...validSandboxConfig, memory: 'invalid' },
        { ...validSandboxConfig, memory: '1KB' },
        { ...validSandboxConfig, memory: '' },
      ];

      for (const config of invalidConfigs) {
        const result = await sandboxManager.createSandbox(config);
        expect(result).toBeErrorResult();
      }
    });

    it('should validate CPU limits correctly', async () => {
      const validCpuConfigs = [
        { ...validSandboxConfig, cpu: 1 },
        { ...validSandboxConfig, cpu: 4 },
        { ...validSandboxConfig, cpu: 0.5 },
      ];

      for (const config of validCpuConfigs) {
        const result = await sandboxManager.createSandbox(config);
        expect(result).toBeValidResult();
      }
    });

    it('should reject invalid CPU limits', async () => {
      const invalidCpuConfigs = [
        { ...validSandboxConfig, cpu: 0 },
        { ...validSandboxConfig, cpu: -1 },
        { ...validSandboxConfig, cpu: 17 }, // Assuming max is 16
      ];

      for (const config of invalidCpuConfigs) {
        const result = await sandboxManager.createSandbox(config);
        expect(result).toBeErrorResult();
      }
    });
  });

  describe('error context and logging', () => {
    it('should include context in error messages', async () => {
      mockDocker.createContainer.mockRejectedValue(new Error('Docker error'));

      const result = await sandboxManager.createSandbox(validSandboxConfig);

      expect(result).toBeErrorResult();
      if (!result.success) {
        expect(result.error.context).toEqual(
          expect.objectContaining({
            sandboxId: validSandboxConfig.id,
            template: validSandboxConfig.template,
          })
        );
      }
    });

    it('should log operations appropriately', async () => {
      await sandboxManager.createSandbox(validSandboxConfig);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Creating new sandbox',
        expect.objectContaining({
          sandboxId: validSandboxConfig.id,
          template: validSandboxConfig.template,
        })
      );
    });
  });
});