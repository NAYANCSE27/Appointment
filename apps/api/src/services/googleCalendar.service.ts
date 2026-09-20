import { google } from 'googleapis';
import { prisma } from '../config/prisma';
import { decryptAES } from '../utils/crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const OAuth2 = google.auth.OAuth2;

// Calendar event interface
interface CalendarEvent {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string; displayName?: string }>;
}

/**
 * Get OAuth2 client for Google Calendar
 */
function getOAuthClient() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }

  return new OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/v1/auth/google/callback'
  );
}

/**
 * Get authorization URL for Google OAuth
 */
export function getGoogleAuthorizationUrl(userId: string, tenantId: string): string {
  const oauth2Client = getOAuthClient();

  // Create state JWT containing userId and tenantId
  const state = Buffer.from(JSON.stringify({ userId, tenantId })).toString('base64');

  const scopes = ['https://www.googleapis.com/auth/calendar.events'];

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    state,
    prompt: 'consent', // Always get refresh token
  });
}

/**
 * Handle Google OAuth callback
 */
export async function handleGoogleCallback(code: string, state: string): Promise<{ success: boolean; userId: string }> {
  const oauth2Client = getOAuthClient();

  // Decode state
  const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
  const { userId, tenantId } = stateData;

  // Exchange code for tokens
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  // Encrypt tokens before storing
  const encryptedAccessToken = encryptAES(tokens.access_token);
  const encryptedRefreshToken = encryptAES(tokens.refresh_token);

  // Upsert OAuth token record
  await prisma.oAuthToken.upsert({
    where: {
      userId_provider: {
        userId,
        provider: 'google',
      },
    },
    update: {
      encryptedAccessToken,
      encryptedRefreshToken,
      accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600000),
      scope: tokens.scope || '',
    },
    create: {
      userId,
      provider: 'google',
      encryptedAccessToken,
      encryptedRefreshToken,
      accessTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600000),
      scope: tokens.scope || '',
    },
  });

  logger.info('Google OAuth tokens stored', { userId, tenantId });

  return { success: true, userId };
}

/**
 * Get authenticated Google Calendar client for a user
 */
async function getAuthenticatedClient(userId: string) {
  const oauthToken = await prisma.oAuthToken.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'google',
      },
    },
  });

  if (!oauthToken) {
    return null;
  }

  const oauth2Client = getOAuthClient();

  // Decrypt tokens
  const accessToken = decryptAES(oauthToken.encryptedAccessToken);
  const refreshToken = decryptAES(oauthToken.encryptedRefreshToken);

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: oauthToken.accessTokenExpiry.getTime(),
  });

  // Check if token needs refresh
  if (oauthToken.accessTokenExpiry < new Date()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();

      // Update tokens in database
      const newEncryptedAccessToken = encryptAES(credentials.access_token || '');
      await prisma.oAuthToken.update({
        where: { id: oauthToken.id },
        data: {
          encryptedAccessToken: newEncryptedAccessToken,
          accessTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3600000),
        },
      });

      oauth2Client.setCredentials(credentials);
      logger.info('Google token refreshed', { userId });
    } catch (error) {
      logger.error('Failed to refresh Google token', { userId, error });
      throw new Error('Failed to refresh Google token');
    }
  }

  return oauth2Client;
}

/**
 * Create a Google Calendar event
 */
export async function createGoogleCalendarEvent(
  userId: string,
  eventData: CalendarEvent
): Promise<string | null> {
  try {
    const auth = await getAuthenticatedClient(userId);
    if (!auth) {
      logger.info('User has not connected Google Calendar', { userId });
      return null;
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventData,
    });

    const eventId = response.data.id;
    logger.info('Google Calendar event created', { userId, eventId });

    return eventId || null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Google Calendar event', { userId, error: errorMessage });
    throw error;
  }
}

/**
 * Update a Google Calendar event
 */
export async function updateGoogleCalendarEvent(
  userId: string,
  eventId: string,
  eventData: CalendarEvent
): Promise<boolean> {
  try {
    const auth = await getAuthenticatedClient(userId);
    if (!auth) {
      logger.info('User has not connected Google Calendar', { userId });
      return false;
    }

    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: eventData,
    });

    logger.info('Google Calendar event updated', { userId, eventId });
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update Google Calendar event', { userId, eventId, error: errorMessage });
    throw error;
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteGoogleCalendarEvent(
  userId: string,
  eventId: string
): Promise<boolean> {
  try {
    const auth = await getAuthenticatedClient(userId);
    if (!auth) {
      logger.info('User has not connected Google Calendar', { userId });
      return false;
    }

    const calendar = google.calendar({ version: 'v3', auth });

    try {
      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });

      logger.info('Google Calendar event deleted', { userId, eventId });
    } catch (error: unknown) {
      // Handle 404 gracefully (event already deleted)
      if (error && typeof error === 'object' && 'code' in error && error.code === 404) {
        logger.info('Google Calendar event already deleted', { userId, eventId });
        return true;
      }
      throw error;
    }

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete Google Calendar event', { userId, eventId, error: errorMessage });
    throw error;
  }
}

/**
 * Build calendar event data from appointment
 */
export function buildCalendarEventData(appointment: {
  service: { name: string };
  patient: { firstName: string; lastName: string; email: string };
  provider: { user: { firstName: string; lastName: string } };
  startTime: Date;
  endTime: Date;
  patientTimezone: string;
  bookingRef: string;
}): CalendarEvent {
  return {
    summary: `${appointment.service.name} - ${appointment.patient.firstName} ${appointment.patient.lastName}`,
    description: `Booking Reference: ${appointment.bookingRef}\nProvider: Dr. ${appointment.provider.user.firstName} ${appointment.provider.user.lastName}`,
    start: {
      dateTime: appointment.startTime.toISOString(),
      timeZone: appointment.patientTimezone,
    },
    end: {
      dateTime: appointment.endTime.toISOString(),
      timeZone: appointment.patientTimezone,
    },
    attendees: [
      {
        email: appointment.patient.email,
        displayName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
      },
    ],
  };
}
