/**
 * Core types and interfaces for the DCandbox project
 * @fileoverview Type definitions following strict typing standards
 */

// Result pattern for error handling
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Union types for better type safety
export type SandboxStatus = 'creating' | 'running' | 'stopped' | 'error';
export type ContainerRuntime = 'docker' | 'podman';
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
export type LanguageType = 'javascript' | 'typescript' | 'python' | 'go' | 'rust' | 'java' | 'ruby' | 'php' | 'csharp' | 'unknown';
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'pip' | 'pipenv' | 'poetry' | 'go-modules' | 'cargo' | 'maven' | 'gradle' | 'bundler' | 'composer' | 'nuget';

/**
 * Configuration for a sandbox environment
 */
export interface SandboxConfig {
  readonly id: string;
  readonly name: string;
  status: SandboxStatus;
  readonly created: Date;
  readonly template: string;
  readonly git?: GitConfig;
  readonly mcp: MCPConfig;
  readonly resources: ResourceConfig;
  containerId?: string;
  mcpPort?: number;
}

/**
 * Git repository configuration
 */
export interface GitConfig {
  readonly url: string;
  readonly branch: string;
  readonly clonePath?: string;
}

/**
 * MCP (Model Context Protocol) configuration
 */
export interface MCPConfig {
  readonly enabled: boolean;
  readonly servers: readonly MCPServer[];
  readonly proxyPort?: number;
}

/**
 * MCP server configuration
 */
export interface MCPServer {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly enabled: boolean;
}

/**
 * Resource allocation configuration
 */
export interface ResourceConfig {
  readonly memory: string;
  readonly cpu: number;
  readonly disk: string;
  readonly timeout: number;
}

/**
 * Template definition for sandbox environments
 */
export interface Template {
  readonly name: string;
  readonly baseImage: string;
  readonly features: readonly string[];
  readonly mcpServers: readonly MCPServer[];
  readonly postCreate?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
  readonly ports?: readonly number[];
}

/**
 * Options for creating a new sandbox
 */
export interface CreateOptions {
  readonly name?: string;
  readonly git?: string;
  readonly branch?: string;
  readonly template?: string;
  readonly memory?: string;
  readonly cpu?: number;
  readonly timeout?: number;
  readonly persist?: boolean;
  readonly autoDetect?: boolean;
}

/**
 * Container information from Docker/Podman
 */
export interface ContainerInfo {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly status: string;
  readonly ports: readonly PortMapping[];
  readonly mounts: readonly Mount[];
  readonly networks: readonly string[];
  readonly created: Date;
  readonly started?: Date;
}

/**
 * Port mapping configuration
 */
export interface PortMapping {
  readonly containerPort: number;
  readonly hostPort?: number;
  readonly protocol: 'tcp' | 'udp';
}

/**
 * Volume mount configuration
 */
export interface Mount {
  readonly source: string;
  readonly destination: string;
  readonly mode: 'ro' | 'rw';
  readonly type: 'bind' | 'volume' | 'tmpfs';
}

/**
 * Complete sandbox information
 */
export interface SandboxInfo {
  readonly sandbox: SandboxConfig;
  readonly containerInfo?: ContainerInfo;
  readonly mcpConnection?: string;
  readonly workingDirectory: string;
}

/**
 * Project detection results
 */
export interface ProjectDetection {
  readonly language: LanguageType;
  readonly framework?: string;
  readonly packageManager?: PackageManager;
  readonly template: string;
  readonly confidence: number;
}

/**
 * Structured log entry
 */
export interface LogEntry {
  readonly timestamp: Date;
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
}

/**
 * Validation error details
 */
export interface ValidationError {
  readonly field: string;
  readonly message: string;
  readonly value?: unknown;
}

/**
 * Custom error for sandbox operations
 */
export interface SandboxError extends Error {
  readonly code: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

/**
 * Cache entry for project detection
 */
export interface CacheEntry<T> {
  readonly data: T;
  readonly timestamp: Date;
  readonly ttl: number;
}

/**
 * Git repository information
 */
export interface GitRepositoryInfo {
  readonly owner: string;
  readonly repo: string;
  readonly provider: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
  readonly defaultBranch?: string;
  readonly isPrivate?: boolean;
  readonly size?: number;
}

/**
 * Template listing information
 */
export interface TemplateInfo {
  readonly name: string;
  readonly description: string;
  readonly builtin: boolean;
  readonly language?: LanguageType;
  readonly framework?: string;
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}

/**
 * File system operations interface
 */
export interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<{ size: number; mtime: Date; isDirectory(): boolean }>;
}

/**
 * Configuration manager interface
 */
export interface ConfigurationManager {
  getGlobalConfig(): Promise<GlobalConfig>;
  saveGlobalConfig(config: Partial<GlobalConfig>): Promise<void>;
  getConfigValue(path: string): Promise<unknown>;
  setConfigValue(path: string, value: unknown): Promise<void>;
  validateConfig(config: unknown): Promise<ValidationResult>;
}

/**
 * Global configuration structure
 */
export interface GlobalConfig {
  readonly defaults: {
    readonly memory: string;
    readonly cpu: number;
    readonly disk: string;
    readonly timeout: number;
    readonly autoCleanup: boolean;
  };
  readonly container: {
    readonly runtime: ContainerRuntime;
    readonly network: string;
  };
  readonly mcp: {
    readonly proxyHost: string;
    readonly portRange: readonly [number, number];
  };
  readonly cleanup: {
    readonly inactiveTimeout: string;
    readonly onExit: boolean;
    readonly preserveNamed: boolean;
  };
  readonly templates: {
    readonly customPath?: string;
    readonly autoUpdate: boolean;
  };
}

/**
 * Project configuration stored with sandbox
 */
export interface ProjectConfig {
  readonly name: string;
  readonly created: string;
  readonly template: string;
  readonly git?: {
    readonly url: string;
    readonly branch: string;
  };
  readonly mcp: {
    readonly servers: readonly string[];
  };
}