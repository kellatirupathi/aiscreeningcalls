export function getRetryDelayMinutes(status: string) {
  if (status === "busy") {
    return 15;
  }

  if (status === "no-answer") {
    return 30;
  }

  return 5;
}
