# Goose

Add the library as a remote extension (Streamable HTTP). No key is needed.

**Command line**

1. Run `goose configure`.
2. Choose **Add Extension**, then **Remote Extension (Streamable HTTP)**.
3. Name it `library-of-alexandria` and enter the address `https://mcp.libraryofalexandria.com/mcp`.

**Or edit `~/.config/goose/config.yaml`**

```yaml
extensions:
  library-of-alexandria:
    name: Library of Alexandria
    type: streamable_http
    uri: https://mcp.libraryofalexandria.com/mcp
    enabled: true
    timeout: 300
```

**Desktop app:** open **Extensions** in the sidebar, choose **Add custom extension** and enter the same address.
