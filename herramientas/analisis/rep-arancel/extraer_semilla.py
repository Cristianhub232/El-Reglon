# Extrae SOLO los datos de los INSERT/UPDATE del repo a CSV (staging), sin ejecutar nada del repo.
import re, csv, sys, os, collections
R, OUT = sys.argv[1], sys.argv[2]
def parse_values(s):
    out=[];i=0
    while i<len(s):
        c=s[i]
        if c in " ,\n\t\r": i+=1; continue
        if c=="'":
            j=i+1;buf=[]
            while True:
                if s[j]=="'" and j+1<len(s) and s[j+1]=="'": buf.append("'");j+=2;continue
                if s[j]=="'": break
                buf.append(s[j]);j+=1
            out.append("".join(buf));i=j+1
        else:
            tok=re.match(r"[^,\s]+",s[i:]).group(0);i+=len(tok)
            out.append(None if tok.upper()=="NULL" else tok)
    return out
def statements(txt):
    st=[];buf=[];q=False
    for ch in txt:
        buf.append(ch)
        if ch=="'": q=not q
        elif ch==";" and not q: st.append("".join(buf).strip());buf=[]
    return st
archivos=sorted(f for f in os.listdir(f"{R}/sql") if f.startswith("dml_"))
filas=collections.defaultdict(list); cols_por_tabla={}
for f in archivos:
    orden=collections.Counter()
    for s in statements(open(f"{R}/sql/{f}",encoding="utf-8").read()):
        s2=re.sub(r"^(--[^\n]*\n|\s)*","",s)
        m=re.match(r"INSERT INTO (\w+) \(([^)]*)\) VALUES \((.*)\);$",s2,re.S)
        if m:
            t=m.group(1).lower();cols=[c.strip().lower() for c in m.group(2).split(",")];vals=parse_values(m.group(3))
            assert len(cols)==len(vals),(f,s2[:200])
            orden[t]+=1
            d=dict(zip(cols,vals)); d["archivo"]=f; d["orden"]=orden[t]
            filas[t].append(d); continue
        m=re.match(r"UPDATE SUBPARTIDA SET activa = 0 WHERE REPLACE\(codigo_10digitos, '\.', ''\) = '(\d+)';",s2)
        if m: filas["desactivar"].append({"archivo":f,"orden":len(filas["desactivar"])+1,"codigo":m.group(1)})
os.makedirs(OUT,exist_ok=True)
for t,rows in filas.items():
    cols=["archivo","orden"]+sorted({k for r in rows for k in r}-{"archivo","orden"})
    with open(f"{OUT}/{t}.csv","w",newline="",encoding="utf-8") as fh:
        w=csv.writer(fh); w.writerow(cols)
        for r in rows: w.writerow([("" if r.get(c) is None else r.get(c)) for c in cols])
    print(t, len(rows), cols)
