import Queue from "bull";
import { env } from "../config/env.js";

export const callQueue = new Queue("call-attempts", env.REDIS_URL);
