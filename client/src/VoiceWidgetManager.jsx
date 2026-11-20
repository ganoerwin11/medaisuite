import { useEffect, useState } from "react";
import { Bot, Check, Code2, Globe2, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useAuth } from "./auth/AuthContext.jsx";

export function VoiceWidgetManager({ onToast }) {
  const { apiFetch } = useAuth();
  const [assistants, setAssistants] = useState([]);
  const [widgets, setWidgets] = useState([]);
  const [assistantName, setAssistantName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selectedAssistantId, setSelectedAssistantId] = useState("");
  const [widgetName, setWidgetName] = useState("");
  const [domains, setDomains] = useState("");
  const [embed, setEmbed] = useState("");
  const [intakeEnabled, setIntakeEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const [assistantResponse, widgetResponse] = await Promise.all([
        apiFetch("/api/assistants"),
        apiFetch("/api/widgets"),
      ]);
      const failedResponse = [assistantResponse, widgetResponse].find(
        (response) => !response.ok,
      );
      if (failedResponse) {
        const body = await failedResponse.json().catch(() => ({}));
        if (failedResponse.status === 503) {
          throw new Error("PostgreSQL is not connected. Check the server database configuration.");
        }
        throw new Error(body.message || "Could not load assistants and widgets.");
      }

      setAssistants(await assistantResponse.json());
      setWidgets(await widgetResponse.json());
    } catch (error) {
      setLoadError(error.message || "Could not load assistants and widgets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createAssistant(event) {
    event.preventDefault();
    const response = await apiFetch("/api/assistants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: assistantName,
        description: "",
        configuration: { instructions, welcomeMessage: "How can I help you today?", intakeEnabled },
      }),
    });
    const body = await response.json();
    if (!response.ok) return onToast(body.message || "Could not create assistant.");
    setAssistantName("");
    setInstructions("");
    setSelectedAssistantId(String(body.id));
    onToast("Assistant created.");
    await load();
  }

  async function createWidget(event) {
    event.preventDefault();
    const response = await apiFetch("/api/widgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistantId: selectedAssistantId,
        name: widgetName,
        title: widgetName,
        welcomeMessage: "How can I help you today?",
        domains: domains.split(",").map((domain) => domain.trim()).filter(Boolean),
      }),
    });
    const body = await response.json();
    if (!response.ok) return onToast(body.message || "Could not create widget.");
    setWidgetName("");
    setDomains("");
    onToast("Widget created.");
    await load();
  }

  async function showEmbed(widget) {
    const response = await apiFetch(`/api/widgets/${widget.id}/embed`);
    const body = await response.json();
    if (response.ok) setEmbed(body.snippet);
  }

  async function toggleWidget(widget) {
    await apiFetch(`/api/widgets/${widget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !widget.active }),
    });
    await load();
  }

  if (loading) {
    return (
      <section className="assistant-page" aria-live="polite">
        <div className="assistant-loading">
          <span className="assistant-loading-indicator" />
          <span>Loading your assistants and widgets...</span>
        </div>
      </section>
    );
  }

  return (
    <section className="assistant-page">
      <header className="assistant-page-header">
        <div className="assistant-page-heading">
          <div className="assistant-page-mark"><Bot aria-hidden="true" /></div>
          <div>
            <div className="assistant-eyebrow"><Sparkles aria-hidden="true" /> AI WORKSPACE</div>
            <h1>AI Assistants &amp; Widgets</h1>
            <p>Create assistants and publish them as secure, embeddable website widgets.</p>
          </div>
        </div>
        <div className={`assistant-connection${loadError ? " has-error" : ""}`}>
          <span className="assistant-connection-dot" />
          {loadError ? "Data connection needs attention" : "PostgreSQL connected"}
        </div>
      </header>

      {loadError && (
        <div className="assistant-error" role="alert">
          <span>{loadError}</span>
          <button className="assistant-secondary-button" type="button" onClick={load}>
            <RefreshCw aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      <div className="assistant-summary-grid">
        <article className="assistant-summary-card">
          <span className="assistant-summary-icon"><Bot aria-hidden="true" /></span>
          <div><span className="assistant-summary-label">Assistants</span><strong>{assistants.length}</strong></div>
          <small>{assistants.filter((assistant) => assistant.active).length} active</small>
        </article>
        <article className="assistant-summary-card">
          <span className="assistant-summary-icon widget"><Code2 aria-hidden="true" /></span>
          <div><span className="assistant-summary-label">Website widgets</span><strong>{widgets.length}</strong></div>
          <small>{widgets.filter((widget) => widget.active).length} live</small>
        </article>
        <article className="assistant-summary-card assistant-summary-note">
          <span className="assistant-summary-icon domains"><Globe2 aria-hidden="true" /></span>
          <div><span className="assistant-summary-label">Ready to publish</span><strong>{widgets.filter((widget) => widget.active).length}</strong></div>
          <small>Active embeds</small>
        </article>
      </div>

      <div className="assistant-create-grid">
        <section className="assistant-panel">
          <div className="assistant-panel-heading">
            <span className="assistant-panel-icon"><Bot aria-hidden="true" /></span>
            <div><h2>Create an assistant</h2><p>Set a name and instructions for your AI.</p></div>
          </div>
          <form className="assistant-form" onSubmit={createAssistant}>
            <label className="assistant-field">
              <span>Assistant name</span>
              <input value={assistantName} onChange={(event) => setAssistantName(event.target.value)} placeholder="e.g. Clinic Concierge" required />
            </label>
            <label className="assistant-field">
              <span>Instructions <small>Optional</small></span>
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe how your assistant should respond..." rows={4} />
            </label>
            <label className="assistant-checkbox">
              <input type="checkbox" checked={intakeEnabled} onChange={(event) => setIntakeEnabled(event.target.checked)} />
              <span className="assistant-checkbox-mark"><Check aria-hidden="true" /></span>
              <span><strong>Enable patient intake</strong><small>Allow the assistant to collect intake details.</small></span>
            </label>
            <button className="assistant-primary-button" type="submit"><Plus aria-hidden="true" /> Create assistant</button>
          </form>
        </section>

        <section className="assistant-panel">
          <div className="assistant-panel-heading">
            <span className="assistant-panel-icon widget"><Code2 aria-hidden="true" /></span>
            <div><h2>Publish a widget</h2><p>Connect an assistant to your website.</p></div>
          </div>
          <form className="assistant-form" onSubmit={createWidget}>
            <label className="assistant-field">
              <span>Assistant</span>
              <select value={selectedAssistantId} onChange={(event) => setSelectedAssistantId(event.target.value)} required disabled={assistants.length === 0}>
                <option value="">Select an assistant</option>
                {assistants.map((assistant) => <option key={assistant.id} value={assistant.id}>{assistant.name}</option>)}
              </select>
            </label>
            <label className="assistant-field">
              <span>Widget name</span>
              <input value={widgetName} onChange={(event) => setWidgetName(event.target.value)} placeholder="e.g. Website support" required />
            </label>
            <label className="assistant-field">
              <span>Authorized domains <small>Optional</small></span>
              <input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="example.com, clinic.org" />
              <small>Only these domains will be allowed to embed the widget.</small>
            </label>
            <button className="assistant-primary-button" type="submit" disabled={assistants.length === 0}>
              <Plus aria-hidden="true" /> Create widget
            </button>
            {assistants.length === 0 && <p className="assistant-form-hint">Create an assistant first to publish a widget.</p>}
          </form>
        </section>
      </div>

      <section className="assistant-panel assistant-list-panel">
        <div className="assistant-list-heading">
          <div><h2>Your assistants</h2><p>Manage the assistants connected to your workspace.</p></div>
          <span className="assistant-count">{assistants.length} total</span>
        </div>
        {assistants.length === 0 ? (
          <div className="assistant-empty-state">
            <span className="assistant-empty-icon"><Bot aria-hidden="true" /></span>
            <strong>No assistants yet</strong>
            <p>Create your first assistant above to get started.</p>
          </div>
        ) : (
          <div className="assistant-table-wrap">
            <table className="assistant-table">
              <thead><tr><th>Assistant</th><th>Model</th><th>Status</th></tr></thead>
              <tbody>{assistants.map((assistant) => (
                <tr key={assistant.id} className={String(assistant.id) === selectedAssistantId ? "is-selected" : ""}>
                  <td>
                    <button className="assistant-name-button" type="button" aria-pressed={String(assistant.id) === selectedAssistantId} onClick={() => setSelectedAssistantId(String(assistant.id))}>
                      <span className="assistant-row-icon"><Bot aria-hidden="true" /></span>
                      <span>{assistant.name}</span>
                    </button>
                  </td>
                  <td><span className="assistant-model">{assistant.configuration?.model || "gpt-4o-mini"}</span></td>
                  <td><span className={`assistant-status${assistant.active ? " is-active" : ""}`}>{assistant.active ? "Active" : "Inactive"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="assistant-panel assistant-list-panel">
        <div className="assistant-list-heading">
          <div><h2>Your widgets</h2><p>Manage embeds and the domains allowed to use them.</p></div>
          <span className="assistant-count">{widgets.length} total</span>
        </div>
        {widgets.length === 0 ? (
          <div className="assistant-empty-state">
            <span className="assistant-empty-icon widget"><Code2 aria-hidden="true" /></span>
            <strong>No widgets yet</strong>
            <p>Create a widget after setting up an assistant.</p>
          </div>
        ) : (
          <div className="assistant-table-wrap">
            <table className="assistant-table">
              <thead><tr><th>Widget</th><th>Public ID</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{widgets.map((widget) => (
                <tr key={widget.id}>
                  <td><span className="assistant-widget-name"><Code2 aria-hidden="true" />{widget.name}</span></td>
                  <td><code className="assistant-public-id">{widget.publicId}</code></td>
                  <td><span className={`assistant-status${widget.active ? " is-active" : ""}`}>{widget.active ? "Active" : "Disabled"}</span></td>
                  <td>
                    <div className="assistant-row-actions">
                      <button className="assistant-table-action" type="button" onClick={() => showEmbed(widget)}><Code2 aria-hidden="true" /> Embed</button>
                      <button className="assistant-table-action secondary" type="button" onClick={() => toggleWidget(widget)}>{widget.active ? "Disable" : "Enable"}</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {embed && (
          <label className="assistant-embed">
            <span>Embed code <small>Copy this snippet into your website.</small></span>
            <textarea readOnly value={embed} rows={5} aria-label="Widget embed code" />
          </label>
        )}
      </section>
    </section>
  );
}
