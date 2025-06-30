import { jest } from '@jest/globals';
import type { Logger } from '../../src/types';

export const createMockLogger = (): jest.Mocked<Logger> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

export const createSpyLogger = (): jest.Mocked<Logger> => {
  const logger = createMockLogger();
  
  // Add helpful methods for testing
  (logger as any).getDebugCalls = () => logger.debug.mock.calls;
  (logger as any).getInfoCalls = () => logger.info.mock.calls;
  (logger as any).getWarnCalls = () => logger.warn.mock.calls;
  (logger as any).getErrorCalls = () => logger.error.mock.calls;
  
  return logger;
};