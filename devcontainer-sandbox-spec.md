# DevContainer Sandbox CLI Tool Specification

## Overview

A CLI tool that creates virtual on-demand devcontainers with MCP (Model Context Protocol) support, designed to work seamlessly with Claude Code. This tool enables users to create isolated sandboxes for experimenting with any idea without affecting their main development environment.

## Core Concept

The tool acts as a local orchestrator that:
- Creates and manages devcontainers on the user's machine
- Configures MCP servers within containers
- Provides connection details to Claude Code
- Handles lifecycle management of sandbox environments

## Architecture

```
Claude Code <--> MCP Protocol <--> Local MCP Proxy <--> DevContainer
                                         |
                                    CLI Tool
                                         |
                                 Container Runtime
```

## CLI Interface

### Basic Commands

```bash
# Create a new sandbox
dcsandbox create [options]

# Create sandbox from git repository
dcsandbox create --git <repository-url> [options]

# List active sandboxes with their MCP connection details
dcsandbox list

# Get MCP connection string for Claude Code
dcsandbox info <sandbox-id>

# Stop a sandbox
dcsandbox stop <sandbox-id>

# Remove a sandbox
dcsandbox remove <sandbox-id>

# Clean up all sandboxes
dcsandbox cleanup

# Show logs from a sandbox
dcsandbox logs <sandbox-id>
```

### Command Options

#### `create` command options:
- `--git <url>` - Git repository URL to clone
- `--branch <branch>` - Git branch to checkout (default: main/master)
- `--name <name>` - Custom name for the sandbox
- `--template <template>` - Predefined devcontainer template
- `--mcp-config <file>` - Custom MCP configuration file
- `--memory <size>` - Memory limit (e.g., 2G, 512M)
- `--cpu <cores>` - CPU core limit
- `--timeout <minutes>` - Auto-cleanup timeout (default: 120)
- `--persist` - Keep sandbox after Claude Code disconnects
- `--auto-detect` - Auto-detect project type from git repo

### Output Format

```bash
$ dcsandbox create --git https://github.com/user/project --name my-sandbox
Creating devcontainer sandbox...
✓ Cloning repository
✓ Detecting project type: Node.js/TypeScript
✓ Building devcontainer image
✓ Starting container
✓ Configuring MCP servers
✓ Setting up development environment

Sandbox created successfully!

Name: my-sandbox
ID: sandbox-a3f4b2c1
Status: Running
MCP Connection: npx mcp-proxy connect localhost:53847
Working Directory: /workspace

To connect from Claude Code, use:
npx mcp-proxy connect localhost:53847

To view logs:
dcsandbox logs sandbox-a3f4b2c1
```

## MCP Integration

### Local MCP Proxy

The tool includes a lightweight MCP proxy that:
- Runs on the host machine
- Routes MCP requests to appropriate containers
- Handles authentication and security
- Manages multiple sandbox connections

### MCP Server Configuration

Default MCP servers included in sandboxes:
- **filesystem** - Safe file system access within container
- **shell** - Command execution in sandbox
- **git** - Git operations
- **search** - Code search capabilities

### Connection Management

```bash
# Get connection details for Claude Code
$ dcsandbox info my-sandbox
Sandbox: my-sandbox (sandbox-a3f4b2c1)
Status: Running
MCP Connection: localhost:53847
Available MCP Servers:
  - filesystem (active)
  - shell (active)
  - git (active)
  - search (active)

Claude Code MCP Configuration:
{
  "mcpServers": {
    "my-sandbox": {
      "command": "npx",
      "args": ["mcp-proxy", "connect", "localhost:53847"],
      "env": {
        "SANDBOX_ID": "sandbox-a3f4b2c1"
      }
    }
  }
}
```

## DevContainer Templates

### Built-in Templates

1. **base** - Minimal Linux environment with core tools
2. **node** - Node.js development environment
3. **python** - Python development environment
4. **go** - Go development environment
5. **rust** - Rust development environment
6. **fullstack** - Multi-language environment

### Template Structure

```yaml
# ~/.config/dcsandbox/templates/node.yaml
name: node
base_image: mcr.microsoft.com/devcontainers/javascript-node:20
features:
  - typescript
  - eslint
  - prettier
mcp_servers:
  - name: filesystem
    command: mcp-server-filesystem
    args: ["--root", "/workspace"]
  - name: npm-scripts
    command: mcp-server-npm
    args: ["--cwd", "/workspace"]
post_create:
  - npm install
  - npm run build
environment:
  NODE_ENV: development
```

### Auto-Detection

When using `--git` without specifying a template:

```bash
$ dcsandbox create --git https://github.com/user/react-app
Analyzing repository...
Detected: React application (package.json, tsconfig.json found)
Selected template: react
Configuring MCP servers for React development...
```

Detection rules:
- `package.json` → Node.js/JavaScript
- `requirements.txt` or `setup.py` → Python
- `go.mod` → Go
- `Cargo.toml` → Rust
- `pom.xml` or `build.gradle` → Java
- `Gemfile` → Ruby

## Sandbox Lifecycle Management

### Creation Process

1. Parse CLI arguments
2. Clone repository (if --git provided)
3. Detect or select template
4. Build/pull devcontainer image
5. Create container with resource limits
6. Configure MCP servers
7. Start MCP proxy on host
8. Output connection details

### Monitoring

```bash
# Real-time resource usage
$ dcsandbox stats my-sandbox
Sandbox: my-sandbox
CPU: 15% (0.3 cores)
Memory: 512MB / 2GB (25%)
Disk: 1.2GB / 10GB
Network: ↓ 12KB/s ↑ 3KB/s
Uptime: 23 minutes

# Follow logs
$ dcsandbox logs -f my-sandbox
[2024-01-20 10:30:15] Starting MCP server: filesystem
[2024-01-20 10:30:16] MCP server started on port 50051
[2024-01-20 10:30:17] npm install completed
```

### Cleanup

```bash
# Manual cleanup
$ dcsandbox cleanup
Found 3 inactive sandboxes:
  - old-project (stopped 2 hours ago)
  - test-sandbox (stopped 5 hours ago)
  - demo-app (stopped 1 day ago)

Remove all? [y/N] y
✓ Removed old-project
✓ Removed test-sandbox
✓ Removed demo-app

# Auto-cleanup configuration
$ dcsandbox config set cleanup.inactive_timeout 4h
$ dcsandbox config set cleanup.on_exit true
```

## Configuration

### Global Configuration

Location: `~/.config/dcsandbox/config.yaml`

```yaml
defaults:
  memory: 2G
  cpu: 2
  disk: 10G
  timeout: 120
  auto_cleanup: true

container:
  runtime: docker  # or podman
  network: bridge

mcp:
  proxy_host: localhost
  port_range: [50000, 60000]
  
cleanup:
  inactive_timeout: 4h
  on_exit: true
  preserve_named: false

templates:
  custom_path: ~/.config/dcsandbox/templates
  auto_update: true
```

### Per-Sandbox Configuration

Created in sandbox at: `/workspace/.dcsandbox/config.yaml`

```yaml
name: my-sandbox
created: 2024-01-20T10:30:00Z
template: node
git:
  url: https://github.com/user/project
  branch: main
mcp:
  servers:
    - filesystem
    - shell
    - git
    - npm-scripts
```

## Security Features

### Isolation

- Container-based isolation
- No host filesystem access (except through MCP)
- Network isolation with explicit port forwarding
- Resource limits enforced by container runtime

### MCP Security

- Authentication tokens for MCP connections
- Scoped permissions per MCP server
- Request validation and sanitization
- Rate limiting on MCP requests

### Safe Defaults

```yaml
security:
  disable_network: false
  readonly_filesystem: false
  no_new_privileges: true
  drop_capabilities:
    - CAP_SYS_ADMIN
    - CAP_NET_ADMIN
  seccomp_profile: default
```

## Error Handling

### User-Friendly Errors

```bash
$ dcsandbox create --git https://invalid-url
Error: Failed to clone repository
  Repository URL appears to be invalid or inaccessible
  
  Suggestions:
  - Check the repository URL for typos
  - Ensure you have access to private repositories
  - Try: dcsandbox create --git <url> --auth

$ dcsandbox create --memory 32G
Error: Insufficient resources
  Requested memory (32G) exceeds available (16G)
  
  Current usage:
  - System: 8G
  - Other containers: 4G
  - Available: 4G
```

### Recovery Options

```bash
# Sandbox in error state
$ dcsandbox list
NAME          STATUS    UPTIME    MCP
my-sandbox    error     -         -
working-app   running   2h 15m    localhost:52341

$ dcsandbox diagnose my-sandbox
Diagnosing sandbox: my-sandbox
✗ Container exited with code 1
✓ Image exists
✓ MCP proxy healthy
✗ Post-create command failed: npm install

Suggested actions:
1. View logs: dcsandbox logs my-sandbox
2. Recreate: dcsandbox recreate my-sandbox
3. Debug: dcsandbox shell my-sandbox
```

## Integration with Claude Code

### Automatic Configuration

```bash
# Generate Claude Code MCP configuration
$ dcsandbox claude-config my-sandbox > ~/.config/claude/mcp-servers.json

# Or append to existing config
$ dcsandbox claude-config my-sandbox --append
✓ Added my-sandbox to Claude Code MCP configuration
✓ Claude Code can now connect to the sandbox
```

### Direct Integration

Future enhancement: Claude Code could directly invoke dcsandbox:

```
# In Claude Code
/sandbox create --git https://github.com/user/project
```

## Advanced Features

### Sandbox Composition

```bash
# Create linked sandboxes
$ dcsandbox create --name frontend --git https://github.com/user/frontend
$ dcsandbox create --name backend --git https://github.com/user/backend --link frontend

# View composed environment
$ dcsandbox compose-info
Composed Environment:
  frontend (localhost:52341)
    └─ links to: backend
  backend (localhost:52342)
    └─ linked from: frontend
```

### Persistent Workspaces

```bash
# Create persistent workspace
$ dcsandbox create --name dev-workspace --persist --volume workspace-data:/workspace

# Reconnect to persistent workspace
$ dcsandbox start dev-workspace
✓ Restored workspace from volume: workspace-data
✓ MCP servers restarted
✓ Ready for Claude Code connection
```

### Export/Import

```bash
# Export sandbox configuration
$ dcsandbox export my-sandbox > my-sandbox.dcsandbox

# Import on another machine
$ dcsandbox import my-sandbox.dcsandbox
✓ Created sandbox from export
✓ Restored workspace state
✓ MCP servers configured
```

## Performance Optimizations

### Image Caching

- Pre-built images for common templates
- Layer caching for custom builds
- Periodic cleanup of unused images

### Resource Management

```bash
# View resource usage across all sandboxes
$ dcsandbox resources
Total Usage:
  CPU: 2.4 cores (30% of limit)
  Memory: 6.2GB (77% of limit)
  Disk: 23GB
  
Per Sandbox:
  my-sandbox:     0.8 cores, 2.1GB RAM
  test-env:       0.4 cores, 1.5GB RAM
  dev-workspace:  1.2 cores, 2.6GB RAM
```

## Troubleshooting

### Debug Mode

```bash
# Run with debug output
$ DCSANDBOX_DEBUG=1 dcsandbox create --name debug-test
[DEBUG] Loading configuration from ~/.config/dcsandbox/config.yaml
[DEBUG] Selected container runtime: docker
[DEBUG] Allocating port from range: 50000-60000
[DEBUG] Building image from template: base
[DEBUG] Starting MCP proxy on port 52345
```

### Common Issues

1. **MCP Connection Failed**
   ```bash
   $ dcsandbox fix-mcp my-sandbox
   ✓ Restarted MCP proxy
   ✓ Regenerated authentication tokens
   ✓ Updated firewall rules
   ```

2. **Container Won't Start**
   ```bash
   $ dcsandbox recreate my-sandbox --keep-data
   ✓ Preserved workspace data
   ✓ Rebuilt container
   ✓ Restored MCP configuration
   ```

3. **Resource Exhaustion**
   ```bash
   $ dcsandbox gc --aggressive
   ✓ Removed 5 stopped containers
   ✓ Cleaned 12GB of unused images
   ✓ Freed 8GB of dangling volumes
   ```