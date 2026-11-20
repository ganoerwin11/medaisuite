import {
  AiSummary,
  IntakeRecord,
  Patient,
  Question,
  QuestionnaireAnswer,
  phoneMatch,
  sequelize,
} from "./db.js";
import { buildSummary } from "./callFlow.js";

const text = (session, code) => session.answers[code]?.text || "";

function classifyPriority(answers) {
  const severity = answers.B06?.value ?? 0;
  const pain = answers.E02?.value ?? 0;
  if (severity >= 8 || pain >= 8) return "Urgent";
  if (answers.D04?.value === "yes" || answers.D05?.value === "yes" || answers.E05?.value === "Getting worse") {
    return "Soon";
  }
  return "Routine";
}

const toClient = (q) => ({
  id: q.id,
  code: q.code,
  section: q.section,
  prompt: q.prompt,
  type: q.type,
  required: q.required,
  options: q.options,
  showIf: q.showIf,
});

export async function readQuestions() {
  const rows = await Question.findAll({
    where: { active: true },
    order: [["sortOrder", "ASC"], ["id", "ASC"]],
  });
  return rows.map(toClient);
}

// Syncs the Question Setup page list to the database; removed questions are deactivated, not deleted.
export async function writeQuestions(items) {
  await sequelize.transaction(async (transaction) => {
    const existing = new Map((await Question.findAll({ transaction })).map((q) => [q.id, q]));
    const keep = new Set();
    for (const [index, item] of items.entries()) {
      const fields = {
        prompt: item.prompt,
        type: item.type || "text",
        required: Boolean(item.required),
        sortOrder: index + 1,
        active: true,
      };
      const row = existing.get(Number(item.id));
      if (row) {
        await row.update(fields, { transaction });
        keep.add(row.id);
      } else {
        const created = await Question.create(
          { ...fields, section: item.section || null, options: item.options || null, showIf: item.showIf || null },
          { transaction },
        );
        keep.add(created.id);
      }
    }
    for (const [id, row] of existing) {
      if (!keep.has(id) && row.active) await row.update({ active: false }, { transaction });
    }
  });
  return readQuestions();
}

async function findOrCreatePatient(session, transaction) {
  const phone = text(session, "A05") || session.from || "";
  const phoneKey = phoneMatch(phone);
  const fields = {
    firstName: text(session, "A02"),
    lastName: text(session, "A03"),
    dateOfBirth: text(session, "A04"),
    phone,
    phoneKey,
    email: text(session, "A06"),
    address: text(session, "A07"),
    preferredLanguage: text(session, "A08"),
    patientType: session.answers.A01?.value || "New patient",
  };

  const existing = phoneKey
    ? await Patient.findOne({ where: { phoneKey }, transaction })
    : null;
  if (existing) {
    const updates = Object.fromEntries(
      Object.entries(fields).filter(([key, value]) => value && key !== "patientType"),
    );
    await existing.update(updates, { transaction });
    return existing;
  }
  return Patient.create(fields, { transaction });
}

// Adapts the live phone intake session (server.js) to the questionnaire session shape.
export function saveLiveIntake(callId, session, confirmed, source = "ai_call") {
  const { answers, customAnswers = [], from } = session;
  const [first = "", ...rest] = String(answers.patientName || "").trim().split(/\s+/);
  const entry = (value) => (value ? { text: value, value: null } : undefined);
  const mapped = {
    A02: entry(first),
    A03: entry(rest.join(" ")),
    A05: entry(answers.phoneNumber),
    B02: entry(answers.reason),
    F03: entry(answers.preferredTime),
  };
  const notes = [
    answers.clinic ? `Clinic requested: ${answers.clinic}` : "",
    ...customAnswers.map(({ question, answer }) => `${question} ${answer || "(no answer)"}`),
  ].filter(Boolean);

  return saveQuestionnaire({
    callId,
    from,
    dataConsent: true,
    confirmed,
    answers: Object.fromEntries(Object.entries(mapped).filter(([, v]) => v)),
    source,
    extraNotes: [...notes, session.notes].filter(Boolean).join("\n"),
    custom: customAnswers.map(({ question, answer }) => ({ question, answer })),
    skipped: [],
    appointment: null,
    appointmentDone: false,
  });
}

// Saves the caller's questionnaire answers, intake record and summary in one transaction.
export async function saveQuestionnaire(session) {
  if (!session.dataConsent) return null;

  const questions = await readQuestions();
  const answered = questions.filter((q) => session.answers[q.code]);
  if (answered.length === 0) return null;

  const summary = buildSummary(session);
  const priority = classifyPriority(session.answers);
  const answeredAt = new Date();

  return sequelize.transaction(async (transaction) => {
    const patient = await findOrCreatePatient(session, transaction);

    const intake = await IntakeRecord.create(
      {
        patientId: patient.id,
        callId: session.callId || null,
        source: session.source || "ai_call",
        contactPhone: session.from || text(session, "A05"),
        visitType: text(session, "B01"),
        chiefComplaint: text(session, "B02"),
        symptoms: text(session, "B03"),
        symptomOnset: text(session, "B04").slice(0, 200),
        symptomSeverity: session.answers.B06?.value ?? null,
        preferredDoctor: text(session, "F02"),
        preferredAppointment: [text(session, "F03"), text(session, "F04")]
          .filter(Boolean)
          .join(", ")
          .slice(0, 200),
        additionalNotes: [text(session, "G01"), text(session, "G04"), session.extraNotes]
          .filter(Boolean)
          .join("\n"),
        priority,
        intakeStatus: session.confirmed === false ? "Needs review" : "Completed",
        confirmedByCaller: session.confirmed,
      },
      { transaction },
    );

    await QuestionnaireAnswer.bulkCreate(
      answered.map((q) => ({
        intakeId: intake.id,
        callId: session.callId || null,
        questionCode: q.code,
        question: q.prompt,
        answer: session.answers[q.code],
        answeredAt,
        verified: session.confirmed === true,
      })),
      { transaction },
    );

    if (session.callId) {
      await AiSummary.upsert(
        {
          callId: session.callId,
          structured: summary.structured,
          summary: summary.text,
          priority,
          generatedBy: "system",
          generatedAt: answeredAt,
        },
        { transaction },
      );
    }

    return intake;
  });
}
