import { createDecipheriv, createCipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

@Injectable()
export class SetupSecretsService {
  private readonly encryptionKey: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    this.encryptionKey = this.readEncryptionKey();
  }

  encryptJson(value: unknown): string {
    const key = this.requireEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const plaintext = JSON.stringify(value);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ciphertext: encrypted.toString('base64'),
    } satisfies EncryptedPayload);
  }

  decryptJson<T>(value: string): T {
    const key = this.requireEncryptionKey();
    const payload = this.parseEncryptedPayload(value);

    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString('utf8')) as T;
    } catch {
      throw new ServiceUnavailableException('Unable to decrypt stored setup secrets');
    }
  }

  private parseEncryptedPayload(value: string): EncryptedPayload {
    let payload: unknown;
    try {
      payload = JSON.parse(value);
    } catch {
      throw new ServiceUnavailableException('Stored setup secret payload is invalid');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new ServiceUnavailableException('Stored setup secret payload is invalid');
    }

    const iv = (payload as Partial<EncryptedPayload>).iv;
    const tag = (payload as Partial<EncryptedPayload>).tag;
    const ciphertext = (payload as Partial<EncryptedPayload>).ciphertext;

    if (
      typeof iv !== 'string' ||
      typeof tag !== 'string' ||
      typeof ciphertext !== 'string' ||
      iv.trim().length === 0 ||
      tag.trim().length === 0 ||
      ciphertext.trim().length === 0
    ) {
      throw new ServiceUnavailableException('Stored setup secret payload is invalid');
    }

    return { iv, tag, ciphertext };
  }

  private requireEncryptionKey(): Buffer {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException('SETUP_SECRETS_KEY is not configured');
    }

    return this.encryptionKey;
  }

  isConfigured(): boolean {
    return Boolean(this.encryptionKey);
  }

  deriveScopedSecret(context: string): Buffer {
    const key = this.requireEncryptionKey();
    return Buffer.from(hkdfSync('sha256', key, Buffer.alloc(0), Buffer.from(context, 'utf8'), 32));
  }

  private readEncryptionKey(): Buffer | null {
    const rawValue = this.configService.get<string>('SETUP_SECRETS_KEY')?.trim();

    if (!rawValue) {
      return null;
    }

    if (/^[0-9a-fA-F]{64}$/.test(rawValue)) {
      return Buffer.from(rawValue, 'hex');
    }

    try {
      const decoded = Buffer.from(rawValue, 'base64');
      if (decoded.length === 32) {
        return decoded;
      }
    } catch {
      // Ignore malformed base64 and rethrow a clearer message below.
    }

    throw new ServiceUnavailableException(
      'SETUP_SECRETS_KEY must be a hex or base64 encoded 32-byte key'
    );
  }
}
