import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import YAML from 'yaml';
import { Template, MCPServer } from '../types';

export class TemplateManager {
  private templatesDir: string;
  private builtinTemplatesDir: string;

  constructor() {
    this.templatesDir = path.join(os.homedir(), '.config', 'dcsandbox', 'templates');
    this.builtinTemplatesDir = path.join(__dirname, '..', 'templates');
  }

  async getTemplate(name: string): Promise<Template | null> {
    // Try custom templates first
    const customTemplate = await this.loadTemplate(this.templatesDir, name);
    if (customTemplate) {
      return customTemplate;
    }

    // Try built-in templates
    const builtinTemplate = await this.loadTemplate(this.builtinTemplatesDir, name);
    if (builtinTemplate) {
      return builtinTemplate;
    }

    // Return null if template not found
    return null;
  }

  async listTemplates(): Promise<{ name: string; description: string; builtin: boolean }[]> {
    const templates: { name: string; description: string; builtin: boolean }[] = [];

    // Load built-in templates
    try {
      const builtinFiles = await fs.readdir(this.builtinTemplatesDir);
      for (const file of builtinFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = path.basename(file, path.extname(file));
          const template = await this.loadTemplate(this.builtinTemplatesDir, name);
          if (template) {
            templates.push({
              name,
              description: template.name,
              builtin: true
            });
          }
        }
      }
    } catch (error) {
      // Built-in templates directory might not exist yet
    }

    // Load custom templates
    try {
      const customFiles = await fs.readdir(this.templatesDir);
      for (const file of customFiles) {
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          const name = path.basename(file, path.extname(file));
          const template = await this.loadTemplate(this.templatesDir, name);
          if (template) {
            templates.push({
              name,
              description: template.name,
              builtin: false
            });
          }
        }
      }
    } catch (error) {
      // Custom templates directory might not exist yet
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name));
  }

  async createBuiltinTemplates(): Promise<void> {
    await fs.mkdir(this.builtinTemplatesDir, { recursive: true });

    const templates = this.getBuiltinTemplateDefinitions();

    for (const [name, template] of Object.entries(templates)) {
      const templatePath = path.join(this.builtinTemplatesDir, `${name}.yaml`);
      const yamlContent = YAML.stringify(template);
      await fs.writeFile(templatePath, yamlContent);
    }
  }

  async saveTemplate(name: string, template: Template): Promise<void> {
    await fs.mkdir(this.templatesDir, { recursive: true });
    
    const templatePath = path.join(this.templatesDir, `${name}.yaml`);
    const yamlContent = YAML.stringify(template);
    await fs.writeFile(templatePath, yamlContent);
  }

  async deleteTemplate(name: string): Promise<boolean> {
    try {
      const templatePath = path.join(this.templatesDir, `${name}.yaml`);
      await fs.unlink(templatePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async loadTemplate(baseDir: string, name: string): Promise<Template | null> {
    try {
      const templatePath = path.join(baseDir, `${name}.yaml`);
      const content = await fs.readFile(templatePath, 'utf8');
      const parsed = YAML.parse(content);
      
      // Validate template structure
      if (!this.isValidTemplate(parsed)) {
        console.warn(`Invalid template structure in ${templatePath}`);
        return null;
      }

      return parsed;
    } catch (error) {
      // Template file doesn't exist or can't be read
      return null;
    }
  }

  private isValidTemplate(obj: any): obj is Template {
    return (
      typeof obj === 'object' &&
      typeof obj.name === 'string' &&
      typeof obj.baseImage === 'string' &&
      Array.isArray(obj.features) &&
      Array.isArray(obj.mcpServers)
    );
  }

  private getBuiltinTemplateDefinitions(): Record<string, Template> {
    return {
      base: {
        name: 'Base Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/base:ubuntu',
        features: [
          'curl',
          'git',
          'vim',
          'nano',
          'htop',
          'unzip'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          }
        ],
        environment: {
          DEBIAN_FRONTEND: 'noninteractive'
        },
        ports: []
      },

      node: {
        name: 'Node.js Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/javascript-node:20',
        features: [
          'git',
          'vim',
          'nano'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          },
          {
            name: 'npm',
            command: 'mcp-server-npm',
            args: ['--cwd', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'npm install'
        ],
        environment: {
          NODE_ENV: 'development'
        },
        ports: [3000, 8080]
      },

      python: {
        name: 'Python Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/python:3.11',
        features: [
          'git',
          'vim',
          'nano'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          },
          {
            name: 'python',
            command: 'mcp-server-python',
            args: ['--cwd', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'pip install -r requirements.txt || true'
        ],
        environment: {
          PYTHONPATH: '/workspace'
        },
        ports: [8000, 5000]
      },

      go: {
        name: 'Go Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/go:1.21',
        features: [
          'git',
          'vim',
          'nano'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'go mod download || true'
        ],
        environment: {
          GOPROXY: 'https://proxy.golang.org'
        },
        ports: [8080]
      },

      rust: {
        name: 'Rust Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/rust:1',
        features: [
          'git',
          'vim',
          'nano'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'cargo fetch || true'
        ],
        environment: {
          CARGO_HOME: '/usr/local/cargo',
          RUSTUP_HOME: '/usr/local/rustup'
        },
        ports: [8080]
      },

      react: {
        name: 'React Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/javascript-node:18',
        features: [
          'git',
          'vim',
          'nano'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          },
          {
            name: 'npm',
            command: 'mcp-server-npm',
            args: ['--cwd', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'npm install',
          'npm run build || true'
        ],
        environment: {
          NODE_ENV: 'development',
          FAST_REFRESH: 'true'
        },
        ports: [3000, 3001]
      },

      django: {
        name: 'Django Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/python:3.11',
        features: [
          'git',
          'vim',
          'nano',
          'postgresql-client'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          },
          {
            name: 'python',
            command: 'mcp-server-python',
            args: ['--cwd', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'pip install -r requirements.txt || true',
          'python manage.py migrate || true'
        ],
        environment: {
          PYTHONPATH: '/workspace',
          DJANGO_DEBUG: 'True'
        },
        ports: [8000, 8080]
      },

      fullstack: {
        name: 'Full-Stack Development Environment',
        baseImage: 'mcr.microsoft.com/devcontainers/universal:2',
        features: [
          'git',
          'vim',
          'nano',
          'postgresql-client',
          'redis-tools'
        ],
        mcpServers: [
          {
            name: 'filesystem',
            command: 'mcp-server-filesystem',
            args: ['--root', '/workspace'],
            enabled: true
          },
          {
            name: 'shell',
            command: 'mcp-server-shell',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'git',
            command: 'mcp-server-git',
            args: ['--repo-path', '/workspace'],
            enabled: true
          },
          {
            name: 'npm',
            command: 'mcp-server-npm',
            args: ['--cwd', '/workspace'],
            enabled: true
          },
          {
            name: 'python',
            command: 'mcp-server-python',
            args: ['--cwd', '/workspace'],
            enabled: true
          }
        ],
        postCreate: [
          'npm install || true',
          'pip install -r requirements.txt || true'
        ],
        environment: {
          NODE_ENV: 'development',
          PYTHONPATH: '/workspace'
        },
        ports: [3000, 8000, 8080, 5000]
      }
    };
  }
}