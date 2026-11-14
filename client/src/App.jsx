import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Package,
  Phone,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Stethoscope,
  Sun,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { TelephonyProviderAdapter } from "./telephony/TelephonyProviderAdapter.js";
import { useAuth } from "./auth/AuthContext.jsx";
import { Login } from "./auth/Login.jsx";
import { UserManagement } from "./auth/UserManagement.jsx";

const navigation = [
  {
    label: "AI Receptionist",
    icon: Headphones,
    view: "receptionist",
    badge: "AI",
  },
  {
    label: "Question Setup",
    icon: MessageSquareText,
    view: "setup",
  },
];

const fallbackCalls = [
  {
    id: "call-1001",
    caller: "Caller ··· 0001",
    clinic: "Sample Clinic",
    reason: "Appointment update",
    outcome: "Completed",
    kind: "handled",
    duration: "03:42",
    title: "Conversation transcript · Call 1001",
    lines: [
      [
        "AI receptionist",
        "Thanks for calling Sample Clinic. How can I help today?",
      ],
      ["Caller", "I need to update my upcoming appointment."],
      [
        "AI receptionist",
        "I can help with that. A team member will confirm an available time with you.",
      ],
    ],
    summary:
      "Caller requested an appointment update. The request was captured for staff follow-up. No recording is stored. Identity and appointment details require verification in the connected clinic system.",
  },
  {
    id: "call-1002",
    caller: "Caller ··· 0002",
    clinic: "Satellite Clinic",
    reason: "General wellness question",
    outcome: "Escalated",
    kind: "escalated",
    duration: "01:18",
    title: "Conversation transcript · Call 1002",
    lines: [
      [
        "AI receptionist",
        "Thank you for calling Satellite Clinic. How can I help?",
      ],
      ["Caller", "I have a question about an upcoming visit."],
      [
        "AI receptionist",
        "I can connect you with clinic staff to help with that. If you are having a medical emergency, please contact local emergency services immediately.",
      ],
    ],
    summary:
      "Caller asked a general question and was routed to staff for follow-up. This summary is not a diagnosis or medical advice.",
  },
  {
    id: "call-1003",
    caller: "Caller ··· 0003",
    clinic: "Sample Clinic",
    reason: "Availability check",
    outcome: "Transferred",
    kind: "handled",
    duration: "04:06",
    title: "Conversation transcript · Call 1003",
    lines: [
      ["AI receptionist", "How can I help you today?"],
      ["Caller", "Can I check whether Dr. Example has appointments this week?"],
      [
        "AI receptionist",
        "I'll connect you with the scheduling team to check the latest availability.",
      ],
    ],
    summary:
      "Caller asked about provider availability. The request was transferred to staff; appointment calendars are not connected in this demo.",
  },
  {
    id: "call-1004",
    caller: "Caller ··· 0004",
    clinic: "Satellite Clinic",
    reason: "General inquiry",
    outcome: "Missed",
    kind: "missed",
    duration: "—",
    title: "Call summary · Call 1004",
    lines: [["System", "Missed incoming call. No transcript is available."]],
    summary:
      "No conversation was captured. Return calls should follow the clinic's identity verification and callback procedures.",
  },
];

const fallbackOrders = [
  {
    id: "#ORD-1001",
    initials: "SA",
    name: "Sample Customer A",
    date: "May 30, 2025",
    amount: "$248.00",
    status: "Paid",
  },
  {
    id: "#ORD-1002",
    initials: "SB",
    name: "Sample Customer B",
    date: "May 30, 2025",
    amount: "$129.50",
    status: "Pending",
  },
  {
    id: "#ORD-1003",
    initials: "SC",
    name: "Sample Customer C",
    date: "May 29, 2025",
    amount: "$485.00",
    status: "Paid",
  },
  {
    id: "#ORD-1004",
    initials: "SD",
    name: "Sample Customer D",
    date: "May 29, 2025",
    amount: "$76.25",
    status: "Refunded",
  },
];

const capabilities = [
  {
    icon: Phone,
    title: "AI-powered call answering",
    detail: "Natural conversations, FAQs, and clinic information",
  },
  {
    icon: CalendarDays,
    title: "Appointment management",
    detail: "Schedule, cancel, or reschedule visits",
  },
  {
    icon: Stethoscope,
    title: "Patient & provider lookup",
    detail: "Collect caller details and check doctor availability",
  },
  {
    icon: ArrowRight,
    title: "Human handoff & escalation",
    detail: "Transfer complex requests and urgent concerns to staff",
  },
  {
    icon: MessageSquareText,
    title: "Transcripts & call summaries",
    detail: "Review conversation notes and outcomes",
  },
  {
    icon: ShieldCheck,
    title: "Consent-aware call records",
    detail: "Recording controls and retention policy configuration",
  },
];

const chartPaths = {
  Week: "M45 124 C82 115 99 129 130 106 S177 117 210 88 S258 105 294 76 S341 93 378 67 S423 82 460 53 S506 76 543 42 S603 54 647 27",
  Month:
    "M45 138 C75 129 83 117 108 121 S144 105 165 111 S200 91 225 101 S261 79 283 91 S319 69 341 78 S377 84 400 69 S437 53 458 64 S494 49 516 54 S552 34 574 46 S615 23 647 30",
  Year: "M45 145 C77 138 88 126 116 132 S157 111 188 119 S226 95 256 106 S297 89 326 94 S365 69 396 81 S436 55 467 65 S508 45 536 56 S578 32 603 40 S629 25 647 20",
};

const defaultReceptionistQuestions = [
  {
    id: 1,
    prompt: "What is your full name?",
    type: "text",
    required: true,
  },
  {
    id: 2,
    prompt: "What is the best phone number to reach you?",
    type: "tel",
    required: true,
  },
  {
    id: 3,
    prompt: "What would you like help with today?",
    type: "text",
    required: true,
  },
];

const defaultReceptionistSettings = {
  enabled: false,
  recordingEnabled: false,
  hoursStart: "08:00",
  hoursEnd: "17:00",
  open24Hours: false,
  telephonyProvider: "",
  speechProvider: "Not connected",
  mainLine: "",
  clinics: ["Sample Clinic", "Satellite Clinic"],
};

function LoadingScreen() {
  return (
    <div className="login-screen">
      <div className="login-card glass">
        <span className="brand-mark" aria-hidden="true">
          <Activity />
        </span>
        <p className="login-subtitle">Loading your workspace…</p>
      </div>
    </div>
  );
}

function App() {
  const { status } = useAuth();
  if (status === "loading") return <LoadingScreen />;
  if (status !== "signedIn") return <Login />;
  return <Dashboard />;
}

function Dashboard() {
  const { user, logout, apiFetch } = useAuth();
  const [view, setView] = useState("receptionist");
  const [activeNav, setActiveNav] = useState("AI Receptionist");
  const [darkMode, setDarkMode] = useState(false);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Month");
  const [callFilter, setCallFilter] = useState("all");
  const [selectedCallId, setSelectedCallId] = useState("call-1042");
  const [settings, setSettings] = useState(defaultReceptionistSettings);
  const provider = settings.telephonyProvider;
  const [twilioStatus, setTwilioStatus] = useState({ configured: false });
  const [questionnaire, setQuestionnaire] = useState({
    patientName: "",
    phoneNumber: "",
    reason: "Appointment request",
    preferredTime: "",
    notes: "",
    consent: false,
  });
  const [customQuestions, setCustomQuestions] = useState(() => {
    try {
      const savedQuestions = localStorage.getItem("receptionistQuestions");
      if (!savedQuestions) {
        return defaultReceptionistQuestions;
      }

      const parsed = JSON.parse(savedQuestions);
      return Array.isArray(parsed) && parsed.length
        ? parsed
        : defaultReceptionistQuestions;
    } catch (error) {
      return defaultReceptionistQuestions;
    }
  });
  const [savedQuestionnaire, setSavedQuestionnaire] = useState(null);
  const lastIntakeIdRef = useRef(null);
  const [orders, setOrders] = useState(fallbackOrders);
  const [calls, setCalls] = useState(fallbackCalls);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [ordersResponse, callsResponse, twilioStatusResponse] =
          await Promise.all([
            apiFetch("/api/orders"),
            apiFetch("/api/calls"),
            apiFetch("/api/voice/twilio/status"),
          ]);

        if (ordersResponse.ok) {
          const nextOrders = await ordersResponse.json();
          if (nextOrders?.length) setOrders(nextOrders);
        }

        if (callsResponse.ok) {
          const nextCalls = await callsResponse.json();
          if (nextCalls?.length) {
            setCalls(nextCalls);
            setSelectedCallId((currentId) =>
              currentId && nextCalls.some((call) => call.id === currentId)
                ? currentId
                : nextCalls[0].id,
            );
          }
        }

        if (twilioStatusResponse.ok) {
          const nextTwilioStatus = await twilioStatusResponse.json();
          setTwilioStatus(nextTwilioStatus);
          if (nextTwilioStatus.configured) {
            setToast(
              "Twilio is connected and ready for inbound voice routing.",
            );
          }
        }
      } catch (error) {
        console.warn("Falling back to demo dashboard data:", error);
      }
    }

    loadDashboardData();
  }, []);

  useEffect(() => {
    if (!calls.some((call) => call.id === selectedCallId)) {
      setSelectedCallId(calls[0]?.id ?? "");
    }
  }, [calls, selectedCallId]);

  const selectedCall =
    calls.find((call) => call.id === selectedCallId) ?? calls[0];
  const telephonyAdapter = useMemo(
    () => new TelephonyProviderAdapter(provider || "unconfigured", apiFetch),
    [provider, apiFetch],
  );
  const navItems = useMemo(
    () =>
      user?.role === "admin"
        ? [...navigation, { label: "User Management", icon: UsersRound, view: "users" }]
        : navigation,
    [user],
  );
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) =>
        `${order.id} ${order.name} ${order.status}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [search],
  );
  const filteredCalls = useMemo(
    () =>
      calls.filter((call) => {
        const matchesFilter = callFilter === "all" || call.kind === callFilter;
        const matchesSearch =
          `${call.caller} ${call.clinic} ${call.reason} ${call.outcome}`
            .toLowerCase()
            .includes(search.toLowerCase());
        return matchesFilter && matchesSearch;
      }),
    [callFilter, search],
  );

  useEffect(() => {
    document.body.classList.toggle("dark-mode", darkMode);
    return () => document.body.classList.remove("dark-mode");
  }, [darkMode]);

  useEffect(() => {
    document.title = `${view === "receptionist" ? "AI Receptionist" : activeNav} · MedAI Suite`;
  }, [view, activeNav]);

  useEffect(() => {
    localStorage.setItem(
      "receptionistQuestions",
      JSON.stringify(customQuestions),
    );
  }, [customQuestions]);

  useEffect(() => {
    async function loadSavedQuestions() {
      try {
        const response = await apiFetch("/api/receptionist/questions");
        if (!response.ok) {
          return;
        }

        const savedQuestions = await response.json();
        if (Array.isArray(savedQuestions) && savedQuestions.length) {
          setCustomQuestions(savedQuestions);
        }
      } catch (error) {
        console.warn("Could not load saved receptionist questions.", error);
      }
    }

    loadSavedQuestions();
  }, []);

  useEffect(() => {
    async function loadReceptionistSettings() {
      try {
        const response = await apiFetch("/api/receptionist/settings");
        if (response.ok) {
          setSettings(await response.json());
        }
      } catch (error) {
        console.warn("Could not load receptionist settings.", error);
      }
    }

    loadReceptionistSettings();
  }, []);

  useEffect(() => {
    let active = true;

    async function pollLatestIntake() {
      try {
        const response = await apiFetch("/api/receptionist/intake/latest");
        if (!response.ok || !active) return;

        const latest = await response.json();
        if (!latest || latest.id === lastIntakeIdRef.current) return;

        lastIntakeIdRef.current = latest.id;
        setSavedQuestionnaire(latest);

        if (latest.source === "ai_call") {
          setQuestionnaire({
            patientName: latest.patientName || "",
            phoneNumber: latest.phoneNumber || "",
            reason: latest.reason || "",
            preferredTime: latest.preferredTime || "",
            notes: latest.notes || "",
            consent: true,
          });
          setToast("The AI captured an intake from a call and filled in the form.");
        }
      } catch (error) {
        console.warn("Could not load the latest intake.", error);
      }
    }

    pollLatestIntake();
    const timer = setInterval(pollLatestIntake, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function navigate(item) {
    setActiveNav(item.label);
    setView(item.view);
    setMobileMenuOpen(false);
    if (item.anchor) {
      window.setTimeout(
        () =>
          document
            .getElementById(item.anchor)
            ?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleProviderChange(nextProvider) {
    if (!(await saveSettings({ telephonyProvider: nextProvider }))) {
      return;
    }

    if (!nextProvider) {
      setToast("Telephony provider selection cleared.");
      return;
    }

    if (nextProvider === "twilio") {
      try {
        const response = await apiFetch("/api/voice/twilio/status");
        const status = response.ok ? await response.json() : null;
        if (status?.configured) {
          setToast("Twilio is connected and ready for inbound voice routing.");
          return;
        }

        setToast(
          status?.error
            ? `Twilio is not connected. ${status.error}`
            : "Twilio is selected, but the backend could not confirm the provider status. Check that the server is running.",
        );
        return;
      } catch (error) {
        setToast(
          "Twilio selected, but the backend could not be reached. Check that the server is running.",
        );
        return;
      }
    }

    setToast(
      `${nextProvider === "twilio" ? "Twilio" : "Other provider"} selected. Connect your secure voice backend to enable calling.`,
    );
  }

  function handleQuestionnaireChange(field, value) {
    setQuestionnaire((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleQuestionnaireSubmit(event) {
    event.preventDefault();

    if (!questionnaire.consent) {
      setToast("Confirm consent before saving the intake questionnaire.");
      return;
    }

    try {
      const response = await apiFetch("/api/receptionist/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(questionnaire),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Could not save the intake.");
      }

      setSavedQuestionnaire(result);
      setToast("Intake saved to the clinic database.");
    } catch (error) {
      setToast(error.message || "Could not save the intake.");
    }
  }

  async function saveSettings(patch) {
    try {
      const response = await apiFetch("/api/receptionist/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result.message || "Could not save receptionist settings.",
        );
      }

      setSettings(result);
      return true;
    } catch (error) {
      setToast(error.message || "Could not save receptionist settings.");
      return false;
    }
  }

  async function handleRecordingChange(event) {
    const checked = event.target.checked;
    if ((await saveSettings({ recordingEnabled: checked })) && checked) {
      setToast(
        "Callers will hear a recording notice. Confirm consent and retention policy before relying on recordings.",
      );
    }
  }

  function updateSettingDraft(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  function updateClinic(index, value) {
    setSettings((current) => ({
      ...current,
      clinics: current.clinics.map((name, i) => (i === index ? value : name)),
    }));
  }

  function addClinic() {
    setSettings((current) => ({
      ...current,
      clinics: [...current.clinics, ""],
    }));
  }

  function removeClinic(index) {
    setSettings((current) => ({
      ...current,
      clinics: current.clinics.filter((_, i) => i !== index),
    }));
  }

  async function saveClinics() {
    if (await saveSettings({ clinics: settings.clinics })) {
      setToast(
        "Clinic list saved. Callers will be asked which clinic they want.",
      );
    }
  }

  function buildQuestionPromptList(questions = customQuestions) {
    if (!Array.isArray(questions) || questions.length === 0) {
      return "";
    }

    return questions
      .filter((question) => question && question.prompt?.trim())
      .map(
        (question, index) =>
          `${index + 1}. ${question.prompt}${question.required ? " (required)" : ""}`,
      )
      .join(" ");
  }

  async function saveQuestionSetup(nextQuestions = customQuestions) {
    const questionsToSave = nextQuestions.filter(
      (question) => question?.prompt?.trim(),
    );
    if (questionsToSave.length === 0) {
      setToast("Add at least one question with text before saving.");
      return;
    }

    try {
      const response = await apiFetch("/api/receptionist/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: questionsToSave }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.message || "Unable to save the receptionist setup.",
        );
      }

      const savedQuestions = await response.json();
      setCustomQuestions(savedQuestions);
      setToast("Question setup saved for the AI receptionist.");
    } catch (error) {
      setToast(error.message || "Could not save the receptionist setup.");
    }
  }

  function addCustomQuestion() {
    setCustomQuestions((current) => [
      ...current,
      {
        id: Date.now(),
        prompt: "New question",
        type: "text",
        required: true,
      },
    ]);
  }

  function updateCustomQuestion(id, field, value) {
    setCustomQuestions((current) =>
      current.map((question) =>
        question.id === id ? { ...question, [field]: value } : question,
      ),
    );
  }

  function removeCustomQuestion(id) {
    setCustomQuestions((current) =>
      current.filter((question) => question.id !== id),
    );
  }

  async function handleTestReceptionist() {
    if (!provider) {
      setToast("Select a telephony provider before testing the receptionist.");
      return;
    }

    if (provider !== "twilio") {
      setToast(
        "Demo only: live voice tests require a connected backend, phone number, and speech services.",
      );
      return;
    }

    const intakeContext = savedQuestionnaire
      ? `Caller details: Name ${savedQuestionnaire.patientName || "not provided"}; Phone ${savedQuestionnaire.phoneNumber || "not provided"}; Reason: ${savedQuestionnaire.reason}; Preferred time: ${savedQuestionnaire.preferredTime || "not specified"}; Notes: ${savedQuestionnaire.notes || "none"}.`
      : "No saved intake form was provided.";

    const questionPrompt = buildQuestionPromptList();
    const clinicNames = settings.clinics.join(" or ");
    const fullMessage = questionPrompt
      ? `Hello. This is the AI receptionist for ${clinicNames}. ${intakeContext} I will ask the caller the following questions: ${questionPrompt}. We are testing the live Twilio voice connection.`
      : `Hello. This is the AI receptionist for ${clinicNames}. ${intakeContext} We are testing the live Twilio voice connection.`;

    try {
      const response = await apiFetch("/api/voice/twilio/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          questions: customQuestions,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Unable to place the test call.");
      }

      setToast(`Twilio test call created successfully. SID: ${result.sid}`);
    } catch (error) {
      setToast(error.message || "The Twilio test call could not be placed.");
    }
  }

  function exportOrders() {
    const rows = [
      ["Order", "Customer", "Date", "Amount", "Status"],
      ...filteredOrders.map((order) => [
        order.id,
        order.name,
        order.date,
        order.amount,
        order.status,
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "medai-recent-orders.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Your orders CSV has been exported.");
  }

  return (
    <div className="app">
      <Sidebar
        activeNav={activeNav}
        mobileMenuOpen={mobileMenuOpen}
        onNavigate={navigate}
        onClose={() => setMobileMenuOpen(false)}
        navigation={navItems}
        user={user}
        onLogout={logout}
      />
      {mobileMenuOpen && (
        <button
          className="overlay visible"
          aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu />
            </button>
            <div>
              <div className="page-heading">
                {view === "receptionist" && activeNav !== "Settings"
                  ? "AI Receptionist"
                  : activeNav}
              </div>
              <div className="breadcrumb">
                Workspace <span>/</span>{" "}
                <span>
                  {view === "receptionist" && activeNav !== "Settings"
                    ? "AI Receptionist"
                    : activeNav}
                </span>
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <label className="search" aria-label="Search orders and calls">
              <Search />
              <input
                type="search"
                placeholder="Search anything..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button
                  className="search-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X />
                </button>
              )}
            </label>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => setToast("You're all caught up on notifications.")}
            >
              <span className="notification-dot" />
              <Activity />
            </button>
            <button
              className="icon-button"
              aria-label={
                darkMode
                  ? "Switch to light appearance"
                  : "Switch to dark appearance"
              }
              onClick={() => setDarkMode((current) => !current)}
            >
              {darkMode ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        {view === "overview" ? (
          <Overview
            period={period}
            onPeriodChange={setPeriod}
            orders={filteredOrders}
            onExport={exportOrders}
            onToast={setToast}
          />
        ) : view === "users" ? (
          <UserManagement onToast={setToast} />
        ) : view === "setup" ? (
          <QuestionSetup
            questions={customQuestions}
            onAddQuestion={addCustomQuestion}
            onUpdateQuestion={updateCustomQuestion}
            onRemoveQuestion={removeCustomQuestion}
            onSave={() => saveQuestionSetup(customQuestions)}
            onToast={setToast}
          />
        ) : (
          <Receptionist
            providerAdapter={telephonyAdapter}
            provider={provider}
            settings={settings}
            twilioConfigured={twilioStatus.configured}
            questionnaire={questionnaire}
            savedQuestionnaire={savedQuestionnaire}
            callFilter={callFilter}
            calls={filteredCalls}
            selectedCall={selectedCall}
            onProviderChange={handleProviderChange}
            onSpeechProviderChange={(value) =>
              saveSettings({ speechProvider: value })
            }
            onSettingChange={updateSettingDraft}
            onSettingSave={saveSettings}
            onClinicChange={updateClinic}
            onClinicAdd={addClinic}
            onClinicRemove={removeClinic}
            onClinicsSave={saveClinics}
            onQuestionnaireChange={handleQuestionnaireChange}
            onQuestionnaireSubmit={handleQuestionnaireSubmit}
            onEnabledChange={(event) =>
              saveSettings({ enabled: event.target.checked })
            }
            onRecordingChange={handleRecordingChange}
            onCallFilter={setCallFilter}
            onSelectCall={setSelectedCallId}
            onTest={handleTestReceptionist}
            onToast={setToast}
          />
        )}
      </main>
      {toast && (
        <div className="toast visible" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

function Sidebar({ activeNav, mobileMenuOpen, onNavigate, onClose, navigation, user, onLogout }) {
  const initials = (user?.fullName || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <aside
      className={`sidebar${mobileMenuOpen ? " open" : ""}`}
      aria-label="Main navigation"
    >
      <a
        className="brand"
        href="#"
        onClick={(event) => event.preventDefault()}
        aria-label="MedAI Suite home"
      >
        <span className="brand-mark" aria-hidden="true">
          <Activity />
        </span>
        <span className="brand-copy">
          <span className="brand-name">
            MedAI<span className="brand-light">Suite</span>
          </span>
          <span className="brand-subtitle">Clinic platform</span>
        </span>
      </a>
      <p className="nav-label">Workspace</p>
      <ul className="nav-list">
        {navigation.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            active={activeNav === item.label}
            onClick={() => onNavigate(item)}
          />
        ))}
      </ul>
      <div className="sidebar-spacer" />
      <div className="help-card">
        <strong>Need a hand?</strong>
        <p>
          Our support team is here to help you get the most out of MedAI Suite.
        </p>
        <a href="mailto:support@sampleclinic.com">Visit help center &rarr;</a>
      </div>
      <div className="profile">
        <div className="avatar" aria-hidden="true">
          {initials}
        </div>
        <div>
          <div className="profile-name">{user?.fullName || "Signed in"}</div>
          <div className="profile-role">{user?.role === "admin" ? "Workspace admin" : "Clinic staff"}</div>
        </div>
        <button className="profile-more" aria-label="Log out" onClick={onLogout}>
          <LogOut />
        </button>
      </div>
      <button
        className="sidebar-close"
        aria-label="Close navigation"
        onClick={onClose}
      >
        <X />
      </button>
    </aside>
  );
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <li>
      <button
        className={`nav-link${active ? " active" : ""}`}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
      >
        <span className="nav-icon">
          <Icon />
        </span>
        {item.label}
        {item.badge && (
          <span
            className={`nav-badge${item.badge === "AI" ? " ai-badge" : ""}`}
          >
            {item.badge}
          </span>
        )}
      </button>
    </li>
  );
}

function Overview({ period, onPeriodChange, orders, onExport, onToast }) {
  const labels =
    period === "Week"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
      : period === "Year"
        ? ["Jan", "Apr", "Jul", "Oct", "Dec"]
        : ["May 01", "May 07", "May 14", "May 21", "May 30"];
  return (
    <div className="content" id="dashboardView">
      <section className="welcome-row">
        <div>
          <h1>
            Good morning, team <Sparkles className="greeting-sparkle" />
          </h1>
          <p className="welcome-copy">
            Here's what's happening with your store today.
          </p>
        </div>
        <button
          className="date-control"
          onClick={() => onToast("Showing data for the last 30 days.")}
        >
          <CalendarDays />
          Last 30 days
          <ChevronDown />
        </button>
      </section>
      <section className="metric-grid" aria-label="Key metrics">
        <Metric
          label="Total revenue"
          value="$48,294"
          trend="↑ 12.8%"
          icon={Activity}
          tone="purple"
        />
        <Metric
          label="Total orders"
          value="1,842"
          trend="↑ 8.2%"
          icon={ShoppingBag}
          tone="blue"
        />
        <Metric
          label="New customers"
          value="684"
          trend="↑ 16.4%"
          icon={UsersRound}
          tone="green"
        />
        <Metric
          label="Conversion rate"
          value="3.24%"
          trend="↓ 0.6%"
          icon={ArrowDownRight}
          tone="orange"
          down
        />
      </section>
      <section className="chart-grid" id="analytics">
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Revenue overview</h2>
              <p className="panel-subtitle">
                Track your store's performance over time
              </p>
            </div>
            <div
              className="period-tabs"
              role="group"
              aria-label="Revenue chart period"
            >
              {["Week", "Month", "Year"].map((item) => (
                <button
                  key={item}
                  className={period === item ? "selected" : ""}
                  onClick={() => onPeriodChange(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="revenue-summary">
            <strong>$48,294.00</strong>
            <span>↗ 12.8%</span>
          </div>
          <div
            className="chart-wrap"
            role="img"
            aria-label={`Revenue chart for this ${period.toLowerCase()}, trending upward`}
          >
            <svg viewBox="0 0 660 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#8175f3" stopOpacity=".2" />
                  <stop offset="100%" stopColor="#8175f3" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[24, 67, 110, 153].map((y) => (
                <line
                  key={y}
                  className="chart-grid-line"
                  x1="42"
                  y1={y}
                  x2="650"
                  y2={y}
                />
              ))}
              <text className="chart-label" x="0" y="27">
                $15k
              </text>
              <text className="chart-label" x="0" y="70">
                $10k
              </text>
              <text className="chart-label" x="8" y="113">
                $5k
              </text>
              <text className="chart-label" x="15" y="156">
                $0
              </text>
              <path
                d={`${chartPaths[period]} L647 154 L45 154 Z`}
                fill="url(#areaFill)"
              />
              <path
                d={chartPaths[period]}
                fill="none"
                stroke="#7668ed"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle
                cx="647"
                cy={period === "Year" ? "20" : "30"}
                r="4.3"
                fill="#7668ed"
                stroke="white"
                strokeWidth="2"
              />
              {labels.map((label, index) => (
                <text
                  key={label}
                  className="chart-label"
                  x={[42, 180, 325, 470, 610][index]}
                  y="179"
                >
                  {label}
                </text>
              ))}
            </svg>
          </div>
        </article>
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Traffic sources</h2>
              <p className="panel-subtitle">Where your visitors come from</p>
            </div>
            <button
              className="icon-button small-icon"
              aria-label="More traffic options"
              onClick={() =>
                onToast(
                  "Traffic source options are not available in this demo.",
                )
              }
            >
              <MoreHorizontal />
            </button>
          </div>
          <div className="traffic-content">
            <div
              className="donut"
              role="img"
              aria-label="Traffic sources: Direct 62%, Social 24%, Referral 14%"
            >
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle className="track" cx="60" cy="60" r="50" />
                <circle className="segment-a" cx="60" cy="60" r="50" />
                <circle className="segment-b" cx="60" cy="60" r="50" />
                <circle className="segment-c" cx="60" cy="60" r="50" />
              </svg>
              <div className="donut-center">
                <strong>8,549</strong>
                <span>Visitors</span>
              </div>
            </div>
            <div className="legend">
              <Legend color="purple" name="Direct" value="62%" />
              <Legend color="blue" name="Social" value="24%" />
              <Legend color="green" name="Referral" value="14%" />
            </div>
          </div>
        </article>
      </section>
      <section className="lower-grid">
        <article className="panel glass table-panel" id="orders">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Recent orders</h2>
              <p className="panel-subtitle">Keep track of your latest sales</p>
            </div>
            <div className="table-head-actions">
              <button className="subtle-button" onClick={onExport}>
                <Download /> Export
              </button>
              <button
                className="subtle-button"
                onClick={() => onToast("You're viewing all recent orders.")}
              >
                View all
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>
                      <span className="customer">
                        <span className="customer-avatar">
                          {order.initials}
                        </span>
                        {order.name}
                      </span>
                    </td>
                    <td>{order.date}</td>
                    <td>{order.amount}</td>
                    <td>
                      <Status status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {orders.length === 0 && (
              <p className="empty-state">No matching orders.</p>
            )}
          </div>
        </article>
        <article className="panel glass">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Recent activity</h2>
              <p className="panel-subtitle">
                The latest updates from your store
              </p>
            </div>
          </div>
          <div className="activity-list">
            <ActivityItem
              icon={ShoppingBag}
              title="New order received"
              text="Sample Customer A placed an order for $248.00"
              time="12 minutes ago"
            />
            <ActivityItem
              icon={Check}
              title="Payment confirmed"
              text="Order #ORD-7824 was paid successfully"
              time="48 minutes ago"
              mint
            />
            <ActivityItem
              icon={UserRound}
              title="New customer joined"
              text="Olivia Martinez created an account"
              time="2 hours ago"
              amber
            />
          </div>
        </article>
      </section>
    </div>
  );
}

function Metric({ label, value, trend, icon: Icon, tone, down = false }) {
  return (
    <article className="metric-card glass">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon />
        </span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span className={`trend${down ? " down" : ""}`}>{trend}</span>
        <span>vs. last month</span>
      </div>
    </article>
  );
}

function Legend({ color, name, value }) {
  return (
    <div className="legend-item">
      <span className={`legend-dot ${color}`} />
      <span>
        {name}
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function Status({ status }) {
  const className = status.toLowerCase();
  return <span className={`status ${className}`}>{status}</span>;
}

function ActivityItem({
  icon: Icon,
  title,
  text,
  time,
  mint = false,
  amber = false,
}) {
  return (
    <div className="activity-item">
      <span
        className={`activity-symbol${mint ? " mint" : ""}${amber ? " amber" : ""}`}
      >
        <Icon />
      </span>
      <div className="activity-copy">
        <strong>{title}</strong>
        <br />
        {text}
        <div className="activity-time">{time}</div>
      </div>
    </div>
  );
}

function QuestionSetup({
  questions,
  onAddQuestion,
  onUpdateQuestion,
  onRemoveQuestion,
  onSave,
  onToast,
}) {
  return (
    <div className="content setup-page">
      <section className="module-panel glass setup-panel">
        <div className="panel-head">
          <div>
            <h1>Question Setup</h1>
            <p className="panel-subtitle">
              Add the questions the AI receptionist should ask each caller.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={onAddQuestion}
          >
            <PlusIcon /> Add question
          </button>
        </div>

        <div className="question-editor">
          {questions.length === 0 ? (
            <div className="empty-state setup-empty">No questions yet.</div>
          ) : (
            questions.map((question) => (
              <div className="question-row" key={question.id}>
                <div className="question-fields">
                  <label>
                    <span>Question</span>
                    <input
                      type="text"
                      value={question.prompt}
                      onChange={(event) =>
                        onUpdateQuestion(
                          question.id,
                          "prompt",
                          event.target.value,
                        )
                      }
                      placeholder="What is your full name?"
                    />
                  </label>
                  <label>
                    <span>Type</span>
                    <select
                      value={question.type}
                      onChange={(event) =>
                        onUpdateQuestion(
                          question.id,
                          "type",
                          event.target.value,
                        )
                      }
                    >
                      <option value="text">Text</option>
                      <option value="tel">Phone</option>
                      <option value="number">Number</option>
                      <option value="date">Date</option>
                      <option value="textarea">Long answer</option>
                      <option value="yesno">Yes / No</option>
                      <option value="choice">Choice</option>
                      <option value="scale">Scale (1-10)</option>
                    </select>
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={question.required}
                      onChange={(event) =>
                        onUpdateQuestion(
                          question.id,
                          "required",
                          event.target.checked,
                        )
                      }
                    />
                    <span>Required</span>
                  </label>
                </div>
                <button
                  type="button"
                  className="text-button remove-button"
                  onClick={() => onRemoveQuestion(question.id)}
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="setup-footer">
          <div className="setup-summary">
            <strong>{questions.length}</strong>
            <span>questions configured</span>
          </div>
          <button className="secondary-button" type="button" onClick={onSave}>
            Save setup
          </button>
        </div>
      </section>
    </div>
  );
}

function PlusIcon() {
  return <span aria-hidden="true">＋</span>;
}

function Receptionist({
  providerAdapter,
  provider,
  settings,
  twilioConfigured,
  questionnaire,
  savedQuestionnaire,
  callFilter,
  calls: visibleCalls,
  selectedCall,
  onProviderChange,
  onSpeechProviderChange,
  onSettingChange,
  onSettingSave,
  onClinicChange,
  onClinicAdd,
  onClinicRemove,
  onClinicsSave,
  onQuestionnaireChange,
  onQuestionnaireSubmit,
  onEnabledChange,
  onRecordingChange,
  onCallFilter,
  onSelectCall,
  onTest,
  onToast,
}) {
  const providerName =
    provider === "twilio"
      ? "Twilio"
      : provider === "other"
        ? "Other provider"
        : "Demo";
  const statusLabel = !settings.enabled
    ? provider
      ? `${providerName} selected · receptionist off`
      : "Demo · not connected"
    : provider === "twilio" && twilioConfigured
      ? "Connected"
      : provider === "twilio"
        ? "Enabled · Twilio not configured"
        : "Enabled · select a telephony provider";
  return (
    <div className="content" data-provider-adapter={providerAdapter.provider}>
      <section className="module-intro">
        <div>
          <h1>AI Voice Receptionist</h1>
          <p>
            This flow handles incoming caller-to-AI receptionist calls only,
            answering patient calls, collecting intake details, and routing
            urgent or complex conversations to your care team.
          </p>
        </div>
        <div className="module-actions">
          <div
            className={`receptionist-status${statusLabel === "Connected" ? " connected" : ""}`}
          >
            <span className="status-pulse" />
            <span>{statusLabel}</span>
          </div>
          <button className="primary-button" onClick={onTest}>
            <Phone />
            Test receptionist
          </button>
        </div>
      </section>
      <section className="voice-metrics" aria-label="Receptionist call metrics">
        <VoiceMetric
          label="Calls handled today"
          value="—"
          note="No call analytics connected"
        />
        <VoiceMetric
          label="Avg. response time"
          value="—"
          note="No call analytics connected"
        />
        <VoiceMetric
          label="Appointments managed"
          value="—"
          note="No scheduling system connected"
        />
        <VoiceMetric
          label="Staff escalations"
          value="—"
          note="No call analytics connected"
        />
      </section>
      <section className="module-columns">
        <article className="module-panel glass">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Receptionist capabilities</h2>
              <p className="panel-subtitle">
                Voice workflows available to callers
              </p>
            </div>
            <span className="call-type">Voice AI</span>
          </div>
          <div className="capability-grid">
            {capabilities.map(({ icon: Icon, title, detail }) => (
              <div className="capability" key={title}>
                <span className="capability-icon">
                  <Icon />
                </span>
                <div>
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="module-panel glass">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Configuration</h2>
              <p className="panel-subtitle">
                Connect providers and manage call routing
              </p>
            </div>
          </div>
          <div className="config-list">
            <ConfigRow
              title="Telephony provider"
              detail="Provider adapter · credentials stay server-side"
            >
              <select
                aria-label="Telephony provider"
                value={provider}
                onChange={(event) => onProviderChange(event.target.value)}
              >
                <option value="">Not connected</option>
                <option value="twilio">Twilio</option>
                <option value="other">Other provider</option>
              </select>
            </ConfigRow>
            <ConfigRow
              title="Speech services"
              detail="Speech-to-text & text-to-speech"
            >
              <select
                aria-label="Speech services"
                value={settings.speechProvider}
                onChange={(event) => {
                  onSpeechProviderChange(event.target.value);
                  if (event.target.value !== "Not connected")
                    onToast(
                      `${event.target.value} selected. Connect it through your secure backend.`,
                    );
                }}
              >
                <option>Not connected</option>
                <option>OpenAI</option>
                <option>Other provider</option>
              </select>
            </ConfigRow>
            <ConfigRow
              title="AI conversation model"
              detail="OpenAI integration status"
            >
              <span className="call-type">Not connected</span>
            </ConfigRow>
            <ConfigRow
              title="Clinics"
              detail="Callers choose one of these on the shared main line"
            >
              <div className="clinic-editor">
                {settings.clinics.map((name, index) => (
                  <span className="clinic-entry" key={index}>
                    <input
                      aria-label={`Clinic ${index + 1} name`}
                      type="text"
                      value={name}
                      onChange={(event) =>
                        onClinicChange(index, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => onClinicRemove(index)}
                      disabled={settings.clinics.length === 1}
                    >
                      Remove
                    </button>
                  </span>
                ))}
                <span className="clinic-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={onClinicAdd}
                    disabled={settings.clinics.length >= 10}
                  >
                    + Add clinic
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={onClinicsSave}
                  >
                    Save clinics
                  </button>
                </span>
              </div>
            </ConfigRow>
            <ConfigRow
              title="Shared main line"
              detail="One number for all clinics · the AI asks which clinic"
            >
              <input
                aria-label="Shared main line"
                type="tel"
                value={settings.mainLine}
                placeholder="Enter number"
                onChange={(event) =>
                  onSettingChange("mainLine", event.target.value)
                }
                onBlur={() => onSettingSave({ mainLine: settings.mainLine })}
              />
            </ConfigRow>
            <ConfigRow
              title="Business hours"
              detail={
                settings.open24Hours
                  ? "Open 24 hours, every day"
                  : "Mon–Fri · local clinic time"
              }
            >
              <span className="hours-inputs">
                {!settings.open24Hours && (
                  <>
                <input
                  aria-label="Business hours start"
                  type="time"
                  value={settings.hoursStart}
                  onChange={(event) =>
                    onSettingChange("hoursStart", event.target.value)
                  }
                  onBlur={() =>
                    onSettingSave({
                      hoursStart: settings.hoursStart,
                      hoursEnd: settings.hoursEnd,
                    })
                  }
                />
                <span>–</span>
                <input
                  aria-label="Business hours end"
                  type="time"
                  value={settings.hoursEnd}
                  onChange={(event) =>
                    onSettingChange("hoursEnd", event.target.value)
                  }
                  onBlur={() =>
                    onSettingSave({
                      hoursStart: settings.hoursStart,
                      hoursEnd: settings.hoursEnd,
                    })
                  }
                />
                  </>
                )}
                <Toggle
                  label="Open 24 hours"
                  checked={settings.open24Hours}
                  onChange={(event) =>
                    onSettingSave({ open24Hours: event.target.checked })
                  }
                />
                <span className="hours-24-label">24 hours</span>
              </span>
            </ConfigRow>
            <ConfigRow
              title="Enable receptionist"
              detail="Requires a configured telephony connection"
            >
              <Toggle
                label="Enable receptionist"
                checked={settings.enabled}
                onChange={onEnabledChange}
              />
            </ConfigRow>
            <ConfigRow
              title="Save call recordings"
              detail="Off by default; configure consent first"
            >
              <Toggle
                label="Save call recordings"
                checked={settings.recordingEnabled}
                onChange={onRecordingChange}
              />
            </ConfigRow>
          </div>
          <form className="questionnaire-form" onSubmit={onQuestionnaireSubmit}>
            <div className="panel-head questionnaire-head">
              <div>
                <h2 className="panel-title">Call intake questionnaire</h2>
                <p className="panel-subtitle">
                  Capture key caller details before a later AI voice handoff
                </p>
              </div>
              <span className="call-type">For later</span>
            </div>
            <div className="questionnaire-grid">
              <label>
                <span>Patient name</span>
                <input
                  type="text"
                  value={questionnaire.patientName}
                  onChange={(event) =>
                    onQuestionnaireChange("patientName", event.target.value)
                  }
                  placeholder="Jane Doe"
                />
              </label>
              <label>
                <span>Phone number</span>
                <input
                  type="tel"
                  value={questionnaire.phoneNumber}
                  onChange={(event) =>
                    onQuestionnaireChange("phoneNumber", event.target.value)
                  }
                  placeholder="(555) 010-2040"
                />
              </label>
              <label>
                <span>Call reason</span>
                <select
                  value={questionnaire.reason}
                  onChange={(event) =>
                    onQuestionnaireChange("reason", event.target.value)
                  }
                >
                  <option>Appointment request</option>
                  <option>Prescription refill</option>
                  <option>Billing question</option>
                  <option>Insurance question</option>
                  <option>Urgent symptom concern</option>
                  <option>General clinic question</option>
                </select>
              </label>
              <label>
                <span>Preferred callback time</span>
                <input
                  type="datetime-local"
                  value={questionnaire.preferredTime}
                  onChange={(event) =>
                    onQuestionnaireChange("preferredTime", event.target.value)
                  }
                />
              </label>
              <label className="full-width">
                <span>Notes for the AI receptionist</span>
                <textarea
                  rows="3"
                  value={questionnaire.notes}
                  onChange={(event) =>
                    onQuestionnaireChange("notes", event.target.value)
                  }
                  placeholder="For example: needs a reschedule or wants to ask about insurance coverage."
                />
              </label>
            </div>
            <div className="questionnaire-actions">
              <label className="questionnaire-consent">
                <input
                  type="checkbox"
                  checked={questionnaire.consent}
                  onChange={(event) =>
                    onQuestionnaireChange("consent", event.target.checked)
                  }
                />
                <span>I confirm this intake is ready for a later AI call.</span>
              </label>
              <button type="submit" className="primary-button">
                Save intake
              </button>
            </div>
            {savedQuestionnaire && (
              <div className="saved-questionnaire">
                <strong>
                  {savedQuestionnaire.source === "ai_call"
                    ? "Saved by AI from call"
                    : "Saved"}
                </strong>
                <span>
                  {savedQuestionnaire.patientName || "Caller"} ·{" "}
                  {savedQuestionnaire.reason} ·{" "}
                  {savedQuestionnaire.phoneNumber || "No phone on file"}
                </span>
              </div>
            )}
          </form>
          <div className="compliance-note">
            <ShieldCheck />
            <span>
              Call recording and transcript retention must follow patient
              consent requirements and applicable privacy laws. Confirm your
              clinic policy before enabling storage. Emergency guidance is not a
              substitute for emergency services.
            </span>
          </div>
        </article>
      </section>
      <section className="module-panel glass calls-panel">
        <div className="panel-head">
          <div>
            <h2 className="panel-title">Recent calls</h2>
            <p className="panel-subtitle">
              Inbound calls answered by the AI receptionist
            </p>
          </div>
          <div className="call-filters" role="group" aria-label="Filter calls">
            {[
              ["all", "All calls"],
              ["escalated", "Escalated"],
              ["missed", "Missed"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={callFilter === value ? "selected" : ""}
                onClick={() => onCallFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table className="call-table">
            <thead>
              <tr>
                <th>Caller</th>
                <th>Date</th>
                <th>Clinic</th>
                <th>Reason</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleCalls.map((call) => (
                <tr key={call.id}>
                  <td>{call.caller}</td>
                  <td>
                    {call.createdAt
                      ? new Date(call.createdAt).toLocaleString()
                      : "—"}
                  </td>
                  <td>{call.clinic}</td>
                  <td>{call.reason}</td>
                  <td>
                    <Status status={call.outcome} />
                  </td>
                  <td>{call.duration}</td>
                  <td>
                    {call.recordingUrl ? (
                      <a href={call.recordingUrl} target="_blank" rel="noreferrer">
                        Listen
                      </a>
                    ) : (
                      "Not stored"
                    )}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onSelectCall(call.id)}
                    >
                      View summary
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleCalls.length === 0 && (
            <p className="empty-state">No matching calls.</p>
          )}
        </div>
        <div className="call-detail" aria-live="polite">
          <div>
            <h3>{selectedCall.title}</h3>
            {selectedCall.lines.map(([speaker, text], index) => (
              <p
                className="transcript-line"
                key={`${selectedCall.id}-${index}`}
              >
                <strong>{speaker}:</strong> {text}
              </p>
            ))}
          </div>
          <div>
            <h3>Call summary</h3>
            <div className="summary-box">{selectedCall.summary}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function VoiceMetric({ label, value, note }) {
  return (
    <article className="voice-metric glass">
      <div className="voice-metric-label">{label}</div>
      <div className="voice-metric-value">{value}</div>
      <div className="voice-metric-note">{note}</div>
    </article>
  );
}

function ConfigRow({ title, detail, children }) {
  return (
    <div className="config-row">
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="toggle-track" />
    </label>
  );
}

export default App;
