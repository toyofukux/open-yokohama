import raw from "../../../data/published/ages.json";
import { agesSchema } from "../../../packages/core/ages";
export const ages = agesSchema.parse(raw);
