import { PagePlaceholder } from "./PagePlaceholder";

export function TrainingPage() {
  return (
    <PagePlaceholder
      title="Training"
      description="Voice-first scenario role-play with light in-conversation correction."
      planned={[
        "Conversation view with the teaching agent",
        "Live correction and hint cards",
        "Microphone input (after the ASR spike) with text fallback",
      ]}
    />
  );
}
