from validar import campo_obrigatorio, formato_email


def criar_usuario(nome, email):
    nome_validado = campo_obrigatorio(nome, "nome")
    email_validado = formato_email(email)
    return {"nome": nome_validado, "email": email_validado}
