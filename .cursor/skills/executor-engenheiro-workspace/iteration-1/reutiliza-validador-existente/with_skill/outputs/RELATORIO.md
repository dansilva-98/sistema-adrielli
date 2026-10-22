## Status

CONCLUÍDO E TESTADO

## O que foi implementado

`criar_usuario` valida nome e e-mail antes de criar o usuário, reutilizando `campo_obrigatorio` e `formato_email` de `validar.py`. Nome vazio, ausente ou composto só por espaços gera `ValueError` com a mensagem "nome é obrigatório". E-mail vazio ou ausente gera `ValueError` com "email é obrigatório". E-mail fora do formato aceito pelo validador existente gera `ValueError` com "email inválido". Dados válidos continuam retornando o dicionário `{"nome", "email"}`, já sem espaços nas bordas. A assinatura da função foi mantida.

Pydantic não foi instalado. O projeto já possui validação equivalente e `requirements.txt` registra que não há dependências de terceiros.

## Arquivos alterados

- `cadastro.py`: passa a validar nome e e-mail antes de retornar o usuário.
- `test_cadastro.py`: arquivo novo, com cenário normal, nome vazio, nome só com espaços, nome ausente, e-mail vazio, e-mail ausente, formato inválido e normalização de espaços.
- `RELATORIO.md`: este relatório.

`validar.py` e `requirements.txt` permaneceram como estavam.

## Banco / migrations

Nenhuma. O fluxo não grava dados.

## APIs alteradas

Nenhuma API externa. `criar_usuario(nome, email)` mantém a mesma assinatura e recusa dados inválidos com `ValueError` antes de montar o usuário.

## Dependências adicionadas

Nenhuma. Pydantic e outras bibliotecas não foram adicionadas porque `validar.py` já cobre campo obrigatório e formato de e-mail.

## Testes executados

Não havia testes existentes. Foi executado `py -m unittest test_cadastro -v` no diretório do projeto.

Cenários cobertos: criação com nome e e-mail válidos; nome vazio; nome só com espaços; nome ausente; e-mail vazio; e-mail ausente; e-mail sem formato válido; e-mail sem domínio; regressão da normalização de espaços nas bordas.

Duplicidade e permissões não se aplicam a esta função: ela não persiste o usuário nem controla acesso.

## Resultado dos testes

9 testes executados, 9 aprovados, 0 falhas. Tempo: 0,001 s. Código de saída: 0.

## Evidências

Saída de `py -m unittest test_cadastro -v`:

```
test_cria_usuario_com_nome_e_email_validos ... ok
test_email_ausente_nao_cria_usuario ... ok
test_email_sem_dominio_nao_cria_usuario ... ok
test_email_sem_formato_valido_nao_cria_usuario ... ok
test_email_vazio_nao_cria_usuario ... ok
test_nome_ausente_nao_cria_usuario ... ok
test_nome_somente_espacos_nao_cria_usuario ... ok
test_nome_vazio_nao_cria_usuario ... ok
test_valores_validos_com_espacos_nas_bordas_sao_normalizados ... ok

Ran 9 tests in 0.001s

OK
```

## Riscos conhecidos

O formato de e-mail continua sendo o do validador já existente (`[^@\s]+@[^@\s]+\.[^@\s]+`). Ele atende ao pedido, mas não implementa todas as regras da RFC 5322. Nome e e-mail válidos passam a ser devolvidos sem espaços nas bordas, porque `campo_obrigatorio` já faz essa normalização.

## Itens não concluídos

Nenhum.

## Próximos passos recomendados

Se o cadastro passar a persistir usuários, a checagem de e-mail duplicado deve entrar nesse momento. Não é necessário substituir o validador atual por Pydantic para o comportamento pedido.
