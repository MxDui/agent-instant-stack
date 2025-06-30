import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';

export interface GlobalConfig {
  defaults: {
    memory: string;
    cpu: number;
    disk: string;
    timeout: number;
    autoCleanup: boolean;
  };
  container: {
    runtime: 'docker' | 'podman';
    network: string;
  };
  mcp: {
    proxyHost: string;
    portRange: [number, number];
  };
  cleanup: {
    inactiveTimeout: string;
    onExit: boolean;
    preserveNamed: boolean;
  };
  templates: {
    customPath?: string;
    autoUpdate: boolean;
  };
}

export interface ProjectConfig {
  name: string;
  created: string;
  template: string;
  git?: {
    url: string;
    branch: string;
  };
  mcp: {
    servers: string[];
  };
}

export class ConfigManager {
  private configDir: string;
  private globalConfigPath: string;
  private defaultConfig: GlobalConfig;

  constructor() {
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
        portRange: [50000, 60000]
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
  }

  async getGlobalConfig(): Promise<GlobalConfig> {
    try {
      await this.ensureConfigDir();
      const configContent = await fs.readFile(this.globalConfigPath, 'utf8');
      const config = YAML.parse(configContent);
      
      // Merge with defaults to ensure all fields are present
      return this.mergeWithDefaults(config);
    } catch (error) {
      // Config file doesn't exist or is invalid, return defaults
      return this.defaultConfig;
    }
  }

  async saveGlobalConfig(config: Partial<GlobalConfig>): Promise<void> {
    await this.ensureConfigDir();
    
    const currentConfig = await this.getGlobalConfig();
    const mergedConfig = this.deepMerge(currentConfig, config);
    
    const yamlContent = YAML.stringify(mergedConfig);
    await fs.writeFile(this.globalConfigPath, yamlContent);
  }

  async getConfigValue(path: string): Promise<any> {
    const config = await this.getGlobalConfig();
    return this.getNestedValue(config, path);
  }

  async setConfigValue(path: string, value: any): Promise<void> {
    const config = await this.getGlobalConfig();
    this.setNestedValue(config, path, value);
    await this.saveGlobalConfig(config);
  }

  async resetConfig(): Promise<void> {
    await this.ensureConfigDir();
    const yamlContent = YAML.stringify(this.defaultConfig);
    await fs.writeFile(this.globalConfigPath, yamlContent);
  }

  async saveProjectConfig(sandboxId: string, config: ProjectConfig): Promise<void> {
    const sandboxDir = path.join(os.homedir(), '.dcsandbox', 'sandboxes', sandboxId);
    await fs.mkdir(sandboxDir, { recursive: true });
    
    const configPath = path.join(sandboxDir, '.dcsandbox', 'config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    
    const yamlContent = YAML.stringify(config);
    await fs.writeFile(configPath, yamlContent);
  }

  async getProjectConfig(sandboxId: string): Promise<ProjectConfig | null> {
    try {
      const configPath = path.join(
        os.homedir(), 
        '.dcsandbox', 
        'sandboxes', 
        sandboxId, 
        '.dcsandbox', 
        'config.yaml'
      );
      
      const configContent = await fs.readFile(configPath, 'utf8');
      return YAML.parse(configContent);
    } catch (error) {
      return null;
    }
  }

  async exportConfig(): Promise<string> {
    const config = await this.getGlobalConfig();
    return YAML.stringify(config);
  }

  async importConfig(yamlContent: string): Promise<void> {
    try {
      const config = YAML.parse(yamlContent);
      await this.saveGlobalConfig(config);
    } catch (error) {
      throw new Error(`Invalid configuration format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validateConfig(config: any): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate structure
    if (typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { valid: false, errors };
    }

    // Validate defaults section
    if (config.defaults) {
      if (config.defaults.memory && !this.isValidMemorySize(config.defaults.memory)) {
        errors.push('Invalid memory size format');
      }
      if (config.defaults.cpu && (!Number.isInteger(config.defaults.cpu) || config.defaults.cpu <= 0)) {
        errors.push('CPU must be a positive integer');
      }
      if (config.defaults.timeout && (!Number.isInteger(config.defaults.timeout) || config.defaults.timeout <= 0)) {
        errors.push('Timeout must be a positive integer');
      }
    }

    // Validate container section
    if (config.container) {
      if (config.container.runtime && !['docker', 'podman'].includes(config.container.runtime)) {
        errors.push('Container runtime must be "docker" or "podman"');
      }
    }

    // Validate MCP section
    if (config.mcp) {
      if (config.mcp.portRange) {
        if (!Array.isArray(config.mcp.portRange) || config.mcp.portRange.length !== 2) {
          errors.push('Port range must be an array of two numbers');
        } else if (config.mcp.portRange[0] >= config.mcp.portRange[1]) {
          errors.push('Port range start must be less than end');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async getConfigDir(): Promise<string> {
    await this.ensureConfigDir();
    return this.configDir;
  }

  private async ensureConfigDir(): Promise<void> {
    await fs.mkdir(this.configDir, { recursive: true });
  }

  private mergeWithDefaults(config: any): GlobalConfig {
    return this.deepMerge(this.defaultConfig, config);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    target[lastKey] = value;
  }

  private isValidMemorySize(size: string): boolean {
    return /^\d+[KMGT]?$/.test(size);
  }
}