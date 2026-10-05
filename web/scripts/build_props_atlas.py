"""Build the office props / floors atlas from the Owner's asset sheets.

Sources (Owner-provided, in __ref/, gitignored):
  office.png       1448x1086 RGB on black: furniture, decor, room prefabs, floor tiles, rugs
  male-sholat.png  1448x1086 RGB on black: mushola + wudhu rooms, props, prayer mats
(The female mushola sheet has the same props with colour fringes; the male copy is used.)

Boxes below are measured from those exact sheets. Each prop is cut out (largest
blob inside its box, or the exact box for tiles/mats), re-pixelized at its sheet's
scale so it matches the 38 px characters, palette-reduced, and shelf-packed.

Output: web/src/office/sprites/props.png + props.json:
  props[name]  = {x, y, w, h, kind}   kind: furniture | decor | plant | mushola | wudhu | prefab
  floors[name] = {x, y, w, h}         seamless repeat textures (use createPattern)
  rugs[name]   = {x, y, w, h}
Every prop is trimmed to its pixels; anchor it bottom-centre on the floor.

Usage: python web/scripts/build_props_atlas.py   (needs numpy, scipy, Pillow)
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage

from build_agents_atlas import REF, OUT, BODY_H, pixelize, make_palette, apply_palette, find_sholat

OFFICE_SCALE = 0.39      # desk ≈ 2.7 character widths; office cooler ≈ 45 px

OFFICE = {
    # furniture
    "desk_single": (30, 12, 197, 150, "furniture"),
    "cubicle_pair": (228, 12, 509, 170, "furniture"),
    "desk_corner": (548, 15, 714, 166, "furniture"),
    "desk_laptop": (746, 25, 874, 162, "furniture"),
    "reception_desk": (902, 15, 1182, 170, "furniture"),
    "desk_exec": (1213, 12, 1428, 193, "furniture"),
    "meeting_round": (30, 175, 205, 332, "furniture"),
    "meeting_table6": (230, 183, 470, 332, "furniture"),
    "conference_table": (495, 175, 808, 333, "furniture"),
    "presentation_screen": (822, 175, 1013, 323, "decor"),
    "whiteboard_stand": (1053, 205, 1225, 322, "decor"),
    "display_stand": (1284, 205, 1428, 325, "decor"),
    "sofa_set": (30, 345, 282, 487, "furniture"),
    "armchair_set": (287, 347, 447, 477, "furniture"),
    "vending_snack": (472, 337, 552, 457, "furniture"),
    "vending_drink": (573, 337, 657, 457, "furniture"),
    "water_cooler": (678, 341, 730, 457, "furniture"),
    "planter_long": (762, 333, 925, 423, "plant"),
    "bookshelf": (966, 333, 1090, 433, "furniture"),
    "side_cabinet": (1116, 335, 1178, 433, "furniture"),
    "coffee_counter": (1210, 335, 1338, 433, "furniture"),
    "plant_pink_big": (1358, 330, 1430, 430, "plant"),
    "cabinet_small": (770, 452, 838, 512, "furniture"),
    "plant_a": (860, 447, 906, 510, "plant"),
    "plant_tall": (925, 437, 985, 510, "plant"),
    "planter_box": (1003, 447, 1066, 508, "plant"),
    "plant_b": (1085, 440, 1140, 510, "plant"),
    "plant_pink_tall": (1158, 438, 1215, 510, "plant"),
    "plant_c": (1228, 450, 1278, 510, "plant"),
    "plant_d": (1292, 455, 1336, 510, "plant"),
    "coat_rack": (1345, 438, 1420, 520, "furniture"),
    "file_cabinet": (32, 495, 96, 582, "furniture"),
    "low_cabinet": (110, 508, 192, 582, "furniture"),
    "printer_small": (210, 510, 270, 582, "furniture"),
    "copier": (288, 488, 369, 582, "furniture"),
    "cabinet_plant": (390, 470, 474, 582, "furniture"),
    "locker": (489, 480, 569, 582, "furniture"),
    "server_rack": (583, 480, 691, 582, "furniture"),
    "shredder": (705, 527, 752, 584, "furniture"),
    "boxes": (770, 530, 857, 582, "furniture"),
    "notice_board": (880, 522, 972, 576, "decor"),
    "air_vent": (1000, 522, 1062, 576, "decor"),
    "clock": (1080, 533, 1130, 580, "decor"),
    "frame_landscape": (1145, 522, 1212, 580, "decor"),
    "frame_chart": (1238, 522, 1318, 580, "decor"),
    "cork_board": (1338, 523, 1420, 582, "decor"),
    # room prefabs (whole rooms, for reference or decoration)
    "room_office": (20, 590, 285, 802, "prefab"),
    "room_cubicles": (316, 590, 776, 802, "prefab"),
    "room_meeting": (794, 590, 1083, 802, "prefab"),
    "room_lounge": (1102, 590, 1432, 802, "prefab"),
}

# floor patches: (x0, y0, x1, y1) of each type's big composed patch interior
FLOORS = {
    "office": 22, "blue_carpet": 197, "hallway": 370, "wood": 545,
    "meeting_carpet": 720, "reception": 895, "restroom": 1068,
}
RUGS = {
    "rug_blue": (1257, 875, 1352, 925), "rug_round": (1366, 875, 1422, 930),
    "rug_green": (1257, 935, 1332, 990), "rug_pink": (1343, 935, 1422, 990),
    "rug_red": (1257, 998, 1332, 1062), "rug_gold": (1338, 998, 1422, 1062),
}

MUSHOLA = {
    "mushola_room": (22, 30, 452, 402, "prefab"),
    "prayer_room_small": (462, 47, 730, 357, "prefab"),
    "wudhu_room": (738, 455, 1045, 715, "prefab"),
    "mihrab_niche": (775, 33, 868, 133, "mushola"),
    "frame_kaaba": (908, 48, 975, 118, "mushola"),
    "frame_calligraphy": (982, 48, 1043, 118, "mushola"),
    "frame_green": (1045, 48, 1090, 118, "mushola"),
    "frame_small": (740, 80, 768, 128, "mushola"),
    "prayer_clock": (1100, 48, 1232, 125, "mushola"),
    "wall_fan": (1248, 45, 1320, 128, "mushola"),
    "aircon": (1325, 45, 1430, 100, "mushola"),
    "bookshelf_mushola": (740, 150, 860, 252, "mushola"),
    "shoe_rack": (740, 258, 860, 358, "mushola"),
    "quran_stand": (880, 140, 948, 215, "mushola"),
    "quran_green": (958, 140, 1022, 215, "mushola"),
    "quran_cream": (1028, 140, 1090, 215, "mushola"),
    "quran_small": (1102, 140, 1158, 213, "mushola"),
    "cabinet_towels": (1180, 130, 1425, 300, "mushola"),
    "plant_mushola": (866, 225, 914, 280, "plant"),
    "sajadah_stack_green": (925, 225, 1000, 295, "mushola"),
    "sajadah_stack_blue": (1008, 225, 1080, 300, "mushola"),
    "sajadah_stack_pink": (1088, 225, 1165, 300, "mushola"),
    "sandals_black": (865, 310, 905, 345, "mushola"),
    "sandals_blue": (912, 310, 960, 345, "mushola"),
    "sandals_pink": (963, 320, 1008, 355, "mushola"),
    "sandals_brown": (860, 358, 905, 398, "mushola"),
    "sandals_tan": (910, 358, 960, 398, "mushola"),
    "plant_mushola_b": (965, 360, 1018, 433, "plant"),
    "water_dispenser": (1022, 298, 1080, 438, "mushola"),
    "tissue_box": (1088, 310, 1140, 360, "mushola"),
    "donation_box": (1088, 362, 1145, 430, "mushola"),
    "plant_mushola_big": (1198, 218, 1280, 312, "plant"),
    "divider_screen": (1150, 312, 1418, 440, "mushola"),
    "wudhu_basin_row": (1058, 455, 1268, 560, "wudhu"),
    "wudhu_basin": (1280, 460, 1338, 572, "wudhu"),
    "wudhu_wall_taps": (1355, 460, 1440, 557, "wudhu"),
    "mirror_small": (1058, 575, 1103, 638, "wudhu"),
    "mirror_large": (1113, 575, 1192, 635, "wudhu"),
    "towel_rack": (1200, 575, 1290, 637, "wudhu"),
    "plant_shelf": (1295, 585, 1345, 637, "plant"),
    "wet_floor_sign": (1350, 585, 1420, 670, "wudhu"),
    "bin_grey": (1252, 640, 1295, 712, "wudhu"),
    "trash_basket": (1300, 648, 1345, 712, "wudhu"),
}
# prayer mats are touching tiles: exact boxes, no blob isolation
MATS = {
    "sajadah_large": (40, 415, 188, 530), "sajadah_arch_a": (192, 412, 258, 515),
    "sajadah_arch_b": (264, 412, 330, 515), "sajadah_arch_c": (333, 412, 400, 515),
    "sajadah_runner": (405, 445, 475, 608), "sajadah_row": (480, 445, 600, 515),
    "sajadah_wide": (262, 520, 400, 605), "sajadah_mihrab": (480, 520, 555, 605),
}


def load(path):
    arr = np.array(Image.open(path).convert("RGBA"))
    dark = arr[..., :3].max(axis=2) < 14
    lab, n = ndimage.label(dark)
    sizes = ndimage.sum(dark, lab, range(1, n + 1))
    fg = ~np.isin(lab, 1 + np.nonzero(sizes > 3000)[0])
    arr[..., 3] = np.where(fg, 255, 0)
    return arr, fg


def cut(arr, fg, box, largest=True):
    x0, y0, x1, y1 = box
    crop = arr[y0:y1, x0:x1].copy()
    m = fg[y0:y1, x0:x1].copy()
    if largest:
        lab, n = ndimage.label(ndimage.binary_closing(m, iterations=2))
        if n > 1:
            sizes = ndimage.sum(m, lab, range(1, n + 1))
            m &= lab == (1 + int(np.argmax(sizes)))
    crop[~m, 3] = 0
    ys, xs = np.nonzero(m)
    return Image.fromarray(crop[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1])


def floor_tile(arr, x0):
    """Seamless repeat: crop a whole number of grid periods from the patch interior."""
    patch = arr[1000:1052, x0 + 30: x0 + 140, :3].astype(float)
    lum = patch.mean(axis=2)
    prof = lum.mean(axis=0) - lum.mean()
    best, period = -1e9, 34
    for p in range(26, 46):
        c = float((prof[:-p] * prof[p:]).mean())
        if c > best:
            best, period = c, p
    w, h = period * 2, period
    crop = arr[1004:1004 + h, x0 + 40: x0 + 40 + w].copy()
    crop[..., 3] = 255
    return Image.fromarray(crop)


def opaque_pixelize(img, scale):
    w, h = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    out = np.array(img.convert("RGB").resize((w, h), Image.LANCZOS))
    return np.dstack([out, np.full((h, w), 255, np.uint8)])


def main():
    items = {}   # name -> (section, kind, pixels)
    oa, of = load(os.path.join(REF, "office.png"))
    for name, (x0, y0, x1, y1, kind) in OFFICE.items():
        items[name] = ("props", kind, pixelize(cut(oa, of, (x0, y0, x1, y1), kind != "prefab"), OFFICE_SCALE))
    for name, x0 in FLOORS.items():
        items["floor_" + name] = ("floors", "floor", opaque_pixelize(floor_tile(oa, x0), OFFICE_SCALE))
    for name, box in RUGS.items():
        items[name] = ("rugs", "rug", pixelize(cut(oa, of, box, False), OFFICE_SCALE))

    ms_path = os.path.join(REF, "male-sholat.png")
    if os.path.exists(ms_path):
        _, _, r1, _ = find_sholat(ms_path)
        stand = [b for b in r1[:4]]
        ms_scale = BODY_H / np.median([b[3] - b[1] for b in stand])
        ma, mf = load(ms_path)
        for name, (x0, y0, x1, y1, kind) in MUSHOLA.items():
            items[name] = ("props", kind, pixelize(cut(ma, mf, (x0, y0, x1, y1), kind != "prefab"), ms_scale))
        for name, box in MATS.items():
            items[name] = ("props", "mushola", pixelize(cut(ma, mf, box, False), ms_scale))
        print(f"mushola scale {ms_scale:.3f}")

    # palette per kind keeps colours faithful without bloating the PNG
    by_kind = {}
    for name, (_, kind, px) in items.items():
        by_kind.setdefault(kind, []).append(name)
    for kind, names in by_kind.items():
        if kind == "floor":
            continue
        pal = make_palette([items[n][2] for n in names], 96)
        for n in names:
            sec, k, px = items[n]
            items[n] = (sec, k, apply_palette(px, pal))

    # shelf packing, tallest first
    order = sorted(items, key=lambda n: -items[n][2].shape[0])
    width, x, y, shelf = 1024, 0, 0, 0
    places = {}
    for n in order:
        h, w = items[n][2].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 2, 0
        places[n] = (x, y)
        x += w + 2
        shelf = max(shelf, h)
    height = y + shelf
    atlas = np.zeros((height, width, 4), np.uint8)
    manifest = {"scale": {"office": OFFICE_SCALE}, "props": {}, "floors": {}, "rugs": {}}
    for n, (px0, py0) in places.items():
        sec, kind, px = items[n]
        h, w = px.shape[:2]
        m = px[..., 3] > 0
        atlas[py0:py0 + h, px0:px0 + w][m] = px[m]
        entry = {"x": px0, "y": py0, "w": w, "h": h}
        if sec == "props":
            entry["kind"] = kind
        manifest[sec][n.removeprefix("floor_") if sec == "floors" else n] = entry
    Image.fromarray(atlas, "RGBA").save(os.path.join(OUT, "props.png"), optimize=True)
    with open(os.path.join(OUT, "props.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    prev = Image.new("RGBA", (width, height), (40, 40, 52, 255))
    prev.alpha_composite(Image.fromarray(atlas, "RGBA"))
    prev.resize((width * 2, height * 2), Image.NEAREST).save(os.path.join(OUT, "props.preview.png"))
    print(f"props atlas {width}x{height}: {len(manifest['props'])} props, {len(manifest['floors'])} floors, {len(manifest['rugs'])} rugs")


if __name__ == "__main__":
    main()
