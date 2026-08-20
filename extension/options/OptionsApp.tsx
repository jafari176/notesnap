import { useEffect, useState } from 'react';
import { isSignedIn, signOut } from '../src/lib/auth';
import { deleteAccount } from '../src/lib/api-client';

type DeleteStep = 'idle' | 'confirming' | 'deleting' | 'done' | 'error';

export function OptionsApp() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [deleteStep, setDeleteStep] = useState<DeleteStep>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    isSignedIn().then(setSignedIn);
  }, []);

  async function handleSignOut() {
    await signOut();
    setSignedIn(false);
  }

  async function handleDeleteAccount() {
    setDeleteStep('deleting');
    setDeleteError(null);
    try {
      await deleteAccount();
      await signOut();
      setDeleteStep('done');
    } catch (err) {
      setDeleteStep('error');
      setDeleteError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="options-container">
      <h1>NoteSnap Settings</h1>

      <section className="options-section">
        <h2>Account</h2>
        {signedIn === null && <p>Loading…</p>}
        {signedIn === false && <p>You're signed out.</p>}
        {signedIn === true && (
          <button className="options-btn" onClick={handleSignOut}>
            Sign out
          </button>
        )}
      </section>

      {signedIn === true && deleteStep !== 'done' && (
        <section className="options-section options-section--danger">
          <h2>Delete Account</h2>
          <p>
            This permanently deletes all your notes and your account. This cannot be undone.
          </p>

          {deleteStep === 'idle' && (
            <button className="options-btn options-btn--danger" onClick={() => setDeleteStep('confirming')}>
              Delete my account
            </button>
          )}

          {deleteStep === 'confirming' && (
            <div className="options-confirm-box">
              <p>
                Type <strong>DELETE</strong> to confirm. This will erase every note you've generated or edited,
                permanently.
              </p>
              <input
                className="options-confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
              />
              <div className="options-confirm-actions">
                <button className="options-btn" onClick={() => setDeleteStep('idle')}>
                  Cancel
                </button>
                <button
                  className="options-btn options-btn--danger"
                  disabled={confirmText !== 'DELETE'}
                  onClick={handleDeleteAccount}
                >
                  Permanently delete
                </button>
              </div>
            </div>
          )}

          {deleteStep === 'deleting' && <p>Deleting your account…</p>}

          {deleteStep === 'error' && (
            <div>
              <p className="options-error">Deletion failed: {deleteError}</p>
              <button className="options-btn" onClick={() => setDeleteStep('confirming')}>
                Try again
              </button>
            </div>
          )}
        </section>
      )}

      {deleteStep === 'done' && (
        <section className="options-section">
          <p>Your account and all notes have been deleted.</p>
        </section>
      )}
    </div>
  );
}
