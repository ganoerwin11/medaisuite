import {
  APPOINTMENT_SECTION,
  QUESTIONNAIRE,
  classifyPriority,
  isVisible,
  normalizeAnswer,
  parseYesNo,
} from "./questionnaire.js";

export const MAX_RETRIES = 2;

export const CLOSING_COMPLETE =
  "Thank you for contacting our clinic. Your information has been recorded and will be made available to our medical team for review. Our staff will follow up with you regarding your request. Have a good day!";
export const CLOSING_NOT_CONFIRMED =
  "Thank you. Our care team will review your details and call you back to correct anything that is wrong. Have a good day!";
export const CLOSING_DECLINED =
  "No problem. Thank you for calling. Our care team can help you by phone during business hours. Have a good day!";

export function createCallSession({ callId, from, recordingEnabled, customQuestions = [] }) {
  return {
    callId,
    from,
    startedAt: Date.now(),
    recordingEnabled,
    recordingConsent: null,
    startRecording: false,
    recordingStarted: false,
    dataConsent: null,
    answers: {},
    skipped: [],
    custom: [],
    customQuestions,
    customIndex: 0,
    offers: [],
    appointmentDone: false,
    appointment: null,
    confirmed: null,
    extraNotes: "",
    declined: false,
    pending: null,
    retries: 0,
    transcript: [],
  };
}

export function wantsAppointment(session) {
  return session.answers.F01?.value === "yes";
}

// Decides what to ask next, following the spec's branching rules.
export function nextStep(session) {
  for (const question of QUESTIONNAIRE) {
    if (session.answers[question.code] || session.skipped.includes(question.code)) continue;
    if (!isVisible(question, session.answers)) continue;
    if (question.section !== APPOINTMENT_SECTION && wantsAppointment(session) && !session.appointmentDone) {
      return { kind: "slotOffer" };
    }
    return { kind: "question", question };
  }

  if (wantsAppointment(session) && !session.appointmentDone) {
    return { kind: "slotOffer" };
  }
  if (session.customIndex < session.customQuestions.length) {
    return { kind: "custom", question: session.customQuestions[session.customIndex] };
  }
  return { kind: "recap" };
}

function answerOrNull(session, key) {
  return session.answers[key]?.text || null;
}

export function buildRecapPrompt(session) {
  const concern = answerOrNull(session, "B02") || "not given";
  const symptoms = answerOrNull(session, "B03") || "not given";
  const date = answerOrNull(session, "F03");
  const dateLine = date ? ` Your preferred appointment date is ${date}.` : "";
  return `Let me confirm the information you've provided. Your primary concern is ${concern}. Your reported symptoms are ${symptoms}.${dateLine} Is all the information correct? Please say yes or no.`;
}

// Records the prompt the caller is answering and returns the text to say.
export function promptFor(session, step) {
  session.pending = step;
  if (step.kind === "question") return step.question.prompt;
  if (step.kind === "custom") return step.question.prompt;
  if (step.kind === "recap") return buildRecapPrompt(session);
  if (step.kind === "extra") return "Is there anything else you would like to add?";
  if (step.kind === "recordingConsent") {
    return "This call may be recorded for quality and care coordination. Do you agree to the recording? Please say yes or no.";
  }
  if (step.kind === "dataConsent") {
    return "I would like to collect a few details to share with our medical team. Do you agree to us saving this information? Please say yes or no.";
  }
  throw new Error(`Unknown step ${step.kind}`);
}

function attempt(session, value) {
  if (value !== null && value !== undefined) {
    session.retries = 0;
    return { value };
  }
  if (session.retries < MAX_RETRIES) {
    session.retries += 1;
    return { retry: true };
  }
  session.retries = 0;
  return { value: null };
}

// Applies the caller's reply to the pending step.
// Returns { retry } to repeat the prompt, { declined } to end without intake, or { next }.
export function applyReply(session, speech) {
  const text = String(speech || "").trim();
  const pending = session.pending;
  if (text) session.transcript.push(["Caller", text]);

  switch (pending.kind) {
    case "recordingConsent": {
      const result = attempt(session, parseYesNo(text));
      if (result.retry) return { retry: true };
      session.recordingConsent = result.value === "yes";
      session.startRecording = session.recordingConsent;
      return { next: true };
    }
    case "dataConsent": {
      const result = attempt(session, parseYesNo(text));
      if (result.retry) return { retry: true };
      session.dataConsent = result.value === "yes";
      if (!session.dataConsent) {
        session.declined = true;
        return { declined: true };
      }
      return { next: true };
    }
    case "question": {
      const answer = normalizeAnswer(pending.question, text);
      if (!answer) {
        if (session.retries < MAX_RETRIES) {
          session.retries += 1;
          return { retry: true };
        }
        session.retries = 0;
        session.skipped.push(pending.question.code);
        return { next: true };
      }
      session.retries = 0;
      session.answers[pending.question.code] = answer;
      return { next: true };
    }
    case "custom": {
      const answer = normalizeAnswer(pending.question, text);
      if (!answer) {
        if (session.retries < MAX_RETRIES) {
          session.retries += 1;
          return { retry: true };
        }
        session.retries = 0;
      }
      session.retries = 0;
      session.custom.push({ question: pending.question.prompt, answer: answer?.text || "" });
      session.customIndex += 1;
      return { next: true };
    }
    case "slotOffer": {
      const choice = parseOptionChoice(text, session.offers.length);
      if (choice === null) {
        if (session.retries < MAX_RETRIES) {
          session.retries += 1;
          return { retry: true };
        }
        session.retries = 0;
        return { none: true };
      }
      session.retries = 0;
      if (choice === "none") return { none: true };
      return { book: session.offers[choice - 1] };
    }
    case "recap": {
      const result = attempt(session, parseYesNo(text));
      if (result.retry) return { retry: true };
      session.confirmed = result.value === "yes";
      return { next: true };
    }
    case "extra": {
      session.extraNotes = text;
      return { done: true };
    }
    default:
      throw new Error(`Unknown step ${pending.kind}`);
  }
}

const NUMBER_WORDS = {
  1: 1, one: 1, first: 1,
  2: 2, two: 2, second: 2,
  3: 3, three: 3, third: 3,
};

// Returns 1-based option index, "none", or null when the reply is unclear.
export function parseOptionChoice(text, count) {
  const lower = String(text || "").toLowerCase();
  if (/\b(none|neither|no|later|not really|don't|do not)\b/.test(lower)) return "none";
  for (const word of lower.match(/[a-z0-9]+/g) || []) {
    const index = NUMBER_WORDS[word];
    if (index && index <= count) return index;
  }
  return null;
}

export function buildSummary(session) {
  const a = session.answers;
  const val = (code) => a[code]?.text || "not given";
  const list = (codes) =>
    codes.map((code) => a[code]?.text).filter(Boolean).join("; ") || "not given";
  const name = [a.A02?.text, a.A03?.text].filter(Boolean).join(" ") || "not given";
  const phone = a.A05?.text || session.from || "no number";
  const priority = classifyPriority(a);

  const flags = [];
  if (a.D04?.value === "yes" || a.D05?.value === "yes") {
    flags.push(`Allergy reported${a.D06 ? `: ${a.D06.text}` : " (reaction not given)"}. Flag for clinical staff.`);
  }
  if ((a.B06?.value ?? 0) >= 8 || (a.E02?.value ?? 0) >= 8) {
    flags.push("Severity or pain reported at 8/10 or higher.");
  }
  if (a.E05?.value === "Getting worse") flags.push("Symptoms reported as getting worse.");

  const appointment = session.appointment
    ? session.appointment.status === "Booked"
      ? `Booked: ${session.appointment.label}`
      : `Requested: ${val("F03")}, ${val("F04")}. Staff to confirm.`
    : wantsAppointment(session) ? "Not booked." : "No appointment requested.";

  const sections = [
    ["Priority", priority],
    ["Caller", `${name} (${phone})`],
    ["Patient", `${val("A01")}; date of birth ${val("A04")}; language ${val("A08")}; address ${val("A07")}`],
    ["Visit", `${val("B01")}. Main concern: ${val("B02")}`],
    ["Symptoms", `${val("B03")}. Onset ${val("B04")}; ${val("B05")}; severity ${val("B06")}/10; frequency ${val("B07")}`],
    ["Treatment and diagnosis", `${val("B08")}. Previously diagnosed: ${val("B09")}`],
    ["Medical history", `Conditions: ${val("C01")}. Past illness: ${val("C02")}. Surgeries: ${val("C03")}. Hospitalized: ${val("C04")}. Family history: ${val("C05")}. Current care: ${val("C06")}`],
    ["Medications and allergies", `Medications: ${val("D01")}${a.D02 ? ` (${a.D02.text})` : ""}. Allergies to medicine: ${val("D04")}. Other allergies: ${val("D05")}${a.D06 ? ` (${a.D06.text})` : ""}. Supplements: ${val("D07")}`],
    ["Current symptoms", a.E01 ? `${a.E01.text}; pain ${val("E02")}/10; ${val("E03")}; other symptoms: ${val("E04")}; ${val("E05")}; affects daily life: ${val("E06")}` : "not asked"],
    ["Appointment", appointment],
    ["Insurance", `${val("F06")}${a.F07 ? ` (${a.F07.text})` : ""}`],
    ["Other information", list(["G01", "G02", "G04"]) + (session.extraNotes ? `; caller added: ${session.extraNotes}` : "")],
    ["Preferred updates", val("G03")],
    ["Confirmed by caller", session.confirmed === null ? "not asked" : session.confirmed ? "Yes" : "No"],
    ["Flags", flags.length ? flags.join(" ") : "None"],
  ];

  const custom = session.custom.map(({ question, answer }) => `${question} ${answer || "(no answer)"}`);
  const text = [
    "Patient-reported information, not verified. This summary is for intake only and is not a diagnosis or medical advice.",
    ...sections.map(([label, value]) => `${label}: ${value}`),
    ...custom,
  ].join("\n");

  const structured = Object.fromEntries(
    sections.map(([label, value]) => [label.toLowerCase().replace(/[^a-z]+/g, "_"), value]),
  );
  structured.flags = flags;
  structured.custom = session.custom;

  return { priority, flags, text, structured };
}
