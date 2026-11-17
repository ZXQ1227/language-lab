import { PagePlaceholder } from "./PagePlaceholder";

export function ReportsPage() {
  return (
    <PagePlaceholder
      title="Reports"
      description="Post-lesson debriefs and long-term progress built from your learning history."
      planned={[
        "Lesson debrief: objectives completed, vocabulary used, errors corrected",
        "Vocabulary mastery overview from memory",
        "Trend views across lessons",
      ]}
    />
  );
}
