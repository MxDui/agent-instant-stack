# Development Container Rules and Guidelines

## Overview
This document outlines the rules, standards, and best practices that all development containers in this project must follow.

## 1. Container Security Rules

### 1.1 User Management
- **REQUIRED**: All containers MUST run as non-root users
- **REQUIRED**: Use specific UID/GID (1001:1001) for consistency
- **PROHIBITED**: Never run applications as root user
- **REQUIRED**: Set proper file permissions and ownership

### 1.2 Image Security
- **REQUIRED**: Use official base images from trusted registries
- **REQUIRED**: Pin specific image versions (avoid `latest` tag)
- **REQUIRED**: Regularly update base images for security patches
- **REQUIRED**: Scan images for vulnerabilities before deployment

### 1.3 Network Security
- **REQUIRED**: Expose only necessary ports
- **REQUIRED**: Use internal networks for service communication
- **PROHIBITED**: Bind containers to 0.0.0.0 in production
- **REQUIRED**: Implement proper firewall rules

## 2. Performance Standards

### 2.1 Resource Limits
- **REQUIRED**: Set memory limits for all containers
- **REQUIRED**: Set CPU limits to prevent resource starvation
- **REQUIRED**: Use multi-stage builds to minimize image size
- **REQUIRED**: Clean up unnecessary files and cache

### 2.2 Optimization Rules
- **REQUIRED**: Use `.dockerignore` to exclude unnecessary files
- **REQUIRED**: Minimize the number of layers in Dockerfiles
- **REQUIRED**: Use caching strategies for dependencies
- **REQUIRED**: Implement health checks for all services

## 3. Development Environment Rules

### 3.1 Code Organization
- **REQUIRED**: Mount source code as volumes for live editing
- **REQUIRED**: Preserve `node_modules` in separate volume
- **REQUIRED**: Use consistent directory structure across environments
- **REQUIRED**: Implement hot reload for development

### 3.2 Environment Configuration
- **REQUIRED**: Use environment-specific configuration files
- **REQUIRED**: Never hardcode secrets or sensitive data
- **REQUIRED**: Use `.env` files for environment variables
- **REQUIRED**: Provide `.env.example` with all required variables

### 3.3 Debugging Support
- **REQUIRED**: Enable debugging ports in development containers
- **REQUIRED**: Support for IDE integration (VS Code, etc.)
- **REQUIRED**: Implement comprehensive logging
- **REQUIRED**: Provide development-specific tools and utilities

## 4. Data Management Rules

### 4.1 Volume Management
- **REQUIRED**: Use named volumes for persistent data
- **REQUIRED**: Implement proper backup strategies
- **REQUIRED**: Separate application data from logs
- **REQUIRED**: Use read-only volumes where appropriate

### 4.2 Database Integration
- **REQUIRED**: Use containerized databases for development
- **REQUIRED**: Implement database migration scripts
- **REQUIRED**: Provide database seeding for development
- **REQUIRED**: Use connection pooling and proper connection management

## 5. Service Integration Rules

### 5.1 Service Communication
- **REQUIRED**: Use Docker networks for service communication
- **REQUIRED**: Implement service discovery mechanisms
- **REQUIRED**: Use environment variables for service configuration
- **REQUIRED**: Implement proper retry and timeout strategies

### 5.2 External Dependencies
- **REQUIRED**: Document all external service dependencies
- **REQUIRED**: Provide mock services for development
- **REQUIRED**: Implement graceful degradation for unavailable services
- **REQUIRED**: Use health checks for dependency validation

## 6. Monitoring and Logging Rules

### 6.1 Logging Standards
- **REQUIRED**: Use structured logging (JSON format)
- **REQUIRED**: Implement different log levels (debug, info, warn, error)
- **REQUIRED**: Never log sensitive information
- **REQUIRED**: Use centralized logging for production

### 6.2 Health Monitoring
- **REQUIRED**: Implement health check endpoints
- **REQUIRED**: Monitor resource usage
- **REQUIRED**: Set up alerting for critical issues
- **REQUIRED**: Implement graceful shutdown procedures

## 7. Testing Requirements

### 7.1 Container Testing
- **REQUIRED**: Test container builds in CI/CD pipeline
- **REQUIRED**: Validate container security configurations
- **REQUIRED**: Test service communication between containers
- **REQUIRED**: Implement integration tests for the full stack

### 7.2 Test Environment
- **REQUIRED**: Provide isolated test containers
- **REQUIRED**: Use test-specific databases and services
- **REQUIRED**: Clean up test data after test runs
- **REQUIRED**: Parallel test execution support

## 8. CI/CD Integration Rules

### 8.1 Build Pipeline
- **REQUIRED**: Automated container building and testing
- **REQUIRED**: Security scanning in build pipeline
- **REQUIRED**: Automated deployment to staging environments
- **REQUIRED**: Rollback capabilities for failed deployments

### 8.2 Version Management
- **REQUIRED**: Tag container images with version numbers
- **REQUIRED**: Use semantic versioning for releases
- **REQUIRED**: Maintain compatibility between versions
- **REQUIRED**: Document breaking changes

## 9. Documentation Requirements

### 9.1 Container Documentation
- **REQUIRED**: Document all environment variables
- **REQUIRED**: Provide setup and usage instructions
- **REQUIRED**: Document troubleshooting procedures
- **REQUIRED**: Maintain up-to-date README files

### 9.2 Architecture Documentation
- **REQUIRED**: Document container architecture and dependencies
- **REQUIRED**: Provide service interaction diagrams
- **REQUIRED**: Document deployment procedures
- **REQUIRED**: Maintain change logs

## 10. Compliance and Governance

### 10.1 Security Compliance
- **REQUIRED**: Regular security audits
- **REQUIRED**: Compliance with organizational security policies
- **REQUIRED**: Vulnerability scanning and remediation
- **REQUIRED**: Access control and authentication

### 10.2 Code Quality
- **REQUIRED**: Code review for all Dockerfile changes
- **REQUIRED**: Automated linting and formatting
- **REQUIRED**: Performance benchmarking
- **REQUIRED**: Regular dependency updates

## Enforcement

These rules are enforced through:
- Automated CI/CD pipeline checks
- Code review requirements
- Security scanning tools
- Performance monitoring
- Regular audits

## Violations

Violations of these rules will result in:
1. Build pipeline failures
2. Mandatory code review and fixes
3. Security assessment and remediation
4. Documentation of lessons learned

## Updates

This document is reviewed and updated quarterly or when significant changes are made to the development environment.

Last Updated: 2024-01-01
Version: 1.0