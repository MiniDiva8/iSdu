"""Generate original geometric tab icons. Development-only: Pillow."""
import pathlib
from PIL import Image,ImageDraw
root=pathlib.Path(__file__).resolve().parents[1]/"miniprogram/assets/journal/tabbar"
root.mkdir(parents=True,exist_ok=True)
for name in ("journal","campus","timeline","profile","pal"):
 for selected,color in ((False,"#969c87"),(True,"#667d4c")):
  image=Image.new("RGBA",(162,162));draw=ImageDraw.Draw(image);w=7
  if name=="journal":
   draw.rounded_rectangle((38,28,124,138),radius=12,outline=color,width=w)
   draw.line((61,28,61,138),fill=color,width=5)
   draw.line((77,61,107,61),fill=color,width=5)
   draw.line((77,82,107,82),fill=color,width=5)
   draw.line((77,103,98,103),fill=color,width=5)
  elif name=="campus":
   draw.line([(25,49),(62,33),(100,49),(137,32),(137,117),(100,134),(62,118),(25,134),(25,49)],fill=color,width=w,joint="curve")
   draw.line((62,34,62,117),fill=color,width=5);draw.line((100,49,100,133),fill=color,width=5)
  elif name=="timeline":
   draw.ellipse((29,29,134,134),outline=color,width=w)
   draw.line([(81,51),(81,82),(103,95)],fill=color,width=w,joint="curve")
   draw.ellipse((76,76,86,86),fill=color)
  elif name=="pal":
   draw.line([(25,76),(81,30),(137,76)],fill=color,width=w,joint="curve")
   draw.line([(39,69),(39,133),(123,133),(123,69)],fill=color,width=w,joint="curve")
   draw.ellipse((59,82,68,91),fill=color)
   draw.ellipse((94,82,103,91),fill=color)
   draw.arc((61,88,101,117),10,170,fill=color,width=5)
  else:
   draw.ellipse((58,29,105,76),outline=color,width=w)
   draw.arc((32,86,131,166),180,360,fill=color,width=w)
   draw.line((33,128,33,135,130,135,130,128),fill=color,width=w,joint="curve")
  image.resize((81,81),Image.Resampling.LANCZOS).save(root/(name+("-selected" if selected else "")+".png"))
