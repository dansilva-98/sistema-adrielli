import unittest

from pedido import calcular_total


class TestPedido(unittest.TestCase):
    def test_cupom_promo(self):
        itens = [{"preco": 10, "quantidade": 2}]
        self.assertEqual(calcular_total(itens, "PROMO"), 18.0)

    def test_cupom_vazio(self):
        itens = [{"preco": 10, "quantidade": 2}]
        self.assertEqual(calcular_total(itens, ""), 20.0)
        self.assertEqual(calcular_total(itens), 20.0)
        self.assertEqual(calcular_total(itens, None), 20.0)


if __name__ == "__main__":
    unittest.main()
