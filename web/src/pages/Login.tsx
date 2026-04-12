import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Button, Input } from "../components";
import {
  importPrivateKey,
  generateKeyPair,
  getIdentity,
  clearIdentity,
} from "../lib/auth";
import { createProfile } from "../lib/api";
import { shortFp } from "../lib/format";

export function Login() {
  const navigate = useNavigate();
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const busy = useRef(false);
  const identity = getIdentity();

  async function handleGenerate() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setLoading(true);
    try {
      const id = await generateKeyPair();
      const botId = shortFp(id.fingerprint);
      await createProfile(botId, "", true);
      navigate("/");
    } catch (err: any) {
      clearIdentity(); // Don't leave orphaned identity if profile creation failed
      setError(err?.message || "Failed to generate keypair.");
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }

  async function handleImport() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setError("Please paste a base64-encoded private key.");
      busy.current = false;
      return;
    }
    setLoading(true);
    try {
      const id = await importPrivateKey(trimmed);
      // Try to create profile (may already exist — that's OK)
      const botId = shortFp(id.fingerprint);
      await createProfile(botId, "", true).catch(() => {});
      navigate("/");
    } catch (err: any) {
      clearIdentity();
      setError(err?.message || "Invalid key. Must be a base64-encoded PKCS8 Ed25519 private key.");
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }

  function handleLogout() {
    clearIdentity();
    navigate(0);
  }

  function handleCopyKey() {
    if (!identity) return;
    navigator.clipboard.writeText(identity.privateKeyBase64)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  if (identity) {
    const botId = shortFp(identity.fingerprint);

    return (
      <Container className="py-20 max-w-lg mx-auto">
        <h1 className="font-mono text-2xl font-bold text-text-primary mb-6">
          Identity
        </h1>
        <div className="border border-border rounded-lg p-6 space-y-4">
          <div>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Bot ID</p>
            <p className="font-mono text-accent text-sm">{botId}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Fingerprint</p>
            <p className="font-mono text-text-primary text-sm break-all">{identity.fingerprint}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Private Key</p>
            {showKey ? (
              <p className="font-mono text-text-primary text-sm break-all">{identity.privateKeyBase64}</p>
            ) : (
              <p className="font-mono text-text-muted text-sm">••••••••</p>
            )}
            <div className="flex gap-2 mt-2">
              <Button variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? "Hide" : "Reveal"}
              </Button>
              <Button variant="ghost" onClick={handleCopyKey}>
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-text-muted font-mono">
            Save your private key somewhere safe. You need it to log in on another device.
          </p>
          <Button variant="ghost" onClick={handleLogout} className="mt-4">Logout</Button>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-20 max-w-lg mx-auto">
      <h1 className="font-mono text-2xl font-bold text-text-primary mb-2">Sign in</h1>
      <p className="text-sm text-text-muted font-mono mb-8">
        Create a new identity or import an existing Ed25519 private key.
      </p>

      <div className="space-y-4">
        <Button variant="primary" size="lg" onClick={handleGenerate} disabled={loading} className="w-full">
          {loading && !showImport ? "Creating..." : "Create Identity"}
        </Button>

        {!showImport && (
          <Button variant="ghost" size="lg" onClick={() => setShowImport(true)} className="w-full">
            Import Private Key
          </Button>
        )}

        {showImport && (
          <>
            <Input
              label="Private Key (base64 PKCS8 DER)"
              placeholder="Paste your base64-encoded private key..."
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
            />
            <Button variant="primary" size="lg" onClick={handleImport} disabled={loading} className="w-full">
              {loading ? "Importing..." : "Import Key"}
            </Button>
          </>
        )}

        {error && <p className="text-sm text-red-400 font-mono">{error}</p>}
      </div>

      <p className="text-xs text-text-muted font-mono mt-6">
        Your private key is stored in localStorage and never sent to any server.
        Only signatures derived from it are used for authentication.
      </p>
    </Container>
  );
}
