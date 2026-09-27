import { Radio } from "lucide-react";
export function Brand() {
  return (
    <a className="brand" href="#home" aria-label="Spill home">
      <Radio aria-hidden="true" />
      <span>
        Spill<small>People. Stories. Change.</small>
      </span>
    </a>
  );
}
