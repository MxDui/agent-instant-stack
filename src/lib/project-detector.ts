import { promises as fs } from 'fs';
import path from 'path';
import { ProjectDetection } from '../types';

export class ProjectDetector {
  
  async detectProject(projectPath: string): Promise<ProjectDetection> {
    const detectors = [
      this.detectNodeJS.bind(this),
      this.detectPython.bind(this),
      this.detectGo.bind(this),
      this.detectRust.bind(this),
      this.detectJava.bind(this),
      this.detectRuby.bind(this),
      this.detectPHP.bind(this),
      this.detectDotNet.bind(this)
    ];

    const results: ProjectDetection[] = [];

    for (const detector of detectors) {
      const result = await detector(projectPath);
      if (result.confidence > 0) {
        results.push(result);
      }
    }

    // Return the detection with highest confidence
    if (results.length === 0) {
      return {
        language: 'unknown',
        template: 'base',
        confidence: 0
      };
    }

    return results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  private async detectNodeJS(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;
    let framework: string | undefined;
    let packageManager: string | undefined;

    // Check for package.json
    if (files.includes('package.json')) {
      confidence += 0.8;
      
      try {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        
        // Detect framework
        const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
        
        if (dependencies.react || dependencies['@types/react']) {
          framework = 'react';
          confidence += 0.1;
        } else if (dependencies.vue || dependencies['@vue/cli']) {
          framework = 'vue';
          confidence += 0.1;
        } else if (dependencies.next) {
          framework = 'nextjs';
          confidence += 0.1;
        } else if (dependencies.nuxt) {
          framework = 'nuxt';
          confidence += 0.1;
        } else if (dependencies.express) {
          framework = 'express';
          confidence += 0.1;
        } else if (dependencies.nestjs || dependencies['@nestjs/core']) {
          framework = 'nestjs';
          confidence += 0.1;
        }
      } catch (error) {
        // Invalid package.json
        confidence -= 0.2;
      }
    }

    // Check for lock files
    if (files.includes('package-lock.json')) {
      packageManager = 'npm';
      confidence += 0.05;
    } else if (files.includes('yarn.lock')) {
      packageManager = 'yarn';
      confidence += 0.05;
    } else if (files.includes('pnpm-lock.yaml')) {
      packageManager = 'pnpm';
      confidence += 0.05;
    }

    // Check for JavaScript/TypeScript files
    if (files.some(f => f.endsWith('.js') || f.endsWith('.jsx'))) {
      confidence += 0.1;
    }
    if (files.some(f => f.endsWith('.ts') || f.endsWith('.tsx'))) {
      confidence += 0.1;
    }

    // Check for Node.js specific files
    if (files.includes('tsconfig.json')) confidence += 0.05;
    if (files.includes('.eslintrc.js') || files.includes('.eslintrc.json')) confidence += 0.05;

    let template = 'node';
    if (framework === 'react') template = 'react';

    return {
      language: 'javascript',
      framework,
      packageManager,
      template,
      confidence
    };
  }

  private async detectPython(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;
    let framework: string | undefined;
    let packageManager: string | undefined;

    // Check for Python files
    if (files.some(f => f.endsWith('.py'))) {
      confidence += 0.6;
    }

    // Check for Python project files
    if (files.includes('requirements.txt')) {
      confidence += 0.2;
      packageManager = 'pip';
    }
    if (files.includes('setup.py')) confidence += 0.15;
    if (files.includes('pyproject.toml')) confidence += 0.1;
    if (files.includes('Pipfile')) {
      confidence += 0.1;
      packageManager = 'pipenv';
    }
    if (files.includes('poetry.lock')) {
      confidence += 0.1;
      packageManager = 'poetry';
    }

    // Detect framework
    if (files.includes('manage.py')) {
      framework = 'django';
      confidence += 0.15;
    } else if (files.some(f => f.includes('flask') || f.includes('app.py'))) {
      framework = 'flask';
      confidence += 0.1;
    } else if (files.includes('main.py') && files.some(f => f.includes('fastapi'))) {
      framework = 'fastapi';
      confidence += 0.1;
    }

    let template = 'python';
    if (framework === 'django') template = 'django';

    return {
      language: 'python',
      framework,
      packageManager,
      template,
      confidence
    };
  }

  private async detectGo(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;

    // Check for Go files
    if (files.some(f => f.endsWith('.go'))) {
      confidence += 0.7;
    }

    // Check for Go project files
    if (files.includes('go.mod')) confidence += 0.2;
    if (files.includes('go.sum')) confidence += 0.1;

    return {
      language: 'go',
      packageManager: 'go-modules',
      template: 'go',
      confidence
    };
  }

  private async detectRust(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;

    // Check for Rust files
    if (files.some(f => f.endsWith('.rs'))) {
      confidence += 0.7;
    }

    // Check for Rust project files
    if (files.includes('Cargo.toml')) confidence += 0.25;
    if (files.includes('Cargo.lock')) confidence += 0.1;

    return {
      language: 'rust',
      packageManager: 'cargo',
      template: 'rust',
      confidence
    };
  }

  private async detectJava(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;
    let framework: string | undefined;
    let packageManager: string | undefined;

    // Check for Java files
    if (files.some(f => f.endsWith('.java'))) {
      confidence += 0.7;
    }

    // Check for Java project files
    if (files.includes('pom.xml')) {
      confidence += 0.2;
      packageManager = 'maven';
    }
    if (files.includes('build.gradle') || files.includes('build.gradle.kts')) {
      confidence += 0.2;
      packageManager = 'gradle';
    }

    // Detect framework
    if (files.some(f => f.includes('Application.java'))) {
      framework = 'spring-boot';
      confidence += 0.1;
    }

    return {
      language: 'java',
      framework,
      packageManager,
      template: 'java',
      confidence
    };
  }

  private async detectRuby(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;
    let framework: string | undefined;

    // Check for Ruby files
    if (files.some(f => f.endsWith('.rb'))) {
      confidence += 0.7;
    }

    // Check for Ruby project files
    if (files.includes('Gemfile')) confidence += 0.2;
    if (files.includes('Gemfile.lock')) confidence += 0.1;

    // Detect framework
    if (files.includes('config.ru')) {
      framework = 'rails';
      confidence += 0.1;
    }

    return {
      language: 'ruby',
      framework,
      packageManager: 'bundler',
      template: 'ruby',
      confidence
    };
  }

  private async detectPHP(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;
    let framework: string | undefined;

    // Check for PHP files
    if (files.some(f => f.endsWith('.php'))) {
      confidence += 0.7;
    }

    // Check for PHP project files
    if (files.includes('composer.json')) confidence += 0.2;
    if (files.includes('composer.lock')) confidence += 0.1;

    // Detect framework
    if (files.includes('artisan')) {
      framework = 'laravel';
      confidence += 0.1;
    } else if (files.includes('index.php') && files.some(f => f.includes('symfony'))) {
      framework = 'symfony';
      confidence += 0.1;
    }

    return {
      language: 'php',
      framework,
      packageManager: 'composer',
      template: 'php',
      confidence
    };
  }

  private async detectDotNet(projectPath: string): Promise<ProjectDetection> {
    const files = await this.getFileList(projectPath);
    let confidence = 0;

    // Check for .NET files
    if (files.some(f => f.endsWith('.cs') || f.endsWith('.csproj') || f.endsWith('.sln'))) {
      confidence += 0.7;
    }

    // Check for .NET project files
    if (files.some(f => f.endsWith('.csproj'))) confidence += 0.2;
    if (files.some(f => f.endsWith('.sln'))) confidence += 0.1;

    return {
      language: 'csharp',
      packageManager: 'nuget',
      template: 'dotnet',
      confidence
    };
  }

  private async getFileList(projectPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          files.push(entry.name);
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Recursively check subdirectories (up to 2 levels deep)
          try {
            const subFiles = await this.getFileList(path.join(projectPath, entry.name));
            files.push(...subFiles.map(f => path.join(entry.name, f)));
          } catch (error) {
            // Skip directories that can't be read
          }
        }
      }

      return files;
    } catch (error) {
      return [];
    }
  }
}