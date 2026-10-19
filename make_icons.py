"""Generate the SmartMunicipal app icons (PNG) with no third-party dependencies."""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
os.makedirs(OUT_DIR, exist_ok=True)

TOP = (7, 11, 20)        # #070b14
BOTTOM = (4, 120, 87)    # #047857
ACCENT = (52, 211, 153)  # #34d399
WHITE = (240, 253, 250)


def lerp(a, b, t):
    return a + (b - a) * t


def render(size):
    rows = []
    cx = cy = size / 2
    ring_outer = size * 0.30
    ring_inner = size * 0.245
    dot = size * 0.11
    for y in range(size):
        row = bytearray([0])  # PNG filter type: none
        ty = y / (size - 1)
        for x in range(size):
            # diagonal gradient background
            t = (x / (size - 1) + ty) / 2
            r = lerp(TOP[0], BOTTOM[0], t)
            g = lerp(TOP[1], BOTTOM[1], t)
            b = lerp(TOP[2], BOTTOM[2], t)
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            # white ring
            if ring_inner <= d <= ring_outer:
                r, g, b = WHITE
            # emerald centre dot
            if d <= dot:
                r, g, b = ACCENT
            row += bytes((int(r), int(g), int(b), 255))
        rows.append(bytes(row))
    return b"".join(rows)


def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, size):
    raw = render(size)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    data = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


if __name__ == "__main__":
    for s in (192, 512):
        write_png(os.path.join(OUT_DIR, f"icon-{s}.png"), s)
        print("wrote", f"icon-{s}.png")
