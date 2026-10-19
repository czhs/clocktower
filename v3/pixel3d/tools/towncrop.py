#!/usr/bin/env python3
# Nearest-neighbour crop + zoom of a render (owner: town foundation lead): towncrop.py src out x y w h [scale]
import sys
from PIL import Image
src,out,x,y,w,h=sys.argv[1],sys.argv[2],*map(int,sys.argv[3:7])
s=int(sys.argv[7]) if len(sys.argv)>7 else 3
Image.open(src).crop((x,y,x+w,y+h)).resize((w*s,h*s),Image.NEAREST).save(out)
