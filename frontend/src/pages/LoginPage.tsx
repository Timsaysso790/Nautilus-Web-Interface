import React, { useState } from 'react';
import { API_CONFIG } from '../config';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, ArrowLeft } from "lucide-react";

interface LoginPageProps {
  onLogin: (token: string, role: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (requires2fa && totpCode.length !== 6) {
      setError('Please enter a complete 6-digit code.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_CONFIG.NAUTILUS_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          totp_code: totpCode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || 'Login failed. Check your credentials.');
        return;
      }

      if (data.requires_2fa) {
        setRequires2fa(true);
        setError('');
        return;
      }

      if (data.access_token) {
        onLogin(data.access_token, data.role ?? 'trader');
      } else {
        setError('Unexpected response from server.');
      }
    } catch {
      setError('Connection failed. Make sure the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <KeyRound className="h-10 w-10 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Nautilus Trader</h1>
          <p className="text-sm text-muted-foreground mt-1">Web Interface</p>
        </div>

        <div className="border border-border rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {!requires2fa ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Username</label>
                  <Input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Enter your username..."
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password..."
                    autoComplete="current-password"
                    required
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Two-Factor Authentication Code
                </label>
                <Input
                  type="text"
                  value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  className="text-center text-xl tracking-widest font-mono"
                />
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>
            )}

            {error && (
              <div className="bg-loss-bg border border-loss/30 text-loss rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Signing in...' : requires2fa ? 'Verify Code' : 'Sign In'}
            </Button>

            {requires2fa && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => { setRequires2fa(false); setTotpCode(''); setError(''); }}
              >
                <ArrowLeft className="h-3 w-3 mr-1" />
                Back to login
              </Button>
            )}
          </form>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Server: <span className="font-mono">{API_CONFIG.NAUTILUS_API_URL}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
