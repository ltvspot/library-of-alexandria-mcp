"""Standard library client for the Library of Alexandria Press API."""

import json
import os
import re
import socket
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://api.libraryofalexandria.com"
API_VERSION = "2026-10-25"


class LoaError(Exception):
    """An API problem or a transport failure."""

    def __init__(
        self, message: str, status: int = 0, code: str = "error",
        title: str = "", detail: str = "", type: str = "",
        retry_after: int | None = None,
    ) -> None:
        """Store the problem fields."""
        self.message = message
        self.status = status
        self.code = code
        self.title = title
        self.detail = detail
        self.type = type
        self.retry_after = retry_after
        super().__init__(detail or title or message)

    def __str__(self) -> str:
        """Return the most useful problem text."""
        return self.detail or self.title or self.message


class Loa:
    """Client for the versioned library API."""

    def __init__(
        self, base_url: str | None = None, timeout: float = 20.0,
        user_agent: str | None = None, headers: dict | None = None,
    ) -> None:
        """Configure the address, timeout and request headers."""
        self.base_url = (
            base_url if base_url is not None
            else os.environ.get("LOA_API_URL", DEFAULT_BASE_URL)
        ).rstrip("/")
        self.timeout = timeout
        self.headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "LOA-Version": API_VERSION,
            "User-Agent": user_agent or "loa-library-python/0.1.0",
        }
        self.headers.update(headers or {})

    def _request(self, path: str, body: dict | None = None,
                 envelope: bool = False) -> object:
        request = Request(
            self.base_url + path,
            data=json.dumps(body).encode("utf-8") if body is not None else None,
            headers=self.headers,
            method="POST" if body is not None else "GET",
        )
        try:
            try:
                response = urlopen(request, timeout=self.timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                retry = response.headers.get("Retry-After", "")
                raw = response.read()
        except (socket.timeout, TimeoutError) as error:
            raise LoaError(f"The request to {self.base_url} timed out.", code="timeout") from error
        except (URLError, OSError) as error:
            reason = getattr(error, "reason", error)
            if isinstance(reason, (socket.timeout, TimeoutError)):
                raise LoaError(f"The request to {self.base_url} timed out.", code="timeout") from error
            raise LoaError(
                f"Could not reach {self.base_url}.", code="network"
            ) from error
        try:
            value = json.loads(raw)
        except (ValueError, UnicodeError):
            value = None
        if (isinstance(value, dict)
                and type(value.get("status")) is int
                and isinstance(value.get("title"), str)):
            raise LoaError(
                value["title"], status=value["status"],
                code=value.get("code") or "error",
                title=value["title"], detail=value.get("detail") or "",
                type=value.get("type") or "",
                retry_after=int(retry) if re.fullmatch(r"[0-9]+", retry) else None,
            )
        if 200 <= status < 300:
            if envelope:
                if (isinstance(value, dict) and value.get("ok") is True
                        and "data" in value):
                    return value["data"]
            elif isinstance(value, (dict, list)):
                return value
        raise LoaError(
            "The server returned an unexpected response.",
            status=status, code="bad_response",
        )

    def call(self, tool: str, arguments: dict | None = None,
             **kwargs: object) -> dict:
        """Call a tool and return its data."""
        if not isinstance(tool, str) or not re.fullmatch(r"[a-z0-9_]{1,64}", tool):
            raise ValueError("Invalid tool name.")
        arguments = {**(arguments or {}), **kwargs}
        body = {key: value for key, value in arguments.items() if value is not None}
        return self._request("/v1/" + tool, body, envelope=True)

    def search_books(self, query: str, language: str | None = None,
                     limit: int | None = None) -> dict:
        """Search the catalogue by title, author or topic."""
        return self.call("search_books", query=query, language=language, limit=limit)

    def get_book(self, id: str, language: str | None = None) -> dict:
        """Get the catalogue facts of one title."""
        return self.call("get_book", id=id, language=language)

    def get_summary(self, id: str, language: str | None = None,
                    part: int | None = None) -> dict:
        """Read the 15-minute summary of one title: the first key idea in full."""
        return self.call("get_summary", id=id, language=language, part=part)

    def get_sample(self, id: str, language: str | None = None,
                   page: int | None = None) -> dict:
        """Read the free opening of one title, in pages of at most 400 words."""
        return self.call("get_sample", id=id, language=language, page=page)

    def list_free_shelf(self, language: str | None = None,
                        subject: str | None = None,
                        limit: int | None = None) -> dict:
        """List shelf titles by language and subject."""
        return self.call("list_free_shelf", language=language,
                         subject=subject, limit=limit)

    def read_free_chapter(self, id: str, chapter: int | None = None,
                          page: int | None = None,
                          language: str | None = None) -> dict:
        """Read one chapter in pages of limited length."""
        return self.call("read_free_chapter", id=id, chapter=chapter,
                         page=page, language=language)

    def get_print_options(self, id: str, language: str | None = None) -> dict:
        """Get the print editions of one title."""
        return self.call("get_print_options", id=id, language=language)

    def get_publisher_info(self) -> dict:
        """Get the publisher description and catalogue languages."""
        return self.call("get_publisher_info")

    def tools(self, format: str = "mcp") -> list:
        """Read the tool definitions in the requested format."""
        result = self._request("/v1/tools?" + urlencode({"format": format}))
        if not isinstance(result, list):
            raise LoaError("Unexpected tool definitions.", status=200,
                           code="bad_response")
        return result

    def openapi(self) -> dict:
        """Read the API description."""
        result = self._request("/v1/openapi.json")
        if not isinstance(result, dict):
            raise LoaError("Unexpected API description.", status=200,
                           code="bad_response")
        return result
