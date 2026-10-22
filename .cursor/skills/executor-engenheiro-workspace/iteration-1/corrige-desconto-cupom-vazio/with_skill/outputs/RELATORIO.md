## Status

CONCLUÍDO E TESTADO

## O que foi implementado

O total do pedido aplicava 10% de desconto sempre que o cupom não era `None`. O valor padrão é `""`, então cupom vazio, omitido, `None` ou só com espaços saía com desconto. A condição passou a exigir uma string com conteúdo depois de remover espaços. O restante do cálculo, a assinatura e o desconto do cupom preenchido permaneceram iguais. Foi acrescentado um teste de regressão para cupom vazio.

## Arquivos alterados

- `pedido.py`
- `test_pedido.py`

## Banco / migrations

Nenhuma alteração de banco ou migration.

## APIs alteradas

Nenhuma API alterada.

## Dependências adicionadas

Nenhuma dependência adicionada.

## Testes executados

`py -m unittest test_pedido.py -v`, no diretório dos arquivos do pedido.

Cenários cobertos:

- cupom `PROMO`: 2 itens de 10 continuam em 18,00;
- cupom `""`, cupom omitido, `None` e `"   "`: o mesmo pedido fica em 20,00.

Antes da correção, os quatro casos (vazio, omitido, `PROMO` e só espaços) retornavam 18,0.

## Resultado dos testes

2 testes executados, ambos OK.

## Evidências

- Causa: `if cupom is not None` tratava string vazia como cupom válido.
- Correção: `if isinstance(cupom, str) and cupom.strip()`.
- Saída do unittest: `Ran 2 tests in 0.000s` e `OK`.

## Riscos conhecidos

Um cupom que não seja string deixa de receber desconto. O uso esperado é texto. Itens sem `preco` ou `quantidade` continuam sem validação extra, fora deste conserto.

## Itens não concluídos

Nenhum.

## Próximos passos recomendados

Se a regra de negócio passar a aceitar só códigos cadastrados, validar o cupom contra essa lista em vez de qualquer texto não vazio.
