export interface CommandResult {
  handled: boolean;
  response?: string;
  action?: 'new_session' | 'status' | 'project_switch' | 'project_list' | 'stop' | 'help';
  projectPath?: string;
}

export function parseCommand(message: string): CommandResult {
  const trimmed = message.trim();

  if (!trimmed.startsWith('/')) {
    return { handled: false };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'new':
      return {
        handled: true,
        action: 'new_session',
        response: '🔄 Starting fresh conversation...'
      };

    case 'status':
      return {
        handled: true,
        action: 'status'
      };

    case 'project':
      if (args.length === 0) {
        return {
          handled: true,
          response: '❌ Usage: /project <path>\n\nExample: /project ~/myproject'
        };
      }
      return {
        handled: true,
        action: 'project_switch',
        projectPath: args.join(' ')
      };

    case 'projects':
      return {
        handled: true,
        action: 'project_list'
      };

    case 'stop':
      return {
        handled: true,
        action: 'stop',
        response: '⏹️ Stopping current operation...'
      };

    case 'help':
      return {
        handled: true,
        action: 'help',
        response: `*Claude WhatsApp Bridge Commands*

/new - Start a fresh conversation
/status - Check Claude's current state
/project <path> - Switch working directory
/projects - List saved projects
/stop - Cancel current operation
/help - Show this help message

Just send any other message to chat with Claude!`
      };

    default:
      return {
        handled: true,
        response: `❓ Unknown command: /${command}\n\nType /help for available commands.`
      };
  }
}
