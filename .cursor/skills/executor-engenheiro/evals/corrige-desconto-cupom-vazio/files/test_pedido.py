import unittest

from pedido import calcular_total


class TestPedido(unittest.TestCase):
    def test_cupom_promo(self):
        itens = [{"preco": 10, "quantidade": 2}]
        self.assertEqual(calcular_total(itens, "PROMO"), 18.0)


if __name__ == "__main__":
    unittest.main()
