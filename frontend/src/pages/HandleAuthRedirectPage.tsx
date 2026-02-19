import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/client';
import { getApiErrorMessage } from '../api/errors';

export default function HandleAuthRedirectPage() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const completeSignIn = async () => {
      const auth = getAuth();
      const url = window.location.href;

      if (isSignInWithEmailLink(auth, url)) {
        let email = window.localStorage.getItem('authEmail');
        const sessionId = window.localStorage.getItem('authSessionId');

        if (!email || !sessionId) {
          setError('Login session not found or expired. Please try logging in again.');
          setLoading(false);
          return;
        }

        try {
          // 1. Sign in with Firebase
          await signInWithEmailLink(auth, email, url);

          // 2. Verify with our backend
          await authApi.sessionVerifyLink(sessionId);

          // 3. Complete login to get our app's JWT
          const tokenData = await authApi.sessionComplete(sessionId);

          // 4. Clean up and log in
          window.localStorage.removeItem('authEmail');
          window.localStorage.removeItem('authSessionId');
          await loginWithToken(tokenData.access_token);
          navigate('/sessions', { replace: true });

        } catch (err: any) {
          setError(getApiErrorMessage(err, 'Failed to complete sign-in.'));
          setLoading(false);
        }
      } else {
        setError('Invalid sign-in link.');
        setLoading(false);
      }
    };

    completeSignIn();
  }, [loginWithToken, navigate]);

  return (
    <div className="card" style={{ maxWidth: '400px', margin: '2rem auto', textAlign: 'center' }}>
      {loading && <h1>Verifying...</h1>}
      {error && (
        <div>
          <h1 style={{ color: 'var(--error)' }}>Authentication Failed</h1>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
