import React, { useState, useEffect } from "react";

type SettingsTab = "profile" | "security";

interface UserProfile {
  name: string;
  email: string;
  avatar_url: string | null;
  timezone: string;
}

interface SecuritySettings {
  mfa_enabled: boolean;
  last_password_change: string;
  active_sessions: number;
}

/**
 * Settings page component.
 *
 * Tabbed layout with sidebar navigation.
 * Currently has two tabs: Profile and Security.
 *
 * NOTE: There is NO "Notifications" tab. Users have no way to manage
 * notification preferences from this page (or anywhere else in the app).
 * The sidebar only shows Profile and Security.
 */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/users/me/settings`);
      const json = await res.json();
      setProfile(json.data.profile);
      setSecurity(json.data.security);
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile(updates: Partial<UserProfile>) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/users/me/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (res.ok) {
        setProfile(json.data.profile);
        setMessage("Settings saved.");
      } else {
        setMessage(`Error: ${json.error}`);
      }
    } catch (err) {
      setMessage("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="settings-loading">Loading settings...</div>;
  }

  return (
    <div className="settings-page">
      {/* Sidebar navigation -- only Profile and Security tabs */}
      <nav className="settings-sidebar">
        <h2>Settings</h2>
        <ul>
          <li>
            <button
              className={activeTab === "profile" ? "active" : ""}
              onClick={() => setActiveTab("profile")}
            >
              Profile
            </button>
          </li>
          <li>
            <button
              className={activeTab === "security" ? "active" : ""}
              onClick={() => setActiveTab("security")}
            >
              Security
            </button>
          </li>
          {/*
            No Notifications tab exists here.
            Users have repeatedly requested the ability to control their
            notification preferences, but this feature has not been built.
            The only options are Profile and Security.
          */}
        </ul>
      </nav>

      {/* Content area */}
      <main className="settings-content">
        {message && <div className="settings-message">{message}</div>}

        {activeTab === "profile" && profile && (
          <ProfileTab
            profile={profile}
            saving={saving}
            onSave={saveProfile}
          />
        )}

        {activeTab === "security" && security && (
          <SecurityTab security={security} />
        )}
      </main>
    </div>
  );
}

function ProfileTab({
  profile,
  saving,
  onSave,
}: {
  profile: UserProfile;
  saving: boolean;
  onSave: (updates: Partial<UserProfile>) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [timezone, setTimezone] = useState(profile.timezone);

  return (
    <section className="settings-section">
      <h3>Profile</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, email, timezone });
        }}
      >
        <div className="form-field">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="timezone">Timezone</label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Chicago">Central Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Berlin">Berlin</option>
            <option value="Asia/Tokyo">Tokyo</option>
          </select>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </section>
  );
}

function SecurityTab({ security }: { security: SecuritySettings }) {
  return (
    <section className="settings-section">
      <h3>Security</h3>

      <div className="security-item">
        <div className="security-label">Two-Factor Authentication</div>
        <div className="security-value">
          {security.mfa_enabled ? "Enabled" : "Disabled"}
        </div>
        <button>{security.mfa_enabled ? "Disable 2FA" : "Enable 2FA"}</button>
      </div>

      <div className="security-item">
        <div className="security-label">Password</div>
        <div className="security-value">
          Last changed: {new Date(security.last_password_change).toLocaleDateString()}
        </div>
        <button>Change Password</button>
      </div>

      <div className="security-item">
        <div className="security-label">Active Sessions</div>
        <div className="security-value">
          {security.active_sessions} active session{security.active_sessions !== 1 ? "s" : ""}
        </div>
        <button>Manage Sessions</button>
      </div>
    </section>
  );
}
