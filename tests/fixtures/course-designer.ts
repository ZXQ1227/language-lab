export const practiceGoal = "Reschedule a job interview and confirm the new time.";
export const interviewCourseDraft = {
  title: "Reschedule a job interview",
  setting:
    "You call a recruiter to move an interview because of a scheduling conflict. The recruiter can offer Thursday at two or Friday at ten.",
  learnerRole: "Job candidate",
  partnerRole: "Recruiter",
  openingLine: "Hello! Are you calling about your interview?",
  vocabulary: ["reschedule", "available", "confirm"],
  patterns: [
    { pattern: "Could we reschedule …?", example: "Could we reschedule my interview?" },
    { pattern: "I can do …", example: "I can do Thursday at two." },
  ],
  stages: [
    {
      title: "Request a new time",
      objective: "Ask to reschedule the interview politely.",
      instruction: "Explain why you are calling and ask to change your interview time.",
      successCriteria: ["The learner politely asks to move their interview."],
      hint: "Start with: Could we …?",
    },
    {
      title: "Confirm the appointment",
      objective: "Agree on a different time and confirm it.",
      instruction:
        "Accept and confirm Thursday at two or Friday at ten, as offered by the recruiter.",
      successCriteria: ["The learner confirms a new day and time from the conversation."],
      hint: "Start with: Just to confirm …",
    },
  ],
};
