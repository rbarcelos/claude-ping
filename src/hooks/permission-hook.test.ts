import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test the permission queue file format
describe('Permission Queue Format', () => {
  let queueDir: string;

  beforeEach(() => {
    queueDir = join(tmpdir(), `claude-ping-perm-test-${Date.now()}`);
    mkdirSync(queueDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(queueDir, { recursive: true, force: true });
  });

  describe('request file format', () => {
    it('should create valid request JSON', () => {
      const requestId = `req_${Date.now()}_abc123`;
      const request = {
        id: requestId,
        toolName: 'Bash',
        details: 'Run: npm test',
        timestamp: Date.now(),
      };

      const requestFile = join(queueDir, `${requestId}.request.json`);
      writeFileSync(requestFile, JSON.stringify(request, null, 2));

      expect(existsSync(requestFile)).toBe(true);

      const content = JSON.parse(readFileSync(requestFile, 'utf-8'));
      expect(content.id).toBe(requestId);
      expect(content.toolName).toBe('Bash');
      expect(content.details).toBe('Run: npm test');
      expect(content.timestamp).toBeTypeOf('number');
    });
  });

  describe('response file format', () => {
    it('should create approval response', () => {
      const requestId = 'req_123';
      const responseFile = join(queueDir, `${requestId}.response.json`);

      writeFileSync(responseFile, JSON.stringify({ approved: true }));

      const content = JSON.parse(readFileSync(responseFile, 'utf-8'));
      expect(content.approved).toBe(true);
    });

    it('should create denial response', () => {
      const requestId = 'req_123';
      const responseFile = join(queueDir, `${requestId}.response.json`);

      writeFileSync(responseFile, JSON.stringify({ approved: false }));

      const content = JSON.parse(readFileSync(responseFile, 'utf-8'));
      expect(content.approved).toBe(false);
    });
  });

  describe('hook output format', () => {
    it('should format allow decision correctly', () => {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'allow' as const,
          },
        },
      };

      expect(output.hookSpecificOutput.hookEventName).toBe('PermissionRequest');
      expect(output.hookSpecificOutput.decision.behavior).toBe('allow');
    });

    it('should format deny decision correctly', () => {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'deny' as const,
            message: 'Denied via WhatsApp',
          },
        },
      };

      expect(output.hookSpecificOutput.decision.behavior).toBe('deny');
      expect(output.hookSpecificOutput.decision.message).toBe('Denied via WhatsApp');
    });

    it('should format ask decision correctly', () => {
      const output = {
        hookSpecificOutput: {
          hookEventName: 'PermissionRequest',
          decision: {
            behavior: 'ask' as const,
            message: 'WhatsApp approval timed out',
          },
        },
      };

      expect(output.hookSpecificOutput.decision.behavior).toBe('ask');
    });
  });
});

describe('Permission Response Parsing', () => {
  const approvalMessages = ['yes', 'YES', 'Yes', 'y', 'Y', 'approve', 'APPROVE', '✅'];
  const denialMessages = ['no', 'NO', 'No', 'n', 'N', 'deny', 'DENY', '❌'];

  describe('approval detection', () => {
    approvalMessages.forEach((msg) => {
      it(`should recognize "${msg}" as approval`, () => {
        const body = msg.trim().toLowerCase();
        const isApproval =
          body === 'yes' || body === 'y' || body === 'approve' || body === '✅';
        expect(isApproval).toBe(true);
      });
    });
  });

  describe('denial detection', () => {
    denialMessages.forEach((msg) => {
      it(`should recognize "${msg}" as denial`, () => {
        const body = msg.trim().toLowerCase();
        const isDenial = body === 'no' || body === 'n' || body === 'deny' || body === '❌';
        expect(isDenial).toBe(true);
      });
    });
  });

  describe('non-response detection', () => {
    const nonResponses = ['maybe', 'later', 'hello', 'what?', ''];

    nonResponses.forEach((msg) => {
      it(`should not recognize "${msg}" as approval or denial`, () => {
        const body = msg.trim().toLowerCase();
        const isApproval =
          body === 'yes' || body === 'y' || body === 'approve' || body === '✅';
        const isDenial = body === 'no' || body === 'n' || body === 'deny' || body === '❌';
        expect(isApproval || isDenial).toBe(false);
      });
    });
  });
});
