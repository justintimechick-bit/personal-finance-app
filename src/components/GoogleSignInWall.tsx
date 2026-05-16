import { useState } from 'react';
import { signIn } from '../sync/driveSync';
import type { DriveUser } from '../sync/driveSync';
import { useAppUI } from '../store/useAppStore';

interface GoogleSignInWallProps {
  onSuccess: (user: DriveUser) => void;
}

export function GoogleSignInWall({ onSuccess }: GoogleSignInWallProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setDriveStatus } = useAppUI();

  async function handleClick() {
    setSigningIn(true);
    setError(null);
    try {
      const user = await signIn();
      setDriveStatus('signed_in', user);
      onSuccess(user);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      if (!/cancelled/i.test(message)) {
        setError(message || 'Sign-in failed. Please try again.');
      }
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="h-full grid place-items-center bg-paper-50 text-ink-900">
      <div className="text-center max-w-sm w-full px-6">
        {/* App branding */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-accent text-ink-900 grid place-items-center font-black text-2xl select-none">
            F
          </div>
        </div>
        <h1 className="text-2xl font-black tracking-tight text-ink-900 mb-1">Finance</h1>
        <p className="text-[13px] text-ink-500 mb-8 leading-relaxed">
          Sign in with Google to access your personal finance data.
          Your finances sync to a single JSON file in your own Google Drive.
        </p>

        {/* Sign-in button */}
        <button
          type="button"
          className="btn-primary w-full py-2.5 text-[14px] gap-2.5"
          disabled={signingIn}
          onClick={handleClick}
          aria-busy={signingIn}
        >
          {signingIn ? (
            <>
              <Spinner />
              Signing in…
            </>
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
            </>
          )}
        </button>

        {/* Inline error display */}
        {error && (
          <p
            role="alert"
            className="mt-4 text-[12px] text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 text-left"
          >
            {error}
          </p>
        )}

        <p className="mt-6 text-[11px] text-ink-400 leading-relaxed">
          Only your own Google Drive is accessed. No data is shared with third parties.
        </p>
      </div>
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────
function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4 shrink-0"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Google "G" icon ──────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
