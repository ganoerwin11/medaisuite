import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import twilio from "twilio";
import { saveQuestionnaire } from "./saveIntake.js";
import {
  AiSummary,
  ApiLog,
  Assistant,
  AssistantConfiguration,
  Call,
  CallTranscript,
  Conversation,
  IntakeRecord,
  Message,
  Order,
  Patient,
  ReceptionistSetting,
  SecurityLog,
  User,
  UsageLog,
  VoiceSession,
  Widget,
  WidgetDomain,
  Op,
  connectAndSync,
  sequelize,
} from "./db.js";
import {
  readQuestions,
  saveLiveIntake,
  writeQuestions,
} from "./saveIntake.js";
import {
  ROLES,
  createAuthMiddleware,
  ensureDefaultAdmin,
  findUserForLogin,
  hashPassword,
  sanitizeUser,
  signToken,
  verifyPassword,
} from "./auth.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "..", "dist");
const publicWidgetDir = path.join(__dirname, "..", "public-widget");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
if (IS_PRODUCTION) {
  // Behind the nginx reverse proxy, so req.protocol/req.ip reflect X-Forwarded-* headers.
  app.set("trust proxy", 1);
}
const PORT = Number(process.env.PORT || 3001);
const DB_NAME = process.env.DB_NAME || "medai_suite";
const twilioClient =
  process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
    ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    : null;
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function toE164(value) {
  if (!value) return value;
  const trimmed = String(value).trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

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

let pgReady = false;
const { requireAuth, requireRole } = createAuthMiddleware(() => pgReady);

const defaultClinics = ["Sample Clinic", "Satellite Clinic"];
const defaultSettings = {
  enabled: false,
  recordingEnabled: false,
  hoursStart: "08:00",
  hoursEnd: "17:00",
  open24Hours: false,
  telephonyProvider: "",
  speechProvider: "Not connected",
  mainLine: "",
  clinics: defaultClinics,
};
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const PHONE_PATTERN = /^[+\d()\-\s.]*$/;
let receptionistQuestions = [
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

function buildQuestionPromptList(questions = receptionistQuestions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return "";
  }

  return questions
    .filter((question) => question && question.prompt && question.prompt.trim())
    .map(
      (question, index) =>
        `${index + 1}. ${question.prompt}${question.required ? " (required)" : ""}`,
    )
    .join(" ");
}

async function initializeDatabase() {
  try {
    await connectAndSync();

    if ((await Order.count()) === 0) {
      await Order.bulkCreate(fallbackOrders);
    }
    if ((await Call.count()) === 0) {
      await Call.bulkCreate(
        fallbackCalls.map(({ lines, summary, ...call }) => call),
      );
      await CallTranscript.bulkCreate(
        fallbackCalls.map((call) => ({ callId: call.id, entries: call.lines })),
      );
      await AiSummary.bulkCreate(
        fallbackCalls.map((call) => ({
          callId: call.id,
          summary: call.summary,
          generatedBy: "seed",
          generatedAt: new Date(),
        })),
      );
    }
    await ReceptionistSetting.findOrCreate({
      where: { id: 1 },
      defaults: { clinics: defaultClinics },
    });
    receptionistQuestions = await readQuestions();
    await ensureDefaultAdmin();

    pgReady = true;
    console.log(`PostgreSQL connection ready for database: ${DB_NAME}`);
    return true;
  } catch (error) {
    console.warn(
      "PostgreSQL is not available; using embedded demo data instead.",
      error.message,
    );
    pgReady = false;
    return false;
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({ origin: true, credentials: false }));

function serializeAssistant(assistant) {
  const plain =
    typeof assistant?.get === "function"
      ? assistant.get({ plain: true })
      : assistant;
  return plain;
}

function validateColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
}

function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const host = raw.includes("://") ? new URL(raw).hostname : raw.split("/")[0];
    return host.replace(/^\*\./, "").replace(/\.$/, "");
  } catch {
    return "";
  }
}

function isOriginAuthorized(origin, domains) {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase().replace(/\.$/, "");
    return domains.some((entry) => {
      const domain = normalizeDomain(entry.domain);
      return entry.active && (host === domain || host.endsWith(`.${domain}`));
    });
  } catch {
    return false;
  }
}

function createIntakeState(intakeEnabled) {
  return intakeEnabled
    ? {
        active: true,
        consent: null,
        answers: {},
        skipped: [],
        pendingCode: "consent",
        confirmed: null,
        completed: false,
        retries: 0,
      }
    : { active: false };
}

function cloneIntakeState(state) {
  return {
    ...state,
    answers: { ...(state.answers || {}) },
    skipped: [...(state.skipped || [])],
  };
}

function normalizeSdpOffer(value) {
  if (typeof value !== "string") return "";
  const lines = value.replace(/\r\n?/g, "\n").trim().split("\n");
  return lines.length === 1 && !lines[0] ? "" : `${lines.join("\r\n")}\r\n`;
}

function dbConditionMet(condition, answers) {
  if (!condition) return true;
  if (condition.anyOf) return condition.anyOf.some((item) => dbConditionMet(item, answers));
  const answer = answers[condition.code];
  if (condition.answered) return Boolean(answer);
  if (!answer) return false;
  return answer.value === condition.is;
}

async function nextIntakeQuestion(state) {
  const questions = await readQuestions();
  return questions.find(
    (question) =>
      !state.answers[question.code] &&
      !state.skipped.includes(question.code) &&
      dbConditionMet(question.showIf, state.answers),
  ) || null;
}

async function intakePrompt(state) {
  if (state.pendingCode === "consent") {
    return "I would like to collect a few details to share with our medical team. Do you consent to saving this intake information? Please say yes or no.";
  }
  if (state.pendingCode === "recap") {
    const concern = state.answers.B02?.text || "not given";
    const symptoms = state.answers.B03?.text || "not given";
    const name = [state.answers.A02?.text, state.answers.A03?.text].filter(Boolean).join(" ") || "not given";
    return `Let me confirm. Your name is ${name}, your main concern is ${concern}, and your symptoms are ${symptoms}. Is all of this correct?`;
  }
  const questions = await readQuestions();
  const question = questions.find((item) => item.code === state.pendingCode);
  return question?.prompt || "What else would you like to add?";
}

function parseYesNo(text) {
  if (/\b(yes|yeah|yep|yup|sure|correct|absolutely|okay|ok)\b/i.test(text)) return "yes";
  if (/\b(no|nope|nah|none|never|not)\b/i.test(text)) return "no";
  return null;
}

async function normalizeDbAnswer(question, speech) {
  const text = String(speech || "").trim();
  if (!text) return null;
  if (question.type === "yesno") {
    const value = parseYesNo(text);
    return value ? { text, value } : null;
  }
  if (question.type === "scale") {
    const match = text.match(/\b(10|[1-9])\b/);
    return match ? { text, value: Number(match[1]) } : null;
  }
  if (question.type === "choice") {
    const lower = text.toLowerCase();
    const exact = (question.options || []).find((option) => lower.includes(String(option).toLowerCase()));
    return exact ? { text, value: exact } : null;
  }
  return { text, value: null };
}

const assistantConfigurationFields = [
  "instructions",
  "welcomeMessage",
  "model",
  "voice",
  "language",
  "temperature",
  "maxTokens",
  "knowledgeBase",
  "tools",
  "conversationLimit",
  "usageLimit",
  "intakeEnabled",
];

app.get("/api/assistants", requireAuth, requireRole("admin"), async (_req, res) => {
  if (!requireDatabase(res)) return;
  const assistants = await Assistant.findAll({
    include: [{ model: AssistantConfiguration, as: "configuration" }],
    order: [["createdAt", "DESC"]],
  });
  res.json(assistants);
});

app.post("/api/assistants", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const name = String(req.body?.name || "").trim();
  if (!name || name.length > 120) {
    return res.status(400).json({ message: "Assistant name is required." });
  }
  const configuration = Object.fromEntries(
    assistantConfigurationFields
      .filter((field) => req.body?.configuration?.[field] !== undefined)
      .map((field) => [field, req.body.configuration[field]]),
  );
  const result = await sequelize.transaction(async (transaction) => {
    const assistant = await Assistant.create(
      { name, description: String(req.body.description || "").trim(), active: req.body.active !== false },
      { transaction },
    );
    await AssistantConfiguration.create(
      { assistantId: assistant.id, ...configuration },
      { transaction },
    );
    return Assistant.findByPk(assistant.id, {
      include: [{ model: AssistantConfiguration, as: "configuration" }],
      transaction,
    });
  });
  res.status(201).json(result);
});

app.get("/api/assistants/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const assistant = await Assistant.findByPk(req.params.id, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  if (!assistant) return res.status(404).json({ message: "Assistant not found." });
  res.json(assistant);
});

app.patch("/api/assistants/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const assistant = await Assistant.findByPk(req.params.id);
  if (!assistant) return res.status(404).json({ message: "Assistant not found." });
  try {
    await sequelize.transaction(async (transaction) => {
      const assistantFields = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name).trim();
        if (!name || name.length > 120) throw Object.assign(new Error("Invalid assistant name"), { status: 400 });
        assistantFields.name = name;
      }
      if (req.body?.description !== undefined) assistantFields.description = String(req.body.description).trim();
      if (req.body?.active !== undefined) assistantFields.active = Boolean(req.body.active);
      await assistant.update(assistantFields, { transaction });

      if (req.body?.configuration) {
        const configuration = await AssistantConfiguration.findOne({ where: { assistantId: assistant.id }, transaction });
        const updates = Object.fromEntries(
          assistantConfigurationFields
            .filter((field) => req.body.configuration[field] !== undefined)
            .map((field) => [field, req.body.configuration[field]]),
        );
        if (configuration) await configuration.update(updates, { transaction });
        else await AssistantConfiguration.create({ assistantId: assistant.id, ...updates }, { transaction });
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    throw error;
  }
  const updated = await Assistant.findByPk(req.params.id, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  return res.json(updated);
});

app.delete("/api/assistants/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const deleted = await Assistant.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ message: "Assistant not found." });
  res.sendStatus(204);
});

app.post("/api/assistants/:id/duplicate", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const source = await Assistant.findByPk(req.params.id, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  if (!source) return res.status(404).json({ message: "Assistant not found." });
  const result = await sequelize.transaction(async (transaction) => {
    const copy = await source.constructor.create(
      { name: `${source.name} Copy`.slice(0, 120), description: source.description, active: false },
      { transaction },
    );
    const sourceConfiguration = source.configuration?.get
      ? source.configuration.get({ plain: true })
      : source.configuration || {};
    const { id, assistantId, createdAt, updatedAt, ...configuration } = sourceConfiguration;
    await AssistantConfiguration.create({ ...configuration, assistantId: copy.id }, { transaction });
    return Assistant.findByPk(copy.id, {
      include: [{ model: AssistantConfiguration, as: "configuration" }],
      transaction,
    });
  });
  res.status(201).json(result);
});

const widgetFields = [
  "name", "title", "welcomeMessage", "primaryColor", "secondaryColor", "buttonColor",
  "position", "size", "avatarUrl", "fontStyle", "initialOpen", "voiceEnabled",
  "textEnabled", "mobileBehavior", "active",
];

app.get("/api/widgets", requireAuth, requireRole("admin"), async (_req, res) => {
  if (!requireDatabase(res)) return;
  const widgets = await Widget.findAll({
    include: [
      { model: Assistant, as: "assistant" },
      { model: WidgetDomain, as: "domains" },
    ],
    order: [["createdAt", "DESC"]],
  });
  res.json(widgets);
});

app.post("/api/widgets", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const assistant = await Assistant.findByPk(req.body?.assistantId);
  if (!assistant) return res.status(400).json({ message: "A valid assistant is required." });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ message: "Widget name is required." });
  const updates = Object.fromEntries(
    widgetFields
      .filter((field) => req.body?.[field] !== undefined)
      .map((field) => [field, req.body[field]]),
  );
  updates.primaryColor = validateColor(updates.primaryColor, "#7c3aed");
  updates.secondaryColor = validateColor(updates.secondaryColor, "#f5f3ff");
  updates.buttonColor = validateColor(updates.buttonColor, "#7c3aed");
  const widget = await Widget.create({
    assistantId: assistant.id,
    publicId: `wd_${randomUUID().replaceAll("-", "")}`,
    name,
    title: String(req.body.title || assistant.name).trim(),
    ...updates,
  });
  if (Array.isArray(req.body.domains)) {
    await Promise.all(req.body.domains.map((domain) => {
      const normalized = normalizeDomain(domain);
      return normalized ? WidgetDomain.create({ widgetId: widget.id, domain: normalized }) : null;
    }));
  }
  res.status(201).json(await Widget.findByPk(widget.id, {
    include: [{ model: Assistant, as: "assistant" }, { model: WidgetDomain, as: "domains" }],
  }));
});

app.get("/api/widgets/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findByPk(req.params.id, {
    include: [{ model: Assistant, as: "assistant" }, { model: WidgetDomain, as: "domains" }],
  });
  if (!widget) return res.status(404).json({ message: "Widget not found." });
  res.json(widget);
});

app.patch("/api/widgets/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findByPk(req.params.id);
  if (!widget) return res.status(404).json({ message: "Widget not found." });
  await sequelize.transaction(async (transaction) => {
    const updates = Object.fromEntries(
      widgetFields
        .filter((field) => req.body?.[field] !== undefined)
        .map((field) => [field, req.body[field]]),
    );
    if (updates.primaryColor) updates.primaryColor = validateColor(updates.primaryColor, "#7c3aed");
    if (updates.secondaryColor) updates.secondaryColor = validateColor(updates.secondaryColor, "#f5f3ff");
    if (updates.buttonColor) updates.buttonColor = validateColor(updates.buttonColor, "#7c3aed");
    await widget.update(updates, { transaction });
    if (Array.isArray(req.body.domains)) {
      await WidgetDomain.destroy({ where: { widgetId: widget.id }, transaction });
      for (const domain of req.body.domains) {
        const normalized = normalizeDomain(domain);
        if (normalized) await WidgetDomain.create({ widgetId: widget.id, domain: normalized }, { transaction });
      }
    }
  });
  res.json(await Widget.findByPk(widget.id, {
    include: [{ model: Assistant, as: "assistant" }, { model: WidgetDomain, as: "domains" }],
  }));
});

app.delete("/api/widgets/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const deleted = await Widget.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ message: "Widget not found." });
  res.sendStatus(204);
});

app.post("/api/widgets/:id/regenerate", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findByPk(req.params.id);
  if (!widget) return res.status(404).json({ message: "Widget not found." });
  await widget.update({ publicId: `wd_${randomUUID().replaceAll("-", "")}` });
  res.json({ publicId: widget.publicId });
});

app.get("/api/widgets/:id/embed", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findByPk(req.params.id, { include: [{ model: Assistant, as: "assistant" }] });
  if (!widget) return res.status(404).json({ message: "Widget not found." });
  const origin = `${req.protocol}://${req.get("host")}`;
  const snippet = `<script\n  src="${origin}/widget/loader.js"\n  data-assistant-id="${widget.assistant.publicId}"\n  data-widget-id="${widget.publicId}"\n  async>\n</script>`;
  res.json({ snippet, publicId: widget.publicId, assistantId: widget.assistant.publicId });
});

function publicOrigin(req) {
  const origin = String(req.get("origin") || "").trim();
  if (!origin) return "";
  try {
    return new URL(origin).origin;
  } catch {
    return "";
  }
}

app.get("/api/public/widgets/:widgetId", async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findOne({
    where: { publicId: req.params.widgetId, active: true },
    include: [
      { model: Assistant, as: "assistant", where: { active: true } },
      { model: WidgetDomain, as: "domains" },
    ],
  });
  if (!widget) return res.status(404).json({ message: "Widget unavailable." });
  const origin = publicOrigin(req);
  if (origin && !isOriginAuthorized(origin, widget.domains || [])) {
    await SecurityLog.create({ eventType: "widget_origin_denied", severity: "warning", origin, details: { widgetId: widget.id } });
    return res.status(403).json({ message: "This widget is not authorized for this website." });
  }
  const plain = widget.get({ plain: true });
  const assistant = await Assistant.findByPk(widget.assistantId, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  const intakeEnabled = assistant?.configuration?.intakeEnabled !== false;
  res.set("Access-Control-Allow-Origin", origin || "*");
  res.set("Cache-Control", "no-store");
  res.json({
    publicId: widget.publicId,
    name: plain.name,
    title: plain.title,
    welcomeMessage: plain.welcomeMessage,
    primaryColor: plain.primaryColor,
    secondaryColor: plain.secondaryColor,
    buttonColor: plain.buttonColor,
    position: plain.position,
    size: plain.size,
    avatarUrl: plain.avatarUrl,
    fontStyle: plain.fontStyle,
    initialOpen: plain.initialOpen,
    voiceEnabled: plain.voiceEnabled,
    textEnabled: plain.textEnabled,
    mobileBehavior: plain.mobileBehavior,
    intakeEnabled,
  });
});

app.post("/api/public/widgets/:widgetId/sessions", async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findOne({
    where: { publicId: req.params.widgetId, active: true },
    include: [
      { model: Assistant, as: "assistant", where: { active: true } },
      { model: WidgetDomain, as: "domains" },
    ],
  });
  if (!widget) return res.status(404).json({ message: "Widget unavailable." });
  const origin = publicOrigin(req);
  if (!isOriginAuthorized(origin, widget.domains || [])) {
    await SecurityLog.create({ eventType: "widget_session_denied", severity: "warning", origin: origin || null, details: { widgetId: widget.id } });
    return res.status(403).json({ message: "This widget is not authorized for this website." });
  }
  const publicSessionId = `conv_${randomUUID().replaceAll("-", "")}`;
  const sessionToken = `sess_${randomUUID().replaceAll("-", "")}`;
  const assistant = await Assistant.findByPk(widget.assistantId, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  const intakeState = createIntakeState(assistant?.configuration?.intakeEnabled !== false);
  const conversation = await Conversation.create({
    publicSessionId,
    assistantId: widget.assistantId,
    widgetId: widget.id,
    kind: "text",
    originDomain: origin ? new URL(origin).hostname : null,
    intakeState,
  });
  await VoiceSession.create({
    conversationId: conversation.id,
    sessionToken,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Cache-Control", "no-store");
  res.json({
    sessionToken,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    publicSessionId,
    intakeEnabled: intakeState.active,
    firstPrompt: intakeState.active ? await intakePrompt(intakeState) : null,
  });
});

async function findPublicSession(req) {
  const sessionToken = String(req.get("x-widget-session") || "").trim();
  if (!sessionToken) return null;
  const voiceSession = await VoiceSession.findOne({
    where: { sessionToken, status: "active" },
    include: [{ model: Conversation, as: "conversation" }],
  });
  if (!voiceSession || voiceSession.expiresAt <= new Date()) return null;
  return voiceSession;
}

app.post("/api/public/widgets/:widgetId/messages", async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findOne({
    where: { publicId: req.params.widgetId, active: true },
    include: [
      { model: Assistant, as: "assistant", where: { active: true } },
      { model: WidgetDomain, as: "domains" },
    ],
  });
  if (!widget) return res.status(404).json({ message: "Widget unavailable." });
  const origin = publicOrigin(req);
  if (!isOriginAuthorized(origin, widget.domains || [])) {
    return res.status(403).json({ message: "This widget is not authorized for this website." });
  }
  const voiceSession = await findPublicSession(req);
  if (!voiceSession?.conversation) {
    return res.status(401).json({ message: "A valid widget session is required." });
  }
  const content = String(req.body?.content || "").trim();
  const idempotencyKey = String(req.body?.idempotencyKey || "").trim();
  if (!content || content.length > 4000) {
    return res.status(400).json({ message: "Message content must be between 1 and 4000 characters." });
  }
  const conversation = voiceSession.conversation;
  if (idempotencyKey) {
    const existingUserMessage = await Message.findOne({
      where: { conversationId: conversation.id, role: "user", idempotencyKey },
    });
    if (existingUserMessage) {
      const existingReply = await Message.findOne({
        where: {
          conversationId: conversation.id,
          role: "assistant",
          createdAt: { [Op.gte]: existingUserMessage.createdAt },
        },
        order: [["createdAt", "ASC"]],
      });
      if (!existingReply) {
        return res.status(409).json({ message: "This message is still being processed. Please retry shortly." });
      }
      return res.json({
        message: existingReply.content,
        providerResponseId: existingReply.providerResponseId,
      });
    }
  }

  if (conversation.intakeState?.active) {
    const state = cloneIntakeState(conversation.intakeState);
    let reply;

    if (state.pendingCode === "consent") {
      const consent = parseYesNo(content);
      if (!consent) {
        reply = "Please answer yes or no. " + await intakePrompt(state);
      } else if (consent === "no") {
        state.completed = true;
        state.consent = false;
        reply = "No problem. I will not save an intake record. If you need help, you can ask a general question.";
      } else {
        state.consent = true;
        const question = await nextIntakeQuestion(state);
        state.pendingCode = question?.code || "recap";
        reply = await intakePrompt(state);
      }
    } else if (state.pendingCode === "recap") {
      const confirmed = parseYesNo(content);
      if (!confirmed) {
        reply = "Please answer yes or no. " + await intakePrompt(state);
      } else {
        state.confirmed = confirmed === "yes";
        state.completed = true;
        if (state.confirmed && pgReady) {
          try {
            await saveQuestionnaire({
              callId: null,
              from: state.answers.A05?.text || "",
              dataConsent: true,
              confirmed: true,
              answers: state.answers,
              source: "ai_widget",
              extraNotes: "Collected through the embeddable AI voice/text intake widget.",
              custom: [],
              skipped: state.skipped,
            });
          } catch (error) {
            await SecurityLog.create({
              eventType: "intake_save_failed",
              severity: "error",
              origin,
              details: { widgetId: widget.id, error: error.message },
            });
          }
        }
        reply = state.confirmed
          ? "Thank you. Your intake has been completed and submitted to the care team for review."
          : "Thank you. Your information needs review by the care team before it is finalized.";
      }
    } else {
      const questions = await readQuestions();
      const question = questions.find((item) => item.code === state.pendingCode);
      const answer = question ? await normalizeDbAnswer(question, content) : null;
      if (!answer) {
        state.retries = Number(state.retries || 0) + 1;
        if (state.retries > 2) {
          if (question) state.skipped.push(question.code);
          state.retries = 0;
        } else {
          reply = "I did not catch that clearly. " + await intakePrompt(state);
        }
      } else {
        state.retries = 0;
        state.answers[question.code] = answer;
      }
      if (!reply) {
        const nextQuestion = await nextIntakeQuestion(state);
        state.pendingCode = nextQuestion?.code || "recap";
        reply = await intakePrompt(state);
      }
    }

    await conversation.update({ intakeState: state });
    await Message.create({
      conversationId: conversation.id,
      role: "user",
      content,
      idempotencyKey: idempotencyKey || null,
    });
    await Message.create({
      conversationId: conversation.id,
      role: "assistant",
      content: reply,
    });
    await UsageLog.create({
      assistantId: widget.assistantId,
      widgetId: widget.id,
      eventType: "intake_message",
    });
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Cache-Control", "no-store");
    return res.json({ message: reply, intake: { completed: state.completed, pendingCode: state.pendingCode } });
  }
  if (!openaiClient) {
    return res.status(503).json({ message: "OpenAI is not configured on the server." });
  }
  const assistant = await Assistant.findByPk(widget.assistantId, {
    include: [{ model: AssistantConfiguration, as: "configuration" }],
  });
  const configuration = assistant?.configuration;
  const instructions = [
    configuration?.instructions || "",
    configuration?.knowledgeBase ? `Knowledge base:\n${configuration.knowledgeBase}` : "",
  ].filter(Boolean).join("\n\n");
  const previousResponse = await Message.findOne({
    where: {
      conversationId: voiceSession.conversationId,
      role: "assistant",
      providerResponseId: { [Op.ne]: null },
    },
    order: [["createdAt", "DESC"]],
  });
  const started = Date.now();
  let providerResponse;
  try {
    providerResponse = await openaiClient.responses.create({
      model: configuration?.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
      instructions: instructions || "You are a helpful AI assistant.",
      input: content,
      max_output_tokens: Math.min(Math.max(Number(configuration?.maxTokens || 1000), 1), 4096),
      temperature: Math.min(Math.max(Number(configuration?.temperature || 0.7), 0), 2),
      ...(previousResponse?.providerResponseId
        ? { previous_response_id: previousResponse.providerResponseId }
        : {}),
    });
  } catch (error) {
    await ApiLog.create({ provider: "openai", endpoint: "responses.create", statusCode: 502, latencyMs: Date.now() - started, error: error.message });
    await SecurityLog.create({ eventType: "openai_request_failed", severity: "error", origin, details: { widgetId: widget.id } });
    return res.status(502).json({ message: "The AI provider could not complete the request." });
  }
  const reply = providerResponse.output_text || "";
  if (!reply.trim()) {
    await ApiLog.create({
      provider: "openai",
      endpoint: "responses.create",
      statusCode: 502,
      latencyMs: Date.now() - started,
      error: "The AI provider returned an empty response.",
    });
    return res.status(502).json({ message: "The AI provider returned an empty response. Please try again." });
  }
  await Message.create({
    conversationId: voiceSession.conversationId,
    role: "user",
    content,
    idempotencyKey: idempotencyKey || null,
  });
  await Message.create({
    conversationId: voiceSession.conversationId,
    role: "assistant",
    content: reply,
    providerResponseId: providerResponse.id || null,
  });
  await UsageLog.create({
    assistantId: widget.assistantId,
    widgetId: widget.id,
    eventType: "text_message",
  });
  res.set("Access-Control-Allow-Origin", origin);
  res.set("Cache-Control", "no-store");
  res.json({ message: reply, providerResponseId: providerResponse.id || null });
});

app.post("/api/public/widgets/:widgetId/voice/session", async (req, res) => {
  if (!requireDatabase(res)) return;
  const widget = await Widget.findOne({
    where: { publicId: req.params.widgetId, active: true, voiceEnabled: true },
    include: [
      { model: Assistant, as: "assistant", where: { active: true } },
      { model: WidgetDomain, as: "domains" },
    ],
  });
  if (!widget) return res.status(404).json({ message: "Voice chat unavailable." });
  const origin = publicOrigin(req);
  if (!isOriginAuthorized(origin, widget.domains || [])) {
    return res.status(403).json({ message: "This widget is not authorized for this website." });
  }
  const voiceSession = await findPublicSession(req);
  if (!voiceSession) return res.status(401).json({ message: "A valid widget session is required." });
  if (!openaiClient) return res.status(503).json({ message: "OpenAI is not configured on the server." });
  const sdp = normalizeSdpOffer(req.body?.sdp);
  if (
    !sdp ||
    sdp.length > 100_000 ||
    !/^v=0(?:\r?\n)/.test(sdp) ||
    !/^m=audio\s/m.test(sdp) ||
    !/^m=application\s/m.test(sdp)
  ) {
    return res.status(400).json({ message: "A valid WebRTC offer is required." });
  }
  try {
    const assistant = await Assistant.findByPk(widget.assistantId, {
      include: [{ model: AssistantConfiguration, as: "configuration" }],
    });
    const configuration = assistant?.configuration;
    const session = {
      type: "realtime",
      model: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime",
      instructions: "Do not respond automatically. The application transcribes each user turn, handles intake consent and saves answers, then sends the exact reply for you to speak. When asked to respond, speak only the supplied text without adding or changing anything.",
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            create_response: false,
            interrupt_response: false,
          },
        },
        output: { voice: configuration?.voice || process.env.OPENAI_VOICE || "alloy" },
      },
      output_modalities: ["audio"],
    };
    const response = await openaiClient.realtime.calls.create({ sdp });
    const answerSdp = await response.text();
    if (!answerSdp.trim().startsWith("v=0")) {
      throw new Error("OpenAI returned an invalid SDP answer.");
    }
    await voiceSession.update({
      providerSessionId: null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      endedAt: null,
    });
    await UsageLog.create({ assistantId: widget.assistantId, widgetId: widget.id, eventType: "voice_session" });
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Cache-Control", "no-store");
    res.status(201).json({ sdp: answerSdp, session, expiresAt: voiceSession.expiresAt });
  } catch (error) {
    await ApiLog.create({ provider: "openai", endpoint: "realtime.calls.create", statusCode: 502, latencyMs: 0, error: error.message });
    res.status(502).json({ message: "Could not initialize voice chat." });
  }
});

app.post("/api/public/widgets/:widgetId/voice/end", async (req, res) => {
  if (!requireDatabase(res)) return;
  const voiceSession = await findPublicSession(req);
  if (!voiceSession) return res.status(401).json({ message: "A valid widget session is required." });
  await voiceSession.update({ providerSessionId: null, endedAt: new Date() });
  res.sendStatus(204);
});

app.get("/widget/loader.js", (_req, res) => {
  res.type("application/javascript");
  res.set("Cache-Control", "public, max-age=300");
  res.sendFile(path.join(publicWidgetDir, "loader.js"));
});

const intakeSessions = new Map();
const INTAKE_MAX_RETRIES = 2;

function buildIntakeSteps(settings, questions = []) {
  const steps = [
    {
      key: "consent",
      prompt:
        "I would like to save a few details so our care team can follow up. Is that okay? Please say yes or no.",
    },
    { key: "patientName", prompt: "May I have your full name, please?" },
    {
      key: "phoneNumber",
      prompt: "What is the best phone number to reach you at?",
    },
  ];

  if (settings.clinics.length) {
    steps.push({
      key: "clinic",
      prompt: `Which clinic would you like to visit: ${settings.clinics.join(" or ")}?`,
    });
  }

  steps.push(
    { key: "reason", prompt: "What is the reason for your call?" },
    {
      key: "preferredTime",
      prompt: "When would you prefer us to contact you or see you?",
    },
  );

  for (const question of questions) {
    if (question?.prompt?.trim()) {
      steps.push({ key: "custom", prompt: question.prompt.trim() });
    }
  }

  return steps;
}

function buildIntakeTwiml(
  prompt,
  { record, recordingCallbackUrl, baseUrl, step, retry },
) {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  if (record && step === 0 && retry === 0) {
    response.say(
      { voice: "alice" },
      "This call may be recorded for quality and scheduling purposes.",
    );
    response.start().recording({
      recordingStatusCallback: recordingCallbackUrl,
      recordingStatusCallbackEvent: "completed",
    });
  }
  const gather = response.gather({
    input: "speech",
    action: `${baseUrl}/api/voice/twilio/intake?step=${step}&retry=${retry}`,
    method: "POST",
    speechTimeout: "auto",
    timeout: 5,
  });
  gather.say({ voice: "alice" }, prompt);
  return response.toString();
}

function buildClosingTwiml(message) {
  const response = new twilio.twiml.VoiceResponse();
  response.say({ voice: "alice" }, message);
  response.hangup();
  return response.toString();
}

function publicBaseUrl(req) {
  if (process.env.TWILIO_WEBHOOK_URL) {
    try {
      const configured = new URL(process.env.TWILIO_WEBHOOK_URL);
      if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(configured.hostname)) {
        return configured.origin;
      }
    } catch {
      // Fall through to request-derived origin.
    }
  }
  const proto = String(req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host")).split(",")[0].trim();
  return `${proto}://${host}`;
}

app.get("/api/health", async (_req, res) => {
  res.json({
    status: "ok",
    database: pgReady ? "postgres" : "fallback",
    message: pgReady ? "Connected to PostgreSQL." : "Using demo data fallback.",
    twilio: twilioClient ? "connected" : "not-configured",
  });
});

function requireDatabase(res) {
  if (!pgReady) {
    res.status(503).json({ message: "PostgreSQL is not connected." });
    return false;
  }
  return true;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = await findUserForLogin(email, () => pgReady);
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  if (typeof user.update === "function") {
    await user.update({ lastLoginAt: new Date() });
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  res.json(sanitizeUser(req.user));
});

app.post("/api/auth/logout", requireAuth, async (_req, res) => {
  res.sendStatus(204);
});

app.get("/api/auth/users", requireAuth, requireRole("admin"), async (_req, res) => {
  if (!requireDatabase(res)) return;
  const users = await User.findAll({ order: [["createdAt", "ASC"]] });
  res.json(users.map(sanitizeUser));
});

app.post("/api/auth/users", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;

  const fullName = String(req.body?.fullName || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "staff");

  if (!fullName || !EMAIL_PATTERN.test(email) || password.length < 8) {
    return res.status(400).json({
      message: "A full name, a valid email, and a password of at least 8 characters are required.",
    });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}.` });
  }

  try {
    const user = await User.create({
      fullName,
      email,
      role,
      passwordHash: await hashPassword(password),
    });
    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ message: "A user with that email already exists." });
    }
    console.error("Could not create user:", error.message);
    res.status(500).json({ message: "Could not create the user." });
  }
});

app.patch("/api/auth/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  if (!requireDatabase(res)) return;

  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  const updates = {};
  if (req.body?.fullName !== undefined) updates.fullName = String(req.body.fullName).trim();
  if (req.body?.active !== undefined) updates.active = Boolean(req.body.active);
  if (req.body?.role !== undefined) {
    if (!ROLES.includes(req.body.role)) {
      return res.status(400).json({ message: `Role must be one of: ${ROLES.join(", ")}.` });
    }
    if (user.id === req.user.id && req.body.role !== "admin") {
      return res.status(400).json({ message: "You cannot remove your own admin role." });
    }
    updates.role = req.body.role;
  }
  if (req.body?.password) {
    if (String(req.body.password).length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }
    updates.passwordHash = await hashPassword(req.body.password);
  }

  await user.update(updates);
  res.json(sanitizeUser(user));
});

app.get("/api/voice/twilio/status", requireAuth, async (_req, res) => {
  const base = {
    phoneNumber: toE164(process.env.TWILIO_PHONE_NUMBER) || null,
    webhookUrl: process.env.TWILIO_WEBHOOK_URL || null,
    testToNumber: toE164(process.env.TWILIO_TEST_TO_NUMBER) || null,
  };

  if (!twilioClient) {
    return res.json({
      ...base,
      configured: false,
      error: "Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to the .env file.",
    });
  }

  try {
    await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    res.json({ ...base, configured: true });
  } catch (error) {
    res.json({
      ...base,
      configured: false,
      error: `Twilio rejected the credentials: ${error.message}`,
    });
  }
});

async function generateAiGreeting(from) {
  const fallback = `Thank you for calling. I am the AI receptionist.`;

  if (!openaiClient) {
    return fallback;
  }

  try {
    const completion = await openaiClient.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            process.env.OPENAI_SYSTEM_PROMPT ||
            "You are a calm clinic receptionist. Be warm, brief, and helpful.",
        },
        {
          role: "user",
          content: `Write a friendly 1-sentence clinic receptionist greeting for a caller from ${from}. Mention we can help with appointments, questions, or urgent concerns. Do not ask any questions.`,
        },
      ],
    });

    return completion.output_text?.trim() || fallback;
  } catch (error) {
    console.warn("OpenAI greeting generation failed:", error.message);
    return fallback;
  }
}

app.get("/api/receptionist/questions", requireAuth, async (_req, res) => {
  receptionistQuestions = await readReceptionistQuestions();
  res.json(receptionistQuestions);
});

app.post("/api/receptionist/questions", requireAuth, async (req, res) => {
  const incoming = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.questions)
      ? req.body.questions
      : [];

  try {
    receptionistQuestions = await saveReceptionistQuestions(incoming);
    res.json(receptionistQuestions);
  } catch (error) {
    res
      .status(400)
      .json({
        message: error.message || "Invalid receptionist question list.",
      });
  }
});

app.post("/api/voice/twilio/incoming", async (req, res) => {
  const from = req.body?.From || "Unknown caller";
  const callId = req.body?.CallSid || `call-${Date.now()}`;
  const questions = Array.isArray(req.body?.questions)
    ? req.body.questions
    : receptionistQuestions;
  const settings = await readReceptionistSettings();

  res.type("text/xml");

  if (!settings.enabled) {
    const message =
      "Thank you for calling. Our AI receptionist is currently unavailable. Please try again later.";
    await insertInboundCall({
      id: callId,
      from,
      outcome: "Unavailable",
      kind: "missed",
      message,
      summary:
        "Call received while the AI receptionist was disabled. No conversation was captured.",
    });
    return res.send(buildClosingTwiml(message));
  }

  if (!isWithinBusinessHours(settings, new Date())) {
    const message = `Thank you for calling. Our clinics are currently closed. Business hours are Monday to Friday, ${settings.hoursStart} to ${settings.hoursEnd}. Please call back during business hours.`;
    await insertInboundCall({
      id: callId,
      from,
      outcome: "After hours",
      kind: "missed",
      message,
      summary:
        "Call received outside business hours. No conversation was captured.",
    });
    return res.send(buildClosingTwiml(message));
  }

  const message = await generateAiGreeting(from);
  await insertInboundCall({
    id: callId,
    from,
    outcome: "Intake in progress",
    kind: "handled",
    message,
    summary:
      "Incoming call answered by the AI receptionist. The AI is collecting intake details.",
    summaryGeneratedBy: "in_progress",
  });

  const steps = buildIntakeSteps(settings, questions);
  const baseUrl = publicBaseUrl(req);
  const consentPrompt = `${message} ${steps[0].prompt}`;
  const session = {
    from,
    startedAt: Date.now(),
    steps,
    answers: {},
    customAnswers: [],
    transcript: [["AI receptionist", consentPrompt]],
    record: settings.recordingEnabled,
    recordingCallbackUrl: `${baseUrl}/api/voice/twilio/recording-status`,
    baseUrl,
  };
  intakeSessions.set(callId, session);
  await saveCallProgress(callId, session);
  res.send(buildIntakeTwiml(consentPrompt, { ...session, step: 0, retry: 0 }));
});

app.post("/api/voice/twilio/intake", async (req, res) => {
  const callId = req.body?.CallSid;
  const session = intakeSessions.get(callId);
  res.type("text/xml");

  if (!session) {
    return res.send(
      buildClosingTwiml(
        "Sorry, we lost track of this call. Please call back and we will be glad to help.",
      ),
    );
  }

  const step = Number(req.query.step) || 0;
  const retry = Number(req.query.retry) || 0;
  const isConfirmStep = step >= session.steps.length;
  const current = isConfirmStep ? null : session.steps[step];
  const prompt = isConfirmStep ? buildRecapPrompt(session) : current.prompt;
  const speech = String(req.body?.SpeechResult || "").trim();

  if (!speech && retry < INTAKE_MAX_RETRIES) {
    return res.send(
      buildIntakeTwiml(prompt, { ...session, step, retry: retry + 1 }),
    );
  }

  if (speech) {
    session.transcript.push(["Caller", speech]);
  }

  if (isConfirmStep) {
    const confirmed = isAffirmative(speech);
    intakeSessions.delete(callId);
    await finalizeAiCall(callId, session, {
      confirmed,
      saveIntake: true,
      outcome: "Intake captured",
    });
    return res.send(
      buildClosingTwiml(
        confirmed
          ? "Thank you. Your details have been sent to our care team, and they will be in touch. Goodbye."
          : "Thank you. Our care team will review your details and call you back to confirm them. Goodbye.",
      ),
    );
  }

  if (current.key === "consent") {
    if (!speech || /\b(no|nope|don't|do not)\b/i.test(speech)) {
      intakeSessions.delete(callId);
      await finalizeAiCall(callId, session, {
        saveIntake: false,
        outcome: "Intake declined",
      });
      return res.send(
        buildClosingTwiml(
          "No problem. Thank you for calling. Our care team can help you by phone during business hours.",
        ),
      );
    }
  } else if (current.key === "custom") {
    session.customAnswers.push({ question: current.prompt, answer: speech });
  } else if (speech) {
    session.answers[current.key] = speech;
  }

  const next = step + 1;
  const nextPrompt =
    next < session.steps.length
      ? session.steps[next].prompt
      : buildRecapPrompt(session);
  session.transcript.push(["AI receptionist", nextPrompt]);
  await saveCallProgress(callId, session);
  res.send(buildIntakeTwiml(nextPrompt, { ...session, step: next, retry: 0 }));
});

app.post("/api/voice/twilio/status", async (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body || {};

  if (CallStatus === "completed" && CallSid) {
    const session = intakeSessions.get(CallSid);
    if (session) {
      intakeSessions.delete(CallSid);
      await finalizeAiCall(CallSid, session, {
        saveIntake: Object.keys(session.answers).length > 0,
        outcome: "Call ended early",
        duration: CallDuration,
      });
    } else if (pgReady && CallDuration) {
      await Call.update(
        { duration: formatDuration(CallDuration) },
        { where: { id: CallSid } },
      );
    }
  }

  res.sendStatus(204);
});

app.post("/api/voice/twilio/recording-status", async (req, res) => {
  const { CallSid, RecordingUrl, RecordingStatus, RecordingDuration } =
    req.body || {};

  if (pgReady && CallSid && RecordingUrl && RecordingStatus === "completed") {
    await Call.update(
      {
        recordingUrl: `${RecordingUrl}.mp3`,
        duration: formatDuration(RecordingDuration),
      },
      { where: { id: CallSid } },
    );
  }

  res.sendStatus(204);
});

app.get("/api/receptionist/settings", requireAuth, async (_req, res) => {
  res.json(await readReceptionistSettings());
});

app.put("/api/receptionist/settings", requireAuth, async (req, res) => {
  let next;
  try {
    next = mergeSettingsPatch(await readReceptionistSettings(), req.body || {});
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  if (!pgReady) {
    return res
      .status(503)
      .json({ message: "PostgreSQL is not connected. Settings were not saved." });
  }

  try {
    await saveReceptionistSettings(next);
    res.json(next);
  } catch (error) {
    console.error("Could not save receptionist settings:", error.message);
    res.status(500).json({ message: "Could not save receptionist settings." });
  }
});

app.get("/api/receptionist/intake/latest", requireAuth, async (_req, res) => {
  if (!pgReady) {
    return res.json(null);
  }

  try {
    const row = await IntakeRecord.findOne({
      include: Patient,
      order: [["id", "DESC"]],
    });
    if (!row) {
      return res.json(null);
    }

    res.json({
      id: row.id,
      patientName: [row.Patient?.firstName, row.Patient?.lastName]
        .filter(Boolean)
        .join(" "),
      phoneNumber: row.contactPhone,
      reason: row.chiefComplaint,
      preferredTime: row.preferredAppointment,
      notes: row.additionalNotes,
      source: row.source,
      callId: row.callId,
      savedAt: new Date(row.createdAt).toISOString(),
    });
  } catch (error) {
    console.error("Could not read intake submissions:", error.message);
    res.status(500).json({ message: "Could not read intake submissions." });
  }
});

app.post("/api/receptionist/intake", requireAuth, async (req, res) => {
  let intake;
  try {
    intake = sanitizeIntake(req.body || {});
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }

  if (!pgReady) {
    return res
      .status(503)
      .json({ message: "PostgreSQL is not connected. The intake was not saved." });
  }

  try {
    await saveLiveIntake(
      null,
      {
        from: intake.phoneNumber,
        answers: {
          patientName: intake.patientName,
          phoneNumber: intake.phoneNumber,
          reason: intake.reason,
          preferredTime: intake.preferredTime,
        },
        customAnswers: [],
        notes: intake.notes,
      },
      null,
      "manual",
    );
    res.status(201).json({ ...intake, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Could not save intake submission:", error.message);
    res.status(500).json({ message: "Could not save the intake." });
  }
});

app.post("/api/voice/twilio/call", requireAuth, async (req, res) => {
  if (!twilioClient) {
    return res.status(400).json({
      message:
        "Twilio is not configured. Add the Twilio credentials to the .env file first.",
    });
  }

  const { to, message, questions } = req.body || {};
  const destination = toE164(to || process.env.TWILIO_TEST_TO_NUMBER);
  const from = toE164(process.env.TWILIO_PHONE_NUMBER);
  const configuredQuestions =
    Array.isArray(questions) && questions.length
      ? questions
      : receptionistQuestions;
  const questionPrompt = buildQuestionPromptList(configuredQuestions);
  const speechMessage = questionPrompt
    ? `${message || "Thank you for calling. A team member will assist you shortly."} The AI receptionist will ask: ${questionPrompt}.`
    : message ||
      "Thank you for calling. A team member will assist you shortly.";

  if (!destination || !from) {
    return res.status(400).json({
      message:
        "Set TWILIO_PHONE_NUMBER and TWILIO_TEST_TO_NUMBER in the .env file to place a test call.",
    });
  }

  try {
    const call = await twilioClient.calls.create({
      to: destination,
      from,
      twiml: `<Response><Say voice="alice">${speechMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Say><Pause length="1" /><Say voice="alice">You are now being connected to our clinic care team.</Say></Response>`,
    });

    res.status(201).json({
      ok: true,
      sid: call.sid,
      status: call.status,
      to: destination,
      from,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
      details: error.code ? { code: error.code } : undefined,
    });
  }
});

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) {
    return "—";
  }
  const minutes = Math.floor(total / 60);
  const remaining = Math.floor(total % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function optionalText(value, name, max) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new Error(`${name} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new Error(`${name} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function mergeSettingsPatch(current, body) {
  const next = { ...current };

  for (const field of ["enabled", "recordingEnabled", "open24Hours"]) {
    if (field in body) {
      if (typeof body[field] !== "boolean") {
        throw new Error(`${field} must be true or false.`);
      }
      next[field] = body[field];
    }
  }

  if ("hoursStart" in body || "hoursEnd" in body) {
    const start = "hoursStart" in body ? body.hoursStart : current.hoursStart;
    const end = "hoursEnd" in body ? body.hoursEnd : current.hoursEnd;
    if (typeof start !== "string" || !TIME_PATTERN.test(start)) {
      throw new Error("Business hours start must be a time such as 08:00.");
    }
    if (typeof end !== "string" || !TIME_PATTERN.test(end)) {
      throw new Error("Business hours end must be a time such as 17:00.");
    }
    if (start >= end) {
      throw new Error("Business hours must end after they start.");
    }
    next.hoursStart = start;
    next.hoursEnd = end;
  }

  if ("telephonyProvider" in body) {
    if (!["", "twilio", "other"].includes(body.telephonyProvider)) {
      throw new Error("Unknown telephony provider.");
    }
    next.telephonyProvider = body.telephonyProvider;
  }

  if ("speechProvider" in body) {
    const speech = optionalText(body.speechProvider, "Speech provider", 40);
    next.speechProvider = speech || "Not connected";
  }

  if ("mainLine" in body) {
    const line = optionalText(body.mainLine, "Main line", 32);
    if (!PHONE_PATTERN.test(line)) {
      throw new Error("Main line may only contain digits, spaces, +, ( ), - and '.'.");
    }
    next.mainLine = line;
  }

  if ("clinics" in body) {
    if (!Array.isArray(body.clinics)) {
      throw new Error("Clinics must be a list.");
    }
    const clinics = body.clinics
      .map((clinic) => optionalText(clinic, "Clinic name", 80))
      .filter(Boolean);
    if (clinics.length === 0 || clinics.length > 10) {
      throw new Error("Provide between 1 and 10 clinic names.");
    }
    next.clinics = clinics;
  }

  return next;
}

function sanitizeIntake(body) {
  if (body.consent !== true) {
    throw new Error("Confirm consent before saving the intake questionnaire.");
  }

  const reason = optionalText(body.reason, "Call reason", 160);
  if (!reason) {
    throw new Error("Call reason is required.");
  }

  return {
    patientName: optionalText(body.patientName, "Patient name", 120),
    phoneNumber: optionalText(body.phoneNumber, "Phone number", 40),
    reason,
    preferredTime: optionalText(body.preferredTime, "Preferred callback time", 40),
    notes: optionalText(body.notes, "Notes", 2000),
  };
}

async function readReceptionistSettings() {
  const row = pgReady ? await ReceptionistSetting.findByPk(1) : null;
  if (!row) {
    return { ...defaultSettings, clinics: [...defaultClinics] };
  }

  return {
    enabled: row.enabled,
    recordingEnabled: row.recordingEnabled,
    hoursStart: row.hoursStart,
    hoursEnd: row.hoursEnd,
    open24Hours: row.open24Hours,
    telephonyProvider: row.telephonyProvider,
    speechProvider: row.speechProvider,
    mainLine: row.mainLine,
    clinics: row.clinics,
  };
}

async function saveReceptionistSettings(settings) {
  await ReceptionistSetting.update(settings, { where: { id: 1 } });
}

function isWithinBusinessHours(settings, now) {
  if (settings.open24Hours) {
    return true;
  }

  const day = now.getDay();
  if (day === 0 || day === 6) {
    return false;
  }

  const toMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const current = now.getHours() * 60 + now.getMinutes();
  return (
    current >= toMinutes(settings.hoursStart) &&
    current < toMinutes(settings.hoursEnd)
  );
}

function buildRecapPrompt(session) {
  const { answers } = session;
  const details = [
    `Your name is ${answers.patientName || "not given"}.`,
    `Your phone number is ${answers.phoneNumber || session.from || "not given"}.`,
    answers.clinic ? `You would like to visit ${answers.clinic}.` : null,
    `The reason for your call is ${answers.reason || "not given"}.`,
    `You would prefer ${answers.preferredTime || "no particular time"}.`,
  ].filter(Boolean);
  return `Let me confirm the details. ${details.join(" ")} Is that correct? Please say yes or no.`;
}

function isAffirmative(speech) {
  if (!speech || /\b(no|nope|not|wrong|incorrect)\b/i.test(speech)) {
    return false;
  }
  return /\b(yes|yeah|yep|correct|right|that's right|sure|okay)\b/i.test(speech);
}

function confirmationLabel(confirmed) {
  if (confirmed === true) return "Yes";
  if (confirmed === false) return "No";
  return "Not asked";
}

function buildTemplateSummary(session, confirmed) {
  const { answers, customAnswers } = session;
  const lines = [
    `Caller: ${answers.patientName || "not given"} (${answers.phoneNumber || session.from || "no number"})`,
    `Reason: ${answers.reason || "not given"}`,
  ];
  if (answers.clinic) {
    lines.push(`Clinic: ${answers.clinic}`);
  }
  lines.push(`Preferred time: ${answers.preferredTime || "not given"}`);
  for (const { question, answer } of customAnswers) {
    lines.push(`${question} ${answer || "(no answer)"}`);
  }
  lines.push(`Confirmed by caller: ${confirmationLabel(confirmed)}`);
  lines.push("Follow-up: care team to review the intake details.");
  return lines.join("\n");
}

async function generateCallSummary(session, confirmed) {
  const template = buildTemplateSummary(session, confirmed);
  if (!openaiClient) {
    return { text: template, generatedBy: "template" };
  }

  const transcriptText = session.transcript
    .map(([speaker, text]) => `${speaker}: ${text}`)
    .join("\n");
  try {
    const completion = await openaiClient.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You summarize clinic receptionist phone calls for the care team. Write a short structured summary using these labelled lines: Caller, Reason, Clinic, Preferred time, Questionnaire, Confirmed by caller, Follow-up. Write 'not given' for unknown items. Do not give medical advice.",
        },
        {
          role: "user",
          content: `Collected answers: ${JSON.stringify({
            ...session.answers,
            customAnswers: session.customAnswers,
            confirmedByCaller: confirmationLabel(confirmed),
          })}\n\nTranscript:\n${transcriptText}`,
        },
      ],
    });
    const text = completion.output_text?.trim();
    return text
      ? { text, generatedBy: "openai" }
      : { text: template, generatedBy: "template" };
  } catch (error) {
    console.warn("OpenAI call summary failed:", error.message);
    return { text: template, generatedBy: "template" };
  }
}

async function upsertCallTranscript(callId, lines) {
  await CallTranscript.upsert({ callId, entries: lines });
}

async function upsertCallSummary(callId, summary, generatedBy) {
  await AiSummary.upsert({
    callId,
    summary,
    generatedBy,
    generatedAt: new Date(),
  });
}

async function saveCallProgress(callId, session) {
  if (!pgReady) {
    return;
  }

  await upsertCallTranscript(callId, session.transcript);
  await Call.update(
    {
      duration: formatDuration(
        Math.round((Date.now() - session.startedAt) / 1000),
      ),
    },
    { where: { id: callId } },
  );
}

async function finalizeAiCall(
  callId,
  session,
  { confirmed = null, saveIntake, outcome, duration },
) {
  if (!pgReady) {
    console.warn("PostgreSQL is not connected. The AI call was not saved.");
    return;
  }

  const { text, generatedBy } = await generateCallSummary(session, confirmed);
  if (saveIntake) {
    try {
      await saveLiveIntake(callId, session, confirmed);
    } catch (error) {
      console.warn("Could not save the intake to PostgreSQL:", error.message);
    }
  }
  await saveCallProgress(callId, session);
  const update = {
    reason: (session.answers.reason || "Reason not given on the call").slice(0, 160),
    outcome,
  };
  if (duration) {
    update.duration = formatDuration(duration);
  }
  await Call.update(update, { where: { id: callId } });
  await upsertCallSummary(callId, text, generatedBy);
}

async function insertInboundCall({
  id,
  from,
  outcome,
  kind,
  message,
  summary,
  summaryGeneratedBy = "system",
}) {
  if (!pgReady) {
    return;
  }

  const digits = String(from).replace(/\D/g, "");
  await Call.findOrCreate({
    where: { id },
    defaults: {
      caller: `Caller ··· ${digits.slice(-4) || "unknown"}`,
      clinic: "Not yet selected",
      reason: "General inquiry",
      outcome,
      kind,
      duration: "—",
      title: `Conversation transcript · ${id}`,
    },
  });
  await upsertCallTranscript(id, [["AI receptionist", message]]);
  await upsertCallSummary(id, summary, summaryGeneratedBy);
}

async function readOrders() {
  if (!pgReady) {
    return fallbackOrders;
  }

  const rows = await Order.findAll({ order: [["createdAt", "DESC"]] });
  return rows.map((row) => ({
    id: row.id,
    initials: row.initials,
    name: row.name,
    date: row.date,
    amount: row.amount,
    status: row.status,
  }));
}

async function readCalls() {
  if (!pgReady) {
    return fallbackCalls;
  }

  const [rows, transcripts, summaries] = await Promise.all([
    Call.findAll({ order: [["createdAt", "DESC"]] }),
    CallTranscript.findAll(),
    AiSummary.findAll(),
  ]);
  const entriesByCall = new Map(transcripts.map((t) => [t.callId, t.entries]));
  const summaryByCall = new Map(summaries.map((s) => [s.callId, s.summary]));
  return rows.map((row) => ({
    id: row.id,
    caller: row.caller,
    clinic: row.clinic,
    reason: row.reason,
    outcome: row.outcome,
    kind: row.kind,
    duration: row.duration,
    createdAt: row.createdAt,
    title: row.title,
    lines: entriesByCall.get(row.id) || [],
    summary: summaryByCall.get(row.id) || "",
    recordingUrl: row.recordingUrl || null,
  }));
}

async function readReceptionistQuestions() {
  return pgReady ? readQuestions() : receptionistQuestions;
}

async function saveReceptionistQuestions(nextQuestions) {
  const sanitizedQuestions = Array.isArray(nextQuestions)
    ? nextQuestions
        .filter(
          (question) => question && question.prompt && question.prompt.trim(),
        )
        .map((question, index) => ({
          id: question.id ?? index + 1,
          prompt: question.prompt.trim(),
          type: question.type || "text",
          required: Boolean(question.required),
        }))
    : [];

  if (!sanitizedQuestions.length) {
    throw new Error("At least one receptionist question is required.");
  }

  if (!pgReady) {
    receptionistQuestions = sanitizedQuestions;
    return receptionistQuestions;
  }

  receptionistQuestions = await writeQuestions(sanitizedQuestions);
  return receptionistQuestions;
}

app.get("/api/orders", requireAuth, async (_req, res) => {
  res.json(await readOrders());
});

app.get("/api/calls", requireAuth, async (_req, res) => {
  res.json(await readCalls());
});

app.post("/api/voice/calls/incoming", async (req, res) => {
  const payload = req.body || {};
  const call = {
    id: `call-${Date.now()}`,
    caller: payload.caller || "Caller ··· unknown",
    clinic: payload.clinic || "Downtown",
    reason: payload.reason || "General inquiry",
    outcome: payload.outcome || "Completed",
    kind: "handled",
    duration: payload.duration || "00:45",
    title: `Conversation transcript · ${payload.id || "Call request"}`,
    lines: [
      [
        "AI receptionist",
        payload.message ||
          "Thank you for calling. A clinic representative will be with you shortly.",
      ],
      ["Caller", payload.caller || "I need to speak with a team member."],
    ],
    summary:
      payload.summary ||
      "Incoming call accepted and routed to the clinic workflow.",
  };

  if (pgReady) {
    await Call.create({
      id: call.id,
      caller: call.caller,
      clinic: call.clinic,
      reason: call.reason,
      outcome: call.outcome,
      kind: call.kind,
      duration: call.duration,
      title: call.title,
    });
    await upsertCallTranscript(call.id, call.lines);
    await upsertCallSummary(call.id, call.summary, "system");
  }

  res.status(201).json(call);
});

app.post("/api/voice/calls/:callId/transfer", requireAuth, async (req, res) => {
  const { destination = "front-desk" } = req.body || {};
  res.json({
    ok: true,
    callId: req.params.callId,
    destination,
    status: "transferred",
  });
});

app.get("/api/voice/calls/:callId/transcript", requireAuth, async (req, res) => {
  const call = (await readCalls()).find(
    (entry) => entry.id === req.params.callId,
  );

  if (!call) {
    return res.status(404).json({ message: "Call not found." });
  }

  res.json(call);
});

// Serves the built React app in production; nginx/the reverse proxy forwards all
// non-API traffic here. Not used in local dev, where Vite serves the client directly.
if (IS_PRODUCTION) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

export { app, cloneIntakeState, normalizeSdpOffer };

if (process.env.NODE_ENV !== "test") {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Express API running on http://localhost:${PORT}`);
  });
}
