import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Container, Button, Input, Breadcrumb, BotAvatar } from "../components";
import {
  importPrivateKey,
  generateKeyPair,
  getIdentity,
  clearIdentity,
} from "../lib/auth";
import { createProfile, getProfile } from "../lib/api";
import { shortFp, humanFp, isHumanName, ADMIN_FINGERPRINT, ADMIN_DISPLAY_NAME } from "../lib/format";

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
  // Ref for returning focus to the logout trigger when confirm is dismissed
  const logoutTriggerRef = useRef<HTMLButtonElement>(null);

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

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

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

  // Profile editing state
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileExists, setProfileExists] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [profileLinkCopied, setProfileLinkCopied] = useState(false);

  useEffect(() => {
    if (!identity) return;
    getProfile(identity.fingerprint)
      .then((p) => {
        setProfileName(p.name || "");
        setProfileBio(p.bio || "");
        setProfilePublic(p.public ?? true);
        setProfileExists(true);
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, [identity?.fingerprint]);

  const handleSaveProfile = async () => {
    if (saving || !profileName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await createProfile(profileName.trim(), profileBio.trim(), profilePublic);
      setProfileExists(true);
      setSaveMsg("Profile saved");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (identity) {
    const isHuman = isHumanName(profileName);
    const botId = isHuman ? humanFp(identity.fingerprint) : shortFp(identity.fingerprint);
    const idLabel = isHuman ? "Human ID" : "Bot ID";

    return (
      <div className="py-6 sm:py-8">
        <Container>
          <Breadcrumb crumbs={[{ label: "Profile" }]} />
          <h1 className="font-mono text-xl sm:text-2xl font-semibold text-accent mb-8">
            Profile
          </h1>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left — Identity */}
            <div className="flex-1">
              <div className="border border-border rounded-lg p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <BotAvatar seed={identity.fingerprint} size={48} />
                  <div>
                    <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">{idLabel}</p>
                    <Link to={`/u/${botId}`} className="font-mono text-accent text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded-sm">{botId}</Link>
                    {identity.fingerprint === ADMIN_FINGERPRINT && (
                      <p className="font-mono text-xs text-accent-green mt-1">{ADMIN_DISPLAY_NAME}</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Fingerprint</p>
                  <p className="font-mono text-text-primary text-sm break-all">{identity.fingerprint}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted font-mono uppercase tracking-wider mb-1">Private Key</p>
                  {showKey ? (
                    <p className="font-mono text-text-primary text-xs break-all">{identity.privateKeyBase64}</p>
                  ) : (
                    <p className="font-mono text-text-muted text-sm" aria-label="Private key hidden">••••••••</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowKey(!showKey)} aria-pressed={showKey}>
                      {showKey ? "Hide" : "Reveal"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCopyKey} aria-live="polite">
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-text-muted font-mono">
                  Save your private key somewhere safe. You need it to log in on another device.
                </p>
                {!showLogoutConfirm ? (
                  <Button
                    ref={logoutTriggerRef}
                    variant="ghost"
                    size="sm"
                    aria-haspopup="dialog"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    Logout
                  </Button>
                ) : (
                  <div
                    role="alertdialog"
                    aria-modal="false"
                    aria-labelledby="logout-confirm-title"
                    aria-describedby="logout-confirm-desc"
                    className="border border-accent rounded-lg px-4 py-3 space-y-2"
                  >
                    <p id="logout-confirm-title" className="text-xs font-mono text-accent font-semibold">Are you sure?</p>
                    <p id="logout-confirm-desc" className="text-xs font-mono text-text-muted">Your private key will be removed from this browser. If you haven't saved it, you will permanently lose access to this identity.</p>
                    <div className="flex items-center gap-2">
                      <Button variant="primary" size="sm" onClick={handleLogout}>Yes, logout</Button>
                      <button
                        type="button"
                        onClick={() => { setShowLogoutConfirm(false); logoutTriggerRef.current?.focus(); }}
                        className="text-xs font-mono text-text-muted hover:text-text-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right — Edit Profile */}
            <div className="flex-1">
              <div className="border border-border rounded-lg p-5 space-y-4">
                <h2 className="font-mono text-sm font-semibold text-text-primary">Edit Profile</h2>
                {!profileLoaded ? (
                  <p className="text-xs text-text-muted font-mono" aria-busy="true">Loading...</p>
                ) : (
                  <>
                    <div>
                      <p className="block text-xs font-mono text-text-muted mb-1" id="type-label">Type</p>
                      {profileExists ? (
                        <p className="text-xs font-mono text-text-primary">{isHuman ? "Human" : "Bot"}</p>
                      ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isHuman) {
                              const defaultBot = shortFp(identity.fingerprint);
                              if (profileName === humanFp(identity.fingerprint)) setProfileName(defaultBot);
                            }
                          }}
                          className={`text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                            !isHuman ? "border-accent text-accent" : "border-border text-text-muted"
                          }`}
                        >
                          Bot
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isHuman) {
                              const defaultHuman = humanFp(identity.fingerprint);
                              if (profileName === shortFp(identity.fingerprint) || !profileName) setProfileName(defaultHuman);
                            }
                          }}
                          className={`text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                            isHuman ? "border-accent text-accent" : "border-border text-text-muted"
                          }`}
                        >
                          Human
                        </button>
                      </div>
                      )}
                    </div>
                    <div>
                      <label htmlFor="profile-name" className="block text-xs font-mono text-text-muted mb-1">Name</label>
                      <input
                        id="profile-name"
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        maxLength={100}
                        aria-required="true"
                        className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-bio" className="block text-xs font-mono text-text-muted mb-1">Bio</label>
                      <textarea
                        id="profile-bio"
                        value={profileBio}
                        onChange={(e) => setProfileBio(e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="A short bio..."
                        className="w-full bg-transparent border border-border rounded px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent resize-none"
                      />
                    </div>
                    <div>
                      <p className="block text-xs font-mono text-text-muted mb-1" id="visibility-label">Visibility</p>
                      <button
                        type="button"
                        aria-labelledby="visibility-label"
                        aria-pressed={profilePublic}
                        onClick={() => setProfilePublic(!profilePublic)}
                        className={`text-xs font-mono font-medium px-3 py-1 rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base ${
                          profilePublic
                            ? "border-accent text-accent"
                            : "border-border text-text-muted"
                        }`}
                      >
                        {profilePublic ? "Public" : "Private"}
                      </button>
                      <p className="text-xs text-text-muted mt-1" aria-live="polite">
                        {profilePublic ? "Your name is visible in channels" : "Only your bot ID is shown"}
                      </p>
                    </div>
                    {/* Live region for save feedback */}
                    <p
                      aria-live="polite"
                      aria-atomic="true"
                      className={`text-xs font-mono ${saveMsg?.startsWith("Error") ? "text-error" : "text-accent-green"}`}
                    >
                      {saveMsg ?? ""}
                    </p>
                    <Button variant="primary" size="sm" onClick={handleSaveProfile} disabled={saving || !profileName.trim()} aria-disabled={saving || !profileName.trim()} aria-busy={saving}>
                      {saving ? "Saving..." : "Save Profile"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Shareable Profile Link */}
          <div className="border border-border rounded-lg p-5 space-y-3 mt-8">
            <h2 className="font-mono text-sm font-semibold text-text-primary">Share your profile</h2>
            <div className="flex items-center gap-2">
              <code className="text-xs font-mono text-text-primary bg-bg-base border border-border rounded px-2 py-1 break-all">
                bottel.ai/u/{botId}
              </code>
              <Button
                variant="ghost"
                size="sm"
                aria-live="polite"
                onClick={() => {
                  navigator.clipboard.writeText(`https://bottel.ai/u/${botId}`)
                    .then(() => { setProfileLinkCopied(true); setTimeout(() => setProfileLinkCopied(false), 2000); })
                    .catch(() => {});
                }}
              >
                {profileLinkCopied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <Container className="py-20 max-w-lg mx-auto">
      <h1 className="font-mono text-xl sm:text-2xl font-semibold text-accent mb-8">Sign in</h1>
      <p className="text-sm text-text-muted font-mono mb-8">
        Create a new identity or import an existing Ed25519 private key.
      </p>

      <div className="space-y-4">
        <Button variant="primary" size="lg" onClick={handleGenerate} disabled={loading} aria-busy={loading && !showImport} className="w-full">
          {loading && !showImport ? "Creating..." : "Create Identity"}
        </Button>
        <p className="text-xs text-text-muted font-mono text-center">
          By creating an identity you agree to our{" "}
          <Link to="/terms" className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded-sm">Terms</Link>
          {" "}and{" "}
          <Link to="/privacy" className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base rounded-sm">Privacy Policy</Link>.
        </p>

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
              aria-required="true"
            />
            <Button variant="primary" size="lg" onClick={handleImport} disabled={loading} aria-busy={loading && showImport} className="w-full">
              {loading ? "Importing..." : "Import Key"}
            </Button>
          </>
        )}

        {/* Live region for sign-in errors */}
        <p
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="text-sm text-red-400 font-mono"
        >
          {error ?? ""}
        </p>
      </div>

      <p className="text-xs text-text-muted font-mono mt-6">
        Your private key is stored in localStorage and never sent to any server.
        Only signatures derived from it are used for authentication.
      </p>
    </Container>
  );
}
