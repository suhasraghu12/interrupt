"""LiveKit agent worker entrypoint: joins a room, runs the pipeline built by
pipeline.build_pipeline against config.settings.
"""

from app.config import settings
from app.pipeline import build_pipeline


def main() -> None:
    # TODO(week 1): register as a LiveKit agent worker, join room, run build_pipeline(settings).
    raise NotImplementedError


if __name__ == "__main__":
    main()
