import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
type Message = pkg.Message;
import qrcode from 'qrcode-terminal';
import { EventEmitter } from 'events';

export interface WhatsAppClientOptions {
  authDir?: string;
  allowedNumbers?: string[];
}

export class WhatsAppClient extends EventEmitter {
  private client: InstanceType<typeof Client>;
  private allowedNumbers: Set<string>;
  private ready = false;
  private myNumber: string | null = null;
  private claudePingChatId: string | null = null;

  constructor(options: WhatsAppClientOptions = {}) {
    super();

    this.allowedNumbers = new Set(options.allowedNumbers || []);

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: options.authDir || './.whatsapp-auth'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('qr', (qr: string) => {
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nWaiting for scan...\n');
      this.emit('qr', qr);
    });

    this.client.on('ready', () => {
      this.ready = true;
      console.log('✅ WhatsApp connected!\n');
      this.emit('ready');
    });

    this.client.on('authenticated', () => {
      console.log('🔐 Authenticated');
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('❌ Authentication failed:', msg);
      this.emit('auth_failure', msg);
    });

    this.client.on('disconnected', (reason: string) => {
      this.ready = false;
      console.log('📴 Disconnected:', reason);
      this.emit('disconnected', reason);
    });

    this.client.on('message', async (message: Message) => {
      // Skip messages from groups or status updates
      if (message.isStatus || message.from.includes('@g.us')) {
        return;
      }

      // Extract phone number (remove @c.us suffix)
      const phoneNumber = message.from.replace('@c.us', '');

      // Check if number is allowed (if whitelist is set)
      if (this.allowedNumbers.size > 0 && !this.allowedNumbers.has(phoneNumber)) {
        console.log(`⚠️  Message from unauthorized number: ${phoneNumber}`);
        return;
      }

      this.emit('message', {
        from: phoneNumber,
        body: message.body,
        timestamp: message.timestamp,
        raw: message
      });
    });
  }

  async initialize(): Promise<void> {
    console.log('🚀 Starting WhatsApp client...\n');
    await this.client.initialize();
  }

  async sendMessage(to: string, text: string): Promise<void> {
    if (!this.ready) {
      throw new Error('WhatsApp client not ready');
    }

    // Ensure number has @c.us suffix
    const chatId = to.includes('@') ? to : `${to}@c.us`;

    // Split long messages into chunks (WhatsApp limit is ~65k but keep it readable)
    const maxLength = 4000;
    const chunks = this.chunkMessage(text, maxLength);

    for (const chunk of chunks) {
      await this.client.sendMessage(chatId, chunk);
      // Small delay between chunks to maintain order
      if (chunks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  private chunkMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to break at a newline or space
      let breakPoint = remaining.lastIndexOf('\n', maxLength);
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = remaining.lastIndexOf(' ', maxLength);
      }
      if (breakPoint === -1 || breakPoint < maxLength / 2) {
        breakPoint = maxLength;
      }

      chunks.push(remaining.slice(0, breakPoint));
      remaining = remaining.slice(breakPoint).trimStart();
    }

    return chunks;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get the logged-in user's phone number
   */
  async getMyNumber(): Promise<string> {
    if (this.myNumber) {
      return this.myNumber;
    }

    const info = this.client.info;
    if (!info || !info.wid) {
      throw new Error('Not connected - cannot get phone number');
    }

    this.myNumber = info.wid.user;
    return this.myNumber;
  }

  /**
   * Find or create a group chat called "claude-ping" with only the logged-in user.
   * Returns the chat ID to use for messaging.
   */
  async findOrCreateClaudePingChat(): Promise<string> {
    if (this.claudePingChatId) {
      return this.claudePingChatId;
    }

    const myNumber = await this.getMyNumber();

    // First, try to find an existing "claude-ping" group
    const chats = await this.client.getChats();
    for (const chat of chats) {
      if (chat.name === 'claude-ping' && chat.isGroup) {
        this.claudePingChatId = chat.id._serialized;
        console.log('📌 Found existing "claude-ping" group');
        return this.claudePingChatId;
      }
    }

    // No existing group found - create one
    // Note: WhatsApp requires at least 1 other participant to create a group,
    // so we'll message ourselves directly instead (which creates a "Message yourself" chat)
    // This is actually better - it's a private note to yourself

    // Use the "me" chat (messaging yourself)
    const myChatId = `${myNumber}@c.us`;
    this.claudePingChatId = myChatId;

    console.log('📌 Using personal chat for claude-ping messages');
    return this.claudePingChatId;
  }

  /**
   * Send a message to the claude-ping chat (self)
   */
  async sendToClaudePing(text: string): Promise<void> {
    const chatId = await this.findOrCreateClaudePingChat();
    await this.sendMessage(chatId, text);
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }
}
