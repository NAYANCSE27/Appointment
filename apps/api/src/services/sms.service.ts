import twilio from 'twilio';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Initialize Twilio client if credentials are configured
let twilioClient: twilio.Twilio | null = null;

if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

// SMS options
export interface SmsOptions {
  to: string;
  body: string;
}

/**
 * Send an SMS using Twilio
 */
export async function sendSms(options: SmsOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!twilioClient || !env.TWILIO_PHONE_NUMBER) {
    logger.warn('Twilio not configured, SMS would have been sent', {
      to: options.to,
      bodyLength: options.body.length,
    });
    return { success: true, messageId: 'mock-message-id' };
  }

  try {
    // Validate phone number format (E.164)
    if (!options.to.startsWith('+')) {
      throw new Error('Phone number must be in E.164 format (e.g., +1234567890)');
    }

    const response = await twilioClient.messages.create({
      to: options.to,
      from: env.TWILIO_PHONE_NUMBER,
      body: options.body,
    });

    logger.info('SMS sent successfully', { to: options.to, messageId: response.sid });

    return { success: true, messageId: response.sid };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send SMS', { to: options.to, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Validate SMS body length (max 160 chars for standard SMS)
 * Returns warning if message exceeds limit
 */
export function validateSmsLength(body: string): { valid: boolean; length: number; warning?: string } {
  const length = body.length;

  if (length > 160) {
    return {
      valid: false,
      length,
      warning: `SMS body exceeds 160 characters (${length} chars). Message may be split into multiple segments.`,
    };
  }

  return { valid: true, length };
}

/**
 * Format phone number to E.164 format
 * Assumes US numbers if no country code provided
 */
export function formatPhoneToE164(phone: string, defaultCountryCode = '+1'): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // If already has country code (11 digits starting with 1 for US)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // If 10 digits (US number without country code)
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }

  // If already has + prefix
  if (phone.startsWith('+')) {
    return phone;
  }

  // Return as-is with + prefix
  return `+${digits}`;
}
