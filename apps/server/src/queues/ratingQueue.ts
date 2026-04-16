import Queue from "bull";
import { env } from "../config/env.js";

export interface RatingJobData {
  callId: string;
}

export const ratingQueue = new Queue<RatingJobData>("call-ratings", env.REDIS_URL);
