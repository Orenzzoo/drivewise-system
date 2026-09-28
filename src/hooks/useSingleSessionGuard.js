import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { decodeSessionId, getActiveSessionId } from '../lib/singleSession.js'

const CHECK_INTERVAL_MS = 60 * 1000

// Single-sign-in enforcement: an account may only be signed in in one
// browser/device at a time. Every fresh sign-in records its auth session id
// in `user_sessions` (evicting whatever session was recorded before it);
// this hook, used by every portal layout, re-checks on mount, every
// minute, and whenever the tab becomes visible again. When the recorded
// session id no longer matches this browser's, the account has signed in
// somewhere else, so this browser is signed out and sent back to Login
// with an explanatory message.
export function useSingleSessionGuard() {
  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    async function check() {
      const {
        data: { session }
      } = await supabase.auth.getSession()

      if (!session || !isMounted) {
        return
      }

      const sessionId = decodeSessionId(session.access_token)
      if (!sessionId) {
        return
      }

      const activeSessionId = await getActiveSessionId(session.user.id)
      if (!isMounted || activeSessionId === null) {
        return
      }

      if (activeSessionId !== sessionId) {
        await supabase.auth.signOut()
        if (isMounted) {
          navigate('/', { replace: true, state: { sessionRevoked: true } })
        }
      }
    }

    check()

    const interval = window.setInterval(check, CHECK_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [navigate])
}
