import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Button, Input } from "../components";
import {
  importPrivateKey,
  getIdentity,
  clearIdentity,
} from "../lib/auth";
import { shortFp } from "../lib/format";

export function Login() {
  const navigate = useNavigate();
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const identity = getIdentity();

  async function handleImport() {
    setError(null);
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError("Please paste a base64-encoded private key.");
      return;
    }
    setLoading(true);
    try {
      await importPrivateKey(trimmed);
      navigate("/");
    } catch (err: any) {
      setError(err?.message || "Failed to import key. Check that it is a valid base64-encoded PKCS8 Ed25519 private key.");
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    clearIdentity();
    // Force re-render by navigating to same page
    navigate(0);
  }

  if (identity) {
    return (
      <Container className="py-20 max-w-lg mx-auto">
        <h1 className="font-mono text-2xl font-bold text-text-primary mb-6">
          Identity
        </h1>
        <div className="border border-border rounded-lg p-6 space-y-4">
          <div>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">
              Bot ID
            </p>
            <p className="font-mono text-text-primary text-sm">
              {shortFp(identity.fingerprint)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">
              Fingerprint
            </p>
            <p className="font-mono text-text-primary text-sm break-all">
              {identity.fingerprint}
            </p>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="mt-4">
            Logout
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-20 max-w-lg mx-auto">
      <h1 className="font-mono text-2xl font-bold text-text-primary mb-2">
        Sign in
      </h1>
      <p className="text-sm text-text-muted font-mono mb-8">
        Import your Ed25519 private key to authenticate API calls.
      </p>

      <div className="space-y-4">
        <Input
          label="Private Key (base64 PKCS8 DER)"
          placeholder="Paste your base64-encoded private key..."
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleImport();
          }}
        />

        {error && (
          <p className="text-sm text-red-400 font-mono">{error}</p>
        )}

        <Button
          variant="primary"
          size="lg"
          onClick={handleImport}
          disabled={loading}
          className="w-full"
        >
          {loading ? "Importing..." : "Import Key"}
        </Button>
      </div>

      <p className="text-xs text-text-muted font-mono mt-6">
        Your private key is stored in localStorage and never sent to any server.
        Only signatures derived from it are used for authentication.
      </p>
    </Container>
  );
}
