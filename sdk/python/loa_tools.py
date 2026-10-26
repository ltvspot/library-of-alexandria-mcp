"""Plain functions for frameworks that build tool schemas."""

from loa_library import Loa, LoaError

_client = Loa()


def set_client(client: Loa) -> None:
    """Replace the client used by the tool functions."""
    global _client
    _client = client


def _call(tool: str, **arguments: object) -> dict:
    try:
        return _client.call(
            tool, {key: value for key, value in arguments.items()
                   if value is not None and value != "" and value != 0}
        )
    except LoaError as error:
        return {"error": str(error), "code": error.code}


def search_books(query: str, language: str = "", limit: int = 0) -> dict:
    """Search the catalogue of Library of Alexandria Press by words from a title or an author's name, or by a topic word, in any language of the catalogue (Chinese in simplified and traditional characters).

    Args:
        query: Words from a title or an author's name, or a topic word.
        language: Language code of the person asking; defaults to the query language, else English.
        limit: Maximum number of matching entries to return; omitted for the server default.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("search_books", query=query, language=language, limit=limit)


def get_book(id: str, language: str = "") -> dict:
    """Get the catalogue facts of one title: title, subtitle, author and original title in the chosen language, the cover picture address, the print editions, and the title page address in each language of the catalogue.

    Args:
        id: Title id from a search result; a plain number refers to the main list.
        language: Language code of the person asking; defaults to English.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("get_book", id=id, language=language)


def get_summary(id: str, language: str = "", part: int = 0) -> dict:
    """Read the 15-minute summary of one title: the first key idea in full, with its heading, and the headings of the other key ideas, which open in the library.

    Args:
        id: Title id from a search result; a plain number refers to the main list.
        language: Language code of the person asking; defaults to English.
        part: Number of the key idea, starting at 1; the default is 1.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("get_summary", id=id, language=language, part=part)


def get_sample(id: str, language: str = "", page: int = 0) -> dict:
    """Read the free opening of one title: the first chapter of its text, in pages of at most 400 words.

    Args:
        id: Title id from a search result; a plain number refers to the main list.
        language: Language code of the person asking; defaults to English.
        page: Page of the sample, starting at 1; the default is 1.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("get_sample", id=id, language=language, page=page)


def list_free_shelf(language: str = "", subject: str = "", limit: int = 0) -> dict:
    """List the titles on the shelf, optionally for one language and one subject, with the address of each reading page.

    Args:
        language: Language code of the person asking; defaults to English.
        subject: A subject word, for example philosophy or poetry.
        limit: Maximum number of matching entries to return; omitted for the server default.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("list_free_shelf", language=language, subject=subject, limit=limit)


def read_free_chapter(id: str, chapter: int = 0, page: int = 0,
                      language: str = "") -> dict:
    """Read one chapter of a shelf title, in pages of at most 400 words.

    Args:
        id: Title id from a search result; a plain number refers to the main list.
        chapter: Chapter number, starting at 1; the default is 1.
        page: Page of the chapter, starting at 1; the default is 1.
        language: Language code of the person asking; defaults to English.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("read_free_chapter", id=id, chapter=chapter,
                 page=page, language=language)


def get_print_options(id: str, language: str = "") -> dict:
    """Get the print editions of one title and the address of each product page.

    Args:
        id: Title id from a search result; a plain number refers to the main list.
        language: Language code of the person asking; defaults to English.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("get_print_options", id=id, language=language)


def get_publisher_info() -> dict:
    """Get the publisher's standard description, the languages of the catalogue and the address of the terms page.

    Args:
        None.

    Returns:
        The tool data, or an error message and code.
    """
    return _call("get_publisher_info")


TOOLS = [
    search_books,
    get_book,
    get_summary,
    get_sample,
    list_free_shelf,
    read_free_chapter,
    get_print_options,
    get_publisher_info,
]
