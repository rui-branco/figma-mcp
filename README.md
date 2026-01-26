# Figma MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that brings Figma designs directly into Claude Code. View design specifications, export frames as images, and reference visual context without leaving your development environment.

## Overview

Implementing designs accurately requires constant reference to Figma. This MCP server eliminates context switching by:

- **Fetching design information** - Get file names, frame details, and dimensions
- **Exporting images** - Download frames as high-resolution PNGs
- **Smart section splitting** - Large frames are automatically split into readable sections
- **Seamless integration** - Works standalone or integrated with [jira-mcp](https://github.com/rui-branco/jira-mcp)

## Features

| Feature | Description |
|---------|-------------|
| Design Info | File name, last modified, frame dimensions |
| Image Export | Export frames as PNG, SVG, JPG, or PDF |
| Auto-Scaling | 2x scale by default for retina clarity |
| Section Detection | Large frames split into individual sections |
| Batch Export | Export multiple frames efficiently |
| URL Parsing | Supports file, design, and prototype URLs |

## Installation

### Prerequisites

- Node.js 18+
- [Claude Code](https://claude.ai/code) CLI
- Figma account with API access

### Step 1: Add to Claude Code

```bash
claude mcp add --transport stdio figma -- npx -y @rui.branco/figma-mcp
```

### Step 2: Get Your Figma Token

1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Scroll down to **"Personal access tokens"**
3. Click **"Generate new token"**
4. Enter a description (e.g., "Claude Code MCP")
5. Click **"Generate token"**
6. Copy the token (you won't be able to see it again)

### Step 3: Configure Credentials

Run the setup with your token:

```bash
npx @rui.branco/figma-mcp setup "YOUR_FIGMA_TOKEN"
```

Or run interactively (will prompt for the token):

```bash
npx @rui.branco/figma-mcp setup
```

### Step 4: Verify

Restart Claude Code and run `/mcp` to verify the server is connected.

### Alternative: Manual Installation

If you prefer to install manually:

```bash
git clone https://github.com/rui-branco/figma-mcp.git ~/.config/figma-mcp
cd ~/.config/figma-mcp && npm install
node setup.js
```

Then add to Claude Code:

```bash
claude mcp add --transport stdio figma -- node $HOME/.config/figma-mcp/index.js
```

## Usage

### Fetch a Design

```
> Get this Figma design: https://www.figma.com/design/ABC123/MyProject?node-id=1-234
```

### Example Output

```
# Figma File: MyProject

**Last Modified:** 2025-01-15T10:30:00Z

## Selected Frame: Login Screen

**Type:** FRAME
**Size:** 1440 x 900

### Sections (4):
- **Header** (FRAME, 1440x80)
- **Login Form** (FRAME, 400x350)
- **Footer** (FRAME, 1440x60)
- **Background** (FRAME, 1440x900)

### Exported Sections:
- Header: ~/.config/figma-mcp/exports/ABC123_1_234.png
- Login Form: ~/.config/figma-mcp/exports/ABC123_1_235.png
- Footer: ~/.config/figma-mcp/exports/ABC123_1_236.png

[Images displayed inline]
```

## Smart Section Export

For large frames (>1500px wide or >2000px tall), the server automatically:

1. Detects child frames, components, and groups
2. Exports each section separately at 2x scale
3. Provides better detail than a single compressed image
4. Limits to 10 sections by default (configurable)

This is especially useful for:
- Full-page designs with multiple sections
- Component libraries
- Design system documentation

## API Reference

### Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `figma_get_design` | Fetch design from URL | `url` (required), `exportImage`, `exportChildren`, `maxChildren`, `scale` |
| `figma_export_frame` | Export specific frame | `fileKey`, `nodeId` (required), `format`, `scale` |

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `exportImage` | `true` | Export images |
| `exportChildren` | `true` | Split large frames into sections |
| `maxChildren` | `10` | Maximum sections to export |
| `scale` | `2` | Export scale (1-4) |
| `format` | `png` | Export format (png, svg, jpg, pdf) |

### Configuration

Config stored at `~/.config/figma-mcp/config.json`:

```json
{
  "token": "YOUR_FIGMA_TOKEN"
}
```

## Error Handling

The server provides clear error messages:

| Error | Meaning | Solution |
|-------|---------|----------|
| `Rate limit exceeded` | Too many API requests | Wait a few minutes |
| `Access denied` | Invalid token or no file access | Check token permissions |
| `File not found` | Invalid URL or deleted file | Verify the Figma URL |

## Integration with Jira MCP

When used alongside [jira-mcp](https://github.com/rui-branco/jira-mcp):

1. Figma links in Jira tickets are **automatically detected**
2. Designs are **fetched without manual intervention**
3. Images appear **inline with ticket context**

This creates a seamless workflow:
```
> Get ticket PROJ-123

# Returns ticket details + auto-fetched Figma designs
```

## Security

- Tokens stored locally in `~/.config/figma-mcp/config.json`
- Config excluded from git via `.gitignore`
- Tokens only transmitted to Figma API
- Exports saved to `~/.config/figma-mcp/exports/`

## License

MIT

## Related

- [jira-mcp](https://github.com/rui-branco/jira-mcp) - Jira MCP server with Figma integration
- [Model Context Protocol](https://modelcontextprotocol.io/) - MCP specification
- [Figma API](https://www.figma.com/developers/api) - Figma REST API documentation
