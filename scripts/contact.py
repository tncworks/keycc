"""Contact sheet: tiles screenshots (optionally cropped/scaled) with labels."""
import sys
from PIL import Image, ImageDraw
def sheet(files, out, cols=2, scale=0.5, crop=None):
    ims = []
    for f in files:
        im = Image.open(f).convert("RGB")
        if crop: im = im.crop(crop)
        im = im.resize((int(im.width * scale), int(im.height * scale)), Image.LANCZOS)
        d = ImageDraw.Draw(im); d.text((8, 6), f.split("/")[-1], fill=(200, 60, 60))
        ims.append(im)
    w, h = ims[0].size; rows = (len(ims) + cols - 1) // cols
    S = Image.new("RGB", (w * cols, h * rows), (40, 40, 40))
    for i, im in enumerate(ims): S.paste(im, ((i % cols) * w, (i // cols) * h))
    S.save(out)
if __name__ == "__main__":
    args = sys.argv[1:]; out = args[0]; cols = int(args[1]); scale = float(args[2])
    crop = tuple(map(int, args[3].split(","))) if args[3] != "-" else None
    sheet(args[4:], out, cols, scale, crop)
