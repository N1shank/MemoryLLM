"""Web search service using Wikipedia."""

import wikipedia
import asyncio

def get_web_search_tool():
    """Return the Gemini tool declaration for web search."""
    return {
        "name": "web_search",
        "description": "Search the web for current information, news, and facts.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "query": {
                    "type": "STRING",
                    "description": "The search query"
                },
                "max_results": {
                    "type": "INTEGER",
                    "description": "Maximum number of results to return (default 5)"
                }
            },
            "required": ["query"]
        }
    }

async def execute_web_search(query: str, max_results: int = 5) -> str:
    """Execute a web search and return formatted results."""
    try:
        def search():
            results = wikipedia.search(query, results=max_results)
            if not results:
                return f"No results found for '{query}'"
                
            formatted = []
            for i, title in enumerate(results):
                try:
                    page = wikipedia.page(title, auto_suggest=False)
                    formatted.append(f"[{i+1}] {page.title}\nURL: {page.url}\nSummary: {page.summary[:500]}...\n")
                except wikipedia.exceptions.DisambiguationError as e:
                    formatted.append(f"[{i+1}] {title}\nDisambiguation page. Please be more specific.\n")
                except wikipedia.exceptions.PageError:
                    pass
            return "\n".join(formatted)
            
        return await asyncio.to_thread(search)
    except Exception as e:
        return f"Web search failed: {str(e)}"
