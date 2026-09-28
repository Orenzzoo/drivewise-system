import { supabase } from './supabaseClient.js'

// Supabase access tokens are JWTs that carry the auth session id in the
// `session_id` claim. Decoding is best-effort: when the claim is missing or
// the token can't be parsed, callers treat the session as "unknown" and
// skip enforcement rather than locking a legitimate browser out.
export function decodeSessionId(accessToken) {
  try {
    const payload = String(accessToken || '').split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const claims = JSON.parse(atob(padded))
    return claims.session_id || null
  } catch {
    return null
  }
}

// Record `sessionId` as the account's only active session. Called right
// after a successful sign-in; the upsert replaces any previously recorded
// session, which is what evicts the account's other browsers/devices.
export async function claimActiveSession(userId, sessionId) {
  if (!userId || !sessionId) return
  const { error } = await supabase
    .from('user_sessions')
    .upsert(
      {
        user_id: userId,
        session_id: sessionId,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    )
  if (error) {
    console.warn('Failed to record active session', error)
  }
}

// Remove the recorded session on explicit logout so the next sign-in
// starts from a clean slate.
export async function releaseActiveSession(userId) {
  if (!userId) return
  const { error } = await supabase
    .from('user_sessions')
    .delete()
    .eq('user_id', userId)
  if (error) {
    console.warn('Failed to release active session', error)
  }
}

// Returns the session id currently recorded for the account, or null when
// none is recorded (never claimed yet, or the read was blocked).
export async function getActiveSessionId(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('user_sessions')
    .select('session_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.warn('Failed to read active session', error)
    return null
  }
  return data?.session_id ?? null
}
