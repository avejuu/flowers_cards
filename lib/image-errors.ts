// Log messages, never raw error objects, stacks, request URLs or response bodies.
export function imageErrorMessage(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown image-copy error';
  for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
  return message.replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/((?:api[_-]?key|key|token|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]').slice(0, 500);
}
