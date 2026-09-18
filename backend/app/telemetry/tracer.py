"""OpenTelemetry setup, exporting to Langfuse. Wraps TurnStageEvent emission as spans
so the same instrumentation feeds both the live latency dashboard (F10) and the
after-the-fact Langfuse traces.
"""


def init_tracer(langfuse_endpoint: str | None = None) -> None:
    # TODO(week 2): configure OTel SDK + OTLP exporter -> Langfuse.
    raise NotImplementedError
