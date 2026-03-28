/**
 * Tests for auto-categorization keyword rules.
 */

import { describe, it, expect } from "vitest";
import { autoCategory } from "./categoryRules";

describe("autoCategory", () => {
  describe("Supermercado", () => {
    it("matches Mercado Extra", () => {
      expect(autoCategory("MERCADO EXTRA-1005")).toBe("Supermercado");
    });

    it("matches Carrefour", () => {
      expect(autoCategory("CARREFOUR MERCADO")).toBe("Supermercado");
    });

    it("matches Pão de Açúcar", () => {
      expect(autoCategory("PAO DE ACUCAR 45")).toBe("Supermercado");
    });

    it("matches Assaí", () => {
      expect(autoCategory("ASSAI ATACADISTA")).toBe("Supermercado");
    });

    it("matches Hortifruti", () => {
      expect(autoCategory("HORTIFRUTI NATURAL DA TERRA")).toBe("Supermercado");
    });

    it("matches Atacadão", () => {
      expect(autoCategory("ATACADAO LTDA")).toBe("Supermercado");
    });

    it("matches Sam's Club", () => {
      expect(autoCategory("SAMS CLUB")).toBe("Supermercado");
    });

    it("does not match Mercado Livre", () => {
      expect(autoCategory("MERCADO LIVRE")).not.toBe("Supermercado");
    });
  });

  describe("Delivery", () => {
    it("matches iFood", () => {
      expect(autoCategory("IFOOD*BURGUER KING")).toBe("Delivery");
    });

    it("matches Uber Eats", () => {
      expect(autoCategory("UBER* EATS")).toBe("Delivery");
    });

    it("matches Rappi", () => {
      expect(autoCategory("RAPPI BRASIL")).toBe("Delivery");
    });

    it("matches James Delivery", () => {
      expect(autoCategory("JAMES DELIVERY")).toBe("Delivery");
    });

    it("matches 99Food", () => {
      expect(autoCategory("99FOOD")).toBe("Delivery");
    });

    it("takes priority over Transporte for Uber Eats", () => {
      expect(autoCategory("UBER EATS")).toBe("Delivery");
    });
  });

  describe("Restaurante", () => {
    it("matches Restaurante", () => {
      expect(autoCategory("RESTAURANTE FAMILIA")).toBe("Restaurante");
    });

    it("matches Pizzaria", () => {
      expect(autoCategory("PIZZARIA DOM PEDRO")).toBe("Restaurante");
    });

    it("matches McDonald's", () => {
      expect(autoCategory("MC DONALD'S")).toBe("Restaurante");
    });

    it("matches Burger King", () => {
      expect(autoCategory("BURGER KING")).toBe("Restaurante");
    });

    it("matches Subway", () => {
      expect(autoCategory("SUBWAY")).toBe("Restaurante");
    });

    it("matches KFC", () => {
      expect(autoCategory("KFC")).toBe("Restaurante");
    });

    it("matches Outback", () => {
      expect(autoCategory("OUTBACK STEAKHOUSE")).toBe("Restaurante");
    });

    it("matches Churrascaria", () => {
      expect(autoCategory("CHURRASCARIA DO SUL")).toBe("Restaurante");
    });

    it("matches Padaria", () => {
      expect(autoCategory("PADARIA SAO JOSE")).toBe("Restaurante");
    });

    it("matches Sushi", () => {
      expect(autoCategory("SUSHI LEBLON")).toBe("Restaurante");
    });
  });

  describe("Transporte", () => {
    it("matches Uber trip", () => {
      expect(autoCategory("UBER*TRIP")).toBe("Transporte");
    });

    it("matches Cabify", () => {
      expect(autoCategory("CABIFY BRASIL")).toBe("Transporte");
    });

    it("matches LATAM", () => {
      expect(autoCategory("LATAM AIRLINES")).toBe("Transporte");
    });

    it("matches Gol Linhas Aéreas", () => {
      expect(autoCategory("GOL LINHAS AEREAS")).toBe("Transporte");
    });

    it("matches Azul Linhas Aéreas", () => {
      expect(autoCategory("AZUL LINHAS AEREAS")).toBe("Transporte");
    });

    it("matches Metrô SP", () => {
      expect(autoCategory("METRO SP")).toBe("Transporte");
    });

    it("matches SPTrans", () => {
      expect(autoCategory("SPTRANS")).toBe("Transporte");
    });

    it("matches Bilhete Único", () => {
      expect(autoCategory("BILHETE UNICO SP")).toBe("Transporte");
    });

    it("does not match Uber Eats as Transporte", () => {
      expect(autoCategory("UBER EATS")).not.toBe("Transporte");
    });
  });

  describe("Combustivel", () => {
    it("matches Shell", () => {
      expect(autoCategory("SHELL")).toBe("Combustivel");
    });

    it("matches Shell auto posto", () => {
      expect(autoCategory("SHELL*AUTO POSTO")).toBe("Combustivel");
    });

    it("matches Ipiranga", () => {
      expect(autoCategory("IPIRANGA PRODUTOS")).toBe("Combustivel");
    });

    it("matches Petrobras", () => {
      expect(autoCategory("PETROBRAS DISTRIBUIDORA")).toBe("Combustivel");
    });

    it("matches Auto Posto", () => {
      expect(autoCategory("AUTO POSTO GUANABARA")).toBe("Combustivel");
    });

    it("matches BR Distribuidora", () => {
      expect(autoCategory("BR DISTRIBUIDORA")).toBe("Combustivel");
    });
  });

  describe("Farmacia", () => {
    it("matches Drogasil", () => {
      expect(autoCategory("DROGASIL")).toBe("Farmacia");
    });

    it("matches Droga Raia", () => {
      expect(autoCategory("DROGA RAIA 045")).toBe("Farmacia");
    });

    it("matches Ultrafarma", () => {
      expect(autoCategory("ULTRAFARMA")).toBe("Farmacia");
    });

    it("matches Farmácia (generic)", () => {
      expect(autoCategory("FARMACIA POPULAR")).toBe("Farmacia");
    });

    it("matches Drogaria", () => {
      expect(autoCategory("DROGARIA SAO PAULO")).toBe("Farmacia");
    });

    it("matches Pague Menos", () => {
      expect(autoCategory("PAGUE MENOS")).toBe("Farmacia");
    });

    it("matches Panvel", () => {
      expect(autoCategory("PANVEL FARMACIAS")).toBe("Farmacia");
    });
  });

  describe("Saude", () => {
    it("matches Hospital", () => {
      expect(autoCategory("HOSPITAL ALBERT EINSTEIN")).toBe("Saude");
    });

    it("matches Clínica", () => {
      expect(autoCategory("CLINICA MEDICA CENTRAL")).toBe("Saude");
    });

    it("matches Laboratório", () => {
      expect(autoCategory("LABORATORIO FLEURY")).toBe("Saude");
    });

    it("matches Fleury", () => {
      expect(autoCategory("FLEURY MEDICINA E SAUDE")).toBe("Saude");
    });

    it("matches Dentista", () => {
      expect(autoCategory("DENTISTA DR SILVA")).toBe("Saude");
    });

    it("matches Unimed", () => {
      expect(autoCategory("UNIMED BH")).toBe("Saude");
    });

    it("matches Odonto", () => {
      expect(autoCategory("ODONTO EXCELLENCE")).toBe("Saude");
    });
  });

  describe("Assinatura", () => {
    it("matches Netflix", () => {
      expect(autoCategory("NETFLIX.COM")).toBe("Assinatura");
    });

    it("matches Spotify", () => {
      expect(autoCategory("SPOTIFY")).toBe("Assinatura");
    });

    it("matches Amazon Prime", () => {
      expect(autoCategory("AMAZON PRIME")).toBe("Assinatura");
    });

    it("matches Disney+", () => {
      expect(autoCategory("DISNEY+")).toBe("Assinatura");
    });

    it("matches HBO Max", () => {
      expect(autoCategory("HBO MAX")).toBe("Assinatura");
    });

    it("matches Globoplay", () => {
      expect(autoCategory("GLOBOPLAY")).toBe("Assinatura");
    });

    it("matches Deezer", () => {
      expect(autoCategory("DEEZER")).toBe("Assinatura");
    });

    it("matches YouTube Premium", () => {
      expect(autoCategory("YOUTUBE PREMIUM")).toBe("Assinatura");
    });

    it("matches Adobe", () => {
      expect(autoCategory("ADOBE CREATIVE CLOUD")).toBe("Assinatura");
    });

    it("matches Microsoft 365", () => {
      expect(autoCategory("MICROSOFT 365")).toBe("Assinatura");
    });
  });

  describe("Games", () => {
    it("matches PlayStation Store", () => {
      expect(autoCategory("PLAYSTATION STORE")).toBe("Games");
    });

    it("matches PSN Store", () => {
      expect(autoCategory("PSN STORE")).toBe("Games");
    });

    it("matches Xbox Game Pass", () => {
      expect(autoCategory("XBOX GAME PASS")).toBe("Games");
    });

    it("matches Epic Games", () => {
      expect(autoCategory("EPIC GAMES")).toBe("Games");
    });

    it("matches Steam", () => {
      expect(autoCategory("STEAM")).toBe("Games");
    });

    it("matches Nintendo eShop", () => {
      expect(autoCategory("NINTENDO ESHOP")).toBe("Games");
    });

    it("matches Nuuvem", () => {
      expect(autoCategory("NUUVEM")).toBe("Games");
    });

    it("takes priority over Assinatura for PSN", () => {
      expect(autoCategory("PLAYSTATION STORE")).toBe("Games");
    });
  });

  describe("Casa", () => {
    it("matches Leroy Merlin", () => {
      expect(autoCategory("LEROY MERLIN")).toBe("Casa");
    });

    it("matches Telhanorte", () => {
      expect(autoCategory("TELHANORTE")).toBe("Casa");
    });

    it("matches Tok&Stok", () => {
      expect(autoCategory("TOK&STOK")).toBe("Casa");
    });

    it("matches Tramontina", () => {
      expect(autoCategory("TRAMONTINA")).toBe("Casa");
    });

    it("matches Brastemp", () => {
      expect(autoCategory("BRASTEMP")).toBe("Casa");
    });

    it("matches Aluguel", () => {
      expect(autoCategory("ALUGUEL IMOVEL JAN")).toBe("Casa");
    });

    it("matches Condomínio", () => {
      expect(autoCategory("CONDOMINIO EDIFICIO")).toBe("Casa");
    });
  });

  describe("Utilidades", () => {
    it("matches SABESP", () => {
      expect(autoCategory("SABESP")).toBe("Utilidades");
    });

    it("matches CEMIG", () => {
      expect(autoCategory("CEMIG")).toBe("Utilidades");
    });

    it("matches CPFL", () => {
      expect(autoCategory("CPFL ENERGIA")).toBe("Utilidades");
    });

    it("matches Enel", () => {
      expect(autoCategory("ENEL DISTRIBUICAO SP")).toBe("Utilidades");
    });

    it("matches Vivo", () => {
      expect(autoCategory("VIVO")).toBe("Utilidades");
    });

    it("matches TIM", () => {
      expect(autoCategory("TIM CELULAR")).toBe("Utilidades");
    });

    it("matches Claro", () => {
      expect(autoCategory("CLARO NET")).toBe("Utilidades");
    });

    it("matches OI Internet", () => {
      expect(autoCategory("OI INTERNET")).toBe("Utilidades");
    });
  });

  describe("returns null for unrecognized merchants", () => {
    it("returns null for unknown merchant", () => {
      expect(autoCategory("COMERCIO DESCONHECIDO")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(autoCategory("")).toBeNull();
    });

    it("returns null for generic store name", () => {
      expect(autoCategory("LOJA ABC 123")).toBeNull();
    });
  });
});
