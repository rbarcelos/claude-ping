import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
type Message = pkg.Message;
import qrcode from 'qrcode-terminal';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, watch } from 'fs';

export interface ReceivedMessage {
  body: string;
  timestamp: number;
}

export interface WhatsAppStatus {
  connected: boolean;
  phoneNumber: string | null;
  state: 'disconnected' | 'connecting' | 'connected' | 'qr_pending';
}

export interface LoginResult {
  alreadyLoggedIn: boolean;
  phoneNumber?: string;
  qrCode?: string;
}

export interface PermissionRequest {
  id: string;
  toolName: string;
  message: string;
  timestamp: number;
}

export interface PermissionResponse {
  id: string;
  approved: boolean;
}

export class WhatsAppService {
  private client: InstanceType<typeof Client> | null = null;
  private state: WhatsAppStatus['state'] = 'disconnected';
  private phoneNumber: string | null = null;
  private messageQueue: ReceivedMessage[] = [];
  private qrCode: string | null = null;
  private qrResolve: ((qr: string) => void) | null = null;
  private readyResolve: (() => void) | null = null;
  private authDir: string;
  private pendingPermissions: Map<string, PermissionRequest> = new Map();
  private permissionResponses: Map<string, boolean> = new Map();
  private queueDir: string;
  private queueWatcher: ReturnType<typeof watch> | null = null;
  private hookPermissionMap: Map<string, string> = new Map(); // hookRequestId -> permId

  constructor() {
    this.authDir = join(homedir(), '.claude-ping', 'whatsapp-auth');
    this.queueDir = join(homedir(), '.claude-ping', 'permission-queue');

    // Ensure queue directory exists
    if (!existsSync(this.queueDir)) {
      mkdirSync(this.queueDir, { recursive: true });
    }

    // Start watching for hook permission requests
    this.startQueueWatcher();
  }

  private startQueueWatcher(): void {
    // Process any existing requests first
    this.processQueuedRequests();

    // Watch for new requests
    try {
      this.queueWatcher = watch(this.queueDir, (eventType, filename) => {
        if (filename?.endsWith('.request.json')) {
          this.processQueuedRequests();
        }
      });
    } catch {
      // Fallback to polling if watch not supported
      setInterval(() => this.processQueuedRequests(), 1000);
    }
  }

  private async processQueuedRequests(): Promise<void> {
    if (this.state !== 'connected' || !this.client || !this.phoneNumber) {
      return; // Can't process without WhatsApp connection
    }

    try {
      const files = readdirSync(this.queueDir);
      const requestFiles = files.filter((f) => f.endsWith('.request.json'));

      for (const file of requestFiles) {
        const requestPath = join(this.queueDir, file);
        const responsePath = requestPath.replace('.request.json', '.response.json');

        // Skip if already processing (response file exists or in our map)
        if (existsSync(responsePath)) continue;

        try {
          const data = readFileSync(requestPath, 'utf-8');
          const request = JSON.parse(data);

          // Check if we're already tracking this
          if (this.hookPermissionMap.has(request.id)) continue;

          // Send to WhatsApp and track
          const permId = await this.requestPermission(request.toolName, request.details);
          this.hookPermissionMap.set(request.id, permId);

          // Start waiting for response in background
          this.waitAndWriteResponse(request.id, permId, responsePath);
        } catch {
          // Skip invalid request files
        }
      }
    } catch {
      // Ignore errors reading queue
    }
  }

  private async waitAndWriteResponse(
    hookRequestId: string,
    permId: string,
    responsePath: string
  ): Promise<void> {
    const approved = await this.waitForPermission(permId, 120000);
    this.hookPermissionMap.delete(hookRequestId);

    // Write response file for the hook to read
    writeFileSync(responsePath, JSON.stringify({ approved }));
  }

  private initClient(): void {
    if (this.client) return;

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.authDir,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', (qr: string) => {
      this.state = 'qr_pending';
      // Generate ASCII QR code
      let qrText = '';
      qrcode.generate(qr, { small: true }, (code: string) => {
        qrText = code;
      });
      this.qrCode = qrText;

      if (this.qrResolve) {
        this.qrResolve(qrText);
        this.qrResolve = null;
      }
    });

    this.client.on('ready', async () => {
      this.state = 'connected';
      const info = this.client!.info;
      if (info?.wid) {
        this.phoneNumber = info.wid.user;
      }

      if (this.readyResolve) {
        this.readyResolve();
        this.readyResolve = null;
      }
    });

    this.client.on('authenticated', () => {
      this.state = 'connecting';
    });

    this.client.on('auth_failure', () => {
      this.state = 'disconnected';
    });

    this.client.on('disconnected', () => {
      this.state = 'disconnected';
      this.phoneNumber = null;
      this.client = null;
    });

    // Only queue messages from self
    this.client.on('message', async (message: Message) => {
      if (message.isStatus || message.from.includes('@g.us')) {
        return;
      }

      const senderNumber = message.from.replace('@c.us', '');

      // Only accept messages from myself
      if (this.phoneNumber && senderNumber === this.phoneNumber) {
        const body = message.body.trim().toLowerCase();

        // Check if this is a permission response
        if (this.pendingPermissions.size > 0) {
          const isApproval = body === 'yes' || body === 'y' || body === 'approve' || body === '✅';
          const isDenial = body === 'no' || body === 'n' || body === 'deny' || body === '❌';

          if (isApproval || isDenial) {
            // Get the most recent pending permission
            const entries = Array.from(this.pendingPermissions.entries());
            const [permId] = entries[entries.length - 1];
            this.permissionResponses.set(permId, isApproval);
            this.pendingPermissions.delete(permId);
            return; // Don't add to message queue
          }
        }

        this.messageQueue.push({
          body: message.body,
          timestamp: message.timestamp * 1000,
        });
      }
    });
  }

  async startLogin(): Promise<LoginResult> {
    // If already connected, return early
    if (this.state === 'connected' && this.phoneNumber) {
      return {
        alreadyLoggedIn: true,
        phoneNumber: this.phoneNumber,
      };
    }

    this.initClient();

    // Start initialization
    this.state = 'connecting';

    const qrPromise = new Promise<string>((resolve) => {
      this.qrResolve = resolve;
    });

    const readyPromise = new Promise<void>((resolve) => {
      this.readyResolve = resolve;
    });

    // Initialize client (will trigger either qr or ready event)
    this.client!.initialize();

    // Wait for either QR code or ready (if already authenticated)
    const result = await Promise.race([
      qrPromise.then((qr) => ({ type: 'qr' as const, qr })),
      readyPromise.then(() => ({ type: 'ready' as const })),
      // Timeout after 30 seconds
      new Promise<{ type: 'timeout' }>((resolve) =>
        setTimeout(() => resolve({ type: 'timeout' }), 30000)
      ),
    ]);

    if (result.type === 'ready') {
      return {
        alreadyLoggedIn: true,
        phoneNumber: this.phoneNumber!,
      };
    }

    if (result.type === 'qr') {
      return {
        alreadyLoggedIn: false,
        qrCode: result.qr,
      };
    }

    throw new Error('Login timed out');
  }

  getStatus(): WhatsAppStatus {
    return {
      connected: this.state === 'connected',
      phoneNumber: this.phoneNumber,
      state: this.state,
    };
  }

  async sendToSelf(message: string): Promise<void> {
    if (this.state !== 'connected' || !this.client || !this.phoneNumber) {
      throw new Error('Not connected. Use whatsapp_login first.');
    }

    const chatId = `${this.phoneNumber}@c.us`;
    await this.client.sendMessage(chatId, message);
  }

  getReceivedMessages(): ReceivedMessage[] {
    const messages = [...this.messageQueue];
    this.messageQueue = [];
    return messages;
  }

  async logout(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      await this.client.destroy();
      this.client = null;
    }
    this.state = 'disconnected';
    this.phoneNumber = null;
    this.messageQueue = [];
    this.qrCode = null;
  }

  /**
   * Request permission approval via WhatsApp.
   * Sends a message and returns a permission ID to check later.
   */
  async requestPermission(toolName: string, details: string): Promise<string> {
    if (this.state !== 'connected' || !this.client || !this.phoneNumber) {
      throw new Error('Not connected. Use whatsapp_login first.');
    }

    const permId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const request: PermissionRequest = {
      id: permId,
      toolName,
      message: details,
      timestamp: Date.now(),
    };

    this.pendingPermissions.set(permId, request);

    // Send permission request to WhatsApp
    const chatId = `${this.phoneNumber}@c.us`;
    const msg = `🔐 *Permission Request*

Tool: \`${toolName}\`
${details}

Reply *yes* to approve or *no* to deny.`;

    await this.client.sendMessage(chatId, msg);

    return permId;
  }

  /**
   * Check if a permission request has been responded to.
   * Returns: { pending: true } if waiting, { pending: false, approved: boolean } if responded.
   */
  checkPermission(permId: string): { pending: boolean; approved?: boolean } {
    if (this.permissionResponses.has(permId)) {
      const approved = this.permissionResponses.get(permId)!;
      this.permissionResponses.delete(permId);
      return { pending: false, approved };
    }

    if (this.pendingPermissions.has(permId)) {
      return { pending: true };
    }

    // Unknown permission ID - treat as denied
    return { pending: false, approved: false };
  }

  /**
   * Wait for permission response with timeout.
   * Returns true if approved, false if denied or timed out.
   */
  async waitForPermission(permId: string, timeoutMs: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      const result = this.checkPermission(permId);
      if (!result.pending) {
        return result.approved ?? false;
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout - clean up and deny
    this.pendingPermissions.delete(permId);
    return false;
  }
}
