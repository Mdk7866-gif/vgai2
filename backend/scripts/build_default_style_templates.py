"""Regenerates app/data/default_style_templates.json from the markdown spec.

The markdown (vgai-default-style-templates-v2.md at the repo root) is the
source of truth you edit -- long prompts are far easier to read and revise as
fenced blocks than as escaped JSON strings. The JSON it produces is what the
backend actually serves; nothing parses markdown at runtime.

    cd backend && uv run python scripts/build_default_style_templates.py

Re-run it after editing the markdown and commit both files. The parser is
deliberately strict: a heading or fence it does not recognise raises rather
than silently emitting a template with an empty prompt.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
MARKDOWN_PATH = REPO_ROOT / "vgai-default-style-templates-v2.md"
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "default_style_templates.json"

# Markdown label -> JSON key. Each of these is a bold label followed by a
# fenced block holding the field's whole value.
FENCED_FIELDS = {
    "Name": "name",
    "Image Prompt": "image_prompt",
    "Animation Prompt": "animation_prompt",
    "Description": "description",
    "YouTube Title/Description/Tags Prompt": "youtube_title_description_tags_prompt",
    "YouTube Thumbnail Prompt": "youtube_thumbnail_image_prompt",
}

SECTION_RE = re.compile(r"^## (\d+)\. (.+)$", re.MULTILINE)
CONTENTS_ROW_RE = re.compile(r"^\| *(\d+) *\| *\[([^\]]+)\][^|]*\| *([^|]+?) *\| *([^|]+?) *\|$", re.MULTILINE)
# The label group excludes newlines and asterisks on purpose: DOTALL is needed
# for the fenced body, and a `.+?` label under DOTALL happily spans lines to
# find a later `**`, swallowing the following field's heading with it.
FENCE_RE = re.compile(r"^\*\*([^\n*]+)\*\*\s*\n+```\n(.*?)\n```", re.MULTILINE | re.DOTALL)
ASPECT_RE = re.compile(r"^\*\*Aspect Ratio:\*\* *`([0-9]+:[0-9]+)", re.MULTILINE)
DENSITY_RE = re.compile(r"^\*\*Scene Density:\*\* *`(\w+)`", re.MULTILINE)


def slugify(name: str) -> str:
    """'Retro 90s Cel Animation' -> 'retro-90s-cel-animation'.

    The slug is the catalog's stable public id -- it goes in the import URL, so
    renaming a template's display name must not change it. If you ever rename
    one, keep the slug and let the name drift.
    """
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def parse_best_for(markdown: str) -> dict[int, str]:
    """Pulls the 'Best for' column out of the Contents table, keyed by number."""
    best_for = {row[0]: row[3].strip() for row in CONTENTS_ROW_RE.findall(markdown)}
    return {int(number): value for number, value in best_for.items()}


def parse_templates(markdown: str) -> list[dict]:
    best_for_by_number = parse_best_for(markdown)

    matches = list(SECTION_RE.finditer(markdown))
    if not matches:
        raise SystemExit("No '## N. Title' template sections found -- has the markdown structure changed?")

    templates: list[dict] = []
    for index, match in enumerate(matches):
        number = int(match.group(1))
        heading = match.group(2).strip()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        body = markdown[match.start() : end]

        fields = {
            FENCED_FIELDS[label]: value.strip()
            for label, value in FENCE_RE.findall(body)
            if label in FENCED_FIELDS
        }

        missing = set(FENCED_FIELDS.values()) - fields.keys()
        if missing:
            raise SystemExit(f"Template {number} ({heading}) is missing: {', '.join(sorted(missing))}")

        aspect_match = ASPECT_RE.search(body)
        density_match = DENSITY_RE.search(body)
        if not aspect_match or not density_match:
            raise SystemExit(f"Template {number} ({heading}) is missing its Aspect Ratio or Scene Density line")

        aspect_ratio = aspect_match.group(1)
        scene_density = density_match.group(1).lower()
        if scene_density not in {"small", "medium", "high"}:
            raise SystemExit(f"Template {number} ({heading}) has invalid scene density {scene_density!r}")

        templates.append(
            {
                "slug": slugify(fields["name"]),
                **fields,
                "scene_density": scene_density,
                "image_aspect_ratio": aspect_ratio,
                "video_aspect_ratio": aspect_ratio,
                "best_for": best_for_by_number.get(number),
                # Filled in later by pasting Cloudinary URLs straight into the
                # JSON -- no code change needed, the card falls back to its icon
                # header while these are null.
                "demo_image_url": None,
            }
        )

    slugs = [template["slug"] for template in templates]
    duplicates = {slug for slug in slugs if slugs.count(slug) > 1}
    if duplicates:
        raise SystemExit(f"Duplicate slugs, which must be unique: {', '.join(sorted(duplicates))}")

    return templates


def main() -> None:
    if not MARKDOWN_PATH.exists():
        raise SystemExit(f"Source markdown not found at {MARKDOWN_PATH}")

    # Preserve any demo_image_url already pasted into the existing JSON, so
    # regenerating after a prompt edit doesn't wipe the image work.
    existing_images: dict[str, str] = {}
    if OUTPUT_PATH.exists():
        for template in json.loads(OUTPUT_PATH.read_text(encoding="utf-8")):
            if template.get("demo_image_url"):
                existing_images[template["slug"]] = template["demo_image_url"]

    templates = parse_templates(MARKDOWN_PATH.read_text(encoding="utf-8"))
    for template in templates:
        if template["demo_image_url"] is None:
            template["demo_image_url"] = existing_images.get(template["slug"])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(templates, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Wrote {len(templates)} templates to {OUTPUT_PATH.relative_to(REPO_ROOT)}", file=sys.stderr)
    for template in templates:
        kept = " (kept demo image)" if template["demo_image_url"] else ""
        print(f"  {template['slug']:<32} {template['scene_density']:<7} {template['best_for']}{kept}", file=sys.stderr)


if __name__ == "__main__":
    main()
