export default async (): Promise<void> => {
  // Global setup that runs once before all tests
  console.log('🧪 Starting test suite...');
  
  // Set up test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  
  // Mock Docker if not available
  if (!process.env.DOCKER_HOST) {
    process.env.DOCKER_HOST = 'unix:///var/run/docker.sock';
  }
};