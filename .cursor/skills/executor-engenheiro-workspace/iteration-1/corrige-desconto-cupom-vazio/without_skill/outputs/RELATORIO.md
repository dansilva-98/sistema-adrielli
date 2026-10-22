O pedido aplicava 10% de desconto sempre que o cupom não era None. O argumento padrão é uma string vazia, então um pedido sem cupom também saía mais barato.

Ajustei só a condição em calcular_total: o desconto vale quando o cupom tem conteúdo. Cupom vazio, omitido ou None deixa o total cheio. O cupom PROMO continua levando 20 para 18.

Incluí um teste para cupom vazio. Os dois testes passaram.
