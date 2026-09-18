# vgAI Style Template Context

This document explains how to design a style template for vgAI. Give this file to ChatGPT, Gemini, Claude, or another assistant before asking it to create values for a new style template.

## What a style template does

A style template is a reusable visual-production brief. The user writes a script, vgAI breaks it into scenes, and each scene uses the template's image and animation instructions. The template should describe a consistent visual language, while the scene itself supplies the changing subject, action, location, and story.

The style prompt must describe **how the scene should look**, not one fixed scene. Do not put a single story, named protagonist, or one permanent location into the template unless every future scene needs it.

## Form fields

### Basic fields

| Form label | Suggested data key | What to provide |
|---|---|---|
| Name | `name` | A short, recognizable template name. |
| Image Prompt | `image_prompt` | The reusable visual instructions used to generate each scene image. Maximum 300 words. |
| Animation Prompt | `animation_prompt` | Motion instructions for animating the generated scene image. Maximum 200 words. |
| Aspect Ratio | `image_aspect_ratio`, `video_aspect_ratio` | Choose `16:9` for long-form YouTube videos or `9:16` for Reels/Shorts. The picker normally sets both values. |
| Mark as default style template | `is_default` | Optional toggle. Use it only when this should be the user's normal default. |

### Advanced settings

| Form label | Suggested data key | What to provide |
|---|---|---|
| Description | `description` | A concise explanation of the visual result and the type of content it suits. Maximum 150 words. |
| Best For | `best_for` | Optional comma-separated topics or use cases. Example: `Hindi psychology, history, self-improvement, strategy`. |
| Demo Image | `demo_image_url` / uploaded image | Optional preview image. It can be a URL, an uploaded sample, or an image generated from the Image Prompt. Never include a watermark or another channel's logo. |
| Scene Density | `scene_density` | Controls how densely the script is represented by scenes. `Small` is useful when you want frequent, focused visuals; choose the available option that matches the desired pacing. |
| YouTube Title/Description/Tags Prompt | `youtube_title_description_tags_prompt` | Optional instructions for generating YouTube metadata. Maximum 150 words. |
| YouTube Thumbnail Prompt | `youtube_thumbnail_prompt` | Optional instructions for generating a thumbnail image. Maximum 150 words. |

The exact backend property names can be checked in the current `styletemplate.py` schema if they differ from the suggested keys above. The visible form labels are authoritative for what the user must fill in.

## How to write the Image Prompt

Write the prompt in English unless the product specifically requires another language; image models usually follow English visual instructions more reliably. A strong image prompt normally contains:

1. **Scene relationship:** tell the model to follow the current scene narrative.
2. **Medium and rendering:** for example, matte 2D digital painting, graphic-novel illustration, watercolor, clay animation, or cinematic realism.
3. **Palette:** specify dominant, secondary, and shadow colors.
4. **Lighting:** describe whether the image is bright, soft, warm, foggy, high-key, or dramatic.
5. **Composition:** focal subject, camera distance, foreground/background layers, and negative space.
6. **Subjects and props:** describe the kinds of people, animals, clothing, architecture, and symbolic objects that fit the channel.
7. **Consistency:** ask for stable faces, hands, clothing, proportions, and readable backgrounds.
8. **Exclusions:** explicitly forbid text, subtitles, logos, watermarks, UI elements, unwanted realism, or unwanted colors.

Avoid contradictory instructions. For example, “bright, readable, soft shadows” conflicts with “near-black shadows, extreme darkness, and harsh chiaroscuro.” Image models often follow the darker wording, so state the desired lighting first and list unwanted lighting explicitly at the end.

## How to write the Animation Prompt

Animation should preserve the generated image rather than redesign it. Ask for slow camera movement, gentle parallax, environmental motion, and restrained character movement. Mention that faces, hands, clothing, props, and architecture must remain stable. For most explainer videos, forbid fast motion, camera shake, morphing, new characters, sudden lighting changes, text, logos, and watermarks.

## Aspect-ratio rules

- Use `16:9` for the channel's normal long-form YouTube videos.
- Use `9:16` only when the same style is intended for Shorts or Reels.
- Keep important subjects away from extreme edges unless the composition deliberately leaves space for captions or thumbnail text.
- Do not put captions, logos, or a watermark into the generated image; add branding during editing.

## Example: current channel direction

The reference channel uses warm, readable, symbolic illustrations for Hindi psychology, human behavior, strategy, trust, betrayal, self-control, and personal-growth narration. A suitable visual direction is:

- bright warm 2D painterly or graphic-novel illustration;
- burnt orange, amber gold, terracotta, warm brown, muted burgundy, and cream;
- soft golden ambient light with readable reddish-brown shadows;
- serious human characters, historical rooms, libraries, courtyards, castles, offices, vaults, books, doors, chess pieces, masks, and symbolic animals such as foxes, snakes, wolves, or owls;
- clear visual metaphors and one strong focal subject per scene;
- no photorealistic glossy rendering, plastic skin, HDR, crushed blacks, excessive bloom, neon light, text, logos, or watermarks.

This is a visual direction, not a requirement for every future template. A new template may use a completely different medium, palette, subject system, or audience.

## Reusable request for another AI assistant

Copy the following instruction together with this document:

> Read `styletemplate_context.md`. I want to create a new vgAI style template. Ask me for the intended audience, content niche, reference images or artists, aspect ratio, desired medium, color palette, lighting, recurring subjects, camera/composition preferences, animation behavior, and unwanted artifacts. Then return copy-ready values for every field in the vgAI form: Name, Image Prompt, Animation Prompt, Aspect Ratio, whether to mark it as default, Description, Best For, Demo Image recommendation, Scene Density, YouTube Title/Description/Tags Prompt, and YouTube Thumbnail Prompt. Keep every field within the form's word limit. Make the Image Prompt reusable across many different scenes instead of describing one fixed image. Do not include logos, watermarks, subtitles, or copyrighted channel branding unless I explicitly provide permission and an asset.

## Quality checklist before saving

- The Image Prompt describes a style, not a single scene.
- The Image Prompt tells the model to use the current scene narrative.
- Image and animation prompts do not contradict each other.
- The aspect ratio matches the intended platform.
- Lighting and shadow instructions match the reference images.
- The prompt explicitly excludes text, logos, and watermarks.
- Description and Best For make the template easy to find later.
- YouTube metadata instructions match the channel language.
- Thumbnail instructions leave room for title text to be added during editing, while asking the image model not to generate text.
- The demo image represents the template and contains no accidental third-party watermark.
- All visible character and prop instructions are general enough to work across the whole script.
