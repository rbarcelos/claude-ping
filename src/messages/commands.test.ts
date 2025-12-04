import { describe, it, expect } from 'vitest';
import { parseCommand } from './commands.js';

describe('parseCommand', () => {
  describe('non-commands', () => {
    it('should not handle regular messages', () => {
      const result = parseCommand('hello world');
      expect(result.handled).toBe(false);
    });

    it('should not handle empty messages', () => {
      const result = parseCommand('');
      expect(result.handled).toBe(false);
    });

    it('should not handle messages with slashes in the middle', () => {
      const result = parseCommand('use this path/to/file');
      expect(result.handled).toBe(false);
    });
  });

  describe('/new command', () => {
    it('should handle /new command', () => {
      const result = parseCommand('/new');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('new_session');
      expect(result.response).toContain('fresh conversation');
    });

    it('should handle /new with extra whitespace', () => {
      const result = parseCommand('  /new  ');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('new_session');
    });
  });

  describe('/status command', () => {
    it('should handle /status command', () => {
      const result = parseCommand('/status');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('status');
    });
  });

  describe('/project command', () => {
    it('should handle /project with path', () => {
      const result = parseCommand('/project ~/myproject');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('project_switch');
      expect(result.projectPath).toBe('~/myproject');
    });

    it('should handle /project with path containing spaces', () => {
      const result = parseCommand('/project ~/my project path');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('project_switch');
      expect(result.projectPath).toBe('~/my project path');
    });

    it('should show usage when /project has no path', () => {
      const result = parseCommand('/project');
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Usage');
    });
  });

  describe('/projects command', () => {
    it('should handle /projects command', () => {
      const result = parseCommand('/projects');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('project_list');
    });
  });

  describe('/stop command', () => {
    it('should handle /stop command', () => {
      const result = parseCommand('/stop');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('stop');
      expect(result.response).toContain('Stopping');
    });
  });

  describe('/help command', () => {
    it('should handle /help command', () => {
      const result = parseCommand('/help');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('help');
      expect(result.response).toContain('/new');
      expect(result.response).toContain('/status');
      expect(result.response).toContain('/project');
    });
  });

  describe('unknown commands', () => {
    it('should handle unknown commands', () => {
      const result = parseCommand('/unknown');
      expect(result.handled).toBe(true);
      expect(result.response).toContain('Unknown command');
      expect(result.response).toContain('/unknown');
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase commands', () => {
      const result = parseCommand('/STATUS');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('status');
    });

    it('should handle mixed case commands', () => {
      const result = parseCommand('/HeLp');
      expect(result.handled).toBe(true);
      expect(result.action).toBe('help');
    });
  });
});
