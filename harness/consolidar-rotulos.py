#!/usr/bin/env python3
"""Junta a rotulagem CEGA e dupla (rotuladores A e B) dos alertas do verificador num gabarito local.

    python3 harness/consolidar-rotulos.py <pasta-da-rotulagem> [--adjudicacao arquivo.json]

Para cada alerta (alegacao, negacao, aspas): concordância bruta e kappa de Cohen entre A e B; lista das divergências e
das "duvida" para o adjudicador; com --adjudicacao (objeto {codigo: rótulo}), grava harness/gold-alertas.local.json
com rótulo final, estrato e peso de amostragem (população do estrato / tamanho da amostra). O arquivo local fica fora do
git (traz trechos reais com nomes de parte)."""
import json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
pasta = sys.argv[1]
adj = {}
if "--adjudicacao" in sys.argv:
    adj = json.load(open(sys.argv[sys.argv.index("--adjudicacao") + 1]))
resumo = json.load(open(os.path.join(pasta, "resumo.json")))
# rótulo(s) POSITIVO(s) de cada conjunto; só entram os conjuntos cujo <nome>-chave.json existir na pasta
TODOS = {"alegacao": ("parte",), "negacao": ("inverte",), "aspas": ("citacao",),
         "transcricao": ("transcrito_julgado", "transcrito_outro"), "divergente": ("vencido",), "alegacao2": ("parte",), "obiter": ("obiter",)}
POS = {k: v for k, v in TODOS.items() if os.path.exists(os.path.join(pasta, f"{k}-chave.json"))}
GOLD = sys.argv[sys.argv.index("--gold") + 1] if "--gold" in sys.argv else "gold-alertas.local.json"


def kappa(pares, rotulos):
    n = len(pares)
    if not n:
        return float("nan")
    po = sum(a == b for a, b in pares) / n
    pe = sum((sum(a == r for a, _ in pares) / n) * (sum(b == r for _, b in pares) / n) for r in rotulos)
    return (po - pe) / (1 - pe) if pe < 1 else 1.0


itens, pendentes = [], []
for alerta, pos in POS.items():
    chave = json.load(open(os.path.join(pasta, f"{alerta}-chave.json")))
    A = json.load(open(os.path.join(pasta, f"{alerta}-rotulos-A.json")))
    B = json.load(open(os.path.join(pasta, f"{alerta}-rotulos-B.json")))
    faltam = [c for c in chave if c not in A or c not in B]
    assert not faltam, f"{alerta}: sem rótulo em {faltam[:5]}"
    rot = lambda d, c: d[c]["r"] if isinstance(d[c], dict) else d[c]
    pares = [(rot(A, c), rot(B, c)) for c in chave if rot(A, c) != "duvida" and rot(B, c) != "duvida"]
    k = kappa(pares, sorted({a for a, _ in pares} | {b for _, b in pares}))
    acordo = sum(a == b for a, b in pares)
    print(f"{alerta}: {len(chave)} itens · concordância {acordo}/{len(pares)} = {100*acordo/max(1,len(pares)):.0f}% · kappa {k:.2f} · "
          f"duvida A {sum(rot(A,c)=='duvida' for c in chave)}, B {sum(rot(B,c)=='duvida' for c in chave)}")
    pop = resumo[alerta]["populacao"]; am = resumo[alerta]["amostra"]
    for c, info in chave.items():
        a, b = rot(A, c), rot(B, c)
        final = adj.get(c) or (a if a == b and a != "duvida" else None)
        if final is None:
            pendentes.append({"cod": c, "alerta": alerta, "A": a, "mA": A[c].get("m") if isinstance(A[c], dict) else "",
                              "B": b, "mB": B[c].get("m") if isinstance(B[c], dict) else ""})
        itens.append({"alerta": alerta, "cod": c, "id": info["id"], "t": info["t"], "estrato": info["estrato"], "rA": a, "rB": b,
                      "r": final, "positivo": None if final in (None, "duvida") else final in pos,
                      "peso": pop[info["estrato"]] / max(1, am[info["estrato"]])})
print(f"pendentes de adjudicação: {len(pendentes)}")
json.dump(pendentes, open(os.path.join(pasta, "pendentes.json"), "w"), ensure_ascii=False, indent=1)
if "--adjudicacao" in sys.argv:
    sem = [i["cod"] for i in itens if i["r"] is None]
    assert not sem, f"ainda sem rótulo final: {sem[:8]}"
    json.dump({"_sobre": "Gabarito CEGO e DUPLO dos alertas do verificador (05/10/2026): dois rotuladores independentes por alerta, sem ver o estrato nem a decisão da heurística; divergências adjudicadas pelo autor. Estratos: 'dispara' (o alerta disparou na versão 1.11.0) e 'calado' (não disparou, mas há verbo de relato / negação / aspas por perto). peso = população do estrato / tamanho da amostra. LOCAL: trechos reais com nomes de parte.",
               "itens": itens}, open(os.path.join(AQUI, GOLD), "w"), ensure_ascii=False, indent=1)
    print("gravado harness/" + GOLD)
