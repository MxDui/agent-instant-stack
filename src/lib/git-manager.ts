import simpleGit, { SimpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export class GitManager {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.join(os.homedir(), '.dcsandbox', 'git-cache');
  }

  async cloneRepository(gitUrl: string, branch: string, sandboxId: string): Promise<string> {
    // Ensure cache directory exists
    await fs.mkdir(this.cacheDir, { recursive: true });

    // Create unique directory for this clone
    const cloneDir = path.join(this.cacheDir, sandboxId);
    
    try {
      // Remove existing directory if it exists
      await fs.rm(cloneDir, { recursive: true, force: true });

      const git: SimpleGit = simpleGit();
      
      // Clone the repository
      await git.clone(gitUrl, cloneDir, [
        '--branch', branch,
        '--single-branch',
        '--depth', '1'
      ]);

      // Verify the clone was successful
      const gitDir = path.join(cloneDir, '.git');
      try {
        await fs.access(gitDir);
      } catch {
        throw new Error('Git clone appears to have failed - no .git directory found');
      }

      return cloneDir;
    } catch (error) {
      // Clean up on failure
      try {
        await fs.rm(cloneDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn('Failed to clean up after git clone error:', cleanupError);
      }

      // Re-throw with more context
      if (error instanceof Error) {
        throw new Error(`Failed to clone repository: ${error.message}`);
      } else {
        throw new Error(`Failed to clone repository: ${String(error)}`);
      }
    }
  }

  async validateGitUrl(gitUrl: string): Promise<boolean> {
    try {
      const git: SimpleGit = simpleGit();
      
      // Use ls-remote to check if repository exists and is accessible
      await git.listRemote([gitUrl]);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getBranches(gitUrl: string): Promise<string[]> {
    try {
      const git: SimpleGit = simpleGit();
      
      // Get remote branches
      const result = await git.listRemote(['--heads', gitUrl]);
      
      // Parse branch names from the output
      const branches = result
        .split('\n')
        .filter(line => line.includes('refs/heads/'))
        .map(line => {
          const match = line.match(/refs\/heads\/(.+)$/);
          return match ? match[1] : '';
        })
        .filter(branch => branch !== '');

      return branches;
    } catch (error) {
      throw new Error(`Failed to get branches: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getDefaultBranch(gitUrl: string): Promise<string> {
    try {
      const git: SimpleGit = simpleGit();
      
      // Get the default branch (HEAD)
      const result = await git.listRemote(['--symref', gitUrl, 'HEAD']);
      
      // Parse the default branch from the output
      const headLine = result.split('\n').find(line => line.includes('ref: refs/heads/'));
      if (headLine) {
        const match = headLine.match(/ref: refs\/heads\/(.+)\s+HEAD/);
        if (match) {
          return match[1];
        }
      }

      // Fallback to common default branch names
      const branches = await this.getBranches(gitUrl);
      for (const defaultName of ['main', 'master', 'develop']) {
        if (branches.includes(defaultName)) {
          return defaultName;
        }
      }

      // Return the first branch if no common defaults found
      return branches[0] || 'main';
    } catch (error) {
      // Fallback to 'main' if we can't determine the default branch
      return 'main';
    }
  }

  extractRepoInfo(gitUrl: string): { owner: string; repo: string; provider: string } {
    // Parse GitHub, GitLab, Bitbucket URLs
    const patterns = [
      // HTTPS patterns
      /^https:\/\/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /^https:\/\/gitlab\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      /^https:\/\/bitbucket\.org\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/.*)?$/,
      // SSH patterns
      /^git@github\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /^git@gitlab\.com:([^\/]+)\/([^\/]+?)(?:\.git)?$/,
      /^git@bitbucket\.org:([^\/]+)\/([^\/]+?)(?:\.git)?$/
    ];

    for (const pattern of patterns) {
      const match = gitUrl.match(pattern);
      if (match) {
        const provider = gitUrl.includes('github.com') ? 'github' :
                        gitUrl.includes('gitlab.com') ? 'gitlab' :
                        gitUrl.includes('bitbucket.org') ? 'bitbucket' : 'unknown';
        
        return {
          owner: match[1],
          repo: match[2],
          provider
        };
      }
    }

    // Fallback for other git URLs
    const urlParts = gitUrl.split('/');
    const repo = urlParts[urlParts.length - 1].replace('.git', '');
    const owner = urlParts[urlParts.length - 2] || 'unknown';

    return {
      owner,
      repo,
      provider: 'unknown'
    };
  }

  async getRepoSize(gitUrl: string): Promise<number | null> {
    try {
      const repoInfo = this.extractRepoInfo(gitUrl);
      
      // For GitHub, we could use the API to get repository size
      if (repoInfo.provider === 'github') {
        // This would require GitHub API integration
        // For now, return null to indicate size is unknown
        return null;
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  async isPrivateRepository(gitUrl: string): Promise<boolean | null> {
    try {
      // Try to access the repository without authentication
      const git: SimpleGit = simpleGit();
      await git.listRemote([gitUrl]);
      return false; // If successful, repository is public
    } catch (error) {
      // If it fails, it might be private or might not exist
      // We can't definitively say it's private without more context
      return null;
    }
  }

  async cleanupCache(olderThanDays: number = 7): Promise<void> {
    try {
      const entries = await fs.readdir(this.cacheDir);
      const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

      for (const entry of entries) {
        const entryPath = path.join(this.cacheDir, entry);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
            await fs.rm(entryPath, { recursive: true, force: true });
          }
        } catch (error) {
          console.warn(`Failed to clean up cache entry ${entry}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup git cache:', error);
    }
  }

  async getCacheSize(): Promise<number> {
    try {
      const entries = await fs.readdir(this.cacheDir);
      let totalSize = 0;

      for (const entry of entries) {
        const entryPath = path.join(this.cacheDir, entry);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.isDirectory()) {
            totalSize += await this.getDirectorySize(entryPath);
          } else {
            totalSize += stats.size;
          }
        } catch (error) {
          // Skip entries that can't be accessed
        }
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let size = 0;

    try {
      const entries = await fs.readdir(dirPath);
      
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry);
        try {
          const stats = await fs.stat(entryPath);
          if (stats.isDirectory()) {
            size += await this.getDirectorySize(entryPath);
          } else {
            size += stats.size;
          }
        } catch (error) {
          // Skip entries that can't be accessed
        }
      }
    } catch (error) {
      // Skip directories that can't be read
    }

    return size;
  }
}