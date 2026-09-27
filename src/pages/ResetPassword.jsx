import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import logoMark from '../layout/images/Logoo.png'

const MIN_PASSWORD_LENGTH = 8

function ResetPassword() {
  const navigate = useNavigate()
  const [state, setState] = useState({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const hasSession = useRef(false)

  useEffect(() => {
    let isCurrent = true

    const fail = (kind) => {
      if (isCurrent) setState({ kind })
    }

    // GoTrue reports a dead/expired link via the URL hash before any
    // exchange happens (error_code=otp_expired).
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const hashError = hashParams.get('error_code') || hashParams.get('error')
    if (hashError) {
      fail(hashError === 'otp_expired' ? 'expired' : 'invalid')
      return
    }

    const handleAuthEvent = (event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        hasSession.current = true
      }
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handleAuthEvent)

    // Poll getSession: the hash exchange is not instantaneous, and a link
    // that never produces a session within ~2s is treated as dead.
    let attempts = 0
    const poll = async () => {
      attempts += 1
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!isCurrent) return

      if (session) {
        hasSession.current = true
        setState({ kind: 'ready' })
        return
      }

      if (attempts >= 10) {
        fail('invalid')
        return
      }

      window.setTimeout(poll, 200)
    }

    poll()

    return () => {
      isCurrent = false
      subscription.unsubscribe()
    }
  }, [])

  // Clear the hash once the session exists so a refresh doesn't re-run the
  // exchange against an already-consumed one-time token.
  useEffect(() => {
    if (state.kind === 'ready' && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [state.kind])

  const trimmedPassword = password.trim()
  const trimmedConfirm = confirmPassword.trim()
  const passwordsMatch = trimmedPassword === trimmedConfirm
  const isValid =
    trimmedPassword.length >= MIN_PASSWORD_LENGTH && passwordsMatch

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!isValid) {
      setErrorMessage(
        !passwordsMatch
          ? 'Passwords do not match.'
          : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      )
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    const { error } = await supabase.auth.updateUser({
      password: trimmedPassword,
    })

    setIsSubmitting(false)

    if (error) {
      setErrorMessage(error.message || 'Unable to update your password.')
      return
    }

    // Sign out so the recovery session can't be reused; the user logs in
    // fresh with the new password.
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(trimmedPassword)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 2000)
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the
      // password stays selectable/visible either way.
    }
  }

  return (
    <main
      className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-50 px-5 py-10 text-slate-900"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <img
            src={logoMark}
            alt="Marvel Trucking Solutions Inc. logo"
            className="h-10 w-auto object-contain"
          />
        </div>

        {state.kind === 'checking' ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-12 shadow-sm">
            <Loader2 className="h-6 w-6 animate-spin text-ember-600" aria-hidden="true" />
            <p className="text-sm text-slate-500">Opening your reset link…</p>
          </div>
        ) : null}

        {state.kind === 'expired' || state.kind === 'invalid' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50">
              <AlertCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">
              {state.kind === 'expired' ? 'This link has expired' : 'This link is invalid'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {state.kind === 'expired'
                ? 'Password reset links are only valid for a short time. Request a new one from the login page.'
                : 'This reset link may have already been used. Request a new one from the login page.'}
            </p>
            <Link
              to="/"
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-ember-600 to-ember-700 px-4 py-3 text-sm font-semibold text-white transition hover:from-ember-500 hover:to-ember-600"
            >
              Back to Login
            </Link>
          </div>
        ) : null}

        {state.kind === 'ready' ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-slate-900">
              Set a new password
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Choose a new password for your account. Your current password
              stops working once this is saved.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-password"
                  className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                >
                  New password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    name="newPassword"
                    autoComplete="new-password"
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setErrorMessage('')
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-ember-500"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="confirm-password"
                  className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                >
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    placeholder="Re-enter the new password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value)
                      setErrorMessage('')
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-white"
                  />
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-ember-500"
                    title="Copy password"
                  >
                    {isCopied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <span className="block h-4 w-4 text-center text-[10px] font-bold leading-4">
                        ⧉
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {errorMessage ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  {errorMessage}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ember-600 to-ember-700 px-4 py-3 text-sm font-semibold text-white transition hover:from-ember-500 hover:to-ember-600 focus:outline-none focus:ring-2 focus:ring-ember-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving
                  </>
                ) : (
                  'Save New Password'
                )}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default ResetPassword
