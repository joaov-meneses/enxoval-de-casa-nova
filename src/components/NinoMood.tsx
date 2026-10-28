import { Nino } from "./Nino";
import type { ninoState } from "../nino";
import "./ninoMood.css";

/** O repouso é estático e a comemoração tem término. */
export function NinoMood({ state }: { state: ReturnType<typeof ninoState> }) {
  return (
    <span className={`nino-mood is-${state}`} aria-hidden="true">
      <Nino pose={state === "celebrating" ? "celebrate" : state === "resting" ? "rest" : "think"} size={56} />
    </span>
  );
}
