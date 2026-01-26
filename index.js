#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

// Load config
const configPath = path.join(process.env.HOME, ".config/figma-mcp/config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const FIGMA_API = "https://api.figma.com/v1";
const exportsDir = path.join(process.env.HOME, ".config/figma-mcp/exports");

if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function figmaFetch(endpoint, { maxRetries = 3 } = {}) {
  let attempts = 0;

  while (true) {
    const response = await fetch(`${FIGMA_API}${endpoint}`, {
      headers: { "X-Figma-Token": config.token },
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 429) {
      if (attempts++ >= maxRetries) {
        const retryAfter = response.headers.get("retry-after") || "60";
        throw new Error(`Figma API rate limit exceeded. Try again in ${retryAfter} seconds.`);
      }
      const retryAfterSec = Number(response.headers.get("retry-after")) || 10;
      await sleep(retryAfterSec * 1000);
      continue;
    }

    if (response.status === 403) {
      throw new Error("Figma access denied. Check your token or file permissions.");
    }
    if (response.status === 404) {
      throw new Error("Figma file not found. Check the URL.");
    }
    const text = await response.text();
    throw new Error(`Figma API error: ${response.status} - ${text}`);
  }
}

function normalizeNodeId(nodeId) {
  if (!nodeId) return null;
  return nodeId.replace(/-/g, ":");
}

function parseFigmaUrl(url) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/");

  let fileKey = null;
  for (let i = 0; i < pathParts.length; i++) {
    if (pathParts[i] === "file" || pathParts[i] === "design" || pathParts[i] === "proto") {
      fileKey = pathParts[i + 1];
      break;
    }
  }

  if (!fileKey) throw new Error("Could not extract file key from Figma URL");

  const rawNodeId = urlObj.searchParams.get("node-id");
  const nodeId = normalizeNodeId(rawNodeId);

  return { fileKey, nodeId };
}

async function getFileInfo(fileKey) {
  return await figmaFetch(`/files/${fileKey}?depth=1`);
}

async function getNodeInfo(fileKey, nodeId, depth = 2) {
  return await figmaFetch(`/files/${fileKey}/nodes?ids=${encodeURIComponent(nodeId)}&depth=${depth}`);
}

async function exportImage(fileKey, nodeId, format = "png", scale = 2) {
  const exportData = await figmaFetch(
    `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`
  );

  if (exportData.err) throw new Error(`Export error: ${exportData.err}`);

  const imageUrl = exportData.images[nodeId];
  if (!imageUrl) throw new Error("No image URL returned");

  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);

  const buffer = await response.buffer();

  const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
  const filename = `${fileKey}_${sanitizedNodeId}.${format}`;
  const localPath = path.join(exportsDir, filename);
  fs.writeFileSync(localPath, buffer);

  return { localPath, buffer, nodeId };
}

// Export multiple nodes in one API call (more efficient)
async function exportMultipleImages(fileKey, nodeIds, format = "png", scale = 2) {
  const idsParam = nodeIds.join(",");
  const exportData = await figmaFetch(
    `/images/${fileKey}?ids=${encodeURIComponent(idsParam)}&format=${format}&scale=${scale}`
  );

  if (exportData.err) throw new Error(`Export error: ${exportData.err}`);

  const results = [];
  for (const nodeId of nodeIds) {
    const imageUrl = exportData.images[nodeId];
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        if (response.ok) {
          const buffer = await response.buffer();
          const sanitizedNodeId = nodeId.replace(/[^a-zA-Z0-9-]/g, "_");
          const filename = `${fileKey}_${sanitizedNodeId}.${format}`;
          const localPath = path.join(exportsDir, filename);
          fs.writeFileSync(localPath, buffer);
          results.push({ localPath, buffer, nodeId });
        }
      } catch (e) {
        // Skip failed downloads
      }
    }
  }
  return results;
}

// Find exportable children (FRAME, COMPONENT, GROUP with reasonable size)
function findExportableChildren(doc, minSize = 100) {
  const children = [];
  if (!doc.children) return children;

  for (const child of doc.children) {
    const isExportable = ["FRAME", "COMPONENT", "COMPONENT_SET", "GROUP", "SECTION"].includes(child.type);
    const bb = child.absoluteBoundingBox;
    const hasSize = bb && bb.width >= minSize && bb.height >= minSize;

    if (isExportable && hasSize) {
      children.push({
        id: child.id,
        name: child.name,
        type: child.type,
        width: bb ? Math.round(bb.width) : 0,
        height: bb ? Math.round(bb.height) : 0,
      });
    }
  }
  return children;
}

async function getFigmaDesign(url, options = {}) {
  const {
    exportImage: shouldExport = true,
    exportChildren = true,  // NEW: export child frames separately
    maxChildren = 10,       // NEW: limit number of children to export
    scale = 2,
  } = options;

  const { fileKey, nodeId } = parseFigmaUrl(url);

  let output = "";
  let images = [];

  const fileInfo = await getFileInfo(fileKey);
  output += `# Figma File: ${fileInfo.name}\n\n`;
  output += `**Last Modified:** ${fileInfo.lastModified}\n`;

  if (nodeId) {
    try {
      const nodeData = await getNodeInfo(fileKey, nodeId, 2);
      const node = nodeData.nodes[nodeId];

      if (node && node.document) {
        const doc = node.document;
        output += `\n## Selected Frame: ${doc.name}\n\n`;
        output += `**Type:** ${doc.type}\n`;

        if (doc.absoluteBoundingBox) {
          const bb = doc.absoluteBoundingBox;
          output += `**Size:** ${Math.round(bb.width)} x ${Math.round(bb.height)}\n`;
        }

        // Find exportable children
        const exportableChildren = findExportableChildren(doc);

        if (exportableChildren.length > 0) {
          output += `\n### Sections (${exportableChildren.length}):\n`;
          for (const child of exportableChildren) {
            output += `- **${child.name}** (${child.type}, ${child.width}x${child.height})\n`;
          }
        }

        // Export logic
        if (shouldExport) {
          // If frame has exportable children and is large, export children instead
          const isLargeFrame = doc.absoluteBoundingBox &&
            (doc.absoluteBoundingBox.width > 1500 || doc.absoluteBoundingBox.height > 2000);

          if (exportChildren && exportableChildren.length > 0 && isLargeFrame) {
            output += `\n### Exported Sections:\n`;

            // Export children (up to maxChildren)
            const childrenToExport = exportableChildren.slice(0, maxChildren);
            const nodeIds = childrenToExport.map(c => c.id);

            try {
              const exportedImages = await exportMultipleImages(fileKey, nodeIds, "png", scale);

              for (const img of exportedImages) {
                const childInfo = childrenToExport.find(c => c.id === img.nodeId);
                output += `- ${childInfo?.name || img.nodeId}: ${img.localPath}\n`;
                images.push({
                  path: img.localPath,
                  buffer: img.buffer,
                  name: childInfo?.name || img.nodeId
                });
              }

              if (exportableChildren.length > maxChildren) {
                output += `\n_(${exportableChildren.length - maxChildren} more sections not exported)_\n`;
              }
            } catch (e) {
              output += `Export failed: ${e.message}\n`;
            }
          } else {
            // Export the whole frame
            output += `\n### Exported Image:\n`;
            try {
              const { localPath, buffer } = await exportImage(fileKey, nodeId, "png", scale);
              output += `Local path: ${localPath}\n`;
              images.push({ path: localPath, buffer, name: doc.name });
            } catch (e) {
              output += `Export failed: ${e.message}\n`;
            }
          }
        }
      }
    } catch (e) {
      output += `\nCould not fetch node details: ${e.message}\n`;
    }
  } else {
    // No specific node, list pages
    if (fileInfo.document && fileInfo.document.children) {
      output += `\n## Pages (${fileInfo.document.children.length}):\n\n`;
      for (const page of fileInfo.document.children) {
        output += `- **${page.name}**\n`;
      }
    }
  }

  return { text: output, images };
}

const server = new Server(
  { name: "figma-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "figma_get_design",
        description: "Fetch a Figma design from a URL. For large frames with sections, automatically exports each section separately for better detail.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The Figma URL" },
            exportImage: { type: "boolean", description: "Export images (default: true)" },
            exportChildren: { type: "boolean", description: "Export child sections separately for large frames (default: true)" },
            maxChildren: { type: "number", description: "Max sections to export (default: 10)" },
            scale: { type: "number", description: "Export scale 1-4 (default: 2)" },
          },
          required: ["url"],
        },
      },
      {
        name: "figma_export_frame",
        description: "Export a specific Figma frame/node as an image",
        inputSchema: {
          type: "object",
          properties: {
            fileKey: { type: "string", description: "The Figma file key" },
            nodeId: { type: "string", description: "The node ID (e.g., '123-456' or '123:456')" },
            format: { type: "string", enum: ["png", "svg", "pdf", "jpg"], description: "Format (default: png)" },
            scale: { type: "number", description: "Scale 0.01-4 (default: 2)" },
          },
          required: ["fileKey", "nodeId"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "figma_get_design") {
      const result = await getFigmaDesign(args.url, {
        exportImage: args.exportImage !== false,
        exportChildren: args.exportChildren !== false,
        maxChildren: args.maxChildren || 10,
        scale: args.scale || 2,
      });

      const content = [{ type: "text", text: result.text }];

      for (const img of result.images) {
        content.push({
          type: "image",
          data: img.buffer.toString("base64"),
          mimeType: "image/png",
        });
      }

      return { content };
    } else if (name === "figma_export_frame") {
      const nodeId = normalizeNodeId(args.nodeId);
      const { localPath, buffer } = await exportImage(
        args.fileKey,
        nodeId,
        args.format || "png",
        args.scale || 2
      );

      return {
        content: [
          { type: "text", text: `Exported to: ${localPath}` },
          { type: "image", data: buffer.toString("base64"), mimeType: "image/png" },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
