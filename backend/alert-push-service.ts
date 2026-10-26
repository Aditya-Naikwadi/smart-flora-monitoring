/**
 * ==============================================================================
 * Backend Push Notification Service (Node.js / Express / Serverless)
 * ==============================================================================
 * Implements:
 * 1. Expo Push API Batching & Chunking (max 100 messages per HTTP request)
 * 2. In-Memory / Redis Deduplication (prevents redundant alert delivery)
 * 3. Invalid Token Management (handles 'DeviceNotRegistered' to prune dead tokens)
 * 4. Storing & Pruning push tokens in PostgreSQL / Supabase
 */

export interface PushNotificationPayload {
  to: string; // ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
  title: string;
  body: string;
  channelId?: 'critical' | 'warning';
  data?: Record<string, unknown>;
  priority?: 'default' | 'normal' | 'high';
  sound?: 'default' | null;
}

export interface PushReceiptTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | string };
}

// In-Memory Deduplication Cache (key: `${plantId}:${sensor}:${level}`, value: timestamp)
const alertDeduplicationCache = new Map<string, number>();
const DEDUPLICATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Checks whether an alert for this plant, sensor, and level is duplicated within the cooldown window.
 */
export function isDuplicateAlert(plantId: string, sensor: string, level: string): boolean {
  const key = `${plantId}:${sensor}:${level}`;
  const now = Date.now();
  const lastSent = alertDeduplicationCache.get(key);

  if (lastSent && now - lastSent < DEDUPLICATION_WINDOW_MS) {
    return true; // Suppress duplicate
  }

  alertDeduplicationCache.set(key, now);

  // Clean stale keys periodically
  if (alertDeduplicationCache.size > 10000) {
    for (const [k, time] of alertDeduplicationCache.entries()) {
      if (now - time > DEDUPLICATION_WINDOW_MS) {
        alertDeduplicationCache.delete(k);
      }
    }
  }

  return false;
}

/**
 * Splits array of push messages into chunks of 100 (Expo Push API hard limit)
 */
function chunkArray<T>(items: T[], chunkSize: number = 100): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Validates whether a token string is a syntactically valid Expo push token
 */
export function isExpoPushToken(token: string): boolean {
  return (
    typeof token === 'string' &&
    ((token.startsWith('ExponentPushToken[') && token.endsWith(']')) ||
      (token.startsWith('ExpoPushToken[') && token.endsWith(']')))
  );
}

/**
 * Sends a batch of push notifications to Expo Push Service
 * with automatic chunking (100 messages per chunk) and receipt parsing.
 */
export async function sendExpoPushNotificationsBatch(
  messages: PushNotificationPayload[],
  onInvalidTokenDetected?: (deadToken: string) => Promise<void>
): Promise<{ successfulCount: number; failedCount: number }> {
  // Filter valid tokens
  const validMessages = messages.filter((m) => isExpoPushToken(m.to));
  if (validMessages.length === 0) {
    return { successfulCount: 0, failedCount: 0 };
  }

  const chunks = chunkArray(validMessages, 100);
  let successfulCount = 0;
  let failedCount = 0;

  for (const chunk of chunks) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error(`Expo Push API HTTP Error: ${response.status} ${response.statusText}`);
        failedCount += chunk.length;
        continue;
      }

      const result = await response.json();
      const tickets: PushReceiptTicket[] = result.data || [];

      tickets.forEach((ticket, index) => {
        if (ticket.status === 'ok') {
          successfulCount++;
        } else {
          failedCount++;
          console.warn(`[Push Error] Token: ${chunk[index].to} - ${ticket.message} (${ticket.details?.error})`);

          // If device uninstalled app or token was invalidated, call cleanup hook
          if (ticket.details?.error === 'DeviceNotRegistered') {
            if (onInvalidTokenDetected) {
              void onInvalidTokenDetected(chunk[index].to);
            }
          }
        }
      });
    } catch (err) {
      console.error('[Push Service Network Error]', err);
      failedCount += chunk.length;
    }
  }

  return { successfulCount, failedCount };
}

/**
 * Helper to register or update user push token in PostgreSQL (Supabase)
 *
 * SQL schema table reference:
 *   UPDATE public.profiles
 *   SET expo_push_token = $1, updated_at = NOW()
 *   WHERE id = $2;
 */
export async function saveUserPushToken(
  supabaseClient: any,
  userId: string,
  token: string
): Promise<void> {
  if (!isExpoPushToken(token)) {
    throw new Error(`Invalid Expo push token: ${token}`);
  }

  const { error } = await supabaseClient
    .from('profiles')
    .update({
      expo_push_token: token,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw new Error(`Failed to save push token: ${error.message}`);
  }
}
