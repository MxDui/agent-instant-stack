import { jest } from '@jest/globals';
import type { FileSystem } from '../../src/types';

export const createMockFileSystem = (): jest.Mocked<FileSystem> => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  exists: jest.fn(),
  mkdir: jest.fn(),
  readdir: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  rmdir: jest.fn(),
});

export const createFileSystemWithFiles = (files: Record<string, string>): jest.Mocked<FileSystem> => {
  const fs = createMockFileSystem();
  
  fs.exists.mockImplementation(async (path: string) => path in files);
  fs.readFile.mockImplementation(async (path: string) => {
    if (path in files) {
      return files[path];
    }
    throw new Error(`File not found: ${path}`);
  });
  fs.writeFile.mockImplementation(async (path: string, content: string) => {
    files[path] = content;
  });
  
  return fs;
};