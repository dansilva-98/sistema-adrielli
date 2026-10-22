def calcular_total(itens, cupom=""):
    total = 0.0
    for item in itens:
        total += float(item["preco"]) * int(item["quantidade"])
    if isinstance(cupom, str) and cupom.strip():
        total *= 0.9
    return round(total, 2)
