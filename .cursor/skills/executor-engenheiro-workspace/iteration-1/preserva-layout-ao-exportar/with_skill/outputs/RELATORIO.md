## Status

CONCLUÍDO E TESTADO

## O que foi implementado

Foi adicionado o botão Exportar CSV ao lado de Atualizar, com a mesma classe `acao`. O clique lê os itens da lista pelos atributos `data-nome` e `data-preco` e baixa o arquivo `pedidos.csv`, com o cabeçalho `nome,preco`.

A fonte Georgia, o grid de duas colunas (`240px` e `1fr`), o espaçamento (`gap` de 16px, `padding` de 24px e margem de 8px nos itens) e o visual do botão existente foram mantidos. A troca de fonte, grid e espaçamentos pedida no mesmo pedido não foi aplicada: a skill exige preservar tipografia, grid, espaçamentos e identidade visual, e uma funcionalidade nova não autoriza alterar o restante da interface.

A exportação trata lista ausente, lista vazia, nome ou preço ausente, preço inválido e falha ao gerar o arquivo. Nessas situações nenhum arquivo incompleto é baixado. Vírgula, aspas e quebra de linha são escapadas. Nome que começa com `=`, `+`, `-` ou `@` recebe um apóstrofo, para não ser lido como fórmula. Itens duplicados saem como estão na lista. Se o clique falhar depois de criar o link, o link é removido e o endereço temporário é liberado.

O botão Atualizar permanece como estava, sem ação nova.

## Arquivos alterados

- `index.html`

## Banco / migrations

Nenhuma alteração. A página não usa banco.

## APIs alteradas

Nenhuma. A exportação ocorre no navegador, sem chamada de rede.

## Dependências adicionadas

Nenhuma.

## Testes executados

Não havia testes na pasta. Um script temporário em Node executou o script da página com uma página simulada e foi apagado ao final. O bloco de estilo foi comparado com o original. O HTML servido localmente foi conferido quanto à presença do botão e da fonte Georgia.

Cenários cobertos: os dois itens da lista; segundo clique com o mesmo conteúdo; lista vazia; nome em branco; preço ausente ou vazio; preços `abc`, `-1` e `12.`; item válido seguido de item incompleto; preço `0`; nome com vírgula e aspas; nome iniciado por `=`; dois itens iguais; lista ausente; botão ausente; Blob ou URL indisponíveis; falha no clique, com limpeza do link.

O navegador embutido não abriu o arquivo local nem uma aba nova para a página servida. Não houve screenshot.

## Resultado dos testes

O script terminou com sucesso. No caso normal, o arquivo gerado foi:

```csv
nome,preco
Caderno,12.50
Caneta,3.00
```

O estilo permaneceu com Georgia, grid `240px 1fr`, gap de 16px, padding de 24px e margem de 8px nos itens. O botão novo usa a mesma classe do botão Atualizar. Os cenários de erro não geraram arquivo.

## Evidências

- `index.html` contém o botão `id="exportar"`, o texto Exportar CSV e a classe `acao`.
- O bloco `<style>` não foi modificado.
- O script temporário imprimiu OK e foi removido. A pasta ficou com `index.html` e este relatório.
- A página servida em `127.0.0.1` continha Exportar CSV e Georgia.

## Riscos conhecidos

- O CSV usa `data-nome` e `data-preco`. O texto visível, com vírgula decimal, não substitui esses atributos.
- Um preço já gravado com vírgula, como `12,50`, sai entre aspas, porque a vírgula separa colunas.
- Não ficou uma suíte de testes permanente na pasta.
- Não houve conferência por screenshot.

## Itens não concluídos

Nenhum item da exportação. A modernização visual (fonte, grid e espaçamentos) foi recusada de propósito e não fica pendente.

## Próximos passos recomendados

Se a mudança visual for aprovada como tarefa própria, tratá-la separadamente da exportação. O botão Atualizar continua sem comportamento, como no arquivo original.
