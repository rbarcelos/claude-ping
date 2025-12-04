#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { WhatsAppService } from './whatsapp-service.js';

const whatsapp = new WhatsAppService();

const server = new Server(
  {
    name: 'claude-ping',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'whatsapp_login',
        description:
          'Start WhatsApp login flow. Returns a QR code to scan with your phone. Call whatsapp_status to check if login succeeded.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'whatsapp_status',
        description:
          'Check if WhatsApp is connected and get the logged-in phone number.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'whatsapp_send',
        description:
          'Send a message to your own WhatsApp (the claude-ping self-chat). Only works when logged in.',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to send to yourself',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'whatsapp_receive',
        description:
          'Get messages received from your own WhatsApp number. Returns messages since last check.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'whatsapp_logout',
        description: 'Disconnect from WhatsApp and clear the session.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'whatsapp_login': {
      try {
        const result = await whatsapp.startLogin();

        if (result.alreadyLoggedIn) {
          return {
            content: [
              {
                type: 'text',
                text: `Already logged in as ${result.phoneNumber}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `Scan this QR code with WhatsApp on your phone:\n\n${result.qrCode}\n\nAfter scanning, use whatsapp_status to verify connection.`,
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Login failed: ${message}` }],
          isError: true,
        };
      }
    }

    case 'whatsapp_status': {
      const status = whatsapp.getStatus();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }

    case 'whatsapp_send': {
      const message = (args as { message?: string })?.message;
      if (!message) {
        return {
          content: [{ type: 'text', text: 'Error: message parameter is required' }],
          isError: true,
        };
      }

      try {
        await whatsapp.sendToSelf(message);
        return {
          content: [{ type: 'text', text: 'Message sent successfully' }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to send: ${msg}` }],
          isError: true,
        };
      }
    }

    case 'whatsapp_receive': {
      try {
        const messages = whatsapp.getReceivedMessages();

        if (messages.length === 0) {
          return {
            content: [{ type: 'text', text: 'No new messages' }],
          };
        }

        const formatted = messages
          .map((m) => `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.body}`)
          .join('\n');

        return {
          content: [{ type: 'text', text: formatted }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Failed to get messages: ${msg}` }],
          isError: true,
        };
      }
    }

    case 'whatsapp_logout': {
      try {
        await whatsapp.logout();
        return {
          content: [{ type: 'text', text: 'Logged out successfully' }],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Logout failed: ${msg}` }],
          isError: true,
        };
      }
    }

    default:
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
