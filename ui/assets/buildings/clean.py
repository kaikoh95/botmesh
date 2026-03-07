from PIL import Image
import numpy as np
from collections import deque

def clean(path):
    img = Image.open(path).convert('RGBA')
    d = np.array(img, dtype=np.int32)
    r,g,b,a = d[...,0],d[...,1],d[...,2],d[...,3]
    h,w = r.shape
    valid=[(y,x) for y,x in [(0,0),(0,w-1),(h-1,0),(h-1,w-1)] if int(a[y,x])>0]
    if not valid: valid=[(0,0)]
    bg_r=int(np.median([int(r[y,x]) for y,x in valid]))
    bg_g=int(np.median([int(g[y,x]) for y,x in valid]))
    bg_b=int(np.median([int(b[y,x]) for y,x in valid]))
    def is_bg(pr,pg,pb,t=60): return ((pr-bg_r)**2+(pg-bg_g)**2+(pb-bg_b)**2)**0.5<t or (pr>150 and pb>150 and pg<100) or (pr+pg+pb)>700
    visited=np.zeros((h,w),bool)
    q=deque()
    for i in range(h):
        for j in [0,w-1]:
            if not visited[i,j]: q.append((i,j));visited[i,j]=True
    for j in range(w):
        for i in [0,h-1]:
            if not visited[i,j]: q.append((i,j));visited[i,j]=True
    dirs8=[(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]
    while q:
        ci,cj=q.popleft()
        for di,dj in dirs8:
            ni,nj=ci+di,cj+dj
            if 0<=ni<h and 0<=nj<w and not visited[ni,nj]:
                if is_bg(int(r[ni,nj]),int(g[ni,nj]),int(b[ni,nj])): visited[ni,nj]=True;q.append((ni,nj))
    q2=deque([(i,j) for i in range(h) for j in range(w) if visited[i,j] or int(a[i,j])==0])
    for i,j in q2: visited[i,j]=True
    while q2:
        ci,cj=q2.popleft()
        for di,dj in dirs8:
            ni,nj=ci+di,cj+dj
            if 0<=ni<h and 0<=nj<w and not visited[ni,nj]:
                if is_bg(int(r[ni,nj]),int(g[ni,nj]),int(b[ni,nj]),30): visited[ni,nj]=True;q2.append((ni,nj))
    out=d.copy(); out[...,3]=np.where(visited,0,255).astype(np.int32)
    Image.fromarray(out.astype(np.uint8)).save(path)
    print(f'cleaned: {path}')

# Clean all 4
for name in ['cottage-l1','townhall-l1','postoffice-l1','plaza-l1']:
    p = f'/home/kai/projects/botmesh/ui/assets/buildings/{name}.png'
    try: clean(p)
    except Exception as e: print(f'skip {name}: {e}')
