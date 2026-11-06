"""Official MCP SDK server (streamable HTTP) that exposes the studio tools."""
import mcp.types as types
from mcp.server.lowlevel import Server


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
        description="AI Music Studio: music generation, stems, mastering, karaoke",
        on_list_tools=on_list_tools,
        on_call_tool=on_call_tool,
    )
