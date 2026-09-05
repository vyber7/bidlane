type LogContext = Record<string, unknown>;

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}

function entry(event: string, context?: LogContext) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...context,
  });
}

export const logger = {
  error(event: string, error: unknown, context?: LogContext) {
    console.error(entry(event, { ...context, error: errorDetails(error) }));
  },
  warn(event: string, context?: LogContext) {
    console.warn(entry(event, context));
  },
  debug(event: string, context?: LogContext) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(entry(event, context));
    }
  },
};
