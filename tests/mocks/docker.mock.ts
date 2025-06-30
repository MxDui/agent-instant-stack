import { jest } from '@jest/globals';
import type { Docker } from 'dockerode';

export const createMockDocker = (): jest.Mocked<Docker> => {
  const mockContainer = {
    id: 'mock-container-id',
    inspect: jest.fn().mockResolvedValue({
      Id: 'mock-container-id',
      State: { Status: 'running', Running: true },
      Config: { Image: 'test-image' },
      NetworkSettings: { Ports: {} },
    }),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    logs: jest.fn().mockResolvedValue(Buffer.from('mock logs')),
    stats: jest.fn().mockResolvedValue({
      memory_stats: { usage: 100000000 },
      cpu_stats: { cpu_usage: { total_usage: 50000000 } },
    }),
  };

  const mockImage = {
    id: 'mock-image-id',
    inspect: jest.fn().mockResolvedValue({
      Id: 'mock-image-id',
      RepoTags: ['test-image:latest'],
      Size: 1000000,
    }),
    remove: jest.fn().mockResolvedValue([{ Deleted: 'mock-image-id' }]),
  };

  return {
    createContainer: jest.fn().mockResolvedValue(mockContainer),
    getContainer: jest.fn().mockReturnValue(mockContainer),
    listContainers: jest.fn().mockResolvedValue([
      {
        Id: 'mock-container-id',
        Image: 'test-image',
        State: 'running',
        Status: 'Up 5 minutes',
        Names: ['/test-container'],
      },
    ]),
    getImage: jest.fn().mockReturnValue(mockImage),
    listImages: jest.fn().mockResolvedValue([
      {
        Id: 'mock-image-id',
        RepoTags: ['test-image:latest'],
        Size: 1000000,
      },
    ]),
    ping: jest.fn().mockResolvedValue(Buffer.from('OK')),
    version: jest.fn().mockResolvedValue({
      Version: '20.10.0',
      ApiVersion: '1.41',
    }),
    info: jest.fn().mockResolvedValue({
      ID: 'mock-docker-id',
      Containers: 1,
      Images: 1,
      MemTotal: 8000000000,
    }),
  } as unknown as jest.Mocked<Docker>;
};