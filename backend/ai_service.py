
import os
import requests
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "qwen3:8b"

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")


# INTERNET SEARCH
def search_web(query):

    if not TAVILY_API_KEY:
        return {"error": "Tavily API key not found."}

    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 3
            },
            timeout=45
        )

        response.raise_for_status()
        data = response.json()

        results = []

        for item in data.get("results", []):

            if not item.get("url") or not item.get("content"):
                continue

            results.append({
                "title": item.get("title", "Untitled"),
                "url": item.get("url"),
                "content": item.get("content"),
                "score": item.get("score", 0)
            })

        if not results:
            return {"error": "No useful search results found."}

        return {"results": results}

    except requests.RequestException as error:
        return {"error": f"Tavily search failed: {error}"}


# OLLAMA AI RESPONSE
def generate_ai_response(prompt):

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "think": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 1200,
                    "num_ctx": 8192
                }
            },
            timeout=900
        )

        response.raise_for_status()

        result = response.json().get("response", "")

        if not result:
            return "AI connection error: Empty response received."

        return result

    except requests.RequestException as error:
        return f"AI connection error: {error}"


# BASIC WEB RESEARCH
def research_topic(query):

    search_data = search_web(query)

    if "error" in search_data:
        return search_data["error"]

    prompt = f"""
You are a professional research assistant.

Research Topic: {query}

Internet Search Results:
{search_data["results"]}

Instructions:
1. Create a detailed research report.
2. Use only supported information.
3. Include relevant source titles and URLs.
4. Never invent facts or sources.
5. Mention limitations where evidence is insufficient.
"""

    return generate_ai_response(prompt)
