#!/usr/bin/env node

/**
 * Setup script for WhatsApp permission hooks
 *
 * This script configures Claude Code to use the WhatsApp permission hook
 * for intercepting permission requests.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ClaudeSettings {
  hooks?: {
    PermissionRequest?: Array<{
      matcher?: string;
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
  };
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
}

function getHookScriptPath(): string {
  // Get the path to the compiled hook script
  const distPath = join(__dirname, '..', 'hooks', 'permission-hook.js');
  if (existsSync(distPath)) {
    return distPath;
  }

  // Fallback to source (for development with tsx)
  const srcPath = join(__dirname, 'permission-hook.ts');
  if (existsSync(srcPath)) {
    return `npx tsx ${srcPath}`;
  }

  throw new Error('Could not find permission hook script');
}

function setupHooks(): void {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.json');

  // Ensure .claude directory exists
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  // Load existing settings or create new
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      const content = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    } catch {
      console.log('Warning: Could not parse existing settings, creating new');
    }
  }

  // Get hook script path
  const hookCommand = `node ${getHookScriptPath()}`;

  // Configure the permission hook
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Check if hook already configured
  const existingHooks = settings.hooks.PermissionRequest || [];
  const hasWhatsAppHook = existingHooks.some((h) =>
    h.hooks?.some((hook) => hook.command.includes('permission-hook'))
  );

  if (hasWhatsAppHook) {
    console.log('✅ WhatsApp permission hook already configured');
    return;
  }

  // Add the hook for all permission requests
  settings.hooks.PermissionRequest = [
    ...existingHooks,
    {
      hooks: [
        {
          type: 'command',
          command: hookCommand,
        },
      ],
    },
  ];

  // Ensure WhatsApp MCP tools are allowed
  if (!settings.permissions) {
    settings.permissions = {};
  }
  if (!settings.permissions.allow) {
    settings.permissions.allow = [];
  }

  const requiredPermissions = [
    'mcp__claude-ping__whatsapp_login',
    'mcp__claude-ping__whatsapp_send',
    'mcp__claude-ping__whatsapp_status',
    'mcp__claude-ping__whatsapp_receive',
    'mcp__claude-ping__whatsapp_logout',
    'mcp__claude-ping__whatsapp_request_permission',
  ];

  for (const perm of requiredPermissions) {
    if (!settings.permissions.allow.includes(perm)) {
      settings.permissions.allow.push(perm);
    }
  }

  // Write updated settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  console.log('✅ WhatsApp permission hook configured successfully!');
  console.log('');
  console.log('How it works:');
  console.log('1. When Claude needs permission for a tool, a WhatsApp message will be sent');
  console.log('2. Reply "yes" or "no" to approve or deny');
  console.log('3. If no response in 2 minutes, falls back to terminal prompt');
  console.log('');
  console.log('Note: Make sure to login to WhatsApp first with whatsapp_login');
}

function removeHooks(): void {
  const settingsPath = join(homedir(), '.claude', 'settings.json');

  if (!existsSync(settingsPath)) {
    console.log('No Claude settings found');
    return;
  }

  const content = readFileSync(settingsPath, 'utf-8');
  const settings: ClaudeSettings = JSON.parse(content);

  if (!settings.hooks?.PermissionRequest) {
    console.log('No permission hooks configured');
    return;
  }

  // Remove WhatsApp hooks
  settings.hooks.PermissionRequest = settings.hooks.PermissionRequest.filter(
    (h) => !h.hooks?.some((hook) => hook.command.includes('permission-hook'))
  );

  if (settings.hooks.PermissionRequest.length === 0) {
    delete settings.hooks.PermissionRequest;
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('✅ WhatsApp permission hook removed');
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (command === 'remove' || command === '--remove' || command === '-r') {
  removeHooks();
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log('Usage: claude-ping-setup [command]');
  console.log('');
  console.log('Commands:');
  console.log('  (none)     Install WhatsApp permission hooks');
  console.log('  remove     Remove WhatsApp permission hooks');
  console.log('  help       Show this help message');
} else {
  setupHooks();
}
