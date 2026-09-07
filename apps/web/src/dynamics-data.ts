import raw from "../../../data/published/dynamics.json";
import { dynamicsSchema } from "../../../packages/core/dynamics";
export const dynamics = dynamicsSchema.parse(raw);
export { dynamicsMetrics, dynamicsPage } from "../../../packages/core/dynamics";
