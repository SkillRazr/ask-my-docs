// OpenTelemetry setup. Load it before anything else (the dev script does it with
// tsx --import), so it can wrap Express, PostgreSQL and outgoing HTTP calls as they load.
// TRACE_EXPORTER picks where traces go:
//   none     nothing (the default)
//   console  print each span, to see what's recorded
//   otlp     any OpenTelemetry backend, such as Jaeger on your laptop
//   gcp      Google Cloud Trace
import "dotenv/config";
import { TraceExporter } from "@google-cloud/opentelemetry-cloud-trace-exporter";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";

const exporters = {
  console: () => new tracing.ConsoleSpanExporter(),
  otlp: () => new OTLPTraceExporter(), // OTEL_EXPORTER_OTLP_ENDPOINT, default http://localhost:4318
  gcp: () => new TraceExporter(), // uses your Google Cloud credentials and project
};
const choice = process.env.TRACE_EXPORTER as keyof typeof exporters | undefined;

if (choice && exporters[choice]) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "ask-my-docs",
    traceExporter: exporters[choice](),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Too noisy: every file read becomes a span.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        // Our own LLM spans (services/usage.ts) also record the cost and purpose.
        "@opentelemetry/instrumentation-openai": { enabled: false },
      }),
    ],
  });
  sdk.start();
  // Send the last spans before the process exits. server.ts decides when to exit.
  process.once("SIGTERM", () => void sdk.shutdown());
}
