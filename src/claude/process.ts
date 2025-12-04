import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface ClaudeProcessOptions {
  workingDir: string;
  claudeCommand?: string;
}

export class ClaudeProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private workingDir: string;
  private claudeCommand: string;
  private outputBuffer = '';
  private isProcessing = false;

  constructor(options: ClaudeProcessOptions) {
    super();
    this.workingDir = options.workingDir;
    this.claudeCommand = options.claudeCommand || 'claude';
  }

  async sendMessage(message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.isProcessing) {
        reject(new Error('Claude is still processing a previous message'));
        return;
      }

      this.isProcessing = true;
      this.outputBuffer = '';

      // Spawn a new claude process with --print flag for non-interactive mode
      // Using -p for print mode which outputs response and exits
      this.process = spawn(this.claudeCommand, ['-p', message], {
        cwd: this.workingDir,
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      this.process.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        this.emit('output', chunk);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        // Emit stderr as well - Claude Code uses stderr for status messages
        this.emit('stderr', chunk);
      });

      this.process.on('close', (code) => {
        this.isProcessing = false;
        this.process = null;

        if (code === 0) {
          resolve(stdout.trim());
        } else {
          // Include stderr in error for debugging
          const errorMsg = stderr || `Claude process exited with code ${code}`;
          reject(new Error(errorMsg));
        }
      });

      this.process.on('error', (err) => {
        this.isProcessing = false;
        this.process = null;
        reject(err);
      });
    });
  }

  isAvailable(): boolean {
    return !this.isProcessing;
  }

  cancel(): void {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.isProcessing = false;
    }
  }

  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  getWorkingDir(): string {
    return this.workingDir;
  }
}
