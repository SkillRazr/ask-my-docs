import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

// Your own spans, for the steps OpenTelemetry can't see by itself: agent runs and
// steps, tool calls and LLM calls with their cost. With no exporter configured, these
// cost almost nothing.
export const tracer = trace.getTracer("ask-my-docs");

export function withSpan<T>(
  name: string,
  attributes: Attributes,
  work: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

// One JSON line per event. On Cloud Run, anything printed as JSON becomes a
// structured log entry in Cloud Logging: severity is understood, and the trace field
// links the log line to its trace, so you can jump from a log to the whole request.
export function log(
  severity: "INFO" | "WARNING" | "ERROR",
  message: string,
  fields: Record<string, unknown> = {}
) {
  // Logs are for machines, so they're off on your laptop unless LOG_JSON=true.
  // Cloud Run and Cloud Functions set K_SERVICE, so there they're on by default.
  const on = process.env.LOG_JSON ?? (process.env.K_SERVICE ? "true" : "false");
  if (on !== "true") return;
  const context = trace.getActiveSpan()?.spanContext();
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  console.log(
    JSON.stringify({
      severity,
      message,
      ...fields,
      ...(context && project
        ? {
            "logging.googleapis.com/trace": `projects/${project}/traces/${context.traceId}`,
            "logging.googleapis.com/spanId": context.spanId,
          }
        : {}),
    })
  );
}
