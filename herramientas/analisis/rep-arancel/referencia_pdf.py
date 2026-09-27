# Construye tabla de referencia (codigo 10 digitos, descripcion, AEC, unidad) desde el texto del PDF oficial GO 6.804.
import re, csv, sys
lines=open(sys.argv[1],encoding="utf-8").read().splitlines()
code_re=re.compile(r"^(\s{0,18})(\d{4}\.\d{2}\.\d{2}\.\d{2})\s+([-A-ZÁÉÍÓÚÑ(].*)$")
any_code=re.compile(r"^\s{0,18}\d{4}(\.\d{1,2}){1,3}\s+[-A-ZÁÉÍÓÚÑ(]")
UNID=r"(?:u|kg|l|m|m²|m³|2u|1000\s?kWh|kWh|kg\s?N|kg\s?P2O5|kg\s?K2O|g|ct|carat|kg\s?met\.am\.|10\^3|TJ|1000\s?u|12u|kg\s?90%\s?sdt|kg\s?H2O2|kg\s?KOH|kg\s?NaOH|kg\s?U|kg\s?net\s?eda|l\s?alc\.\s?100%|GI\s?F/S|kg/net\s?eda)"
tail_re=re.compile(r"\s{2,}(?P<aec>\d{1,2}(?:[.,]\d{1,2})?(?:BK|BIT)?)(?P<resto>(?:\s{2,}\S+){0,3}?)\s{2,}(?P<unidad>"+UNID+r")\s*$")
out=[];i=0
while i<len(lines):
    m=code_re.match(lines[i])
    if not m: i+=1; continue
    code=m.group(2); block=[lines[i]]; j=i+1
    while j<len(lines) and j<i+6 and not any_code.match(lines[j]) and lines[j].strip():
        block.append(lines[j]); j+=1
    aec=unidad=resto=None
    for b in block:
        t=tail_re.search(b)
        if t: aec,unidad,resto=t.group("aec"),t.group("unidad"),t.group("resto").split()
    first=tail_re.sub("",m.group(3))
    extra=[tail_re.sub("",b).strip() for b in block[1:]]
    desc=" ".join([first.strip()]+[e for e in extra if e and not re.fullmatch(r"[\d,\sA-Z]+",e)])
    desc=re.sub(r"(-)\s+(?=-)",r"\1 ",desc); desc=re.sub(r"\s{2,}"," ",desc).strip()
    out.append((code,desc,aec,unidad," ".join(resto or [])))
    i=j
w=csv.writer(open(sys.argv[2],"w",newline="",encoding="utf-8"));w.writerow(["codigo","descripcion","aec","unidad","otros"])
seen=set()
for r in out:
    w.writerow(r)
print("lineas con codigo:",len(out),"codigos unicos:",len({r[0] for r in out}),"con AEC:",sum(1 for r in out if r[2]))
