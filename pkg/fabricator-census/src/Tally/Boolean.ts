import type { BooleanTally as BooleanOutput } from "../Types";

export class BooleanTally {
  private yes = 0;
  private no = 0;

  add(value: boolean): void {
    if (value) this.yes++;
    else this.no++;
  }

  absorb(other: BooleanTally): void {
    this.yes += other.yes;
    this.no += other.no;
  }

  snapshot(): BooleanOutput {
    return { true: this.yes, false: this.no };
  }
}
