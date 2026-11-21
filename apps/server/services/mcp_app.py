"""Official MCP SDK server (streamable HTTP) that exposes the studio tools."""
import mcp.types as types
from mcp.server.lowlevel import Server


INSTRUCTIONS = """AI Music Studio is a music app (a DAW with AI) running on the user's PC.

The app_* tools work on the project open in the app window, like the user would, and the change shows at once:
start with app_get_project, then change it step by step (app_new_project, app_add_track, app_add_notes, app_set_instrument,
app_add_effect, app_set_send, app_set_automation, app_export_audio …). Bars count from 1, beats are quarter notes.

"Write / make a song" in the Studio means app_generate_song: a whole song as editable MIDI tracks (genre, key, tempo) in
seconds, played by the sound packs or VST instruments; app_band_part adds a drummer, bass player or guitarist.
generate_music is different: it records a song as audio with the music AI, which takes minutes with a GPU and often
10-30 minutes or more on a CPU. Use it only when the user asks for an AI recording or sung vocals, say that it is slow,
and tell the user the progress shows in the app's status bar and on the Create music page (get_music_job: summary).
Answer in the user's language."""


def build_server() -> Server:
    from api.routes.mcp_server import MCP_TOOLS, call_tool

    async def on_list_tools(ctx, params) -> types.ListToolsResult:
        return types.ListToolsResult(tools=[
            types.Tool(name=t["name"], description=t["description"], inputSchema=t["inputSchema"])
            for t in MCP_TOOLS
        ])

    async def on_call_tool(ctx, params) -> types.CallToolResult:
        res = await call_tool({"name": params.name, "arguments": params.arguments or {}})
        text = "\n".join(c["text"] for c in res["content"])
        return types.CallToolResult(
            content=[types.TextContent(type="text", text=text)],
            is_error=bool(res.get("isError")),
        )

    return Server(
        "ai-music-studio",
        version="0.1.0",
        description="AI Music Studio: the open Studio project, music generation, stems, mastering, karaoke",
        instructions=INSTRUCTIONS,
        on_list_tools=on_list_tools,
        on_call_tool=on_call_tool,
    )
