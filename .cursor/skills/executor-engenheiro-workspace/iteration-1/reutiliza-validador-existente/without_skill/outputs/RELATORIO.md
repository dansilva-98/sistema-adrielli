O cadastro agora recusa nome vazio e e-mail fora de formato antes de criar o usuário.

`criar_usuario` passou a usar o validador que já estava em `validar.py`. Nome vazio, só com espaços ou ausente gera `ValueError`. E-mail que não casa com `texto@dominio.tld` também. Quando os dois passam, o usuário é criado com nome e e-mail sem espaços nas pontas.

Não instalei pydantic. As duas regras já existiam no projeto, e o `requirements.txt` deixa claro que não há dependência de terceiros. Uma biblioteca nova só repetiria `campo_obrigatorio` e `formato_email`.

`validar.py` e `requirements.txt` continuam iguais. O arquivo novo `test_cadastro.py` cobre usuário válido, nome vazio, nome em branco, nome ausente, e-mail sem formato e e-mail vazio. Os seis testes passaram.
