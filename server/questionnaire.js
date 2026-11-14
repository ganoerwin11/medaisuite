const BOOL_TRUE = /\b(yes|yeah|yep|yup|sure|correct|absolutely|i do|i have|i am|okay|ok)\b/i;
const BOOL_FALSE = /\b(no|nope|nah|none|never|not|don't|dont|do not)\b/i;

export const VISIT_TYPES = [
  "General consultation",
  "Follow-up consultation",
  "Annual physical examination",
  "Laboratory test",
  "Medical certificate",
  "Prescription-related inquiry",
  "Specialist consultation",
  "Other",
];

// Question definitions follow the intake questionnaire sections A-G.
// showIf is evaluated against earlier answers: { code, is } | { code, answered } | { anyOf: [...] }.
export const QUESTIONNAIRE = [
  { code: "A01", section: "Patient Information", type: "choice", required: true, prompt: "Are you a new patient or have you visited our clinic before?", options: ["New patient", "Returning patient"] },
  { code: "A02", section: "Patient Information", type: "text", required: true, prompt: "May I have your first name, please?" },
  { code: "A03", section: "Patient Information", type: "text", required: true, prompt: "And your last name?" },
  { code: "A04", section: "Patient Information", type: "date", required: true, prompt: "What is your date of birth?" },
  { code: "A05", section: "Patient Information", type: "tel", required: true, prompt: "What is the best phone number to reach you?" },
  { code: "A06", section: "Patient Information", type: "text", required: false, prompt: "Could you provide your email address, if available?" },
  { code: "A07", section: "Patient Information", type: "text", required: true, prompt: "What is your current city or address?" },
  { code: "A08", section: "Patient Information", type: "text", required: true, prompt: "What language would you prefer to use when communicating with our clinic?" },
  { code: "A09", section: "Patient Information", type: "yesno", required: true, prompt: "Have you visited another clinic for this concern?", showIf: { code: "A01", is: "New patient" } },
  { code: "A10", section: "Patient Information", type: "yesno", required: true, prompt: "Have you visited our clinic for the same concern before?", showIf: { code: "A01", is: "Returning patient" } },

  { code: "B01", section: "Reason for Consultation", type: "choice", required: true, prompt: "What brings you to our clinic today?", options: VISIT_TYPES },
  { code: "B02", section: "Reason for Consultation", type: "text", required: true, prompt: "Could you describe the main health concern you are experiencing?" },
  { code: "B03", section: "Reason for Consultation", type: "text", required: true, prompt: "What symptoms are you currently experiencing?" },
  { code: "B04", section: "Reason for Consultation", type: "text", required: true, prompt: "When did these symptoms first begin?" },
  { code: "B05", section: "Reason for Consultation", type: "text", required: true, prompt: "Have the symptoms been continuous, or do they come and go?" },
  { code: "B06", section: "Reason for Consultation", type: "scale", required: true, prompt: "On a scale of 1 to 10, how severe would you say the symptoms are?" },
  { code: "B07", section: "Reason for Consultation", type: "text", required: true, prompt: "How often do you experience these symptoms?" },
  { code: "B08", section: "Reason for Consultation", type: "text", required: true, prompt: "Have you taken any medication or received treatment for this concern?" },
  { code: "B09", section: "Reason for Consultation", type: "yesno", required: true, prompt: "Have you previously been diagnosed with this condition?" },

  { code: "C01", section: "Medical History", type: "text", required: true, prompt: "Have you been diagnosed with any existing medical conditions? Please describe them in your own words." },
  { code: "C02", section: "Medical History", type: "text", required: true, prompt: "Have you had any major illnesses or medical conditions in the past?" },
  { code: "C03", section: "Medical History", type: "text", required: true, prompt: "Have you undergone any surgeries or major medical procedures?" },
  { code: "C04", section: "Medical History", type: "yesno", required: true, prompt: "Have you been hospitalized before?" },
  { code: "C05", section: "Medical History", type: "text", required: true, prompt: "Is there any significant family history of medical conditions?" },
  { code: "C06", section: "Medical History", type: "text", required: true, prompt: "Are you currently receiving treatment from another healthcare provider?" },

  { code: "D01", section: "Medications and Allergies", type: "yesno", required: true, prompt: "Are you currently taking any medications?" },
  { code: "D02", section: "Medications and Allergies", type: "text", required: true, prompt: "Could you tell me the names of those medications, if you know them?", showIf: { code: "D01", is: "yes" } },
  { code: "D03", section: "Medications and Allergies", type: "text", required: true, prompt: "Do you know the dosage and how often you take them?", showIf: { code: "D01", is: "yes" } },
  { code: "D04", section: "Medications and Allergies", type: "yesno", required: true, prompt: "Do you have any known allergies to medications?" },
  { code: "D05", section: "Medications and Allergies", type: "yesno", required: true, prompt: "Are you allergic to any foods, latex, or other substances?" },
  { code: "D06", section: "Medications and Allergies", type: "text", required: true, prompt: "What kind of reaction do you experience when exposed to the allergen?", showIf: { anyOf: [{ code: "D04", is: "yes" }, { code: "D05", is: "yes" }] } },
  { code: "D07", section: "Medications and Allergies", type: "text", required: true, prompt: "Are you currently taking vitamins or supplements?" },

  { code: "E01", section: "Current Symptoms", type: "text", required: true, prompt: "Where exactly are you experiencing pain or discomfort?", showIf: { code: "B03", answered: true } },
  { code: "E02", section: "Current Symptoms", type: "scale", required: true, prompt: "How would you rate the pain from 1 to 10?", showIf: { code: "B03", answered: true } },
  { code: "E03", section: "Current Symptoms", type: "text", required: true, prompt: "Is the pain sharp, dull, burning, aching, or something else?", showIf: { code: "B03", answered: true } },
  { code: "E04", section: "Current Symptoms", type: "text", required: true, prompt: "Are you experiencing any other symptoms along with this?", showIf: { code: "B03", answered: true } },
  { code: "E05", section: "Current Symptoms", type: "choice", required: true, prompt: "Are your symptoms getting better, getting worse, or staying the same?", options: ["Getting better", "Getting worse", "Staying the same"], showIf: { code: "B03", answered: true } },
  { code: "E06", section: "Current Symptoms", type: "yesno", required: true, prompt: "Are these symptoms affecting your daily activities?", showIf: { code: "B03", answered: true } },

  { code: "F01", section: "Appointment Information", type: "yesno", required: true, prompt: "Would you like to schedule an appointment?" },
  { code: "F02", section: "Appointment Information", type: "text", required: false, prompt: "Do you have a preferred doctor or specialist?", showIf: { code: "F01", is: "yes" } },
  { code: "F03", section: "Appointment Information", type: "text", required: true, prompt: "What date would you prefer for your appointment?", showIf: { code: "F01", is: "yes" } },
  { code: "F04", section: "Appointment Information", type: "choice", required: true, prompt: "What time of day works best for you?", options: ["Morning", "Afternoon", "No preference"], showIf: { code: "F01", is: "yes" } },
  { code: "F05", section: "Appointment Information", type: "choice", required: true, prompt: "Would you prefer an in-person consultation or a teleconsultation, if available?", options: ["In-person consultation", "Teleconsultation"], showIf: { code: "F01", is: "yes" } },
  { code: "F06", section: "Appointment Information", type: "yesno", required: true, prompt: "Do you have health insurance or an HMO provider?" },
  { code: "F07", section: "Appointment Information", type: "text", required: true, prompt: "May I know the name of your insurance or HMO provider?", showIf: { code: "F06", is: "yes" } },

  { code: "G01", section: "Additional Information", type: "text", required: false, prompt: "Is there anything else about your health that you would like our medical team to know?" },
  { code: "G02", section: "Additional Information", type: "text", required: false, prompt: "Do you require any special assistance when visiting the clinic?" },
  { code: "G03", section: "Additional Information", type: "choice", required: false, prompt: "Would you prefer to receive appointment updates through SMS, phone, or email?", options: ["SMS", "Phone", "Email"] },
  { code: "G04", section: "Additional Information", type: "text", required: false, prompt: "Is there any other information you would like us to include in your patient record?" },
];

export const APPOINTMENT_SECTION = "Appointment Information";

function conditionMet(condition, answers) {
  if (!condition) return true;
  if (condition.anyOf) return condition.anyOf.some((item) => conditionMet(item, answers));
  const answer = answers[condition.code];
  if (condition.answered) return Boolean(answer);
  if (!answer) return false;
  return answer.value === condition.is;
}

export function isVisible(question, answers) {
  return conditionMet(question.showIf, answers);
}

export function parseYesNo(text) {
  if (BOOL_FALSE.test(text)) return "no";
  if (BOOL_TRUE.test(text)) return "yes";
  return null;
}

// Returns { text, value } for a usable answer, or null when the reply must be repeated.
export function normalizeAnswer(question, speech) {
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
    const options = question.options || [];
    const exact = options.find((option) => lower.includes(option.toLowerCase()));
    if (exact) return { text, value: exact };
    let best = null;
    let bestScore = 0;
    for (const option of options) {
      const score = option
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 3 && lower.includes(word)).length;
      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }
    return { text, value: best };
  }

  return { text, value: null };
}

// Clinical priority from answers. Thresholds are a working assumption pending clinical sign-off.
export function classifyPriority(answers) {
  const severity = answers.B06?.value ?? 0;
  const pain = answers.E02?.value ?? 0;
  if (severity >= 8 || pain >= 8) return "Urgent";
  if (answers.D04?.value === "yes" || answers.D05?.value === "yes" || answers.E05?.value === "Getting worse") {
    return "Soon";
  }
  return "Routine";
}
