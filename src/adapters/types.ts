import type { Observation, SourceId } from "../core/types.js";

/** Every data source implements this contract. Adding a source = one file + one registration. */
export interface Adapter {
  readonly id: SourceId;
  poll(): Promise<Observation[]>;
}
