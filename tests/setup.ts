import { jest } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
});

beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidResult(): R;
      toBeErrorResult(): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidResult(received) {
    const pass = received && received.success === true && received.data !== undefined;
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid result`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid result with success: true and data`,
        pass: false,
      };
    }
  },
  toBeErrorResult(received) {
    const pass = received && received.success === false && received.error !== undefined;
    if (pass) {
      return {
        message: () => `expected ${received} not to be an error result`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be an error result with success: false and error`,
        pass: false,
      };
    }
  },
});