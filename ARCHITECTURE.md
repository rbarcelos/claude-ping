# Claude Code WhatsApp Bridge - Architecture Plan

## Overview

A **local-only** TypeScript CLI tool that bridges WhatsApp and Claude Code. Everything runs on your laptop - no server deployment required.

**How it works:**
1. You run Claude Code in your terminal as usual
2. You start this bridge tool (could be a Claude Code plugin/MCP server)
3. A QR code appears in your terminal
4. You scan it with WhatsApp on your phone
5. Now you can message Claude from your phone and receive responses

## Simplified Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    YOUR LAPTOP                           │
│                                                          │
│  ┌─────────────┐      ┌─────────────┐                   │
│  │   Claude    │◄────►│  WhatsApp   │◄──── QR Scan ────►│ Your Phone
│  │   Code CLI  │      │  Bridge     │      (local)      │
│  │  (terminal) │      │  (local)    │                   │
│  └─────────────┘      └─────────────┘                   │
│                              │                           │
│                       ┌──────┴──────┐                   │
│                       │ whatsapp-   │                   │
│                       │ web.js      │                   │
│                       │ (headless)  │                   │
│                       └─────────────┘                   │
└──────────────────────────────────────────────────────────┘
```

**Key point:** whatsapp-web.js runs a headless browser session on your laptop. When you scan the QR code, WhatsApp Web connects through your phone - all communication stays local to your machine.

## Two Integration Options

### Option A: Standalone CLI Tool (Simpler)
Run alongside Claude Code:
```bash
# Terminal 1: Normal Claude Code
claude

# Terminal 2: WhatsApp bridge
npx claude-whatsapp-bridge
# Shows QR code, scan with phone, now connected!
```

### Option B: Claude Code MCP Server (Tighter Integration)
Register as an MCP server so Claude Code can send you WhatsApp messages proactively:
```json
// ~/.claude/mcp.json
{
  "servers": {
    "whatsapp": {
      "command": "npx",
      "args": ["claude-whatsapp-bridge", "--mcp"]
    }
  }
}
```

Then Claude Code gains tools like:
- `whatsapp_send(message)` - Send you a WhatsApp message
- `whatsapp_ask(question)` - Ask you something and wait for reply

## Core Components

### 1. WhatsApp Client (`src/whatsapp/client.ts`)
- Uses `whatsapp-web.js` library
- Displays QR code in terminal for scanning
- Manages the local WhatsApp Web session
- Stores auth data locally (no re-scan needed after first time)

### 2. Claude Bridge (`src/claude/bridge.ts`)
- Connects to running Claude Code process OR spawns new one
- Routes messages: Phone → Claude, Claude → Phone
- Handles output formatting for WhatsApp

### 3. Message Handler (`src/messages/handler.ts`)
- Parses incoming WhatsApp messages
- Chunks long responses for readability
- Handles special commands (`/new`, `/status`, `/project`)

### 4. Session Store (`src/session/store.ts`)
- Persists WhatsApp auth locally (`~/.claude-whatsapp/`)
- Remembers last project/working directory
- Stores conversation context

## File Structure

```
claude_ping/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── whatsapp/
│   │   ├── client.ts         # WhatsApp Web.js wrapper
│   │   ├── qr.ts             # QR code terminal display
│   │   └── auth.ts           # Auth persistence
│   ├── claude/
│   │   ├── bridge.ts         # Claude Code integration
│   │   └── process.ts        # Process spawning/management
│   ├── messages/
│   │   ├── handler.ts        # Message routing
│   │   ├── commands.ts       # Special command handlers
│   │   └── formatter.ts      # Output formatting
│   ├── session/
│   │   └── store.ts          # Local session persistence
│   └── mcp/
│       └── server.ts         # Optional MCP server mode
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencies

```json
{
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "qrcode-terminal": "^0.12.0",
    "puppeteer": "^21.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0",
    "tsx": "^4.6.0"
  }
}
```

## Usage Flow

```bash
# First time setup
npm install
npm run build

# Start the bridge
npm start

# Terminal shows:
#
# Claude WhatsApp Bridge
# ======================
# Scan this QR code with WhatsApp:
#
# ██████████████
# ██          ██
# ██  ██████  ██
# ...
#
# Waiting for scan...
# ✓ Connected! You can now message Claude from WhatsApp.
```

Then on your phone:
```
You: Help me debug the auth module

Claude: I'll take a look at the auth module. Let me read the files...
[Claude analyzes and responds]

You: Apply the fix

Claude: Done! I've updated src/auth/login.ts
```

## Special Commands

| Command | Description |
|---------|-------------|
| `/new` | Start fresh conversation |
| `/status` | Show Claude's current state |
| `/project <path>` | Switch working directory |
| `/projects` | List saved projects |
| `/stop` | Cancel current Claude operation |

## Key Features

### Local-Only
- Everything runs on your laptop
- No cloud server or deployment needed
- WhatsApp Web session is local (via headless browser)

### Persistent Auth
- Scan QR code once
- Auth saved to `~/.claude-whatsapp/`
- Reconnects automatically on restart

### Multi-Project
- Switch between projects with `/project`
- Remembers last used project

### Milestone Notifications
- Long tasks send progress updates
- "Started...", "Working on X...", "Done!"

## Security Considerations

- Auth data stored locally only
- No messages logged by default
- Your phone number is the only one that can interact
- All traffic goes through WhatsApp's E2E encryption

## Implementation Phases

### Phase 1: Basic Connection
- [ ] Project setup (package.json, tsconfig)
- [ ] WhatsApp client with QR display
- [ ] Basic message echo test

### Phase 2: Claude Integration
- [ ] Spawn/connect to Claude Code CLI
- [ ] Message routing WhatsApp ↔ Claude
- [ ] Output formatting

### Phase 3: Commands & Polish
- [ ] Special commands (/new, /project, etc.)
- [ ] Session persistence
- [ ] Error handling

### Phase 4: Optional MCP Mode
- [ ] MCP server wrapper
- [ ] Claude Code tool registration

## Notes

- **ToS**: whatsapp-web.js technically violates WhatsApp ToS - personal use only, avoid spam
- **Puppeteer**: Runs headless Chrome for WhatsApp Web - ~200MB download on first run
- **Phone Required**: Your phone must stay connected to internet for WhatsApp Web to work

## Future: libp2p Alternative

For v2, consider replacing WhatsApp with direct P2P via libp2p:
- Build a simple mobile app (React Native or Flutter)
- Direct phone ↔ laptop connection without middleman
- No ToS concerns, full control
- Current architecture abstracts the transport layer to make this swap feasible
