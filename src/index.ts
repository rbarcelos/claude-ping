#!/usr/bin/env node

import { WhatsAppClient } from './whatsapp/client.js';
import { ClaudeProcess } from './claude/process.js';
import { parseCommand } from './messages/commands.js';
import { SessionStore } from './session/store.js';
import { ensureBrowser } from './whatsapp/browser.js';
import { existsSync } from 'fs';

interface IncomingMessage {
  from: string;
  body: string;
  timestamp: number;
  raw: unknown;
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   Claude WhatsApp Bridge v0.1.0      ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Initialize session store
  const session = new SessionStore();
  const currentProject = session.getCurrentProject();

  console.log(`📁 Working directory: ${currentProject}\n`);

  // Ensure browser is downloaded (with progress bar if needed)
  await ensureBrowser();

  // Initialize Claude process manager
  const claude = new ClaudeProcess({
    workingDir: currentProject
  });

  // Initialize WhatsApp client
  const whatsapp = new WhatsAppClient({});

  let myNumber: string | null = null;

  // Handle incoming messages - ONLY from self
  whatsapp.on('message', async (msg: IncomingMessage) => {
    const { from, body } = msg;

    // Only accept messages from myself (the logged-in user)
    if (!myNumber) {
      console.log(`⚠️  Ignoring message - not ready yet (from: ${from})`);
      return;
    }

    if (from !== myNumber) {
      console.log(`⚠️  Ignoring message from ${from} (not me: ${myNumber})`);
      return;
    }

    console.log(`📩 Message from self: ${body.slice(0, 50)}${body.length > 50 ? '...' : ''}`);

    try {
      // Check for commands first
      const commandResult = parseCommand(body);

      if (commandResult.handled) {
        await handleCommand(commandResult, whatsapp, claude, session);
        return;
      }

      // Send to Claude
      await whatsapp.sendToClaudePing('🤔 Thinking...');

      const response = await claude.sendMessage(body);
      await whatsapp.sendToClaudePing(response);

      console.log(`✅ Response sent (${response.length} chars)\n`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error(`❌ Error: ${errorMessage}`);
      await whatsapp.sendToClaudePing(`❌ Error: ${errorMessage}`);
    }
  });

  // Start WhatsApp client
  await whatsapp.initialize();

  // Get my phone number and set up claude-ping chat
  myNumber = await whatsapp.getMyNumber();
  console.log(`👤 Logged in as: ${myNumber}`);

  // Initialize the claude-ping chat
  await whatsapp.findOrCreateClaudePingChat();
  await whatsapp.sendToClaudePing('🤖 Claude bridge connected! Send me a message to chat with Claude.');
  console.log('✅ Ready to receive messages from yourself only.\n');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await whatsapp.destroy();
    process.exit(0);
  });
}

async function handleCommand(
  result: ReturnType<typeof parseCommand>,
  whatsapp: WhatsAppClient,
  claude: ClaudeProcess,
  session: SessionStore
): Promise<void> {
  if (result.response) {
    await whatsapp.sendToClaudePing(result.response);
  }

  switch (result.action) {
    case 'status': {
      const status = claude.isAvailable() ? '✅ Ready' : '⏳ Processing...';
      const project = session.getCurrentProject();
      await whatsapp.sendToClaudePing(`*Status*\n\n${status}\n📁 Project: ${project}`);
      break;
    }

    case 'project_switch': {
      const resolvedPath = session.resolveProject(result.projectPath!);
      if (!resolvedPath) {
        await whatsapp.sendToClaudePing('❌ Could not resolve project path');
        return;
      }

      if (!existsSync(resolvedPath)) {
        await whatsapp.sendToClaudePing(`❌ Directory does not exist: ${resolvedPath}`);
        return;
      }

      session.setCurrentProject(resolvedPath);
      claude.setWorkingDir(resolvedPath);
      await whatsapp.sendToClaudePing(`✅ Switched to: ${resolvedPath}`);
      console.log(`📁 Project switched to: ${resolvedPath}\n`);
      break;
    }

    case 'project_list': {
      const projects = session.getProjects();
      if (projects.length === 0) {
        await whatsapp.sendToClaudePing('No saved projects. Use /project <path> to add one.');
        return;
      }

      const list = projects
        .map((p, i) => {
          const label = p.alias ? `${p.alias} (${p.path})` : p.path;
          const current = p.path === session.getCurrentProject() ? ' ✓' : '';
          return `${i + 1}. ${label}${current}`;
        })
        .join('\n');

      await whatsapp.sendToClaudePing(`*Saved Projects*\n\n${list}`);
      break;
    }

    case 'stop':
      claude.cancel();
      break;

    case 'new_session':
      // For now, just acknowledge - Claude Code handles context per invocation
      // In the future, could clear any persisted state
      break;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
