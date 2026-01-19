import re
import os

file_path = r"c:\Users\dzoblin\Desktop\TX\src\client\menu.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

original_content = content

# 1. Fix closing tags first to avoid confusion </ div> -> </div>
content = re.sub(r'</\s+([a-zA-Z0-9]+)>', r'</\1>', content)

# 2. Fix opening tags < div -> <div
content = re.sub(r'<\s+([a-zA-Z0-9]+)', r'<\1', content)

# 3. Fix attributes with spaces around hyphen: data - order -> data-order
# We loop this to catch multiple hyphens if any, though usually attributes have one.
# Regex looks for "word - word="
content = re.sub(r'\b([a-zA-Z0-9]+)\s-\s([a-zA-Z0-9]+)=', r'\1-\2=', content)

# 4. Fix attributes with spaces around equals: style = " -> style="
content = re.sub(r'\b([a-zA-Z0-9-]+)\s=\s"', r'\1="', content)

# 5. Fix CSS properties: box - shadow: -> box-shadow:
# We look for "word - word:" pattern inside the file (mostly in style blocks or strings)
# Common properties: box-shadow, text-shadow, border-radius, z-index, pointer-events, border-color, background-color...
# A generic regex \w+ - \w+: might catch legitimate text "Free - For:".
# So we target specific CSS-like patterns or known properties.
known_css_props = [
    "box", "text", "border", "z", "pointer", "background", "margin", "padding", "flex", "grid", "align", "justify", "overflow", "font", "line"
]
for prop in known_css_props:
    # replace "box - shadow" with "box-shadow"
    # match "keyword - word"
    pattern = r'\b' + prop + r'\s-\s([a-zA-Z-]+)'
    content = re.sub(pattern, lambda m: f"{prop}-{m.group(1)}", content)

# 6. Fix ID and Class selectors in CSS blocks or strings
# .mp-mode - btn -> .mp-mode-btn
# #mp-join - room - modal -> #mp-join-room-modal
# We can mistakenly hit text like "Free - for - all".
# We only want to target lines that look like selectors or ID strings.
# Strategy: Look for specific prefixes known to be ids/classes in this file.
prefixes = ["mp-", "btn-", "progress-", "stats-", "settings-", "battle-", "map-", "quest-", "achievement-"]
for prefix in prefixes:
    # Replace "prefix - word" with "prefix-word", repeatedly
    # We do a loop to ensure "mp - join - room" becomes "mp-join-room"
    # Regex: (prefix_part) - (next_part)
    # We need to be careful. The corruption puts spaces around ALL hyphens in the string.
    # So "mp - join - room" matches "word - word".
    
    # Let's try a replacement on specific strings if they start with the prefix and have spaces.
    # We will search for the prefix followed by " - "
    
    # This regex matches the prefix, then any number of " - word" groups.
    # Actually, simpler: just remove " - " if it follows one of our prefixes or a word starting with them?
    pass

# Refined approach for selectors:
# Fix specific known broken strings observed in the file
content = content.replace(".mp-mode - btn", ".mp-mode-btn")
content = content.replace("#mp-join - room - modal", "#mp-join-room-modal")
content = content.replace("#mp-room - details", "#mp-room-details") # base for many
content = content.replace("room - details", "room-details") 
content = content.replace("mp - room", "mp-room")
content = content.replace("mp - btn", "mp-btn")
content = content.replace("mp - create", "mp-create")
content = content.replace("mp - connection", "mp-connection")
content = content.replace("mp - status", "mp-status")
content = content.replace("mp - rooms", "mp-rooms")
content = content.replace("battle - btn", "battle-btn")
content = content.replace("progress - tab", "progress-tab")
content = content.replace("progress - content", "progress-content")
content = content.replace("progress - level", "progress-level")
content = content.replace("progress - stat", "progress-stat")
content = content.replace("progress - bonus", "progress-bonus")
content = content.replace("progress - next", "progress-next")
content = content.replace("progress - xp", "progress-xp")
content = content.replace("quest - card", "quest-card")
content = content.replace("quest - header", "quest-header")
content = content.replace("quest - name", "quest-name")
content = content.replace("quest - status", "quest-status")
content = content.replace("quest - description", "quest-description")
content = content.replace("quest - progress", "quest-progress")
content = content.replace("quest - rewards", "quest-rewards")
content = content.replace("quest - reward", "quest-reward")
content = content.replace("achievement - card", "achievement-card")
content = content.replace("achievement - header", "achievement-header")
content = content.replace("achievement - icon", "achievement-icon")
content = content.replace("achievement - name", "achievement-name")
content = content.replace("achievement - tier", "achievement-tier")
content = content.replace("achievement - description", "achievement-description")
content = content.replace("achievement - reward", "achievement-reward")
content = content.replace("achievement - status", "achievement-status")
content = content.replace("achievement - category", "achievement-category")
content = content.replace("map - card", "map-card")
content = content.replace("map - grid", "map-grid")
content = content.replace("map - selection", "map-selection")
content = content.replace("panel - content", "panel-content")
content = content.replace("panel - title", "panel-title")
content = content.replace("panel - close", "panel-close")
content = content.replace("panel - btn", "panel-btn")
content = content.replace("panel - buttons", "panel-buttons")
content = content.replace("panel - header", "panel-header")
content = content.replace("panel - overlay", "panel-overlay")
content = content.replace("play - window", "play-window")
content = content.replace("window - actions", "window-actions")
content = content.replace("window - btn", "window-btn")
content = content.replace("section - title", "section-title")
content = content.replace("mode - buttons", "mode-buttons")
content = content.replace("game - type", "game-type")
content = content.replace("btn - label", "btn-label")
content = content.replace("btn - icon", "btn-icon")

# Fix text content that shouldn't be fixed?
# "Free -for-All" -> "Free-for-All" (Space before hyphen only)
# "Co - op" -> "Co-op"
content = content.replace("Free -for-All", "Free-for-All")
content = content.replace("Co - op", "Co-op")
content = content.replace("Free - for - All", "Free-for-All") # Just in case

if content != original_content:
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Fixed corruption in menu.ts")
else:
    print("No changes needed")
