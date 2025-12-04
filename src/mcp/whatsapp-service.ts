import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
type Message = pkg.Message;
import qrcode from 'qrcode-terminal';
import { homedir } from 'os';
import { join } from 'path';

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

export class WhatsAppService {
  private client: InstanceType<typeof Client> | null = null;
  private state: WhatsAppStatus['state'] = 'disconnected';
  private phoneNumber: string | null = null;
  private messageQueue: ReceivedMessage[] = [];
  private qrCode: string | null = null;
  private qrResolve: ((qr: string) => void) | null = null;
  private readyResolve: (() => void) | null = null;
  private authDir: string;

  constructor() {
    this.authDir = join(homedir(), '.claude-ping', 'whatsapp-auth');
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
}
