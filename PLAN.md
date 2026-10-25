# UNKNOWN archive — design & deployment specification

Status: **first version built, waiting for actual Notion work page ID and release counts**.

## Visual system
- Night: `#17232D` — deep navy / indigo city
- Mist: `#566F76` — muted blue-gray
- Ivory: `#E8D7BF` — warm window light
- Coral: `#B47F70` — quiet accent
- Reader: `#F5F0E8` — warm white paper, independent of homepage theme
- Images: original vector rain-night Taipei-inspired apartments, warm room, afternoon desk. No actors, official stills, or logos.

## Reading experiences
1. `serial`: The Distance Between Us. Ordered sequentially, optional spoiler hiding in index; resume on same device.
2. `shorts`: independent short stories, with search, CP, age rating, ordering.
3. Reader: accessible page structure, Notion formatting, safe rich-text links, YouTube music, multi-part TOC, past/next, locally remembered typography and theme.

## Backend safety
- Strict work-page Relation + status + publish checkbox + explicitly approved category.
- Never use whole database's public pages without work ID filter.
- Downloads Notion native article images to published assets; removes unused current images.
- Uses stdlib GitHub Actions Python 3.12, no external packages.

## Next milestones
1. Confirm the actual page IDs of both independent Notion work pages: **The Distance Between Us** (`the_distance_between_us`) and **短篇集** (`unknown_shorts`). The `作品識別碼` text is not the 32-character Page ID.
2. Verify the approximate 47 shorts individually or in bulk point via `所屬作品` Relation to **短篇集**; currently that work page shows the inverse chapter relation as Empty. The already verified serial chapters point to The Distance Between Us. `故事篇章` is not required.
3. Enable Actions with both page IDs and validate counts with at most one intentional test publication if needed.
4. Deploy to Cloudflare Pages and inspect real content; replace placeholder SVGs with licensed free stock photography before final publishing.
