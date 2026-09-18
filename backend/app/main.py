"""LiveKit agent worker entrypoint: mints its own room token, joins, and runs the
pipeline built from config.settings.
"""

import asyncio

from pipecat.pipeline.runner import PipelineRunner

from app.config import settings
from app.pipeline import build_pipeline
from app.providers.llm import preload
from app.server import mint_token


async def run() -> None:
    preload(settings)
    token = mint_token(settings, settings.livekit_room, "interrupt-agent")
    task = build_pipeline(settings, token)
    await PipelineRunner(handle_sigint=False).run(task)


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
