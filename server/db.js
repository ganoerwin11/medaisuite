import { DataTypes, Op, Sequelize } from "sequelize";

const DB_NAME = process.env.DB_NAME || "medai_suite";
const dbOptions = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  dialect: "postgres",
  logging: false,
};

export const sequelize = new Sequelize(DB_NAME, null, null, {
  ...dbOptions,
  define: { underscored: true, timestamps: true },
});

const money = { type: DataTypes.STRING(20), allowNull: false };

export const Order = sequelize.define(
  "Order",
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    initials: { type: DataTypes.STRING(8), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    date: { type: DataTypes.STRING(80), allowNull: false },
    amount: money,
    status: { type: DataTypes.STRING(32), allowNull: false },
  },
  { tableName: "orders" },
);

export const ReceptionistSetting = sequelize.define(
  "ReceptionistSetting",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recordingEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    hoursStart: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: "08:00",
    },
    hoursEnd: {
      type: DataTypes.STRING(5),
      allowNull: false,
      defaultValue: "17:00",
    },
    open24Hours: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    telephonyProvider: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "",
    },
    speechProvider: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "Not connected",
    },
    mainLine: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "" },
    clinics: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  { tableName: "receptionist_settings" },
);

export const Question = sequelize.define(
  "Question",
  {
    code: { type: DataTypes.STRING(8), allowNull: true, unique: true },
    section: { type: DataTypes.STRING(80), allowNull: true },
    prompt: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "text" },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    options: { type: DataTypes.JSONB, allowNull: true },
    showIf: { type: DataTypes.JSONB, allowNull: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: "questionnaire_questions" },
);

export const Call = sequelize.define(
  "Call",
  {
    id: { type: DataTypes.STRING(64), primaryKey: true },
    caller: { type: DataTypes.STRING(120), allowNull: false },
    clinic: { type: DataTypes.STRING(80), allowNull: false },
    reason: { type: DataTypes.STRING(160), allowNull: false },
    outcome: { type: DataTypes.STRING(40), allowNull: false },
    kind: { type: DataTypes.STRING(40), allowNull: false },
    duration: { type: DataTypes.STRING(20), allowNull: false },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    recordingUrl: { type: DataTypes.TEXT, allowNull: true },
    recordingConsent: { type: DataTypes.BOOLEAN, allowNull: true },
    dataConsent: { type: DataTypes.BOOLEAN, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "calls" },
);

export const CallTranscript = sequelize.define(
  "CallTranscript",
  {
    callId: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    entries: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  { tableName: "call_transcripts" },
);

export const Patient = sequelize.define(
  "Patient",
  {
    patientNumber: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    firstName: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    lastName: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    dateOfBirth: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "" },
    phone: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "" },
    phoneKey: { type: DataTypes.STRING(10), allowNull: true, index: true },
    email: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
    address: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    preferredLanguage: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: "",
    },
    patientType: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "New patient",
    },
  },
  { tableName: "patients" },
);

export const IntakeRecord = sequelize.define(
  "IntakeRecord",
  {
    callId: { type: DataTypes.STRING(64), allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "manual" },
    contactPhone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "" },
    visitType: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    chiefComplaint: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    symptoms: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    symptomOnset: { type: DataTypes.STRING(200), allowNull: false, defaultValue: "" },
    symptomSeverity: { type: DataTypes.INTEGER, allowNull: true },
    preferredDoctor: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "" },
    preferredAppointment: {
      type: DataTypes.STRING(200),
      allowNull: false,
      defaultValue: "",
    },
    additionalNotes: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Routine" },
    intakeStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "Completed",
    },
    confirmedByCaller: { type: DataTypes.BOOLEAN, allowNull: true },
  },
  { tableName: "intake_records" },
);

export const QuestionnaireAnswer = sequelize.define(
  "QuestionnaireAnswer",
  {
    callId: { type: DataTypes.STRING(64), allowNull: true },
    questionCode: { type: DataTypes.STRING(16), allowNull: false },
    question: { type: DataTypes.TEXT, allowNull: false },
    answer: { type: DataTypes.JSONB, allowNull: false },
    answeredAt: { type: DataTypes.DATE, allowNull: false },
    verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { tableName: "questionnaire_answers" },
);

export const AiSummary = sequelize.define(
  "AiSummary",
  {
    callId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    structured: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    summary: { type: DataTypes.TEXT, allowNull: false },
    priority: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Routine" },
    generatedBy: { type: DataTypes.STRING(20), allowNull: false },
    generatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: "ai_summaries" },
);

export const User = sequelize.define(
  "User",
  {
    fullName: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(160), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(120), allowNull: false },
    role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "staff" },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "users" },
);

export const Provider = sequelize.define(
  "Provider",
  {
    name: { type: DataTypes.STRING(120), allowNull: false },
    specialty: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  },
  { tableName: "providers" },
);

export const AvailabilitySlot = sequelize.define(
  "AvailabilitySlot",
  {
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: false },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "open" },
  },
  { tableName: "availability_slots" },
);

export const Appointment = sequelize.define(
  "Appointment",
  {
    callId: { type: DataTypes.STRING(64), allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    visitType: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "" },
    requestedTime: { type: DataTypes.STRING(200), allowNull: false, defaultValue: "" },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Requested" },
  },
  { tableName: "appointments" },
);

Patient.hasMany(IntakeRecord, { foreignKey: "patientId" });
IntakeRecord.belongsTo(Patient, { foreignKey: "patientId" });
IntakeRecord.hasMany(QuestionnaireAnswer, { foreignKey: "intakeId" });
QuestionnaireAnswer.belongsTo(IntakeRecord, { foreignKey: "intakeId" });
Patient.hasMany(Appointment, { foreignKey: "patientId" });
Appointment.belongsTo(Patient, { foreignKey: "patientId" });
Provider.hasMany(AvailabilitySlot, { foreignKey: "providerId" });
AvailabilitySlot.belongsTo(Provider, { foreignKey: "providerId" });
Provider.hasMany(Appointment, { foreignKey: "providerId" });
Appointment.belongsTo(Provider, { foreignKey: "providerId" });
AvailabilitySlot.hasOne(Appointment, { foreignKey: "slotId" });
Appointment.belongsTo(AvailabilitySlot, { foreignKey: "slotId" });
Call.belongsTo(Patient, { foreignKey: "patientId" });

async function ensureDatabaseExists() {
  const admin = new Sequelize("postgres", null, null, {
    ...dbOptions,
    logging: false,
  });
  try {
    const [rows] = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = :name",
      { replacements: { name: DB_NAME } },
    );
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${DB_NAME}"`);
    }
  } finally {
    await admin.close();
  }
}

export async function connectAndSync() {
  await ensureDatabaseExists();
  await sequelize.authenticate();
  await sequelize.sync();
}

export function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function phoneMatch(value) {
  const digits = phoneDigits(value);
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export { Op };
