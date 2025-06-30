# DCsandbox - DevContainer Sandbox CLI

A CLI tool that creates virtual on-demand devcontainers with MCP (Model Context Protocol) support, designed to work seamlessly with Claude Code. This tool enables users to create isolated sandboxes for experimenting with any idea without affecting their main development environment.

## Features

- 🚀 **Quick Setup**: Create development sandboxes in seconds
- 🔗 **Git Integration**: Clone repositories directly into containers
- 🤖 **MCP Support**: Built-in MCP servers for Claude Code integration
- 🎯 **Auto-Detection**: Smart project type detection for optimal templates
- 📦 **Template System**: Pre-built templates for popular languages and frameworks
- 🔒 **Isolation**: Complete filesystem and network isolation
- 🧹 **Auto-Cleanup**: Automatic resource management and cleanup

## Installation

```bash
npm install -g dcsandbox
```

Or install from source:

```bash
git clone https://github.com/yourusername/dcsandbox.git
cd dcsandbox
npm install
npm run build
npm link
```

## Quick Start

### Create a basic sandbox
```bash
dcsandbox create --name my-sandbox
```

### Create sandbox from git repository
```bash
dcsandbox create --git https://github.com/user/project
```

### Create with auto-detection
```bash
dcsandbox create --git https://github.com/user/react-app --auto-detect
```

### List active sandboxes
```bash
dcsandbox list
```

### Get connection info for Claude Code
```bash
dcsandbox info my-sandbox
```

## Commands

### `create [options]`
Create a new sandbox

Options:
- `--git <url>` - Git repository URL to clone
- `--branch <branch>` - Git branch to checkout (default: main)
- `--name <name>` - Custom name for the sandbox
- `--template <template>` - Predefined devcontainer template
- `--memory <size>` - Memory limit (e.g., 2G, 512M)
- `--cpu <cores>` - CPU core limit
- `--timeout <minutes>` - Auto-cleanup timeout
- `--persist` - Keep sandbox after disconnection
- `--auto-detect` - Auto-detect project type

### `list`
List active sandboxes with their MCP connection details

### `info <sandbox-id>`
Get detailed information about a sandbox including MCP connection string

### `stop <sandbox-id>`
Stop a running sandbox

### `remove <sandbox-id>`
Remove a sandbox permanently

Options:
- `--force` - Skip confirmation prompt

### `cleanup`
Clean up stopped/errored sandboxes

Options:
- `--all` - Remove all sandboxes including running ones
- `--force` - Skip confirmation prompts

### `logs <sandbox-id>`
Show logs from a sandbox

Options:
- `-f, --follow` - Follow log output
- `--tail <lines>` - Number of lines to show

## Templates

Built-in templates available:

- **base** - Minimal Linux environment
- **node** - Node.js development environment
- **python** - Python development environment
- **go** - Go development environment
- **rust** - Rust development environment
- **react** - React development environment
- **django** - Django development environment
- **fullstack** - Multi-language environment

## Claude Code Integration

After creating a sandbox, use the MCP connection details to integrate with Claude Code:

```bash
# Get connection info
dcsandbox info my-sandbox

# Example output:
# MCP Connection: localhost:52341
```

Add to your Claude Code MCP configuration:

```json
{
  "mcpServers": {
    "my-sandbox": {
      "command": "npx",
      "args": ["mcp-proxy", "connect", "localhost:52341"],
      "env": {
        "SANDBOX_ID": "sandbox-a3f4b2c1"
      }
    }
  }
}
```

## Configuration

Global configuration is stored at `~/.config/dcsandbox/config.yaml`:

```yaml
defaults:
  memory: 2G
  cpu: 2
  disk: 10G
  timeout: 120
  autoCleanup: true

container:
  runtime: docker
  network: bridge

mcp:
  proxyHost: localhost
  portRange: [50000, 60000]

cleanup:
  inactiveTimeout: 4h
  onExit: true
  preserveNamed: false

templates:
  autoUpdate: true
```

## Project Auto-Detection

DCsandbox can automatically detect project types and select appropriate templates:

- **Node.js/JavaScript**: Detects package.json, lock files, and frameworks (React, Vue, Next.js, etc.)
- **Python**: Detects requirements.txt, setup.py, and frameworks (Django, Flask, FastAPI)
- **Go**: Detects go.mod files and .go source files
- **Rust**: Detects Cargo.toml and .rs source files
- **Java**: Detects Maven (pom.xml) and Gradle (build.gradle) projects
- **Ruby**: Detects Gemfile and Rails projects
- **PHP**: Detects composer.json and Laravel/Symfony projects

## Examples

### React Development
```bash
dcsandbox create --git https://github.com/user/react-app --auto-detect
# → Automatically selects React template
# → Runs npm install after creation
# → Exposes ports 3000, 3001
```

### Python Data Science
```bash
dcsandbox create --template python --name data-analysis
# → Creates Python environment
# → Includes Jupyter notebook support
# → Pre-configured for data science workflows
```

### Full-Stack Development
```bash
dcsandbox create --template fullstack --git https://github.com/user/monorepo
# → Multi-language environment
# → Supports both frontend and backend development
# → Multiple ports exposed
```

## Troubleshooting

### Container Issues
```bash
# Check sandbox status
dcsandbox info <sandbox-id>

# View logs
dcsandbox logs <sandbox-id>

# Recreate sandbox
dcsandbox remove <sandbox-id>
dcsandbox create --git <repo-url>
```

### MCP Connection Issues
```bash
# Check MCP proxy status
dcsandbox info <sandbox-id>

# Restart sandbox
dcsandbox stop <sandbox-id>
dcsandbox start <sandbox-id>
```

### Resource Issues
```bash
# Clean up unused sandboxes
dcsandbox cleanup

# Check system resources
docker system df
```

## Requirements

- Node.js 18+
- Docker or Podman
- Git

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- GitHub Issues: [Report bugs and request features](https://github.com/yourusername/dcsandbox/issues)
- Documentation: [Full documentation](https://docs.example.com/dcsandbox)