import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext.jsx";

const ROLES = ["admin", "staff"];

export function UserManagement({ onToast }) {
  const { apiFetch, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "staff" });
  const [creating, setCreating] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/auth/users");
      const body = await response.json().catch(() => ([]));
      if (!response.ok) {
        throw new Error(body.message || "Could not load staff accounts.");
      }
      setUsers(body);
    } catch (loadError) {
      setError(loadError.message || "Could not load staff accounts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await apiFetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Could not create the user.");
      }
      setForm({ fullName: "", email: "", password: "", role: "staff" });
      onToast?.(`${body.fullName} was added to the workspace.`);
      await loadUsers();
    } catch (createError) {
      onToast?.(createError.message || "Could not create the user.");
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(id, patch) {
    try {
      const response = await apiFetch(`/api/auth/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "Could not update the user.");
      }
      await loadUsers();
    } catch (updateError) {
      onToast?.(updateError.message || "Could not update the user.");
    }
  }

  return (
    <div className="content">
      <section className="module-panel glass">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Staff accounts</h2>
            <p className="panel-subtitle">
              Manage who can sign in to the clinic dashboard and what they can access
            </p>
          </div>
        </div>

        {loading ? (
          <p className="panel-subtitle">Loading staff accounts…</p>
        ) : error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {users.map((row) => (
                <tr key={row.id}>
                  <td>{row.fullName}</td>
                  <td>{row.email}</td>
                  <td>
                    <select
                      aria-label={`Role for ${row.fullName}`}
                      value={row.role}
                      onChange={(event) => updateUser(row.id, { role: event.target.value })}
                      disabled={row.id === currentUser?.id}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{row.active ? "Active" : "Disabled"}</td>
                  <td>{row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : "Never"}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => updateUser(row.id, { active: !row.active })}
                      disabled={row.id === currentUser?.id}
                    >
                      {row.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="module-panel glass">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Add a staff account</h2>
            <p className="panel-subtitle">New accounts can sign in immediately</p>
          </div>
        </div>
        <form className="questionnaire-grid" onSubmit={handleCreate}>
          <label>
            <span>Full name</span>
            <input
              type="text"
              value={form.fullName}
              onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label>
            <span>Temporary password</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              minLength={8}
              required
            />
          </label>
          <label>
            <span>Role</span>
            <select
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <div className="questionnaire-actions">
            <button type="submit" className="primary-button" disabled={creating}>
              {creating ? "Adding…" : "Add staff account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default UserManagement;
