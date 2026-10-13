/**
 * Agentia ConflictHealer — MCP Server
 * Exposes ConflictHealer as native tools for Cursor / VS Code / Claude Desktop
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { healConflicts } from './engine.js';

const server = new Server(
  { name: 'agentia-conflicthealer', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'healer_auto_resolve',
      description:
        'Scans the Salesforce project for Git merge conflicts, semantically heals XML metadata tags using AST deduplication, verifies XML syntax validity, and saves healed files ready for agentia cicd work submit.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to directory containing merge conflicts (defaults to workspace root)',
          },
          dry_run: {
            type: 'boolean',
            description: 'If true, returns preview of resolutions without touching disk',
          },
        },
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'healer_auto_resolve') {
    const targetPath = args?.path ?? process.cwd();
    const dryRun = args?.dry_run ?? false;

    try {
      const result = await healConflicts(targetPath, { dryRun });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: result.healedFiles.length > 0 ? 'RESOLVED' : 'NO_CONFLICTS',
                totalConflictsResolved: result.totalConflictsResolved,
                healedFiles: result.healedFiles,
                errors: result.errors,
                recommendation: 'Conflicts healed and XML validated. Ready to execute: agentia cicd work submit --resume',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `ConflictHealer error: ${err.message}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Agentia ConflictHealer MCP server running on stdio');
