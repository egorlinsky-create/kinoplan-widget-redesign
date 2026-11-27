import sys
from PIL import Image
import numpy as np
im = Image.open(sys.argv[1]).convert("RGB")
w, h = im.size
sx = w / 1554.0
box = (int(340 * sx), int(420 * sx), int(620 * sx), int(700 * sx))
region = im.crop(box)
a = np.array(region.convert("L"))
mask = a < 80
ys, xs = np.where(mask)
x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
qr = region.crop((x0, y0, x1 + 1, y1 + 1))
side = max(qr.size)
canvas = Image.new("RGB", (side, side), "white")
canvas.paste(qr, ((side - qr.size[0]) // 2, (side - qr.size[1]) // 2))
out = canvas.resize((600, 600), Image.NEAREST)
out.save(r"C:\Users\jonik\Documents\Проекты\Киноплан\.tmp\qr-success.png")
print("region", box, "qr", qr.size, "saved 600x600")
