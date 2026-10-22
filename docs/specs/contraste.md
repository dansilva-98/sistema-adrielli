# Contraste dos tokens

Valores em `src/app/globals.css`. O teste `tests/unit/contrast.test.ts` recalcula a razão e falha abaixo de 4.5:1.

| Par                                                  | Razão aproximada |
| ---------------------------------------------------- | ---------------- |
| text `#3A2418` sobre surface `#F6F0E8`               | 12.83            |
| muted `#5C4334` sobre surface `#F6F0E8`              | 8.04             |
| primary-foreground `#FFF8F4` sobre primary `#8F3D24` | 6.99             |
| support-foreground `#F4FFF8` sobre support `#1E5A38` | 7.96             |
| danger-foreground `#FFF5F6` sobre danger `#9F1239`   | 7.50             |
| danger `#9F1239` sobre surface `#F6F0E8`             | 7.08             |
| support `#1E5A38` sobre surface `#F6F0E8`            | 7.20             |
| primary `#8F3D24` sobre surface `#F6F0E8`            | 6.48             |

Todos os pares passam WCAG AA para texto normal (4.5:1).

O token `muted` é a cor de texto secundário (`text-muted`). O fundo suave dos componentes é `surface-muted`, para não reaproveitar o mesmo valor como fundo e texto.
