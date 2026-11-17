import { PagePlaceholder } from "./PagePlaceholder";

export function ScenariosPage() {
  return (
    <PagePlaceholder
      title="Scenarios"
      description="Real-life conversation scenarios with clear objectives and target vocabulary."
      planned={[
        "Scenario library shipped in content/ and loaded into the local database",
        "Filter by category and difficulty",
        "Start a lesson from a scenario",
      ]}
    />
  );
}
