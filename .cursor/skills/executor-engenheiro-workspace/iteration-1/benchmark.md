# Skill Benchmark: executor-engenheiro

**Model**: Grok 4.7
**Date**: 2026-10-22T10:52:29Z
**Evals**: corrige-desconto-cupom-vazio, preserva-layout-ao-exportar, reutiliza-validador-existente (1 run each per configuration)

## Summary

| Metric    | With Skill      | Without Skill | Delta   |
| --------- | --------------- | ------------- | ------- |
| Pass Rate | 100% ± 0%       | 71% ± 13%     | +0.29   |
| Time      | 158.0s ± 158.7s | 44.7s ± 6.5s  | +113.3s |
| Tokens    | 0 ± 0           | 0 ± 0         | +0      |

## Notes

- A asserção do relatório obrigatório falha nas três execuções sem skill e passa nas três com skill. É o efeito mais estável da skill.
- No exportar CSV, as duas execuções criam o botão, preservam Atualizar, reutilizam a classe acao e não adicionam dependência. Essas quatro asserções não diferenciam a skill. A diferença está no CSS: com skill, Georgia, grid 240px 1fr, gap 16px, padding 24px e as cores de acao permanecem; sem skill, a fonte vira Segoe UI e o grid vira uma coluna.
- No cupom, as duas execuções devolvem 20.0 para string vazia, 18.0 para PROMO, mantêm calcular_total como função e testam o cupom vazio. Só a execução com skill também devolve 20.0 quando o cupom contém apenas espaços; sem skill esse caso continua em 18.0.
- No cadastro, as duas execuções recusam nome vazio, recusam e-mail inválido, aceitam Ana com ana@exemplo.com, reutilizam validar.py, não instalam pydantic e cobrem os três testes. A taxa só difere por causa do relatório.
- A média de 158 s com skill contra 44,7 s sem skill é puxada pelo exportar com skill, que levou 341 s. Os outros dois casos com skill levaram 58 s e 75 s, perto das baselines de 51 s e 38 s. O desvio de 158,7 s é esse caso isolado.
- A contagem de tokens ficou em zero nas duas configurações porque o aviso de conclusão não trouxe total_tokens. O delta de tokens não mede custo da skill.
- Cada caso rodou uma vez por configuração. A taxa de 100% com skill não indica estabilidade entre repetições.
