import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import OpenAI from "openai";
import twilio from "twilio";
import {
  AiSummary,
  Call,
  CallTranscript,
  IntakeRecord,
  Order,
  Patient,
  ReceptionistSetting,
  User,
  connectAndSync,
} from "./db.js";
import {
  readQuestions,
  saveLiveIntake,
  seedQuestions,
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
    await seedQuestions();
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
  return process.env.TWILIO_WEBHOOK_URL
    ? new URL(process.env.TWILIO_WEBHOOK_URL).origin
    : `${req.protocol}://${req.get("host")}`;
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

export { app };

if (process.env.NODE_ENV !== "test") {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Express API running on http://localhost:${PORT}`);
  });
}
