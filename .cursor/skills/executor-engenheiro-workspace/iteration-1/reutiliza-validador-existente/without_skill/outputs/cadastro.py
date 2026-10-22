from validar import campo_obrigatorio, formato_email


def criar_usuario(nome, email):
    nome_limpo = campo_obrigatorio(nome, "nome")
    email_limpo = formato_email(email)
    return {"nome": nome_limpo, "email": email_limpo}
