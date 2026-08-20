import { useAuthStore } from '../state/auth-store';
import { signIn } from '../../lib/auth';

// MVP-SPEC's original idle state showed the Generate button pre-auth — that
// no longer applies once /notes/generate requires a JWT (a real, correct
// behavior change forced by the AWS backend, not a bug). Signed-out users
// see this instead.
export function SignInGate() {
  const { status, errorMessage, setStatus, setError } = useAuthStore();

  async function handleSignIn() {
    setStatus('signing-in');
    try {
      await signIn();
      setStatus('signed-in');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="notesnap-signin-gate">
      <p className="notesnap-placeholder">Sign in to generate and sync your notes.</p>
      {errorMessage && <p className="notesnap-error">{errorMessage}</p>}
      <button className="notesnap-generate-btn" onClick={handleSignIn} disabled={status === 'signing-in'}>
        {status === 'signing-in' ? 'Signing in…' : 'Sign in with Google'}
      </button>
    </div>
  );
}
