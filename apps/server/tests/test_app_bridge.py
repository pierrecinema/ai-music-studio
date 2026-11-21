"""The MCP bridge to the app window: a tool call waits for the window, which takes the command and answers."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import app_bridge  # noqa: E402


def test_round_trip():
    async def run():
        app_bridge._queue = None
        app_bridge._last_poll = 0.0
        # no window: a clear error instead of waiting
        try:
            await app_bridge.request("get_project", {})
            assert False, "should fail without a window"
        except RuntimeError as e:
            assert "not open" in str(e)

        async def window():
            cmd = await app_bridge.next_command()
            assert cmd["name"] == "add_midi_track" and cmd["args"] == {"name": "Bass"}
            assert app_bridge.deliver(cmd["id"], True, {"id": "t1", "name": "Bass"})

        app_bridge._last_poll = __import__("time").time()       # the window asked for work a moment ago
        w = asyncio.create_task(window())
        result = await app_bridge.request("add_midi_track", {"name": "Bass"}, timeout=5)
        await w
        assert result == {"id": "t1", "name": "Bass"}

        # an error in the window comes back as an error
        async def failing():
            cmd = await app_bridge.next_command()
            app_bridge.deliver(cmd["id"], False, error="No track x")
        w = asyncio.create_task(failing())
        try:
            await app_bridge.request("set_track", {"track": "x"}, timeout=5)
            assert False
        except RuntimeError as e:
            assert "No track" in str(e)
        await w

    asyncio.run(run())


def test_tools_listed():
    from api.routes.mcp_server import MCP_TOOLS
    names = {t["name"] for t in MCP_TOOLS}
    assert {"app_get_project", "app_add_midi_track", "app_set_instrument", "app_add_midi_effect", "app_add_notes", "app_set_track", "app_list_plugins", "app_set_bpm", "app_transport"} <= names


def test_every_app_tool_has_a_handler_in_the_window():
    """Each app_* tool must be handled by apps/desktop/src/renderer/src/lib/appBridge.ts (HANDLERS)."""
    import re
    from api.routes.mcp_server import APP_TOOLS
    ts = open(os.path.join(os.path.dirname(__file__), "..", "..", "desktop", "src", "renderer", "src", "lib", "appBridge.ts"), encoding="utf-8").read()
    body = ts[ts.index("const HANDLERS"):ts.index("let running")]
    handlers = set(re.findall(r"^  ([a-z_]+): ", body, re.M))
    tools = {t["name"][4:] for t in APP_TOOLS}
    assert tools - handlers == set(), f"no handler for {tools - handlers}"
    assert handlers - tools == set(), f"no tool for {handlers - tools}"
    assert len(tools) >= 50
