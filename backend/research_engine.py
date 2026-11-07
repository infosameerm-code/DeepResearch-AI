
import json
import re

from ai_service import generate_ai_response, search_web


def create_research_plan(topic):

    prompt = f"""
Create exactly 4 important research subtopics for:
{topic}

Return only valid JSON:
{{
    "subtopics": [
        "Subtopic 1",
        "Subtopic 2",
        "Subtopic 3",
        "Subtopic 4"
    ]
}}
"""

    response = generate_ai_response(prompt)

    if response.startswith("AI connection error"):
        return None

    try:
        match = re.search(r"\{.*\}", response, re.DOTALL)

        if not match:
            raise ValueError("Invalid research plan")

        data = json.loads(match.group())
        subtopics = data.get("subtopics", [])

        if not isinstance(subtopics, list) or len(subtopics) < 4:
            raise ValueError("Four subtopics required")

        return [str(item) for item in subtopics[:4]]

    except (ValueError, json.JSONDecodeError):
        return [
            topic,
            f"Applications of {topic}",
            f"Benefits and challenges of {topic}",
            f"Future of {topic}"
        ]


def conduct_research(topic):

    subtopics = create_research_plan(topic)

    if not subtopics:
        return {
            "status": "failed",
            "message": "Could not generate research plan. Check Ollama."
        }

    all_sources = []
    seen_urls = set()
    research_findings = []

    for subtopic in subtopics:

        search_data = search_web(subtopic)

        if "error" in search_data:
            research_findings.append({
                "subtopic": subtopic,
                "sources": []
            })
            continue

        current_sources = []

        for item in search_data["results"]:

            url = item.get("url")

            if not url or url in seen_urls:
                continue

            seen_urls.add(url)

            source_id = f"S{len(all_sources) + 1}"

            source = {
                "id": source_id,
                "subtopic": subtopic,
                "title": item.get("title", "Untitled"),
                "url": url,
                "content": item.get("content", ""),
                "score": item.get("score", 0)
            }

            all_sources.append(source)

            current_sources.append({
                "id": source_id,
                "title": source["title"],
                "url": source["url"],
                "content": source["content"][:2500]
            })

        research_findings.append({
            "subtopic": subtopic,
            "sources": current_sources
        })

    if not all_sources:
        return {
            "status": "failed",
            "message": "No internet search results found."
        }

    prompt = f"""
You are a professional autonomous research assistant.

MAIN TOPIC:
{topic}

RESEARCH PLAN AND SOURCES:
{json.dumps(research_findings, indent=2)}

Write a detailed research report using this structure:

1. Executive Summary
2. Introduction
3. Research Findings by Subtopic
4. Important Discoveries
5. Benefits and Challenges
6. Future Possibilities
7. Conclusion

STRICT SOURCE AND CITATION RULES:

1. Cover all four research subtopics.
2. Use only the information provided in the sources.
3. Add citations like [S1] after supported factual claims.
4. Use a source ID only when that source supports the claim.
5. Use sources from the relevant subtopic wherever possible.
6. Never invent source IDs, facts, statistics or URLs.
7. If evidence is insufficient, clearly mention it.
8. Do not use unrelated sources just to add citations.
9. Do not create a Sources section. It will be added automatically.
10. Write in clear, professional language.

IMPORTANT:
A search result is not automatically verified evidence.
Do not claim that a source proves something unless its provided
content actually supports that statement.
"""

    report = generate_ai_response(prompt)

    if report.startswith("AI connection error"):
        return {
            "status": "failed",
            "message": report
        }

    source_list = "\n\n## Sources\n\n"

    for source in all_sources:
        source_list += (
            f"[{source['id']}] {source['title']}\n"
            f"{source['url']}\n\n"
        )

    report = report.strip() + source_list

    return {
        "status": "completed",
        "topic": topic,
        "research_plan": subtopics,
        "sources_collected": len(all_sources),
        "sources": [
            {
                "id": source["id"],
                "subtopic": source["subtopic"],
                "title": source["title"],
                "url": source["url"]
            }
            for source in all_sources
        ],
        "report": report
    }
