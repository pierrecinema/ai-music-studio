"""The bridge from the backend (MCP tools) to the app window: the window asks for work (long poll on
/mcp/app/next), runs it on the open project (tracks, instruments, MIDI effects, notes) and sends the answer back
(/mcp/app/result). An MCP client (Claude, other agents) can so work on the project the user sees.
"""
import asyncio
import itertools
import time
from typing import Any

_queue: "asyncio.Queue[dict[str, Any]] | None" = None
_waiting: dict[int, asyncio.Future] = {}
_ids = itertools.count(1)
_last_poll = 0.0

POLL_SECONDS = 20          # how long the window's request waits for work
ALIVE_SECONDS = 45         # the window counts as connected if it asked for work this recently


def _q() -> "asyncio.Queue[dict[str, Any]]":
    global _queue
    if _queue is None:
        _queue = asyncio.Queue()
    return _queue


def connected() -> bool:
    return time.time() - _last_poll < ALIVE_SECONDS


async def request(name: str, args: dict[str, Any], timeout: float = 30.0) -> Any:
    """Runs one command in the app window and returns its result (raises RuntimeError on failure)."""
    if not connected():
        raise RuntimeError("The AI Music Studio window is not open (or too old for this tool): start the app.")
    cid = next(_ids)
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    _waiting[cid] = fut
    await _q().put({"id": cid, "name": name, "args": args})
    try:
        return await asyncio.wait_for(fut, timeout)
    except asyncio.TimeoutError as e:
        raise RuntimeError(f"The app did not answer the command {name} in time.") from e
    finally:
        _waiting.pop(cid, None)


async def next_command() -> dict[str, Any]:
    """The window asks for work: a command, or {"none": true} after a while without any."""
    global _last_poll
    _last_poll = time.time()
    try:
        cmd = await asyncio.wait_for(_q().get(), POLL_SECONDS)
    except asyncio.TimeoutError:
        _last_poll = time.time()
        return {"none": True}
    _last_poll = time.time()
    return cmd


def deliver(cid: int, ok: bool, result: Any = None, error: str | None = None) -> bool:
    fut = _waiting.get(cid)
    if fut is None or fut.done():
        return False
    if ok:
        fut.set_result(result)
    else:
        fut.set_exception(RuntimeError(error or "the app could not do that"))
    return True
