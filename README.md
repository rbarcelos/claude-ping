# claude-ping

A WhatsApp MCP server for Claude Code. Message yourself via WhatsApp to interact with Claude.

## Features

- **Login via QR code** - Scan with your phone to authenticate
- **Self-messaging only** - Messages are sent to/from your own number (no contacts are messaged)
- **MCP integration** - Works as a Claude Code skill via the Model Context Protocol

## Installation

### Prerequisites

- Node.js 18+
- npm
- Claude Code CLI installed

### Quick Install (via npx)

Run this single command to add claude-ping to Claude Code:

```bash
claude mcp add claude-ping -- npx -y github:conbon/claude-ping
```

That's it! The MCP server will be downloaded and run automatically when Claude Code starts.

### Manual Install (from source)

If you prefer to clone and build locally:

```bash
# Clone the repository
git clone https://github.com/conbon/claude-ping.git
cd claude-ping

# Install dependencies
npm install

# Build
npm run build

# Add to Claude Code
claude mcp add claude-ping node $(pwd)/dist/mcp/server.js
```

### Alternative: Manual Configuration

You can also manually add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "claude-ping": {
      "command": "npx",
      "args": ["-y", "github:conbon/claude-ping"]
    }
  }
}
```

## Usage

Once configured, you can use these tools in Claude Code:

### `whatsapp_login`

Start the login flow. Returns a QR code to scan with WhatsApp on your phone.

```
> Use whatsapp_login to connect to WhatsApp
```

### `whatsapp_status`

Check connection status and see your logged-in phone number.

```
> Check whatsapp_status
```

### `whatsapp_send`

Send a message to your own WhatsApp number.

```
> Use whatsapp_send to message myself "Hello from Claude!"
```

### `whatsapp_receive`

Get messages you've sent to yourself since the last check.

```
> Check whatsapp_receive for new messages
```

### `whatsapp_logout`

Disconnect from WhatsApp and clear the session.

```
> Use whatsapp_logout to disconnect
```

## How It Works

1. The MCP server uses [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) to connect to WhatsApp Web
2. Authentication is stored locally in `~/.claude-ping/whatsapp-auth/`
3. Messages are only exchanged with your own number (the "Message yourself" chat)
4. The server runs as a subprocess managed by Claude Code

```
Claude Code ←→ MCP Server ←→ WhatsApp Web ←→ Your Phone
```

## Security Considerations

- **Local only** - All data stays on your machine
- **Self-messaging** - The bridge only messages your own number, never contacts
- **Session storage** - WhatsApp credentials are stored in `~/.claude-ping/`
- **No external services** - Direct connection to WhatsApp, no intermediary servers

## Remote Permission Approval (Experimental)

You can approve Claude Code's permission requests from your phone! When enabled, permission prompts are sent to WhatsApp instead of the terminal.

### Prerequisites

1. Claude Code must be running with the claude-ping MCP server configured
2. You must be logged into WhatsApp (run `whatsapp_login` first)

### Setup

```bash
# After installing claude-ping, run:
npm run setup-hooks
# or
npx claude-ping-setup
```

This configures Claude Code to intercept permission requests and relay them to WhatsApp.

### How It Works

1. Claude Code requests permission for a tool (e.g., Bash, Write, Edit)
2. A WhatsApp message is sent with the permission details
3. Reply to approve or deny
4. Claude Code proceeds based on your response

If you don't respond within 2 minutes, it falls back to the terminal prompt.

### Accepted Responses

| To Approve | To Deny |
|------------|---------|
| `yes`      | `no`    |
| `y`        | `n`     |
| `approve`  | `deny`  |

Responses are case-insensitive.

### Example

When Claude tries to run a bash command, you'll receive:

```
🔐 Permission Request

Tool: `Bash`
Claude needs permission to run: npm test

Reply *yes* to approve or *no* to deny.
```

Simply reply `yes` or `no` to continue.

### Remove Hooks

```bash
npm run remove-hooks
# or
npx claude-ping-setup remove
```

## Development

```bash
# Run in development mode
npm run dev

# Build
npm run build
```

## Standalone Mode

There's also a standalone bridge (not MCP) that runs independently:

```bash
# Start the standalone bridge
npm run start:standalone
```

This mode:
- Shows a QR code in terminal
- Responds to the first user who messages
- Supports commands like `/new`, `/status`, `/project`, `/projects`, `/stop`, `/help`

## Project Structure

```
src/
├── mcp/
│   ├── server.ts          # MCP server entry point
│   └── whatsapp-service.ts # WhatsApp client wrapper
├── index.ts               # Standalone entry point
├── whatsapp/
│   ├── client.ts          # WhatsApp Web.js wrapper (standalone)
│   └── browser.ts         # Browser download management
├── claude/
│   └── process.ts         # Claude Code CLI integration (standalone)
├── messages/
│   └── commands.ts        # Command parsing (standalone)
├── hooks/
│   ├── permission-hook.ts # Hook script for WhatsApp permission approval
│   └── setup.ts           # Setup script for configuring hooks
└── session/
    └── store.ts           # Session persistence (standalone)
```

## License

MIT
