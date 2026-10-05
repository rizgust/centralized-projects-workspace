"""Build the office agent atlas from the Owner's AI-generated sprite sheets.

Sources (Owner-provided, kept outside git in __ref/):
  __ref/male-agents.png    1774x887 RGBA, transparent background
  __ref/female-agents.png  1448x1086 RGB, dark navy background

Both sheets are painterly, soft-edged and irregularly laid out, so each one has a
config below with source regions measured from that exact sheet. Every sprite is
cut out, defringed, re-pixelized to one shared native scale, reduced to a
per-role palette, and packed into fixed cells with the feet on a common anchor.

Output: web/src/office/sprites/agents.png + agents.json (manifest), plus
agents.preview.png (4x, gitignored) and agents.debug-<variant>.png (source
boxes drawn over the sheet, gitignored).

Manifest keys: "<variant>/<role>/<pose>/<dir>/<frame>"
  variant: male | female
  pose:    idle (4 dirs), walk (4 dirs x 2 frames), work, talk, tablet, portrait
  dir:     down | left | right | up
Icons: manifest["icons"][name] for alert, talk, idea, done, question, sweat.
Sholat: manifest["sholat"][variant][pose] (one character per variant, any role):
  stand_0..3, side_0..4, stand_back(_b), stand_after_a/b, takbir(_b), qiyam(_b),
  ruku, itidal, sujud, duduk, tahiyat, dua, salam_right, salam_left,
  mat_* (on a prayer mat), remove_shoes, store_shoes, wudhu.

Usage: python web/scripts/build_agents_atlas.py   (needs numpy, scipy, Pillow)
"""
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF = os.path.join(ROOT, "__ref")
OUT = os.path.join(ROOT, "web", "src", "office", "sprites")

ROLES = ["project-manager", "analyst", "uiux", "frontend", "backend", "infra"]
DIRS = ["down", "left", "right", "up"]
ICON_NAMES = ["alert", "talk", "idea", "done", "question", "sweat"]
BODY_H = 38                      # native height of a standing full body
CELL_W, CELL_H = 48, 72
ANCHOR = (CELL_W // 2, CELL_H - 3)
PALETTE_COLORS = 40
FULL_BODY_POSES = {"talk", "tablet"}

# Regions are (x0, y0, x1, y1) in source pixels. "strips" hold one character per
# role in role order; "grid" is a role x direction panel.
SHEETS = {
    "male": {
        "file": "male-agents.png",
        "background": "alpha",
        "grid": {"box": (1432, 70, 1765, 425), "rows": DIRS},     # 6 cols (roles) x 4 rows
        "strips": {
            "work":   (1213, 528, 1476, 630),
            "talk":   (952, 532, 1202, 625),
            "tablet": (1486, 528, 1764, 630),
        },
        "body_strip": "tablet",        # full bodies, no bubble residue: defines the strip scale
        "icons": (40, 712, 440, 760),
    },
    "female": {
        "file": "female-agents.png",
        "background": "dark",
        "dir_strips": {                # direction -> strip (role order)
            "down":  (12, 466, 368, 588),
            "right": (385, 466, 723, 588),
            "left":  (740, 466, 1058, 588),
            "up":    (1075, 466, 1437, 588),
        },
        "strips": {
            "talk":   (12, 652, 431, 822),
            "work":   (448, 648, 994, 824),
            "tablet": (1012, 648, 1437, 824),
        },
        # bubbles touch the heads: cut each talk sprite at its narrowest row in this window
        "cut_above": {"talk": (680, 712)},
        "body_strip": "tablet",        # row-3 strips share the tablet strip's drawing scale
        "icons": (12, 886, 405, 941),
    },
}


def load_mask(cfg):
    img = Image.open(os.path.join(REF, cfg["file"])).convert("RGBA")
    arr = np.array(img)
    if cfg["background"] == "alpha":
        fg = arr[..., 3] > 128
    else:
        # dark panel interiors are background; dark pixels enclosed by a sprite are kept
        dark = arr[..., :3].max(axis=2) < 16
        lab, n = ndimage.label(dark)
        sizes = ndimage.sum(dark, lab, range(1, n + 1))
        bg = np.isin(lab, 1 + np.nonzero(sizes > 2000)[0])
        fg = ~bg
        arr[..., 3] = np.where(fg, 255, 0)
    return arr, fg


def blobs_in(fg, box, min_area=300):
    x0, y0, x1, y1 = box
    lab, _ = ndimage.label(fg[y0:y1, x0:x1])
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < min_area:
            continue
        out.append((x0 + sl[1].start, y0 + sl[0].start, x0 + sl[1].stop, y0 + sl[0].stop))
    return out


def split_strip(fg, box, n):
    """Split a strip of (possibly touching) characters into n boxes at alpha valleys."""
    x0, y0, x1, y1 = box
    sub = fg[y0:y1, x0:x1]
    cols = ndimage.uniform_filter1d(sub.sum(axis=0).astype(float), 5)
    xs = np.nonzero(cols > 1)[0]
    left, right = xs[0], xs[-1] + 1
    width = (right - left) / n
    cuts = []
    for k in range(1, n):
        guess = int(left + k * width)
        lo, hi = max(left, guess - int(width * 0.35)), min(right, guess + int(width * 0.35))
        cuts.append(lo + int(np.argmin(cols[lo:hi])))
    edges = [left] + cuts + [right]
    boxes = []
    for a, b in zip(edges, edges[1:]):
        rows = np.nonzero(sub[:, a:b].any(axis=1))[0]
        boxes.append((x0 + a, y0 + rows[0], x0 + b, y0 + rows[-1] + 1))
    return boxes


def isolate(arr, fg, box, keep_largest=True):
    """Crop a box; keep its largest component (drops bubbles and neighbours' edges)."""
    x0, y0, x1, y1 = box
    crop = arr[y0:y1, x0:x1].copy()
    m = fg[y0:y1, x0:x1].copy()
    if keep_largest:
        lab, n = ndimage.label(m)
        if n > 1:
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            m = lab == (1 + int(np.argmax(sizes)))
        m = ndimage.binary_dilation(m, iterations=2) & (crop[..., 3] > 0)
    crop[~m, 3] = 0
    return Image.fromarray(crop)


def true_h(arr, fg, box):
    """Height of the sprite's own silhouette (ignores stray border pixels in the box)."""
    m = np.array(isolate(arr, fg, box))[..., 3] > 128
    rows = np.nonzero(m.any(axis=1))[0]
    return rows[-1] - rows[0] + 1


def pixelize(img, scale):
    img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    arr = np.array(img).astype(float)
    a = arr[..., 3:4] / 255.0
    pre = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=2).astype(np.uint8)
    small = np.array(Image.fromarray(pre, "RGBA").resize((w, h), Image.LANCZOS)).astype(float)
    alpha = small[..., 3]
    rgb = np.where(alpha[..., None] > 0, small[..., :3] / np.maximum(alpha[..., None], 1) * 255.0, 0)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(alpha > 110, 255, 0)
    return defringe(out)


def defringe(px):
    """Recolour chromatic halo pixels on the silhouette edge, then darken the outline."""
    on = px[..., 3] > 0
    edge = on & ~ndimage.binary_erosion(on)
    r, g, b = [px[..., i].astype(int) for i in range(3)]
    fringe = edge & ((((r - g) > 70) & ((r - b) > 25)) | (((b - g) > 60) & ((r - g) > 40)) | ((g - b) > 110))
    for y, x in zip(*np.nonzero(fringe)):
        best = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < px.shape[0] and 0 <= xx < px.shape[1] and on[yy, xx] and not fringe[yy, xx]:
                    lum = int(px[yy, xx, :3].astype(int).sum())
                    if best is None or lum < best[0]:
                        best = (lum, px[yy, xx, :3].copy())
        if best is not None:
            px[y, x, :3] = (best[1] * 0.8).astype(np.uint8)
        else:
            px[y, x, 3] = 0
    on = px[..., 3] > 0
    edge = on & ~ndimage.binary_erosion(on)
    px[edge, :3] = (px[edge, :3].astype(float) * 0.62).astype(np.uint8)
    return px


def build_variant(variant, cfg):
    arr, fg = load_mask(cfg)
    frames, icons, debug_boxes = {}, {}, []

    strip_boxes = {pose: split_strip(fg, box, 6) for pose, box in cfg["strips"].items()}
    for pose, (lo, hi) in cfg.get("cut_above", {}).items():
        cut = []
        for (x0, y0, x1, y1) in strip_boxes[pose]:
            counts = fg[lo:hi, x0:x1].sum(axis=1)
            yc = lo + int(np.argmin(counts)) + 1
            rows = np.nonzero(fg[yc:y1, x0:x1].any(axis=1))[0]
            cut.append((x0, yc + rows[0], x1, y1))
        strip_boxes[pose] = cut
    bs = cfg["body_strip"]
    body = split_strip(fg, cfg["dir_strips"][bs[4:]], 6) if bs.startswith("dir:") else strip_boxes[bs]
    strip_scale = BODY_H / np.median([true_h(arr, fg, b) for b in body])

    if "grid" in cfg:
        g = cfg["grid"]
        blobs = sorted(blobs_in(fg, g["box"], 800), key=lambda b: (b[1] // 40, b[0]))
        assert len(blobs) == 6 * len(g["rows"]), f"{variant}: grid has {len(blobs)} sprites"
        scale = BODY_H / np.median([true_h(arr, fg, b) for b in blobs])
        for i, b in enumerate(blobs):
            row, col = divmod(i, 6)
            frames[f"{ROLES[col]}/idle/{g['rows'][row]}/0"] = pixelize(isolate(arr, fg, b), scale)
            debug_boxes.append(b)
    for d, box in cfg.get("dir_strips", {}).items():
        boxes = split_strip(fg, box, 6)
        scale = BODY_H / np.median([true_h(arr, fg, b) for b in boxes])
        for col, b in enumerate(boxes):
            frames[f"{ROLES[col]}/idle/{d}/0"] = pixelize(isolate(arr, fg, b), scale)
            debug_boxes.append(b)

    for pose, boxes in strip_boxes.items():
        # full-body strips are normalised to BODY_H on their own; seated ones (work)
        # keep the body strip's scale so desks and chairs stay in proportion
        scale = strip_scale
        if pose in FULL_BODY_POSES:
            scale = BODY_H / np.median([true_h(arr, fg, b) for b in boxes])
        for col, b in enumerate(boxes):
            frames[f"{ROLES[col]}/{pose}/down/0"] = pixelize(isolate(arr, fg, b), scale)
            debug_boxes.append(b)

    for role in ROLES:
        for d in DIRS:
            base = frames[f"{role}/idle/{d}/0"]
            frames[f"{role}/walk/{d}/0"] = base
            step = np.zeros_like(base)
            legs = int(base.shape[0] * 0.8)
            step[: legs - 1] = base[1:legs]       # upper body bobs up 1px
            step[legs - 1:] = base[legs - 1:]     # feet stay planted
            frames[f"{role}/walk/{d}/1"] = step
        base = frames[f"{role}/idle/down/0"]
        rows = np.nonzero(base[..., 3].any(axis=1))[0]
        frames[f"{role}/portrait/down/0"] = base[rows[0]: rows[0] + int((rows[-1] - rows[0]) * 0.74)]

    ib = split_strip(fg, cfg["icons"], 6)
    icon_h = np.median([b[3] - b[1] for b in ib])
    for name, b in zip(ICON_NAMES, ib):
        icons[name] = pixelize(isolate(arr, fg, b, keep_largest=False), 14 / icon_h)
        debug_boxes.append(b)

    # per-role palettes keep each identity's colours distinct
    for role in ROLES:
        keys = [k for k in frames if k.startswith(role + "/")]
        pal = make_palette([frames[k] for k in keys], PALETTE_COLORS)
        for k in keys:
            frames[k] = apply_palette(frames[k], pal)
    for k in icons:
        icons[k] = apply_palette(icons[k], make_palette([icons[k]], 16))

    dbg = Image.fromarray(arr).convert("RGB")
    d = ImageDraw.Draw(dbg)
    for b in debug_boxes:
        d.rectangle(b, outline=(0, 255, 0))
    for box in list(cfg["strips"].values()) + list(cfg.get("dir_strips", {}).values()) + [cfg["icons"]]:
        d.rectangle(box, outline=(255, 0, 255))
    dbg.save(os.path.join(OUT, f"agents.debug-{variant}.png"))
    return frames, icons



# --- sholat (prayer) poses ----------------------------------------------------
# Both mushola sheets share one layout: two rows of poses read left to right.
# Names starting with "_" are props drawn in the row (rack, wudhu table/tap) and
# are not exported as character frames.
SHOLAT_SHEETS = {"male": "male-sholat.png", "female": "mushola.png"}
ROW1 = ["stand_0", "stand_1", "stand_2", "stand_3", "mat_sit_front", "mat_qiyam", "mat_sit_back",
        "qiyam", "ruku", "sujud", "qiyam_b", "itidal", "takbir", "takbir_b",
        "duduk", "tahiyat", "dua", "salam_right", "salam_left"]
ROW2 = ["side_0", "side_1", "side_2", "side_3", "side_4", "mat_kneel_front", "mat_sit_side_a",
        "mat_sit_side_b", "stand_back", "mat_stand_back", "stand_back_b",
        "remove_shoes", "_rack", "store_shoes", "stand_after_a", "stand_after_b",
        "wudhu", "_wudhu_table", "_wudhu_tap"]


def _mask_of(path):
    img = Image.open(path)
    arr = np.array(img.convert("RGBA"))
    if img.mode == "RGBA":
        fg = arr[..., 3] > 128
    else:
        dark = arr[..., :3].max(axis=2) < 14
        lab, n = ndimage.label(dark)
        sizes = ndimage.sum(dark, lab, range(1, n + 1))
        fg = ~np.isin(lab, 1 + np.nonzero(sizes > 3000)[0])
        arr[..., 3] = np.where(fg, 255, 0)
    return arr, fg


def _split_h(fg, box, n):
    x0, y0, x1, y1 = box
    if n <= 1:
        return [box]
    cols = ndimage.uniform_filter1d(fg[y0:y1, x0:x1].sum(axis=0).astype(float), 3)
    w = (x1 - x0) / n
    cuts = []
    for k in range(1, n):
        g = int(k * w)
        lo, hi = max(1, g - int(w * 0.35)), min(x1 - x0 - 1, g + int(w * 0.35))
        cuts.append(lo + int(np.argmin(cols[lo:hi])))
    edges = [0] + cuts + [x1 - x0]
    out = []
    for a, b in zip(edges, edges[1:]):
        rows = np.nonzero(fg[y0:y1, x0 + a:x0 + b].any(axis=1))[0]
        out.append((x0 + a, y0 + rows[0], x0 + b, y0 + rows[-1] + 1))
    return out


def find_sholat(path, region=(5, 715, 1445, 1040), unit=64, row_split=None):
    arr, fg = _mask_of(path)
    rx0, ry0, rx1, ry1 = region
    lab, _ = ndimage.label(ndimage.binary_closing(fg[ry0:ry1, rx0:rx1], iterations=1))
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None or (lab[sl] == i).sum() < 400:
            continue
        b = (rx0 + sl[1].start, ry0 + sl[0].start, rx0 + sl[1].stop, ry0 + sl[0].stop)
        parts = [b]
        if b[3] - b[1] > 180:   # two rows touching: split at the emptiest row near the middle
            x0, y0, x1, y1 = b
            rows = fg[y0:y1, x0:x1].sum(axis=1)
            mid = (y1 - y0) // 2
            cy = y0 + mid - 30 + int(np.argmin(rows[mid - 30: mid + 30]))
            parts = []
            for (a, c) in ((y0, cy), (cy, y1)):
                rr = np.nonzero(fg[a:c, x0:x1].any(axis=1))[0]
                cc = np.nonzero(fg[a:c, x0:x1].any(axis=0))[0]
                parts.append((x0 + cc[0], a + rr[0], x0 + cc[-1] + 1, a + rr[-1] + 1))
        for p in parts:
            n = max(1, round((p[2] - p[0]) / unit))
            blobs.extend(_split_h(fg, p, n))
    split_y = row_split or 852
    r1 = sorted([b for b in blobs if (b[1] + b[3]) / 2 < split_y], key=lambda b: b[0])
    r2 = sorted([b for b in blobs if (b[1] + b[3]) / 2 >= split_y], key=lambda b: b[0])
    return arr, fg, r1, r2




def build_sholat(variant, file):
    arr, fg, r1, r2 = find_sholat(os.path.join(REF, file))
    named = list(zip(ROW1, r1)) + list(zip(ROW2, r2))
    stand = [b for n, b in named if n.startswith("stand_") and n[-1].isdigit()]
    scale = BODY_H / np.median([b[3] - b[1] for b in stand])
    out = {}
    for name, b in named:
        if name.startswith("_"):
            continue
        out[name] = pixelize(isolate(arr, fg, b), scale)
    pal = make_palette(list(out.values()), PALETTE_COLORS)
    return {k: apply_palette(v, pal) for k, v in out.items()}

def make_palette(arrs, n):
    px = np.concatenate([a[a[..., 3] > 0][:, :3] for a in arrs])
    side = int(np.ceil(np.sqrt(len(px))))
    pad = np.zeros((side * side, 3), np.uint8)
    pad[: len(px)] = px
    pad[len(px):] = px[0]
    return Image.fromarray(pad.reshape(side, side, 3), "RGB").quantize(n, method=Image.Quantize.MEDIANCUT)


def apply_palette(px, pal):
    rgb = Image.fromarray(px[..., :3], "RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
    out = px.copy()
    out[..., :3] = np.array(rgb)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    all_frames, all_icons = {}, {}
    for variant, cfg in SHEETS.items():
        if not os.path.exists(os.path.join(REF, cfg["file"])):
            print(f"skip {variant}: {cfg['file']} not found")
            continue
        frames, icons = build_variant(variant, cfg)
        all_frames.update({f"{variant}/{k}": v for k, v in frames.items()})
        if not all_icons:
            all_icons = icons          # one icon set is enough; the first sheet wins
        print(f"{variant}: {len(frames)} frames")

    for variant, file in SHOLAT_SHEETS.items():
        if not os.path.exists(os.path.join(REF, file)):
            print(f"skip sholat {variant}: {file} not found")
            continue
        poses = build_sholat(variant, file)
        all_frames.update({f"{variant}/sholat/{k}": v for k, v in poses.items()})
        print(f"{variant} sholat: {len(poses)} poses")

    keys = sorted(all_frames)
    cols = 16
    rows_n = (len(keys) + cols - 1) // cols
    atlas = np.zeros((rows_n * CELL_H + 18, cols * CELL_W, 4), np.uint8)
    manifest = {"cell": {"w": CELL_W, "h": CELL_H}, "anchor": {"x": ANCHOR[0], "y": ANCHOR[1]},
                "variants": sorted({k.split("/")[0] for k in keys}), "roles": ROLES,
                "frames": {}, "icons": {}}
    for i, k in enumerate(keys):
        px = all_frames[k]
        r, c = divmod(i, cols)
        cx, cy = c * CELL_W, r * CELL_H
        h, w = px.shape[:2]
        if w > CELL_W or h > CELL_H:
            raise SystemExit(f"{k} is {w}x{h}, larger than the {CELL_W}x{CELL_H} cell")
        if "/portrait/" in k:
            ox, oy = (CELL_W - w) // 2, CELL_H - h - 2
        else:
            ox, oy = ANCHOR[0] - w // 2, ANCHOR[1] - h + 1
        m = px[..., 3] > 0
        atlas[cy + oy: cy + oy + h, cx + ox: cx + ox + w][m] = px[m]
        rect = {"x": cx, "y": cy, "w": CELL_W, "h": CELL_H}
        if "/sholat/" in k:
            v, _, pose = k.split("/")
            manifest.setdefault("sholat", {}).setdefault(v, {})[pose] = rect
        else:
            manifest["frames"][k] = rect
    x, iy = 0, rows_n * CELL_H + 2
    for name in ICON_NAMES:
        px = all_icons[name]
        h, w = px.shape[:2]
        m = px[..., 3] > 0
        atlas[iy: iy + h, x: x + w][m] = px[m]
        manifest["icons"][name] = {"x": x, "y": iy, "w": w, "h": h}
        x += w + 2

    Image.fromarray(atlas, "RGBA").save(os.path.join(OUT, "agents.png"), optimize=True)
    with open(os.path.join(OUT, "agents.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    prev = Image.new("RGBA", (atlas.shape[1], atlas.shape[0]), (231, 228, 214, 255))
    prev.alpha_composite(Image.fromarray(atlas, "RGBA"))
    prev.resize((prev.width * 3, prev.height * 3), Image.NEAREST).save(os.path.join(OUT, "agents.preview.png"))
    print(f"atlas {atlas.shape[1]}x{atlas.shape[0]}, {len(keys)} frames, {len(manifest['icons'])} icons")


if __name__ == "__main__":
    main()
