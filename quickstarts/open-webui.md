# Open WebUI

Open WebUI 0.6.31 or newer connects to the library in either of two ways. No key is needed.

**As an MCP server (Streamable HTTP)**

1. Go to **Settings > Admin > Integrations**.
2. Under **External Tool Servers**, click **+ Add Connection**.
3. Set **Type** to **MCP (Streamable HTTP)**.
4. Enter the Server URL `https://mcp.libraryofalexandria.com/mcp` and set **Auth** to **None**.
5. Save (restart Open WebUI if it asks).

**As an OpenAPI tool server**

The same path, with **Type** set to OpenAPI and the address of the OpenAPI file, `https://api.libraryofalexandria.com/v1/openapi.json`. Open WebUI reads the eight operations from it.
