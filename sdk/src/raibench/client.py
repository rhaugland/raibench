import httpx

from raibench.types import Event


class RaiBenchClient:
    def __init__(self, api_url: str, api_key: str, timeout: float = 5.0):
        self._api_url = api_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout

    async def send_events(self, events: list[Event]) -> None:
        """Send a batch of events to the ingestion API. Never raises."""
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                await client.post(
                    f"{self._api_url}/v1/events",
                    json=[e.model_dump(exclude_none=True) for e in events],
                    headers={
                        "authorization": f"Bearer {self._api_key}",
                        "content-type": "application/json",
                    },
                )
        except Exception:
            # Fire and forget — never break the host application
            pass
