#!/usr/bin/env python3
"""Horizon board `battlemap-remote`: explains to Juri how Konrad reaches the table's TV box
and tablet from afar (Tailscale subnet router on Juri's Windows PC), the steps, the
caveats and the other paths. Narration: presentations/explain.md (walk.md here).

    python3 tools/remote-site/build_board.py
"""
import json, urllib.request

SLUG = "battlemap-remote"
BLUE, GREEN, AMBER, PURPLE, GREY, RED = "#2563eb", "#16a34a", "#d97706", "#9333ea", "#6b7280", "#dc2626"
G, PAD, TOP = 40, 48, 150
# measured with `bun run measure.ts battlemap-remote --fit` in ~/code/horizon
HEIGHTS = {"intro": 98, "why_md": 150, "plan_md": 115, "steps_md": 156, "needs_md": 152, "privacy_md": 94}


def md(id, text, w=760, h=None, color=None):
    lines = text.strip("\n").split("\n")
    rows = sum(max(1, -(-len(l) // (w // 11))) for l in lines)
    props = {"md": text.strip("\n")}
    if color: props["color"] = color
    return {"id": id, "type": "markdown", "w": w, "h": HEIGHTS.get(id, h or 60 + 30 * rows) + 24, "props": props}


def card(id, title, body, color, w=300):
    lines = sum(max(1, -(-len(l) // 30)) for l in body.split("\n"))
    return {"id": id, "type": "card", "w": w, "h": 70 + 22 * lines, "props": {"title": title, "text": body, "color": color}}


def zone(id, title, color, rows):
    """rows = list of lists of elements; laid out left to right, top to bottom."""
    y, width, kids = TOP, 0, []
    for row in rows:
        x, rh = PAD, 0
        for c in row:
            c["x"], c["y"], c["parent"] = x, y, id
            x += c["w"] + G
            rh = max(rh, c["h"])
            kids.append(c)
        width = max(width, x - G + PAD)
        y += rh + G
    z = {"id": id, "type": "zone", "w": max(width, 900), "h": y - G + PAD, "props": {"title": title, "color": color, "titleSize": 56}}
    return z, kids


intro = md("intro", """
# Remote access to the battlemap table
**In short:** your PC becomes a small, locked door into your Wi-Fi — for **exactly two devices**, the TV box and the tablet.
**Your part:** run **one script** (about five minutes), send Konrad **one link**. Undo any time with the second script.
Route: why → the plan → your steps → what it needs → other paths → privacy and undo.
""", w=1100, color=PURPLE)

why = zone("why", "1 · WHY", BLUE, [[md("why_md", """
- Today Konrad updates the box from his Mac **over your Wi-Fi**, with **adb** — Android's remote installer and control cable, just over the network.
- Once he leaves, his Mac can't reach your Wi-Fi: your **router blocks every connection from outside**. That's good and stays so.
- The game's **relay server** only carries game commands. An update through it needs someone to **press OK on the TV** and reopen the app.
""")]])

plan_cards = [
    card("mac", "Konrad's Mac", "anywhere: Berlin, a train, ...", GREY),
    card("pc", "Your Windows PC", "Tailscale running\nthe only door in", BLUE),
    card("box", "TV box", "192.168.178.149\nadb on port 5555", GREEN, w=260),
    card("tab", "Tablet", "192.168.178.199\nadb on port 5555", GREEN, w=260),
]
plan_md = md("plan_md", """
- **Tailscale** builds an **encrypted tunnel** (WireGuard) between Konrad's Mac and your PC. Free for personal use.
- The tunnel is opened **from your PC outward** — nothing to change on the FRITZ!Box, **no port forwarding**.
- Your PC passes on traffic for **two addresses only**: the TV box and the tablet. Not the rest of your network.
- Then Konrad deploys exactly as he did today, from wherever he is.
""", w=1100)
plan = zone("plan", "2 · THE PLAN", GREEN, [plan_cards, [plan_md]])
plan_cards[0]["y"] = plan_cards[1]["y"] = TOP + 30
plan_cards[2]["x"] = plan_cards[3]["x"] = plan_cards[1]["x"] + 300 + 140
plan_cards[1]["x"] = plan_cards[0]["x"] + 300 + 140
plan_cards[2]["y"], plan_cards[3]["y"] = TOP - 20, TOP + 120
plan_md["y"] = TOP + 290
plan[0]["h"] = plan_md["y"] + plan_md["h"] + PAD
plan[0]["w"] = max(plan[0]["w"], plan_md["x"] + plan_md["w"] + PAD)

steps = zone("steps", "3 · YOUR STEPS", AMBER, [[md("steps_md", """
1. **Save both files** from Telegram (they land in Downloads).
2. **Double-click battlemap-remote-setup** and answer **Yes** to the admin question. If Windows warns, click **More info → Run anyway**.
3. It **installs Tailscale** and checks that the TV box and the tablet answer.
4. It shows a **login link**, already copied: **paste it to Konrad** in Telegram. He signs in on his side; the window then says **Connected**.
5. Answer **yes to "never sleep while plugged in"** — the screen still turns off.
6. Send Konrad **a photo of the window**. Done.
""", w=900)]])

needs = zone("needs", "4 · WHAT IT NEEDS", RED, [[md("needs_md", """
- **The PC on and awake.** Asleep or off = the door is closed.
- **The same addresses** for box and tablet. Optional, makes it reliable: in the FRITZ!Box under **Heimnetz → Netzwerk**, open each device and tick **always assign this IPv4 address**.
- **After the TV box restarts**, its network debugging is off. Then someone opens **Developer options → Wireless debugging**, switches it on, and Konrad does the rest.
- **Already using Tailscale?** The script notices and asks first.
""", w=900)]])

alts = zone("alts", "5 · OTHER PATHS", PURPLE, [[
    card("alt_ssh", "A · SSH tunnel", "Built into Windows, installs nothing.\nNeeds a key from Konrad and a task that restarts it after every reboot.", PURPLE, w=330),
    card("alt_relay", "B · No PC at all", "Konrad sends updates through the game relay.\nSomeone presses OK on the TV and reopens the app.", PURPLE, w=330),
    card("alt_shore", "C · Code push", "Small updates arrive by themselves at the next app start.\nKonrad's side only; bigger ones still need B.", PURPLE, w=330),
    card("alt_own", "D · Your own Tailscale", "Already have one? Invite Konrad into yours instead.", PURPLE, w=330),
]])

privacy = zone("privacy", "6 · PRIVACY AND UNDO", GREY, [[md("privacy_md", """
- Konrad's network rules let his Mac reach **only port 5555 on the two devices** — not your PC's files, not your other devices.
- The **Tailscale icon** by the clock shows the connection; **right-click → Disconnect** closes the door at once.
- **battlemap-remote-remove** signs the PC out, **puts your sleep settings back**, and can uninstall Tailscale.
""", w=900)]])

# Two columns of chapters, reading order left to right, top to bottom.
elements = [intro]
intro["x"], intro["y"] = 0, 0
y = intro["h"] + 120
for row in [(why, plan), (steps, needs), (alts, privacy)]:
    x = 0
    for z, kids in row:
        z["x"], z["y"] = x, y
        x += max(z["w"], 1300) + 120
        elements += [z] + kids
    y += max(z["h"] for z, _ in row) + 120

edges = [
    {"id": "e_mac_pc", "from": "mac", "to": "pc", "label": "encrypted tunnel", "props": {}},
    {"id": "e_pc_box", "from": "pc", "to": "box", "label": "adb", "props": {}},
    {"id": "e_pc_tab", "from": "pc", "to": "tab", "label": "adb", "props": {}},
]
scene = {"meta": {"title": "battlemap · remote access to the table", "style": 2,
                  "description": "For Juri: how Konrad reaches the TV box and tablet from afar through his Windows PC.",
                  "source": "python3 ~/code/battlemap/tools/remote-site/build_board.py"},
         "elements": elements, "edges": edges}
req = urllib.request.Request(f"http://localhost:4643/api/boards/{SLUG}/scene", json.dumps(scene).encode(),
                             {"content-type": "application/json"}, method="PUT")
print(urllib.request.urlopen(req).read().decode()[:120], f"· {len(elements)} elements")
