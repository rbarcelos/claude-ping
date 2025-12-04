#!/usr/bin/env node

/**
 * Claude Code Permission Hook
 *
 * This hook intercepts permission requests and relays them to WhatsApp
 * for remote approval. It communicates with the claude-ping MCP server
 * through a shared file-based queue.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface HookInput {
  session_id: string;
  transcript_path: string;
  permission_mode: string;
  hook_event_name: string;
  message: string;
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'PermissionRequest';
    decision: {
      behavior: 'allow' | 'deny' | 'ask';
      message?: string;
    };
  };
}

const QUEUE_DIR = join(homedir(), '.claude-ping', 'permission-queue');
const TIMEOUT_MS = 120000; // 2 minutes

// Ensure queue directory exists
if (!existsSync(QUEUE_DIR)) {
  mkdirSync(QUEUE_DIR, { recursive: true });
}

async function main() {
  // Read input from stdin
  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let input: HookInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    // Invalid input, let Claude Code handle it
    process.exit(0);
  }

  // Only handle PermissionRequest events
  if (input.hook_event_name !== 'PermissionRequest') {
    process.exit(0);
  }

  const toolName = input.tool_name;
  const message = input.message;

  // Format tool input details
  let details = message;
  if (input.tool_input) {
    const inputStr = JSON.stringify(input.tool_input, null, 2);
    if (inputStr.length < 500) {
      details = `${message}\n\nInput:\n\`\`\`\n${inputStr}\n\`\`\``;
    }
  }

  // Create a permission request file
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const requestFile = join(QUEUE_DIR, `${requestId}.request.json`);
  const responseFile = join(QUEUE_DIR, `${requestId}.response.json`);

  const request = {
    id: requestId,
    toolName,
    details,
    timestamp: Date.now(),
  };

  writeFileSync(requestFile, JSON.stringify(request, null, 2));

  // Wait for response
  const startTime = Date.now();
  while (Date.now() - startTime < TIMEOUT_MS) {
    if (existsSync(responseFile)) {
      try {
        const responseData = readFileSync(responseFile, 'utf-8');
        const response = JSON.parse(responseData);

        // Clean up
        try {
          unlinkSync(requestFile);
          unlinkSync(responseFile);
        } catch {
          // Ignore cleanup errors
        }

        const output: HookOutput = {
          hookSpecificOutput: {
            hookEventName: 'PermissionRequest',
            decision: {
              behavior: response.approved ? 'allow' : 'deny',
              message: response.approved ? undefined : 'Denied via WhatsApp',
            },
          },
        };

        console.log(JSON.stringify(output));
        process.exit(0);
      } catch {
        // Invalid response, continue waiting
      }
    }

    // Poll every 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Timeout - clean up and fall back to default behavior
  try {
    unlinkSync(requestFile);
  } catch {
    // Ignore cleanup errors
  }

  // On timeout, ask the user directly (fall back to normal behavior)
  const output: HookOutput = {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'ask',
        message: 'WhatsApp approval timed out, asking locally',
      },
    },
  };

  console.log(JSON.stringify(output));
  process.exit(0);
}

main().catch(() => {
  process.exit(0);
});
