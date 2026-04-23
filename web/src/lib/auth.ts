import { NextAuthOptions } from 'next-auth';
import StravaProvider from 'next-auth/providers/strava';
import { JWT } from 'next-auth/jwt';
import { GCSUserSettings, readUserSettings, writeUserSettings } from '@/lib/gcs-settings';

async function persistStravaTokens(
  ownerId: number,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
): Promise<void> {
  const existing = await readUserSettings();
  const settings: GCSUserSettings = existing ?? {
    user_id: String(ownerId),
    strava_owner_id: ownerId,
    ftp: 200,
    weight_kg: 70,
    max_hr: 190,
    goal: { type: '', name: '', date: '', priority: '' },
    training_preference: {
      mode: 'outdoor_preferred',
      location: { lat: 0, lon: 0 },
      weekly_schedule: {},
    },
    strava_auth: { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt },
    notification: { channels: [] },
    zwift_id: '',
    updated_at: new Date().toISOString(),
  };
  settings.strava_owner_id = ownerId;
  settings.strava_auth = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  };
  settings.updated_at = new Date().toISOString();
  await writeUserSettings(settings);
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID!,
        client_secret: process.env.STRAVA_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken as string,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    const newToken = {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: refreshedTokens.expires_at,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    };
    if (token.id) {
      persistStravaTokens(
        Number(token.id),
        newToken.accessToken as string,
        newToken.refreshToken as string,
        newToken.expiresAt as number,
      ).catch(console.error);
    }
    return newToken;
  } catch (error) {
    const isNetwork =
      error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError');
    if (!isNetwork) {
      console.error('Error refreshing access token', error);
    }
    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    StravaProvider({
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read,activity:read_all,profile:read_all',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign in
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.id = account.providerAccountId;
        persistStravaTokens(
          Number(account.providerAccountId),
          account.access_token as string,
          account.refresh_token as string,
          account.expires_at as number,
        ).catch(console.error);
        return token;
      }

      // Return previous token if the access token has not expired yet
      // Add 60 second buffer to refresh before actual expiration
      if (Date.now() < (token.expiresAt as number) * 1000 - 60000) {
        return token;
      }

      // Access token has expired, try to refresh it
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error as string | undefined;
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
