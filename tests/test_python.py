"""Tests of the Python client (sdk/python/loa_library.py) and of the plain functions for local models (sdk/python/loa_tools.py). Standard library only.
Run: python3 -I tests/test_python.py   (from public-docs/developers)"""
import inspect
import json
import os
import re
import socket
import sys
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
KIT = HERE.parent
sys.path.insert(0, str(KIT / "sdk" / "python"))

import loa_library  # noqa: E402
import loa_tools  # noqa: E402
from loa_library import DEFAULT_BASE_URL, API_VERSION, Loa, LoaError  # noqa: E402

FIXTURE = {
    "search_books": {"query": "moby dick", "language": "en", "count": 1, "results": [{"id": "top3500-00002", "title": "Moby-Dick", "author": "Herman Melville", "language": "en", "url": "https://libraryofalexandria.com/products/moby-dick-or-the-whale"}]},
    "get_book": {"id": "top3500-00002", "title": "Moby-Dick", "author": "Herman Melville", "language": "en", "url": "https://libraryofalexandria.com/products/moby-dick-or-the-whale", "print": []},
    "get_summary": {"id": "top3500-00002", "available": False, "message": "The summary of this title is not available yet."},
    "get_sample": {"id": "top3500-00002", "available": False, "message": "The sample pages of this title are not available yet."},
    "list_free_shelf": {"language": "es", "available": True, "count": 1, "titles": [{"id": "top3500-00013", "title": "Meditaciones"}]},
    "read_free_chapter": {"id": "top3500-00013", "available": False, "message": "Free-shelf chapters are not available yet."},
    "get_print_options": {"id": "top3500-00002", "status": "available", "editions": [], "currency": "USD"},
    "get_publisher_info": {"name": "Library of Alexandria Press", "website": "https://libraryofalexandria.com"},
}
TOOL_NAMES = list(FIXTURE)
PROBLEM_TYPE = "https://libraryofalexandria.com/pages/developers#errors"


class Mock:
    """A local HTTP server that answers like the library's API and records requests."""

    def __init__(self, handler=None, delay=0.0):
        self.requests = []
        self.handler = handler
        self.delay = delay
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _do(self):
                n = int(self.headers.get("content-length") or 0)
                body = self.rfile.read(n).decode("utf-8") if n else ""
                rec = {"method": self.command, "path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body}
                outer.requests.append(rec)
                if outer.delay:
                    time.sleep(outer.delay)
                status, ctype, text, extra = outer.answer(rec)
                data = text.encode("utf-8")
                try:
                    self.send_response(status)
                    self.send_header("content-type", ctype)
                    self.send_header("content-length", str(len(data)))
                    for k, v in extra.items():
                        self.send_header(k, v)
                    self.end_headers()
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            do_GET = do_POST = _do

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), H)
        self.server.daemon_threads = True
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def answer(self, rec):
        if self.handler:
            return self.handler(rec)
        m = re.match(r"^/v1/([a-z0-9_]+)$", rec["path"])
        if rec["method"] == "POST" and m and m.group(1) == "get_book" and json.loads(rec["body"] or "{}").get("id") == "nope":
            return problem(404, "not_found", "Not found", "No title found for id 'nope'. Use search_books to find the id.")
        if rec["method"] == "POST" and m and m.group(1) in FIXTURE:
            return 200, "application/json; charset=utf-8", json.dumps({"ok": True, "data": FIXTURE[m.group(1)], "source": "Library of Alexandria, libraryofalexandria.com"}), {}
        if rec["method"] == "POST" and m:
            return problem(404, "unknown_tool", "Unknown tool", f"Unknown tool '{m.group(1)}'. Read /v1/openapi.json.")
        if rec["method"] == "GET" and rec["path"].startswith("/v1/tools"):
            return 200, "application/json", json.dumps([{"name": "search_books", "path": rec["path"]}]), {}
        if rec["method"] == "GET" and rec["path"] == "/v1/openapi.json":
            return 200, "application/json", json.dumps({"openapi": "3.1.0", "paths": {}}), {}
        return 404, "application/json", "{}", {}

    def close(self):
        self.server.shutdown()
        self.server.server_close()


def problem(status, code, title, detail, headers=None):
    return status, "application/problem+json; charset=utf-8", json.dumps({"type": PROBLEM_TYPE, "title": title, "status": status, "detail": detail, "code": code}), headers or {}


def dead_url():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}"


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.mock = Mock()
        self.addCleanup(self.mock.close)
        self.loa = Loa(base_url=self.mock.url)

    def test_constants(self):
        self.assertEqual(DEFAULT_BASE_URL, "https://api.libraryofalexandria.com")
        self.assertEqual(API_VERSION, "2026-10-25")
        self.assertTrue(issubclass(LoaError, Exception))

    def test_call_posts_json_and_returns_the_data_of_the_envelope(self):
        data = self.loa.call("search_books", {"query": "moby dick", "limit": 3})
        self.assertEqual(data, FIXTURE["search_books"])
        r = self.mock.requests[0]
        self.assertEqual((r["method"], r["path"]), ("POST", "/v1/search_books"))
        self.assertTrue(r["headers"]["content-type"].startswith("application/json"))
        self.assertIn("application/json", r["headers"]["accept"])
        self.assertEqual(r["headers"]["loa-version"], API_VERSION)
        self.assertEqual(json.loads(r["body"]), {"query": "moby dick", "limit": 3})

    def test_arguments_may_be_keywords_and_none_is_left_out(self):
        self.loa.call("get_book", id="top3500-00002", language=None)
        self.loa.call("get_publisher_info")
        self.assertEqual(json.loads(self.mock.requests[0]["body"]), {"id": "top3500-00002"})
        self.assertEqual(json.loads(self.mock.requests[1]["body"]), {})

    def test_base_url_loses_trailing_slashes_and_the_environment_is_the_default(self):
        self.assertEqual(Loa(base_url=self.mock.url + "///").base_url, self.mock.url)
        old = os.environ.get("LOA_API_URL")
        os.environ["LOA_API_URL"] = self.mock.url
        try:
            self.assertEqual(Loa().base_url, self.mock.url)
            del os.environ["LOA_API_URL"]
            self.assertEqual(Loa().base_url, DEFAULT_BASE_URL)
        finally:
            if old is not None:
                os.environ["LOA_API_URL"] = old

    def test_one_method_per_tool_with_the_tools_arguments(self):
        calls = [
            ("search_books", dict(query="moby", language="de", limit=2)),
            ("get_book", dict(id="top3500-00002", language="fr")),
            ("get_summary", dict(id="top3500-00002", language="es")),
            ("get_sample", dict(id="top3500-00002")),
            ("list_free_shelf", dict(language="es", subject="philosophy", limit=5)),
            ("read_free_chapter", dict(id="top3500-00013", chapter=2, page=3, language="en")),
            ("get_print_options", dict(id="top3500-00002")),
            ("get_publisher_info", dict()),
        ]
        self.assertEqual(sorted(t for t, _ in calls), sorted(TOOL_NAMES))
        for tool, args in calls:
            with self.subTest(tool=tool):
                before = len(self.mock.requests)
                data = getattr(self.loa, tool)(**args)
                self.assertEqual(data, FIXTURE[tool])
                r = self.mock.requests[before]
                self.assertEqual(r["path"], "/v1/" + tool)
                self.assertEqual(json.loads(r["body"]), args)

    def test_a_tool_name_that_is_not_snake_case_is_refused_before_any_request(self):
        for bad in ["", "Search_Books", "a/b", "../x", "x" * 65, "search books"]:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    self.loa.call(bad)
        self.assertEqual(self.mock.requests, [])

    def test_a_problem_becomes_a_loa_error_with_its_fields(self):
        with self.assertRaises(LoaError) as cm:
            self.loa.call("no_such_tool")
        e = cm.exception
        self.assertEqual((e.status, e.code, e.title, e.type), (404, "unknown_tool", "Unknown tool", PROBLEM_TYPE))
        self.assertIn("no_such_tool", e.detail)
        self.assertEqual(str(e), e.detail)
        self.assertIsNone(e.retry_after)

    def test_retry_after_in_seconds(self):
        m = Mock(lambda rec: problem(429, "rate_limited", "Too many requests", "Slow down.", {"retry-after": "7"}))
        self.addCleanup(m.close)
        with self.assertRaises(LoaError) as cm:
            Loa(base_url=m.url).call("search_books", query="x")
        self.assertEqual((cm.exception.status, cm.exception.code, cm.exception.retry_after), (429, "rate_limited", 7))

    def test_an_answer_that_is_not_the_envelope_is_bad_response(self):
        for status, ctype, text in [(502, "text/html", "<html>Bad gateway</html>"), (200, "text/html", "hello"), (200, "application/json", '{"unexpected": true}')]:
            with self.subTest(status=status, text=text[:10]):
                m = Mock(lambda rec, a=(status, ctype, text): (a[0], a[1], a[2], {}))
                try:
                    with self.assertRaises(LoaError) as cm:
                        Loa(base_url=m.url).call("search_books", query="x")
                    self.assertEqual(cm.exception.code, "bad_response")
                    self.assertEqual(cm.exception.status, status)
                finally:
                    m.close()

    def test_an_address_that_cannot_be_reached_is_network_with_status_zero(self):
        with self.assertRaises(LoaError) as cm:
            Loa(base_url=dead_url(), timeout=3).call("search_books", query="x")
        self.assertEqual((cm.exception.code, cm.exception.status), ("network", 0))

    def test_a_slow_answer_ends_with_timeout(self):
        m = Mock(delay=0.6)
        self.addCleanup(m.close)
        started = time.time()
        with self.assertRaises(LoaError) as cm:
            Loa(base_url=m.url, timeout=0.15).call("search_books", query="x")
        self.assertEqual((cm.exception.code, cm.exception.status), ("timeout", 0))
        self.assertLess(time.time() - started, 0.55)

    def test_user_agent_and_extra_headers(self):
        loa = Loa(base_url=self.mock.url, user_agent="my-app/2.0", headers={"x-extra": "yes"})
        loa.call("get_publisher_info")
        h = self.mock.requests[0]["headers"]
        self.assertEqual(h["user-agent"], "my-app/2.0")
        self.assertEqual(h["x-extra"], "yes")
        Loa(base_url=self.mock.url).call("get_publisher_info")
        self.assertIn("loa-library", self.mock.requests[1]["headers"]["user-agent"].lower())

    def test_tools_and_openapi(self):
        self.assertEqual(self.loa.tools()[0]["path"], "/v1/tools?format=mcp")
        self.assertEqual(self.loa.tools("openai")[0]["path"], "/v1/tools?format=openai")
        self.assertEqual(self.loa.openapi()["openapi"], "3.1.0")

    def test_the_module_uses_the_standard_library_only(self):
        text = (KIT / "sdk" / "python" / "loa_library.py").read_text(encoding="utf-8")
        std = set(sys.stdlib_module_names)
        for m in re.finditer(r"^\s*(?:from|import)\s+([A-Za-z_][\w.]*)", text, re.M):
            self.assertIn(m.group(1).split(".")[0], std, m.group(1))
        self.assertLess(len(text), 12000)
        self.assertIn("-> ", text)

    def test_every_method_has_a_docstring_and_annotations(self):
        for tool in TOOL_NAMES:
            fn = getattr(Loa, tool)
            self.assertTrue(inspect.getdoc(fn), tool)
            self.assertTrue(fn.__annotations__, tool)


class ToolsModuleTests(unittest.TestCase):
    """loa_tools: plain functions that Ollama's Python client (and any framework that builds a tool schema from type hints and docstrings) can use as tools."""

    def setUp(self):
        self.mock = Mock()
        self.addCleanup(self.mock.close)
        loa_tools.set_client(Loa(base_url=self.mock.url))

    def test_one_function_per_tool_named_like_the_tool_and_listed_in_TOOLS(self):
        self.assertEqual([f.__name__ for f in loa_tools.TOOLS], TOOL_NAMES)
        for name in TOOL_NAMES:
            self.assertTrue(callable(getattr(loa_tools, name)), name)

    def test_the_names_equal_the_tool_files_of_the_kit(self):
        names = [t["name"] for t in json.loads((KIT / "function-tools" / "mcp.json").read_text(encoding="utf-8"))]
        self.assertEqual(names, TOOL_NAMES)

    def test_each_function_has_type_hints_and_a_google_style_docstring_that_names_every_parameter(self):
        for fn in loa_tools.TOOLS:
            with self.subTest(tool=fn.__name__):
                doc = inspect.getdoc(fn) or ""
                self.assertGreater(len(doc), 40)
                self.assertIn("Args:", doc) if inspect.signature(fn).parameters else None
                sig = inspect.signature(fn)
                for pname, p in sig.parameters.items():
                    self.assertNotEqual(p.annotation, inspect.Parameter.empty, pname)
                    self.assertRegex(doc, rf"(?m)^\s+{pname}\b", pname)
                self.assertEqual(sig.return_annotation, dict)

    def test_the_functions_call_the_api_and_return_the_data(self):
        self.assertEqual(loa_tools.search_books("moby dick", "en", 3), FIXTURE["search_books"])
        self.assertEqual(json.loads(self.mock.requests[0]["body"]), {"query": "moby dick", "language": "en", "limit": 3})
        self.assertEqual(loa_tools.get_book("top3500-00002"), FIXTURE["get_book"])
        self.assertEqual(json.loads(self.mock.requests[1]["body"]), {"id": "top3500-00002"})
        self.assertEqual(loa_tools.list_free_shelf(language="es", subject="philosophy", limit=5), FIXTURE["list_free_shelf"])
        self.assertEqual(json.loads(self.mock.requests[2]["body"]), {"language": "es", "subject": "philosophy", "limit": 5})
        self.assertEqual(loa_tools.read_free_chapter("top3500-00013", 2, 3), FIXTURE["read_free_chapter"])
        self.assertEqual(json.loads(self.mock.requests[3]["body"]), {"id": "top3500-00013", "chapter": 2, "page": 3})
        self.assertEqual(loa_tools.get_publisher_info(), FIXTURE["get_publisher_info"])

    def test_empty_optional_values_are_left_out(self):
        loa_tools.search_books("x", "", 0)
        self.assertEqual(json.loads(self.mock.requests[0]["body"]), {"query": "x"})

    def test_a_problem_comes_back_as_a_dict_the_model_can_read_not_as_an_exception(self):
        out = loa_tools.get_book("nope")
        self.assertEqual(out["code"], "not_found")
        self.assertIn("No title found", out["error"])
        self.assertIn("error", out)
        self.assertIsInstance(out["error"], str)

    def test_an_unreachable_server_comes_back_as_a_dict_too(self):
        loa_tools.set_client(Loa(base_url=dead_url(), timeout=3))
        out = loa_tools.get_publisher_info()
        self.assertEqual(out["code"], "network")
        self.assertIn("error", out)

    def test_the_module_imports_nothing_but_the_standard_library_and_loa_library(self):
        text = (KIT / "sdk" / "python" / "loa_tools.py").read_text(encoding="utf-8")
        std = set(sys.stdlib_module_names) | {"loa_library"}
        for m in re.finditer(r"^\s*(?:from|import)\s+([A-Za-z_][\w.]*)", text, re.M):
            self.assertIn(m.group(1).split(".")[0], std, m.group(1))


if __name__ == "__main__":
    unittest.main(verbosity=2)
