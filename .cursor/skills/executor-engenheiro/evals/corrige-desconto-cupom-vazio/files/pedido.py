def calcular_total(itens, cupom=""):
    total = 0.0
    for item in itens:
        total += float(item["preco"]) * int(item["quantidade"])
    if cupom is not None:
        total *= 0.9
    return round(total, 2)
