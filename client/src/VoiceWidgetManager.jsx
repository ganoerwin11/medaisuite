import { useEffect, useState } from "react";
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

  async function load() {
    setLoading(true);
    const [assistantResponse, widgetResponse] = await Promise.all([
      apiFetch("/api/assistants"),
      apiFetch("/api/widgets"),
    ]);
    if (assistantResponse.status === 503) {
      setLoading(false);
      return;
    }
    if (assistantResponse.ok) setAssistants(await assistantResponse.json());
    if (widgetResponse.ok) setWidgets(await widgetResponse.json());
    setLoading(false);
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

  if (loading) return <section className="content-card"><div className="card-title">Loading AI assistants...</div></section>;
  if (!loading && assistants.length === 0 && widgets.length === 0) {
    return (
      <section className="content-card">
        <div className="card-title">AI Voice & Widget</div>
        <p>Connect PostgreSQL to create persistent assistants and embeddable widgets.</p>
      </section>
    );
  }

  return (
    <section className="content-card">
      <div className="card-title">AI Assistants & Widgets</div>
      <form className="question-form" onSubmit={createAssistant}>
        <input value={assistantName} onChange={(event) => setAssistantName(event.target.value)} placeholder="Assistant name" required />
        <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="System instructions" rows={4} />
        <label>
          <input type="checkbox" checked={intakeEnabled} onChange={(event) => setIntakeEnabled(event.target.checked)} />
          {" "}Enable patient intake collection
        </label>
        <button className="primary-button" type="submit">Create assistant</button>
      </form>

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="data-table">
          <thead><tr><th>Assistant</th><th>Model</th><th>Status</th></tr></thead>
          <tbody>{assistants.map((assistant) => (
            <tr key={assistant.id} onClick={() => setSelectedAssistantId(String(assistant.id))}>
              <td>{assistant.name}</td>
              <td>{assistant.configuration?.model || "gpt-4o-mini"}</td>
              <td>{assistant.active ? "Active" : "Inactive"}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <form className="question-form" onSubmit={createWidget} style={{ marginTop: 20 }}>
        <select value={selectedAssistantId} onChange={(event) => setSelectedAssistantId(event.target.value)} required>
          <option value="">Select assistant</option>
          {assistants.map((assistant) => <option key={assistant.id} value={assistant.id}>{assistant.name}</option>)}
        </select>
        <input value={widgetName} onChange={(event) => setWidgetName(event.target.value)} placeholder="Widget name" required />
        <input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="Authorized domains, comma-separated" />
        <button className="primary-button" type="submit">Create widget</button>
      </form>

      <div className="table-wrap" style={{ marginTop: 20 }}>
        <table className="data-table">
          <thead><tr><th>Widget</th><th>Public ID</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{widgets.map((widget) => (
            <tr key={widget.id}>
              <td>{widget.name}</td>
              <td>{widget.publicId}</td>
              <td>{widget.active ? "Active" : "Disabled"}</td>
              <td>
                <button type="button" onClick={() => showEmbed(widget)}>Embed</button>
                <button type="button" onClick={() => toggleWidget(widget)}>{widget.active ? "Disable" : "Enable"}</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {embed && <textarea readOnly value={embed} rows={6} style={{ width: "100%", marginTop: 16 }} />}
    </section>
  );
}
