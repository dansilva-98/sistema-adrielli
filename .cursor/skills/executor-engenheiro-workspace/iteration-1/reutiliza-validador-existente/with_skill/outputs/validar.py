import re


def campo_obrigatorio(valor, nome):
    if valor is None or str(valor).strip() == "":
        raise ValueError(f"{nome} é obrigatório")
    return str(valor).strip()


def formato_email(valor):
    texto = campo_obrigatorio(valor, "email")
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", texto):
        raise ValueError("email inválido")
    return texto
